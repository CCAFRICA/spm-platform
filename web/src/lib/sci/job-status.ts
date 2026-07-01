// HF-372 Phase D — the SINGLE server-side writer for import-job state (processing_jobs).
//
// EPG-0.5 found the core lie: the server's last happy-path status write was 'classified';
// 'committing'/'committed' were written ONLY by the browser (fire-and-forget, unchecked) — so a
// navigate-away, a dead response socket, or a platform operator (RLS: SELECT-only on
// processing_jobs) left the durable record claiming a finished import was unfinished forever, and
// the fleet view rendered it green. This module makes the SERVER the only status writer past
// 'classified' (service-role — immune to the RLS hole), with an explicit machine:
//
//   pending → classifying → classified → committing → committed → finalized
//                                      ↘ failed (with error_detail)      (terminal)
//
// plus the REAL step in metadata.phase (jsonb — migration 20260703_hf372, architect-applied;
// the writers degrade to status-only pre-migration):
//   queued | classifying | awaiting_confirmation | interpreting_plan | committing | loading |
//   finalizing | completed | failed | cancelled
//
// Transitions are RANKED — a late/duplicate writer can never downgrade a job (a 'committing' write
// arriving after 'finalized' is a no-op), and 'failed' never overwrites a durable 'committed' /
// 'finalized' (mirrors job-failure.ts's .neq guard). Metadata is merged per job (phase +
// proposal_id), never replaced.

import type { SupabaseClient } from '@supabase/supabase-js';

export const JOB_STATUS_RANK: Record<string, number> = {
  pending: 0,
  classifying: 1,
  classified: 2,
  confirming: 3,
  committing: 4,
  committed: 5,
  finalized: 6,
  failed: 7, // terminal; guarded separately so it never overwrites committed/finalized
};

export type JobPhase =
  | 'queued' | 'classifying' | 'awaiting_confirmation' | 'interpreting_plan' | 'committing'
  | 'loading' | 'finalizing' | 'completed' | 'failed' | 'cancelled';

export interface JobPatch {
  status?: string;
  phase?: JobPhase;
  proposalId?: string;
  errorDetail?: string;
  completedAt?: boolean;
}

/** Pure transition guard (unit-tested): may `next` overwrite `current`? */
export function statusMayAdvance(current: string | null | undefined, next: string): boolean {
  const cur = JOB_STATUS_RANK[current ?? ''] ?? -1;
  const nxt = JOB_STATUS_RANK[next] ?? -1;
  if (next === 'failed') return current !== 'committed' && current !== 'finalized';
  return nxt > cur;
}

async function patchJobs(
  supabase: SupabaseClient,
  jobs: Array<{ id: string; status: string | null; metadata: Record<string, unknown> | null }>,
  patch: JobPatch,
): Promise<number> {
  let updated = 0;
  for (const job of jobs) {
    const update: Record<string, unknown> = {};
    if (patch.status && statusMayAdvance(job.status, patch.status)) update.status = patch.status;
    if (patch.phase || patch.proposalId) {
      update.metadata = {
        ...(job.metadata ?? {}),
        ...(patch.phase ? { phase: patch.phase, phase_at: new Date().toISOString() } : {}),
        ...(patch.proposalId ? { proposal_id: patch.proposalId } : {}),
      };
    }
    if (patch.errorDetail) update.error_detail = patch.errorDetail.slice(0, 2000);
    if (patch.completedAt) update.completed_at = new Date().toISOString();
    if (Object.keys(update).length === 0) continue;
    const { error } = await supabase.from('processing_jobs').update(update).eq('id', job.id);
    // metadata column absent: SQL surfaces 42703; PostgREST's schema cache surfaces PGRST204.
    if (error && (error.code === '42703' || error.code === 'PGRST204') && update.metadata) {
      // Pre-migration degradation (20260703_hf372): the metadata column is absent — land the STATUS
      // truth anyway; the phase display simply has nothing to read until the migration is applied.
      delete update.metadata;
      if (Object.keys(update).length > 0) {
        const retry = await supabase.from('processing_jobs').update(update).eq('id', job.id);
        if (!retry.error) { updated++; }
        console.warn(`[job-status] metadata column absent (apply migration 20260703_hf372) — status-only write ${retry.error ? 'FAILED: ' + retry.error.message : 'landed'} on ${job.id}`);
      } else {
        console.warn(`[job-status] metadata column absent (apply migration 20260703_hf372) — phase write dropped on ${job.id}`);
      }
    } else if (error) {
      console.warn(`[job-status] non-blocking update error on ${job.id}: ${error.message}`);
    } else {
      updated++;
    }
  }
  return updated;
}

/** Patch every job of an import SESSION (tenant- and session-scoped). Best-effort, never throws. */
export async function markSessionJobs(
  supabase: SupabaseClient,
  tenantId: string,
  sessionId: string | null | undefined,
  patch: JobPatch,
): Promise<number> {
  if (!sessionId) return 0; // synchronous import — no job rows exist
  try {
    type JobRow = { id: string; status: string | null; metadata: Record<string, unknown> | null };
    const first = await supabase
      .from('processing_jobs')
      .select('id, status, metadata')
      .eq('tenant_id', tenantId)
      .eq('session_id', sessionId);
    let rows = first.data as unknown as JobRow[] | null;
    let err = first.error;
    if (err && err.code === '42703') {
      // Pre-migration degradation (20260703_hf372): select without metadata; status truth still lands.
      const retry = await supabase
        .from('processing_jobs')
        .select('id, status')
        .eq('tenant_id', tenantId)
        .eq('session_id', sessionId);
      rows = retry.data as unknown as JobRow[] | null;
      err = retry.error;
    }
    if (err || !rows?.length) return 0;
    return await patchJobs(supabase, rows, patch);
  } catch (e) {
    console.warn(`[job-status] markSessionJobs failed (non-blocking): ${e instanceof Error ? e.message : e}`);
    return 0;
  }
}

/**
 * Patch every job carrying metadata.proposal_id = proposalId (stamped by execute-bulk at commit
 * entry). This is how finalize-import — which receives only the proposalId — reaches the session's
 * jobs on EVERY dispatch path (client fire, execute-bulk waitUntil, finalize-sweep cron).
 */
export async function markJobsByProposal(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string | null | undefined,
  patch: JobPatch,
): Promise<number> {
  if (!proposalId) return 0;
  try {
    const { data, error } = await supabase
      .from('processing_jobs')
      .select('id, status, metadata')
      .eq('tenant_id', tenantId)
      .eq('metadata->>proposal_id', proposalId);
    if (error || !data?.length) return 0;
    return await patchJobs(supabase, data as never, patch);
  } catch (e) {
    console.warn(`[job-status] markJobsByProposal failed (non-blocking): ${e instanceof Error ? e.message : e}`);
    return 0;
  }
}
