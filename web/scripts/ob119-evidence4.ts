import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  // Get all calculation results with total_payout
  const { data: allResults } = await sb.from("calculation_results")
    .select("total_payout, rule_set_id, period_id, entity_id")
    .eq("tenant_id", TENANT);
  
  console.log("=== CALCULATION_RESULTS ===");
  console.log(`Total rows: ${allResults?.length}`);
  
  let grandTotal = 0;
  const byRuleSet: Record<string, { count: number; total: number; nonZero: number }> = {};
  const byPeriod: Record<string, { count: number; total: number }> = {};
  
  for (const r of allResults || []) {
    const payout = r.total_payout || 0;
    grandTotal += payout;
    
    const rsId = r.rule_set_id;
    if (!byRuleSet[rsId]) byRuleSet[rsId] = { count: 0, total: 0, nonZero: 0 };
    byRuleSet[rsId].count++;
    byRuleSet[rsId].total += payout;
    if (payout > 0) byRuleSet[rsId].nonZero++;
    
    const pId = r.period_id;
    if (!byPeriod[pId]) byPeriod[pId] = { count: 0, total: 0 };
    byPeriod[pId].count++;
    byPeriod[pId].total += payout;
  }
  
  console.log(`Grand total: $${grandTotal.toLocaleString()}`);
  
  // Get rule set names
  const { data: ruleSets } = await sb.from("rule_sets")
    .select("id, name")
    .eq("tenant_id", TENANT);
  const rsNames: Record<string, string> = {};
  for (const rs of ruleSets || []) rsNames[rs.id] = rs.name;
  
  console.log("\nBy Rule Set:");
  for (const [rsId, data] of Object.entries(byRuleSet)) {
    console.log(`  ${rsNames[rsId] || rsId}: ${data.count} results, ${data.nonZero} non-zero, $${data.total.toLocaleString()}`);
  }
  
  // Get period names
  const { data: periods } = await sb.from("periods")
    .select("id, canonical_key")
    .eq("tenant_id", TENANT);
  const pNames: Record<string, string> = {};
  for (const p of periods || []) pNames[p.id] = p.canonical_key;
  
  console.log("\nBy Period:");
  for (const [pId, data] of Object.entries(byPeriod)) {
    console.log(`  ${pNames[pId] || pId}: ${data.count} results, $${data.total.toLocaleString()}`);
  }
  
  // Show a non-zero result sample
  const nonZeroResults = (allResults || []).filter(r => r.total_payout > 0);
  console.log(`\nNon-zero payouts: ${nonZeroResults.length}`);
  for (const r of nonZeroResults.slice(0, 5)) {
    console.log(`  entity=${r.entity_id.substring(0,8)}, period=${pNames[r.period_id]}, payout=$${r.total_payout.toLocaleString()}`);
  }
}

main().catch(console.error);
