// OB-197 Phase 1C — post-migration verification.
// Verifies via Supabase service-role client that migration 024 applied correctly.
//
// Checks performed:
//   (a) classification_signals has 24 columns including calculation_run_id
//   (b) signal_type distribution shows ONLY prefix-form values
//   (c) CHECK constraint enforced — INSERT with invalid signal_type fails
//   (d) Three indexes present — DEFERRED: pg_indexes / information_schema not
//       exposed via PostgREST. Architect must verify via SQL Editor paste; this
//       script emits the query.
//
// Phase 1C architect confirmation — 3/3 indexes verified via SQL Editor:
//   SELECT indexname FROM pg_indexes
//    WHERE tablename = 'classification_signals'
//      AND indexname IN ('idx_cs_run_id', 'idx_cs_tenant_run_type', 'idx_cs_tenant_type_created')
//    ORDER BY indexname;
//   Result:
//     idx_cs_run_id
//     idx_cs_tenant_run_type
//     idx_cs_tenant_type_created
//   Phase 1C closed. All four checks (a)(b)(c)(d) PASS.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PREFIX_PATTERN = /^(classification|comprehension|convergence|cost|lifecycle):/;

function section(title: string) {
  console.log(`\n${'='.repeat(72)}\n${title}\n${'='.repeat(72)}`);
}

let halt = false;

async function checkA_columns() {
  section('(a) Column check — expect 24 incl. calculation_run_id');
  const { data, error } = await supabase
    .from('classification_signals')
    .select('*')
    .limit(1);
  if (error) {
    console.log(`FAIL — sample failed: ${error.message}`);
    halt = true;
    return;
  }
  const cols = data && data.length ? Object.keys(data[0]).sort() : [];
  console.log(`column count: ${cols.length}`);
  console.log(`columns: ${cols.join(', ')}`);
  const hasRunId = cols.includes('calculation_run_id');
  console.log(`calculation_run_id present: ${hasRunId}`);
  if (cols.length !== 24 || !hasRunId) {
    console.log('FAIL — expected 24 columns with calculation_run_id');
    halt = true;
  } else {
    console.log('PASS');
  }
}

async function checkB_distribution() {
  section('(b) signal_type distribution — expect prefix-form only');
  const { data, error } = await supabase
    .from('classification_signals')
    .select('signal_type');
  if (error) {
    console.log(`FAIL — query: ${error.message}`);
    halt = true;
    return;
  }
  const dist: Record<string, number> = {};
  for (const r of data ?? []) dist[r.signal_type] = (dist[r.signal_type] ?? 0) + 1;
  const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  for (const [t, c] of sorted) console.log(`  ${t}: ${c}`);
  const offenders = Object.keys(dist).filter((t) => !PREFIX_PATTERN.test(t));
  if (offenders.length > 0) {
    console.log(`FAIL — non-prefix signal_types: ${JSON.stringify(offenders)}`);
    halt = true;
  } else {
    console.log('PASS');
  }
}

async function checkC_constraint() {
  section("(c) CHECK constraint — INSERT with signal_type='invalid_test_value' must fail");
  // Need a real tenant_id (FK NOT NULL). Reuse a tenant from existing rows.
  const { data: anyRow, error: pickErr } = await supabase
    .from('classification_signals')
    .select('tenant_id')
    .limit(1);
  if (pickErr || !anyRow || anyRow.length === 0) {
    console.log(`FAIL — cannot obtain a tenant_id for the test INSERT: ${pickErr?.message ?? 'no rows'}`);
    halt = true;
    return;
  }
  const tenantId = anyRow[0].tenant_id;
  const probeId = '00000000-1111-2222-3333-444444444444'; // sentinel id for cleanup if leak

  const { error: insertErr, data: inserted } = await supabase
    .from('classification_signals')
    .insert({
      id: probeId,
      tenant_id: tenantId,
      signal_type: 'invalid_test_value',
      signal_value: { ob197_phase1c_probe: true },
      context: {},
    })
    .select('id');

  if (!insertErr) {
    // Insert succeeded — constraint NOT enforced. Clean up the leak then HALT.
    console.log(`FAIL — INSERT with invalid signal_type SUCCEEDED (constraint not enforced)`);
    console.log(`leaked row id: ${inserted?.[0]?.id ?? '<unknown>'} — cleaning up`);
    await supabase.from('classification_signals').delete().eq('id', probeId);
    halt = true;
    return;
  }
  console.log(`INSERT rejected as expected. error: ${insertErr.message}`);
  // Confirm the rejection cites the CHECK constraint, not some other gate.
  const msg = insertErr.message.toLowerCase();
  const code = (insertErr as any).code ?? '<no-code>';
  console.log(`pg error code: ${code}`);
  if (msg.includes('check') || code === '23514') {
    console.log('PASS — rejection is from CHECK constraint');
  } else {
    console.log('FAIL — rejection but not from CHECK constraint (different gate intercepted)');
    halt = true;
  }
}

async function checkD_indexes() {
  section('(d) Indexes — DEFERRED to architect SQL Editor paste');
  console.log('PostgREST does not expose pg_indexes or information_schema.statistics.');
  console.log('Run the following query in Supabase SQL Editor and paste the result:');
  console.log('');
  console.log("  SELECT indexname FROM pg_indexes");
  console.log("   WHERE tablename = 'classification_signals'");
  console.log("     AND indexname IN ('idx_cs_run_id', 'idx_cs_tenant_run_type', 'idx_cs_tenant_type_created')");
  console.log("   ORDER BY indexname;");
  console.log('');
  console.log('Expected: three rows. Architect verifies; CC cannot from this surface.');
}

async function main() {
  await checkA_columns();
  await checkB_distribution();
  await checkC_constraint();
  await checkD_indexes();

  section('SUMMARY');
  if (halt) {
    console.log('HALT — at least one check failed. See output above.');
    process.exit(1);
  }
  console.log('Programmatic checks (a)(b)(c) PASS. (d) deferred to architect SQL Editor paste.');
}

main().catch((e) => {
  console.error('Unhandled:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
