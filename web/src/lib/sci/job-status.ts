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

// HF-373 Phase F (D7): phases are RANKED like statuses. Pre-HF-373 phase/completed_at were
// UNCONDITIONAL jsonb merges — a blocked status write still overwrote phase='failed' with
// 'completed' and stamped completed_at (the 86K lie), and a late 'finalizing' regressed a
// 'completed' phase (the observed {status:'finalized', phase:'finalizing'} stuck shape).
export const JOB_PHASE_RANK: Record<string, number> = {
  queued: 0,
  classifying: 1,
  awaiting_confirmation: 2,
  interpreting_plan: 3,
  committing: 4,
  loading: 5,
  finalizing: 6,
  completed: 7,
  failed: 8,     // terminal
  cancelled: 8,  // terminal
};

export interface JobPatch {
  status?: string;
  phase?: JobPhase;
  proposalId?: string;
  errorDetail?: string;
  completedAt?: boolean;
  /** HF-373 Phase F (D8): a summary-engine failure surfaces on the job record, never a silent pass. */
  summaryError?: string;
}

/** Pure transition guard (unit-tested): may `next` overwrite `current`? */
export function statusMayAdvance(current: string | null | undefined, next: string): boolean {
  const cur = JOB_STATUS_RANK[current ?? ''] ?? -1;
  const nxt = JOB_STATUS_RANK[next] ?? -1;
  if (next === 'failed') return current !== 'committed' && current !== 'finalized';
  return nxt > cur;
}

/** HF-373 Phase F (D7) — pure phase guard (unit-tested): a terminal phase ('failed'/'cancelled')
 *  is never overwritten by a non-terminal one, and phases only advance (a late duplicate writer
 *  can never regress the record the UIs trust). */
export function phaseMayAdvance(current: string | null | undefined, next: JobPhase): boolean {
  const cur = JOB_PHASE_RANK[current ?? ''] ?? -1;
  const nxt = JOB_PHASE_RANK[next] ?? -1;
  if ((current === 'failed' || current === 'cancelled') && nxt < 8) return false;
  return nxt > cur;
}

/** HF-373 Phase F (D7) — pure predicate (unit-tested, shared by the outcome-aware terminal stamp
 *  and the dispatch-jobs requeue gate): is this job a COMMIT-STAGE failure? Keyed on our own
 *  writers' structural markers — metadata.phase='failed' (markSessionJobs) and the mechanical
 *  error_detail prefixes (recordCommitFailureOnJob / execute-bulk) — never a prose scan. */
export function isCommitStageFailure(
  status: string | null | undefined,
  phase: string | null | undefined,
  errorDetail: string | null | undefined,
): boolean {
  if (phase === 'failed') return true;
  if (typeof errorDetail === 'string' && /^(Commit failed|Commit error|Hand-off enqueue failed)/.test(errorDetail)) return true;
  return false;
}

async function patchJobs(
  supabase: SupabaseClient,
  jobs: Array<{ id: string; status: string | null; metadata: Record<string, unknown> | null }>,
  patch: JobPatch,
): Promise<number> {
  let updated = 0;
  for (const job of jobs) {
    const update: Record<string, unknown> = {};
    const statusRejected = !!patch.status && !statusMayAdvance(job.status, patch.status);
    if (patch.status && !statusRejected) update.status = patch.status;
    // HF-373 Phase F (D7): phase + completed_at obey the SAME rank discipline as status.
    // A 'completed' phase additionally requires the status write (if any) to have been
    // accepted and the job to not be terminally failed — a failed import can never again
    // read phase='completed' + completed_at (the 2026-07-02 86K job lie).
    const currentPhase = ((job.metadata ?? {}) as { phase?: string }).phase ?? null;
    const phaseAccepted = !!patch.phase
      && phaseMayAdvance(currentPhase, patch.phase)
      && !(patch.phase === 'completed' && (statusRejected || job.status === 'failed'));
    if (phaseAccepted || patch.proposalId || patch.summaryError) {
      update.metadata = {
        ...(job.metadata ?? {}),
        ...(phaseAccepted ? { phase: patch.phase, phase_at: new Date().toISOString() } : {}),
        ...(patch.proposalId ? { proposal_id: patch.proposalId } : {}),
        ...(patch.summaryError ? { summary_error: patch.summaryError.slice(0, 500), summary_error_at: new Date().toISOString() } : {}),
      };
    }
    if (patch.errorDetail) update.error_detail = patch.errorDetail.slice(0, 2000);
    if (patch.completedAt && !statusRejected && job.status !== 'failed') update.completed_at = new Date().toISOString();
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

/**
 * HF-373 Phase F (D7) — the OUTCOME-AWARE terminal stamp finalize-import applies. Pre-HF-373 the
 * stamp was unconditional ({status:'finalized', phase:'completed', completedAt}) with zero knowledge
 * of the commit outcome: the failed 86K import terminated "finalized/completed" with its error text
 * attached (after a dispatch-jobs requeue un-terminalized the failure), and a 0-jobs-matched stamp
 * was discarded silently. Per matched job:
 *   • a job that FAILED (status 'failed', phase 'failed', or a mechanical commit-failure marker in
 *     error_detail) keeps its failure — the stamp only ensures phase='failed', never 'completed',
 *     never a success completed_at;
 *   • every other job receives the truthful terminal transition (finalized/completed/completed_at).
 * Returns the per-outcome counts; matched===0 is the caller's loud anomaly.
 */
export async function finalizeJobsByProposalOutcomeAware(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string | null | undefined,
): Promise<{ matched: number; finalized: number; failedPreserved: number }> {
  if (!proposalId) return { matched: 0, finalized: 0, failedPreserved: 0 };
  try {
    const { data, error } = await supabase
      .from('processing_jobs')
      .select('id, status, metadata, error_detail')
      .eq('tenant_id', tenantId)
      .eq('metadata->>proposal_id', proposalId);
    if (error || !data?.length) return { matched: 0, finalized: 0, failedPreserved: 0 };
    type Row = { id: string; status: string | null; metadata: Record<string, unknown> | null; error_detail: string | null };
    const rows = data as unknown as Row[];
    let finalized = 0;
    let failedPreserved = 0;
    for (const job of rows) {
      const phase = ((job.metadata ?? {}) as { phase?: string }).phase ?? null;
      const isFailed = job.status === 'failed' || isCommitStageFailure(job.status, phase, job.error_detail);
      if (isFailed) {
        await patchJobs(supabase, [job], { phase: 'failed' });
        failedPreserved++;
      } else {
        await patchJobs(supabase, [job], { status: 'finalized', phase: 'completed', completedAt: true });
        finalized++;
      }
    }
    return { matched: rows.length, finalized, failedPreserved };
  } catch (e) {
    console.warn(`[job-status] finalizeJobsByProposalOutcomeAware failed (non-blocking): ${e instanceof Error ? e.message : e}`);
    return { matched: 0, finalized: 0, failedPreserved: 0 };
  }
}
