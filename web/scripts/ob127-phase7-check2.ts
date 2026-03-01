import { createClient } from '@supabase/supabase-js';
const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";
const MBC = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);
async function main() {
  // LAB results
  const { data: labRS } = await supabase
    .from('rule_sets')
    .select('id, name')
    .eq('tenant_id', LAB)
    .eq('status', 'active');

  console.log('=== LAB Calculation Results ===');
  for (const rs of (labRS || [])) {
    const { data: results } = await supabase
      .from('calculation_results')
      .select('id, total_payout, entity_id')
      .eq('tenant_id', LAB)
      .eq('rule_set_id', rs.id);

    const count = results?.length || 0;
    const total = (results || []).reduce((sum, r) => sum + Number(r.total_payout || 0), 0);
    console.log(`  ${rs.name}: ${count} results, $${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

    if (count > 0 && rs.name.toLowerCase().includes('deposit')) {
      const amounts = (results || []).map(r => Number(r.total_payout || 0));
      const unique = new Set(amounts.map(a => a.toFixed(2)));
      console.log(`    Unique payouts: ${unique.size}`);
      console.log(`    Sample: ${Array.from(unique).slice(0, 5).join(', ')}`);
    }
  }

  // MBC results
  console.log('\n=== MBC Calculation Results ===');
  const { data: mbcRS } = await supabase
    .from('rule_sets')
    .select('id, name')
    .eq('tenant_id', MBC)
    .eq('status', 'active');

  let mbcTotal = 0;
  let mbcCount = 0;
  for (const rs of (mbcRS || [])) {
    const { data: results } = await supabase
      .from('calculation_results')
      .select('total_payout')
      .eq('tenant_id', MBC)
      .eq('rule_set_id', rs.id);

    const count = results?.length || 0;
    const total = (results || []).reduce((sum, r) => sum + Number(r.total_payout || 0), 0);
    mbcTotal += total;
    mbcCount += count;
    console.log(`  ${rs.name}: ${count} results, $${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  }
  console.log(`  MBC TOTAL: ${mbcCount} results, $${mbcTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
}
main().catch(console.error);
