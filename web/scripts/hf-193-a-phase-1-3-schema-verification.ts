// HF-193-A Phase 1.3: Post-migration schema verification
//
// Verifies the three scoping columns added by migration
// 20260421030000_hf_193_a_signal_surface_schema.sql are present on
// classification_signals. Permanent regression coverage — re-runnable.
//
// Approach 3a: information_schema.columns query via Supabase JS client.
// Fallback 3b: behavioral INSERT+DELETE test if 3a metadata access is blocked.
// Index presence: accepted on Supabase SQL Editor output at apply time.
//
// Usage:  npx tsx --env-file=.env.local scripts/hf-193-a-phase-1-3-schema-verification.ts

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EXPECTED_COLUMNS = ['rule_set_id', 'metric_name', 'component_index'] as const;
const STRUCTURAL_MARKER = '__hf_193_a_phase_1_3_structural_verification__';

async function approach3a(): Promise<'pass' | 'inconclusive'> {
  console.log('Approach 3a — information_schema.columns query via PostgREST');
  const { data, error } = await sb
    // @ts-expect-error — information_schema is not in the PostgREST-typed schema; we probe whether it is exposed at all.
    .from('information_schema.columns')
    .select('column_name, data_type, is_nullable')
    .eq('table_name', 'classification_signals')
    .in('column_name', [...EXPECTED_COLUMNS]);

  if (error) {
    console.log('  3a error (expected on default PostgREST config):', error.code, error.message);
    return 'inconclusive';
  }
  console.log('  3a rows:', JSON.stringify(data, null, 2));
  const names = (data ?? []).map((r: { column_name: string }) => r.column_name).sort();
  const expected = [...EXPECTED_COLUMNS].sort();
  const match = names.length === expected.length && names.every((n: string, i: number) => n === expected[i]);
  return match ? 'pass' : 'inconclusive';
}

async function approach3b(): Promise<'pass' | 'fail'> {
  console.log('Approach 3b — behavioral INSERT+DELETE probe');

  // Find any existing tenant for a valid FK (structural test only; no business semantics)
  const { data: tenants, error: tenantErr } = await sb
    .from('tenants')
    .select('id')
    .limit(1);
  if (tenantErr || !tenants?.[0]) {
    console.error('  3b FAIL: could not read any tenant for structural test', tenantErr);
    return 'fail';
  }
  const tenantId = tenants[0].id;
  console.log('  Using tenant_id:', tenantId);

  const testRow = {
    tenant_id: tenantId,
    signal_type: 'metric_comprehension',
    signal_value: {},
    rule_set_id: '00000000-0000-0000-0000-000000000000',
    metric_name: STRUCTURAL_MARKER,
    component_index: 0,
  };

  const { data: inserted, error: insertErr } = await sb
    .from('classification_signals')
    .insert(testRow)
    .select('id, rule_set_id, metric_name, component_index, signal_type');

  if (insertErr) {
    console.error('  3b INSERT error:', insertErr.code, insertErr.message);
    if (insertErr.details) console.error('    details:', insertErr.details);
    if (insertErr.hint) console.error('    hint:', insertErr.hint);
    return 'fail';
  }

  console.log('  3b INSERT succeeded. Returned row:');
  console.log(JSON.stringify(inserted, null, 2));

  // Read back to confirm persistence
  const { data: readBack, error: readErr } = await sb
    .from('classification_signals')
    .select('id, rule_set_id, metric_name, component_index, signal_type')
    .eq('metric_name', STRUCTURAL_MARKER)
    .limit(1);
  if (readErr || !readBack?.[0]) {
    console.error('  3b read-back error:', readErr);
    return 'fail';
  }
  const row = readBack[0];
  const shapeOk =
    row.rule_set_id === '00000000-0000-0000-0000-000000000000' &&
    row.metric_name === STRUCTURAL_MARKER &&
    row.component_index === 0 &&
    row.signal_type === 'metric_comprehension';
  console.log('  3b read-back row:', JSON.stringify(row, null, 2));
  console.log('  3b round-trip shape check:', shapeOk ? 'PASS' : 'FAIL');

  // Clean up
  const { error: delErr } = await sb
    .from('classification_signals')
    .delete()
    .eq('metric_name', STRUCTURAL_MARKER);
  if (delErr) {
    console.error('  3b cleanup DELETE error (manual cleanup may be needed):', delErr);
    return 'fail';
  }
  console.log('  3b cleanup DELETE succeeded.');

  return shapeOk ? 'pass' : 'fail';
}

(async () => {
  console.log('HF-193-A Phase 1.3 schema verification');
  console.log('Target: classification_signals new columns rule_set_id, metric_name, component_index');
  console.log('');

  const r3a = await approach3a();
  console.log('');

  if (r3a === 'pass') {
    console.log('VERIFICATION PASS (via Approach 3a — information_schema query)');
    process.exit(0);
  }

  console.log('Approach 3a inconclusive; falling back to Approach 3b');
  console.log('');
  const r3b = await approach3b();
  console.log('');

  if (r3b === 'pass') {
    console.log('VERIFICATION PASS (via Approach 3b — behavioral INSERT+DELETE)');
    console.log('All three columns (rule_set_id, metric_name, component_index) accept');
    console.log('values of the expected types and round-trip correctly through PostgREST.');
    process.exit(0);
  }

  console.error('VERIFICATION FAIL — migration application may have issues');
  process.exit(1);
})();
