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

/**
 * AUTH (permissive-but-documented). Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`
 * when a CRON_SECRET env var is configured, and always sends an `x-vercel-cron` header on
 * its scheduled invocations. We allow the request when ANY of:
 *   (a) CRON_SECRET is unset (local/dev — no secret to check against), OR
 *   (b) the Authorization header matches `Bearer ${CRON_SECRET}` (production cron / manual), OR
 *   (c) the `x-vercel-cron` header is present (Vercel-originated scheduled invocation).
 * Otherwise → 401. There is no CRON_SECRET in the repo yet; once one is added in Vercel,
 * branch (b) tightens automatically with no code change.
 */
function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // (a) dev: nothing to check.
  const authHeader = req.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) return true; // (b)
  if (req.headers.get('x-vercel-cron')) return true; // (c)
  return false;
}

async function dispatch(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
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
          headers: { 'Content-Type': 'application/json' },
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
      .select('id, retry_count, started_at')
      .eq('status', 'failed')
      .lt('retry_count', MAX_RETRIES);
    if (failedErr) throw failedErr;

    const now = Date.now();
    for (const job of failed ?? []) {
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

    // ── 3. RECLAIM STALE ──────────────────────────────────────────────────
    // A worker that crashed mid-stage leaves a job stuck in 'classifying' or 'committing'.
    // Any such job older than STALE_CLASSIFYING_MS (by started_at) is reset to 'pending'
    // (status-guarded) so the next sweep — or the client — re-fires it.
    let reclaimed = 0;
    const staleCutoff = new Date(now - STALE_CLASSIFYING_MS).toISOString();
    // A stuck 'classifying' job → 'pending' (re-classified by process-job). A stuck 'committing' job
    // → 'classified' (re-COMMITTED by the client/execute-bulk resume, which is idempotent — it skips
    // spine-terminal units), NOT 'pending' (that would wastefully re-run classify on a done proposal).
    const RECLAIM_TARGET: Record<'classifying' | 'committing', string> = { classifying: 'pending', committing: 'classified' };
    for (const stuckStatus of ['classifying', 'committing'] as const) {
      const { data: stuck, error: stuckErr } = await supabase
        .from('processing_jobs')
        .select('id')
        .eq('status', stuckStatus)
        .lt('started_at', staleCutoff);
      if (stuckErr) throw stuckErr;

      for (const job of stuck ?? []) {
        const reset = await supabase
          .from('processing_jobs')
          .update({ status: RECLAIM_TARGET[stuckStatus] })
          .eq('id', job.id)
          .eq('status', stuckStatus)
          .select('id');
        if (!reset.error && reset.data && reset.data.length > 0) reclaimed += 1;
      }
    }

    return NextResponse.json({ dispatched, requeued, reclaimed, scannedAt });
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
