// OB-136 Phase 8 — LAB + MBC regression
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function run() {
  // LAB regression
  const LAB = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
  const { data: labData, count: labCount } = await sb.from('calculation_results')
    .select('total_payout', { count: 'exact' })
    .eq('tenant_id', LAB);

  const labTotal = labData?.reduce((s, r) => s + parseFloat(r.total_payout || '0'), 0) || 0;
  const labPass = labCount === 268 && Math.abs(labTotal - 8498311.77) < 1;
  console.log('=== LAB REGRESSION ===');
  console.log('Results:', labCount, 'Expected: 268', labCount === 268 ? 'OK' : 'MISMATCH');
  console.log('Total:', labTotal.toLocaleString(), 'Expected: $8,498,311.77');
  console.log('Status:', labPass ? 'PASS' : 'FAIL');

  // MBC regression
  const MBC = '7e31a1d0-8c14-41c0-9f01-471f3842834c';
  const { data: mbcData, count: mbcCount } = await sb.from('calculation_results')
    .select('total_payout', { count: 'exact' })
    .eq('tenant_id', MBC);

  const mbcTotal = mbcData?.reduce((s, r) => s + parseFloat(r.total_payout || '0'), 0) || 0;
  const mbcPass = mbcCount === 240 && Math.abs(mbcTotal - 3245212.66) < 1;
  console.log('\n=== MBC REGRESSION ===');
  console.log('Results:', mbcCount, 'Expected: 240', mbcCount === 240 ? 'OK' : 'MISMATCH');
  console.log('Total:', mbcTotal.toLocaleString(), 'Expected: $3,245,212.66');
  console.log('Status:', mbcPass ? 'PASS' : 'FAIL');

  // PTC verification (post-fix)
  const PTC = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
  const { data: ptcRS } = await sb.from('rule_sets')
    .select('id, name, input_bindings')
    .eq('tenant_id', PTC)
    .eq('status', 'active');

  console.log('\n=== PTC PLAN-READINESS (POST-FIX) ===');
  for (const rs of ptcRS || []) {
    const b = rs.input_bindings as Record<string, unknown> | null;
    const hasBindings = (b && Object.keys(b).length > 0);
    console.log('Plan:', rs.name);
    console.log('  input_bindings has content:', hasBindings);
  }

  const { count: ptcData } = await sb.from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', PTC);
  console.log('  committed_data rows:', ptcData);
  console.log('  hasBindings (auto-resolve):', (ptcData || 0) > 0);

  const { count: ptcAssign } = await sb.from('rule_set_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', PTC);
  console.log('  assignments (exact count):', ptcAssign);

  const isReady = (ptcAssign || 0) > 0 && (ptcData || 0) > 0;
  console.log('  isReady:', isReady);

  // Overall
  console.log('\n=== OVERALL ===');
  console.log('LAB:', labPass ? 'PASS' : 'FAIL');
  console.log('MBC:', mbcPass ? 'PASS' : 'FAIL');
  console.log('PTC ready:', isReady ? 'PASS' : 'FAIL');
}

run().catch(console.error);
