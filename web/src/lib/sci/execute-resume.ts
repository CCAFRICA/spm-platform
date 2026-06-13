// OB-203 Phase 6B / Phase B — resume disposition (pure).
//
// Execute-bulk is resumable BY CONSTRUCTION: every invocation classifies each
// requested unit against the durable spine before processing. Response/process
// death at any point cannot orphan a unit — the next invocation walks the
// proposal's unit list (never a batch scan, so a never-created-a-batch unit
// cannot hide: the A3 gap closed operationally per the HALT-1 disposition §3)
// and reprocesses exactly the units no live owner holds.
//
// Ownership arbitration: the D16.1 liveness window IS the lease. A 'processing'
// batch inside the window may belong to a still-running owner (the warm witness
// proved a dead RESPONSE is not a dead SERVER) — leave it; polling settles it
// if alive, and the next resume sweeps + reprocesses it once the lease expires.

export type ResumeDisposition =
  | 'process'              // no owner, no terminal truth — this invocation does the work
  | 'skip_terminal'        // bound / resolved / failed_interpretation on the spine
  | 'skip_completed_batch' // commit landed; only the bound emission died — re-emit, skip
  | 'skip_in_flight';      // a possibly-live owner holds the lease — do not double-process

// D16.1: a 'processing' batch older than this cannot still be in-flight (the
// execute lifecycle caps at Vercel's 300s; buffered well beyond). Configuration,
// not architecture (Scale Reference: timeouts are config) — the controlled
// kill-test EPG shortens it; the arbitration logic is identical at any value.
export function batchLivenessMs(): number {
  const env = Number(process.env.OB203_BATCH_LIVENESS_MS ?? '');
  return Number.isFinite(env) && env > 0 ? env : 6 * 60 * 1000;
}

export function classifyUnitForResume(params: {
  spineState: string | null;                                    // effective unit state from the session record (resolved-sticky)
  latestBatch: { status: string; createdAt: string } | null;    // the unit's newest import_batches row this session
  livenessMs: number;
  nowMs: number;
}): ResumeDisposition {
  const { spineState, latestBatch, livenessMs, nowMs } = params;
  if (spineState === 'bound' || spineState === 'resolved' || spineState === 'failed_interpretation') {
    return 'skip_terminal';
  }
  if (latestBatch?.status === 'completed') {
    return 'skip_completed_batch';
  }
  if (latestBatch?.status === 'processing') {
    const age = nowMs - Date.parse(latestBatch.createdAt);
    if (Number.isFinite(age) && age < livenessMs) return 'skip_in_flight';
  }
  return 'process';
}
