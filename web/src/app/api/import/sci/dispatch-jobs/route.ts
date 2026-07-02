/**
 * OB-251 (DS-016) — GET/POST /api/import/sci/dispatch-jobs
 *
 * ── THE OPTION-B CRON SAFETY-NET OF THE HYBRID WORKER TRIGGER ──────────────────
 *
 * Async ingestion fires its per-file worker (/api/import/sci/process-job) through a
 * HYBRID trigger built from two complementary paths:
 *
 *   • Option C (client-fire, low-latency): operate/import/page.tsx POSTs the worker
 *     directly the instant a processing_job is created. Sub-second latency, but it is
 *     BROWSER-DEPENDENT — if the tab closes, the network drops, or a worker Lambda
 *     crashes mid-flight, that fire is lost and the job stalls.
 *
 *   • Option B (this route, the backstop): a Vercel Cron sweep that runs every minute
 *     (vercel.json `crons`). It is BROWSER-INDEPENDENT — it picks up any 'pending' job
 *     the client never fired (or whose fire was lost), and it implements RETRY (P-B4):
 *     it requeues 'failed' jobs under a capped exponential backoff, and it RECLAIMS jobs
 *     a crashed worker abandoned mid-stage (stuck 'classifying'/'committing').
 *
 * Together: processing is browser-independent AND retried. The client-fire gives speed;
 * the cron gives durability. They never double-process — the worker's ATOMIC CLAIM
 * (UPDATE ... WHERE status='pending') admits exactly one caller per job, so a job the
 * client already fired is a harmless no-op for the sweep (the sweep's fire just 409s).
 *
 * This sweep itself NEVER awaits worker bodies — it fires-and-moves-on with a short
 * AbortController timeout, so a 60s maxDuration cron can dispatch a full batch without
 * being held hostage by any single long-running worker (the worker keeps running
 * server-side in its own Lambda after the dispatch socket is aborted).
 *
 * Korean Test: every token here is a structural processing state or a control-flow
 * constant — zero domain, tenant, or role literal. No registry.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
// HF-356 (RC2): shared internal/cron principal — this route's own gate AND the credential it forwards to
// the worker (process-job) when it fires it server-side (without forwarding, the worker 401'd every job).
import { isInternalCronCaller, internalCronHeaders } from '@/lib/sci/cron-principal';
// HF-358 (Part B-2): the reclaim retry cap — a repeatedly-crashing job converges to terminal 'failed'.
import { reclaimPatch } from '@/lib/sci/reclaim-policy';
import { isCommitStageFailure } from '@/lib/sci/job-status'; // HF-373 Phase F (D7)

// Retry policy (P-B4).
const MAX_RETRIES = 3;
// A job stuck mid-stage longer than this had its worker crash → reclaim it.
const STALE_CLASSIFYING_MS = 5 * 60_000;
// Exponential backoff base for failed-job requeue: BACKOFF_BASE_MS * 2^retry_count.
const BACKOFF_BASE_MS = 30_000;

// How many pending jobs to fire per sweep, and how long to wait on each dispatch
// socket before aborting (the worker keeps running server-side past the abort).
const PENDING_BATCH_SIZE = 20;
const DISPATCH_ABORT_MS = 2_000;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function dispatch(req: NextRequest): Promise<NextResponse> {
  // AUTH: the cron/internal principal (CRON_SECRET bearer or x-vercel-cron; permissive in dev). Shared
  // with the worker so the two never drift — see cron-principal.ts for the (a)/(b)/(c) rule.
  if (!isInternalCronCaller(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scannedAt = new Date().toISOString();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  try {
    // ── 1. PICK UP PENDING ────────────────────────────────────────────────
    // Oldest-first so no job starves. Fire the worker WITHOUT awaiting its body:
    // each fetch is aborted after DISPATCH_ABORT_MS (the worker continues server-side
    // in its own Lambda). The worker's atomic claim makes a duplicate fire (client
    // already fired) a harmless 409. We swallow the abort — it is the expected outcome.
    let dispatched = 0;
    const { data: pending, error: pendingErr } = await supabase
      .from('processing_jobs')
      .select('id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(PENDING_BATCH_SIZE);
    if (pendingErr) throw pendingErr;

    const fires = (pending ?? []).map(async (job) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DISPATCH_ABORT_MS);
      try {
        await fetch(`${baseUrl}/api/import/sci/process-job`, {
          method: 'POST',
          // HF-356 (RC2): forward the internal/cron credential so the worker — which has no user session
          // on this server-side fire — recognizes us as the trusted principal instead of 401'ing.
          headers: { 'Content-Type': 'application/json', ...internalCronHeaders() },
          body: JSON.stringify({ jobId: job.id }),
          signal: controller.signal,
        });
      } catch {
        // Abort (expected — worker still runs server-side) or transient network error.
        // Either way the job stays claimable for the next sweep if it was never claimed.
      } finally {
        clearTimeout(timer);
      }
    });
    const fireResults = await Promise.allSettled(fires);
    dispatched = fireResults.length;

    // ── 2. RETRY FAILED (P-B4) ────────────────────────────────────────────
    // Requeue 'failed' jobs that have retries left AND whose backoff window has elapsed.
    // Backoff = BACKOFF_BASE_MS * 2^retry_count, measured from started_at (null = eligible now).
    // Each requeue is a status-guarded conditional update so a concurrent sweep can't double-bump.
    let requeued = 0;
    const { data: failed, error: failedErr } = await supabase
      .from('processing_jobs')
      .select('id, retry_count, started_at, error_detail, metadata')
      .eq('status', 'failed')
      .lt('retry_count', MAX_RETRIES);
    if (failedErr) throw failedErr;

    const now = Date.now();
    for (const job of failed ?? []) {
      // HF-373 Phase F (D7): a COMMIT-STAGE failure is TERMINAL — requeueing it to 'pending' both
      // erased the terminal rank (letting a later blind finalize stamp 'finalized' over the failure:
      // the 86K lie) and pointlessly re-dispatched a CLASSIFY worker at an already-classified file.
      // Commit failures are marked by our own writers (metadata.phase='failed' via markSessionJobs;
      // the mechanical 'Commit failed/Commit error/Hand-off enqueue failed' prefixes via
      // recordCommitFailureOnJob) — structural markers, not prose scans. Only classify-stage
      // failures remain requeue-eligible.
      const jobPhase = ((job.metadata ?? {}) as { phase?: string }).phase ?? null;
      if (isCommitStageFailure('failed', jobPhase, job.error_detail as string | null)) continue;
      const retryCount: number = job.retry_count ?? 0;
      const backoffMs = BACKOFF_BASE_MS * Math.pow(2, retryCount);
      const startedAtMs = job.started_at ? new Date(job.started_at as string).getTime() : null;
      const eligible = startedAtMs === null || startedAtMs < now - backoffMs;
      if (!eligible) continue;

      // Read-then-guarded-write the increment: bump retry_count, reset to 'pending',
      // keep error_detail. Guarded on status='failed' so exactly one writer wins.
      const reset = await supabase
        .from('processing_jobs')
        .update({ status: 'pending', retry_count: retryCount + 1 })
        .eq('id', job.id)
        .eq('status', 'failed')
        .select('id');
      if (!reset.error && reset.data && reset.data.length > 0) requeued += 1;
    }

    // ── 3. RECLAIM STALE (HF-358 Part B-2: WITH A RETRY CAP) ──────────────
    // A worker that crashed mid-stage (OOM, timeout) leaves a job stuck in 'classifying' or 'committing'.
    // Any such job older than STALE_CLASSIFYING_MS (by started_at) is reclaimed. DIAG-078 defect #3: the
    // reclaim had NO retry cap, so a job whose worker keeps crashing was reset → re-dispatched → crashed →
    // reclaimed forever. Now each reclaim INCREMENTS retry_count, and once it reaches MAX_RETRIES the job
    // is marked TERMINALLY 'failed' with a reason (not reset) — a repeatedly-crashing job converges to a
    // terminal state. (The failed-requeue cap at §2 / `:lt('retry_count', MAX_RETRIES)` — the kill-switch
    // guard — is unchanged; a kill-switched job is never resurrected here either, as it is already
    // terminal 'failed', not 'classifying'/'committing'.)
    let reclaimed = 0;
    let reclaimFailedOut = 0;
    const staleCutoff = new Date(now - STALE_CLASSIFYING_MS).toISOString();
    const nowIso = new Date(now).toISOString();
    for (const stuckStatus of ['classifying', 'committing'] as const) {
      const { data: stuck, error: stuckErr } = await supabase
        .from('processing_jobs')
        .select('id, retry_count')
        .eq('status', stuckStatus)
        .lt('started_at', staleCutoff);
      if (stuckErr) throw stuckErr;

      for (const job of stuck ?? []) {
        // Status-guarded conditional update (exactly one sweep wins). At the cap → terminal 'failed' with a
        // job-visible reason; otherwise reclaim to the stage target and bump the counter (reclaimPatch).
        const patch = reclaimPatch(stuckStatus, job.retry_count, MAX_RETRIES, nowIso);
        const reset = await supabase
          .from('processing_jobs')
          .update(patch)
          .eq('id', job.id)
          .eq('status', stuckStatus)
          .select('id');
        if (!reset.error && reset.data && reset.data.length > 0) {
          if (patch.status === 'failed') reclaimFailedOut += 1; else reclaimed += 1;
        }
      }
    }

    return NextResponse.json({ dispatched, requeued, reclaimed, reclaimFailedOut, scannedAt });
  } catch (err) {
    return NextResponse.json(
      { error: 'Dispatch sweep failed', details: err instanceof Error ? err.message : String(err), scannedAt },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return dispatch(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return dispatch(req);
}
