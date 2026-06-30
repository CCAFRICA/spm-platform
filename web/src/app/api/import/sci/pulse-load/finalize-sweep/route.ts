/**
 * POST /api/import/sci/pulse-load/finalize-sweep   (cron / internal principal only)
 *
 * HF-360 (finalize orphan fix) — the robust, client-independent post-commit finalize. When the pg_cron
 * worker marks a pulse_load_job 'complete', entity resolution (which READS committed_data) must run. The
 * import page fires it when the user is present, but a user who LEAVES during the (minutes-long) load would
 * orphan it — leaving committed_data with NULL entity_id and calc broken (the DIAG-071 failure mode). This
 * sweep, scheduled server-side, finalizes every complete-but-unfinalized session exactly once.
 *
 * Idempotent: finalize-import is safe to call repeatedly (it reconciles), and the `finalized` flag stops a
 * re-fire. Auth: the internal cron principal only (CRON_SECRET bearer / x-vercel-cron) — same gate as
 * dispatch-jobs. ARCHITECT: schedule this (e.g. Vercel cron every 1-2 min) alongside the pg_cron worker.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isInternalCronCaller, internalCronHeaders } from '@/lib/sci/cron-principal';
import { PULSE_LOAD_JOBS_TABLE } from '@/lib/sci/pulse-load-types';

const MAX_SESSIONS_PER_SWEEP = 25; // bound the work per tick

// HF-361 follow-up: Vercel Cron invokes its scheduled path with a GET request, but this handler only
// exported POST → every cron tick returned 405 Method Not Allowed (after the middleware 401 was fixed).
// Export BOTH GET (the Vercel cron convention) and POST (manual / server-side invocation) over one handler.
async function handleSweep(req: NextRequest): Promise<NextResponse> {
  if (!isInternalCronCaller(req)) {
    return NextResponse.json({ error: 'Forbidden — internal cron principal required.' }, { status: 403 });
  }
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Candidate sessions: those with at least one complete-but-unfinalized job.
  const { data: candidates, error } = await service
    .from(PULSE_LOAD_JOBS_TABLE)
    .select('tenant_id, session_id')
    .eq('status', 'complete')
    .eq('finalized', false)
    .order('updated_at', { ascending: true })
    .limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const origin = req.nextUrl.origin;
  const seen = new Set<string>();
  let sessionsFinalized = 0;
  let jobsMarked = 0;
  for (const c of (candidates ?? []) as Array<{ tenant_id: string; session_id: string }>) {
    const key = `${c.tenant_id}::${c.session_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > MAX_SESSIONS_PER_SWEEP) break;

    // Finalize a session ONLY when EVERY job of it is 'complete' (a multi-file-group import has several jobs
    // sharing session_id; entity resolution must run over the WHOLE import, not a partial one). This mirrors
    // the client's projectSessionLoadState('complete' = all jobs complete).
    const { data: sessionJobs } = await service
      .from(PULSE_LOAD_JOBS_TABLE)
      .select('id, status')
      .eq('tenant_id', c.tenant_id)
      .eq('session_id', c.session_id);
    const all = (sessionJobs ?? []) as Array<{ id: string; status: string }>;
    if (all.length === 0 || !all.every((j) => j.status === 'complete')) continue; // not all loaded yet — wait

    try {
      // Fire the SAME finalize the client fires (entity resolution + assignments + summary). Idempotent.
      const r = await fetch(`${origin}/api/import/sci/finalize-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...internalCronHeaders() },
        body: JSON.stringify({ tenantId: c.tenant_id, proposalId: c.session_id }),
      });
      if (!r.ok) {
        console.warn(`[finalize-sweep] finalize-import for session ${c.session_id} returned ${r.status} — leaving unfinalized for retry`);
        continue; // leave finalized=false so the next sweep retries
      }
    } catch (e) {
      console.warn(`[finalize-sweep] finalize-import dispatch failed for ${c.session_id}:`, e instanceof Error ? e.message : e);
      continue;
    }
    // Mark every job of the now-finalized session.
    await service.from(PULSE_LOAD_JOBS_TABLE).update({ finalized: true }).eq('tenant_id', c.tenant_id).eq('session_id', c.session_id);
    sessionsFinalized++;
    jobsMarked += all.length;
  }

  return NextResponse.json({ ok: true, sessionsFinalized, jobsMarked });
}

// Vercel Cron sends GET; POST retained for manual / server-side invocation. Both authenticate via the
// internal cron principal inside handleSweep (CRON_SECRET / x-vercel-cron).
export async function GET(req: NextRequest): Promise<NextResponse> { return handleSweep(req); }
export async function POST(req: NextRequest): Promise<NextResponse> { return handleSweep(req); }
