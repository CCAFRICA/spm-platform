// HF-286 — read-only proof: evaluate the poller-stop predicate (allUnitsSettled)
// against REAL import_session_telemetry records. No mutation, single-table read.
// Proves the predicate fires correctly on production-shaped data: settled sessions
// → STOP (true), in-flight sessions → keep polling (false). Run from web/:
//   set -a && source .env.local && set +a && npx tsx scripts/diag/hf286-predicate-on-real-sessions.ts
import { createClient } from '@supabase/supabase-js';
import { projectSessionStateView } from '../../src/lib/sci/session-telemetry-accumulator';
import { allUnitsSettled, SETTLED_STATES } from '../../src/lib/sci/comprehension-state-service';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // read-only: most recent telemetry records (any tenant)
  const { data, error } = await supabase
    .from('import_session_telemetry')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(25);
  if (error) { console.error('read failed:', error.message); process.exit(1); }

  console.log(`SETTLED_STATES = {${Array.from(SETTLED_STATES).join(', ')}}`);
  console.log(`Inspected ${data?.length ?? 0} most-recent import_session_telemetry rows\n`);
  console.log('predicate(stop?) | #units | states (count) | importSessionId');
  console.log('-----------------+--------+----------------+----------------');

  let settledCount = 0, inflightCount = 0, emptyCount = 0;
  for (const rec of (data ?? [])) {
    const view = projectSessionStateView(rec, rec.tenant_id, rec.import_session_id);
    const stop = allUnitsSettled(view.units);
    const byState: Record<string, number> = {};
    for (const u of view.units) byState[u.state] = (byState[u.state] ?? 0) + 1;
    const stateStr = Object.entries(byState).map(([s, n]) => `${s}:${n}`).join(' ') || '(empty)';
    if (view.units.length === 0) emptyCount++;
    else if (stop) settledCount++;
    else inflightCount++;
    console.log(`${String(stop).padEnd(16)} | ${String(view.units.length).padStart(6)} | ${stateStr.padEnd(14)} | ${rec.import_session_id}`);
  }

  console.log(`\nSUMMARY: ${settledCount} settled→STOP  |  ${inflightCount} in-flight→KEEP POLLING  |  ${emptyCount} empty→KEEP POLLING`);
  // Cross-check: every settled row must have all units in SETTLED_STATES; every
  // in-flight row must have ≥1 unit outside it. (Self-verifying invariant.)
  let ok = true;
  for (const rec of (data ?? [])) {
    const view = projectSessionStateView(rec, rec.tenant_id, rec.import_session_id);
    if (view.units.length === 0) continue;
    const allIn = view.units.every(u => SETTLED_STATES.has(u.state));
    if (allUnitsSettled(view.units) !== allIn) { ok = false; console.error('INVARIANT VIOLATION on', rec.import_session_id); }
  }
  console.log(`INVARIANT (predicate ⇔ all-units-in-settled-set): ${ok ? 'HOLDS' : 'VIOLATED'}`);
}
main().catch(e => { console.error(e); process.exit(1); });
