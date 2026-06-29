// HF-358 (Part B-1) — record a commit failure on the import job (processing_jobs), keyed by session.
//
// DIAG-078 defect #2: every commit-failure exit wrote `import_batches.error_summary` but NEVER the
// job-visible `processing_jobs.error_detail` — so every diagnostic query saw `error_detail = null` and the
// job sat non-terminal with no recorded reason. This makes the job row carry the mechanical failure reason
// AND a terminal status, so a failed commit is never a silent non-event.
//
// KEY (FP-49 verified): `processing_jobs.session_id` is the import-session id the client threads through
// the whole lifecycle (enqueue → classified → committing → committed). It is NOT the proposal's
// `proposalId` (that is a fresh uuid minted client-side at `page.tsx:441`), so the commit must be told the
// real `session_id` — `execute-bulk` now receives it in the request body and passes it here.
//
// Reconciliation-channel separation: `error_detail` records MECHANICAL failure reasons only (upload / RPC /
// data-loss / exception), never reconciliation or answer values. Best-effort + non-throwing: a failure to
// record must not mask or replace the original commit failure.

import type { SupabaseClient } from '@supabase/supabase-js';

/** Terminal status for a failed import job (the value dispatch-jobs requeue and the kill switch key on). */
export const JOB_TERMINAL_FAILED = 'failed';

/**
 * Mark the session's job(s) terminally failed with a human-readable reason. Tenant- AND session-scoped.
 * `.neq('status', 'committed')` so a genuinely-committed job is never flipped to failed by a late/duplicate
 * failure signal. No-op (0 rows) on the synchronous path where no processing_job exists. Returns the number
 * of job rows updated (for tests/telemetry); never throws.
 */
export async function recordCommitFailureOnJob(
  supabase: SupabaseClient,
  tenantId: string,
  sessionId: string | null | undefined,
  reason: string,
): Promise<number> {
  if (!sessionId) return 0; // synchronous import — no job to mark
  try {
    const { data, error } = await supabase
      .from('processing_jobs')
      .update({
        status: JOB_TERMINAL_FAILED,
        error_detail: reason.slice(0, 2000),
        completed_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('session_id', sessionId)
      .neq('status', 'committed')
      .select('id');
    if (error) {
      console.warn(`[recordCommitFailureOnJob] non-blocking update error: ${error.message}`);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.warn('[recordCommitFailureOnJob] non-blocking exception:', err instanceof Error ? err.message : err);
    return 0;
  }
}
