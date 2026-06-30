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

const MAX_PER_SWEEP = 25; // bound the work per tick

export async function POST(req: NextRequest) {
  if (!isInternalCronCaller(req)) {
    return NextResponse.json({ error: 'Forbidden — internal cron principal required.' }, { status: 403 });
  }
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Complete jobs that have not yet been finalized — one per (tenant, session); a multi-job session is
  // finalized once (finalize-import is tenant+session scoped).
  const { data: jobs, error } = await service
    .from(PULSE_LOAD_JOBS_TABLE)
    .select('id, tenant_id, session_id')
    .eq('status', 'complete')
    .eq('finalized', false)
    .order('updated_at', { ascending: true })
    .limit(MAX_PER_SWEEP);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const origin = req.nextUrl.origin;
  const seenSessions = new Set<string>();
  let finalizedCount = 0;
  for (const j of (jobs ?? []) as Array<{ id: string; tenant_id: string; session_id: string }>) {
    const sessionKey = `${j.tenant_id}::${j.session_id}`;
    if (!seenSessions.has(sessionKey)) {
      seenSessions.add(sessionKey);
      try {
        // Fire the SAME finalize the client fires (entity resolution + assignments + summary). Idempotent.
        const r = await fetch(`${origin}/api/import/sci/finalize-import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...internalCronHeaders() },
          body: JSON.stringify({ tenantId: j.tenant_id, proposalId: j.session_id }),
        });
        if (!r.ok) {
          console.warn(`[finalize-sweep] finalize-import for session ${j.session_id} returned ${r.status} — leaving unfinalized for retry`);
          continue; // leave finalized=false so the next sweep retries
        }
      } catch (e) {
        console.warn(`[finalize-sweep] finalize-import dispatch failed for ${j.session_id}:`, e instanceof Error ? e.message : e);
        continue;
      }
    }
    // Mark this job finalized (every job of the session, so the index stays small).
    await service.from(PULSE_LOAD_JOBS_TABLE).update({ finalized: true }).eq('id', j.id);
    finalizedCount++;
  }

  return NextResponse.json({ ok: true, jobsFinalized: finalizedCount, sessionsFinalized: seenSessions.size });
}
