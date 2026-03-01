/**
 * OB-127 Phase 7: Quick check — verify calculation_results format and regression
 */
import { createClient } from '@supabase/supabase-js';

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";
const MBC = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  // Check LAB results
  console.log("=== LAB Calculation Results ===");
  const { data: labRS } = await supabase
    .from('rule_sets')
    .select('id, name, status')
    .eq('tenant_id', LAB);

  for (const rs of (labRS || [])) {
    const { data: results, count } = await supabase
      .from('calculation_results')
      .select('result_data', { count: 'exact' })
      .eq('tenant_id', LAB)
      .eq('rule_set_id', rs.id)
      .limit(2);

    console.log(`  ${rs.name} [${rs.status}]: ${count} results`);
    if (results && results.length > 0) {
      const rd = results[0].result_data as Record<string, unknown>;
      console.log(`    Sample keys: ${Object.keys(rd).join(', ')}`);
      console.log(`    Sample: ${JSON.stringify(rd).substring(0, 200)}`);
    }
  }

  // Check MBC results
  console.log("\n=== MBC Calculation Results ===");
  const { data: mbcRS } = await supabase
    .from('rule_sets')
    .select('id, name, status')
    .eq('tenant_id', MBC);

  let mbcTotal = 0;
  let mbcCount = 0;
  for (const rs of (mbcRS || [])) {
    const { data: results, count } = await supabase
      .from('calculation_results')
      .select('result_data', { count: 'exact' })
      .eq('tenant_id', MBC)
      .eq('rule_set_id', rs.id)
      .limit(2);

    console.log(`  ${rs.name} [${rs.status}]: ${count} results`);
    if (results && results.length > 0) {
      const rd = results[0].result_data as Record<string, unknown>;
      console.log(`    Sample keys: ${Object.keys(rd).join(', ')}`);
      // Try to find the payout amount field
      const amount = Number(rd.calculated_amount || rd.payout || rd.total_payout || rd.result || 0);
      console.log(`    Sample amount: ${amount}`);
    }

    for (const r of (results || [])) {
      const rd = r.result_data as Record<string, unknown>;
      mbcTotal += Number(rd.calculated_amount || rd.payout || rd.total_payout || rd.result || 0);
    }
    mbcCount += count || 0;
  }

  console.log(`\n  MBC total from sample: $${mbcTotal.toFixed(2)} (${mbcCount} results)`);
}

main().catch(console.error);
