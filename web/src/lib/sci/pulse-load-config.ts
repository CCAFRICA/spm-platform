// HF-360 (Part A) — the hand-off ACTIVATION gate. The pg_cron worker that performs the loads is
// architect-applied (the migration + cron.schedule are SR-44 — CC does not apply them). This flag lets the
// CODE deploy safely BEFORE the worker is live: with it off, the commit path is byte-identical to HF-359
// (synchronous load); the architect flips it ON only AFTER applying the migration and scheduling the worker.
//
// This is NOT a permanent second commit route — it is the cutover switch for the architect-pending worker.
// Once the worker is proven in production, the flag + the synchronous branch can be retired, leaving the
// hand-off as the sole load path (the directive's "one path"). Until then, an unsequenced deploy (code live,
// worker not scheduled) MUST NOT silently stage rows that never load — the flag prevents exactly that.
export function isPulseHandoffEnabled(): boolean {
  return process.env.PULSE_LOAD_HANDOFF === 'true';
}
