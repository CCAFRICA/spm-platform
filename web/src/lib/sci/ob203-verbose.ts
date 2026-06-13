// OB-203 §2 — VERBOSE witness-trace layer (env-gated; default OFF, architect arms it for witness runs).
//
// A SINGLE trace surface logging each counter-relevant ingestion event with a timestamp, so a future run
// failure is reconstructable from the console alone — no screenshots, no guessing what the platform did.
// It logs the SAME events the durable telemetry counters derive from (fingerprint decision, atom claim,
// LLM call/bypass, signal write, pulse commit) — one line each, machine-greppable by the `[OB203_VERBOSE]`
// tag and the event name.
//
// Gating: process.env.OB203_VERBOSE truthy ('1' / 'true'). Off → ob203Trace is a no-op (zero overhead
// beyond the env check). This NEVER changes behavior; it only narrates it.

export type Ob203Event =
  | 'fingerprint'      // tier decision per sheet (tier, match, resolver)
  | 'atom'             // atom claim (known-from-memory vs novel→comprehend)
  | 'llm'              // an LLM call was made OR bypassed-by-memory
  | 'binding'          // fieldBindings injected from the flywheel (warm path)
  | 'signal'           // a durable signal write
  | 'pulse'            // a write-pulse committed (execute)
  | 'unit';            // a unit reached a spine state (comprehended / bound / failed)

function verboseOn(): boolean {
  const v = process.env.OB203_VERBOSE;
  return v === '1' || v === 'true' || v === 'TRUE';
}

/**
 * Emit one verbose trace line when armed. `data` is shallow-serialized. Never throws — tracing must never
 * perturb the path it observes.
 */
export function ob203Trace(event: Ob203Event, data: Record<string, unknown>): void {
  if (!verboseOn()) return;
  try {
    // Timestamps come from the runtime clock here (app code, not a workflow script) — fine to use.
    const ts = new Date().toISOString();
    console.log(`[OB203_VERBOSE] ${ts} ${event} ${JSON.stringify(data)}`);
  } catch {
    /* tracing is best-effort */
  }
}
