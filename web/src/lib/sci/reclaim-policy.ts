// HF-358 (Part B-2) — the stale-job reclaim policy, extracted as a PURE function so it can be tested in a
// loop (a repeatedly-crashing job must converge to a terminal state, never re-dispatch forever — DIAG-078
// defect #3). dispatch-jobs imports this; the test drives it across ticks.

// A stuck 'classifying' job → 'pending' (re-classified). A stuck 'committing' job → 'classified'
// (re-committed via the idempotent execute-bulk resume), NOT 'pending'.
export const RECLAIM_STAGE_TARGET: Record<'classifying' | 'committing', string> = {
  classifying: 'pending',
  committing: 'classified',
};

/**
 * The conditional-update patch for reclaiming one stale job. Each reclaim INCREMENTS retry_count; once it
 * reaches `maxRetries` the job is marked TERMINALLY 'failed' with a job-visible reason instead of being
 * reset — so a worker that keeps crashing stops being re-dispatched. Pure (no I/O); `nowIso` is passed in.
 */
export function reclaimPatch(
  stuckStatus: 'classifying' | 'committing',
  retryCount: number | null | undefined,
  maxRetries: number,
  nowIso: string,
): { status: string; retry_count: number; error_detail?: string; completed_at?: string } {
  const nextRetry = (retryCount ?? 0) + 1;
  if (nextRetry >= maxRetries) {
    return {
      status: 'failed',
      retry_count: nextRetry,
      error_detail: `Reclaimed ${nextRetry} times without completing (likely repeated worker crash/OOM) — giving up.`,
      completed_at: nowIso,
    };
  }
  return { status: RECLAIM_STAGE_TARGET[stuckStatus], retry_count: nextRetry };
}
