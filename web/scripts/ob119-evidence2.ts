import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  // Calculation results - try entity_period_outcomes
  const { data: outcomes, count: outcomeCount } = await sb.from("entity_period_outcomes")
    .select("*", { count: "exact" })
    .eq("tenant_id", TENANT)
    .limit(10);
  console.log("=== ENTITY_PERIOD_OUTCOMES ===");
  console.log(`Count: ${outcomeCount}`);
  if (outcomes?.length) {
    let grandTotal = 0;
    for (const o of outcomes) {
      const payout = (o as any).total_payout || (o as any).payout || 0;
      grandTotal += payout;
      console.log(`  entity=${(o as any).entity_id?.substring(0,8)}, period=${(o as any).period_id?.substring(0,8)}, payout=${payout}`);
    }
    console.log(`Grand total (first 10): $${grandTotal.toLocaleString()}`);
  }

  // Try calculation_results with different approach
  const { data: calcRes, error: calcErr } = await sb.from("calculation_results")
    .select("id, rule_set_id, entity_id, period_id, result_data")
    .eq("tenant_id", TENANT)
    .limit(5);
  console.log("\n=== CALCULATION_RESULTS ===");
  if (calcErr) console.log(`Error: ${calcErr.message}`);
  console.log(`Rows: ${calcRes?.length}`);
  let totalPayout = 0;
  for (const cr of calcRes || []) {
    const rd = cr.result_data as any;
    const payout = rd?.total_payout || rd?.payout || rd?.totalPayout || 0;
    totalPayout += payout;
    console.log(`  entity=${cr.entity_id?.substring(0,8)}, keys=${rd ? Object.keys(rd).join(",") : "null"}, payout=${payout}`);
    if (rd) console.log(`    sample: ${JSON.stringify(rd).substring(0, 200)}`);
  }
  
  // Count all calculation results
  const { count: totalCalcCount } = await sb.from("calculation_results")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT);
  console.log(`Total calculation_results: ${totalCalcCount}`);

  // Sum all payouts
  const { data: allCalc } = await sb.from("calculation_results")
    .select("result_data")
    .eq("tenant_id", TENANT);
  let grand = 0;
  for (const cr of allCalc || []) {
    const rd = cr.result_data as any;
    if (rd?.total_payout) grand += rd.total_payout;
    else if (rd?.payout) grand += rd.payout;
    else if (rd?.totalPayout) grand += rd.totalPayout;
  }
  console.log(`Grand total all payouts: $${grand.toLocaleString()}`);

  // Product licenses
  const { data: licenses, count: licCount } = await sb.from("product_licenses")
    .select("*", { count: "exact" })
    .eq("tenant_id", TENANT)
    .limit(5);
  console.log("\n=== PRODUCT_LICENSES ===");
  console.log(`Count: ${licCount}`);
  for (const l of licenses || []) {
    console.log(`  entity=${(l as any).entity_id?.substring(0,8)}, rule_set=${(l as any).rule_set_id?.substring(0,8)}`);
  }

  // Calculation batches
  const { data: batches } = await sb.from("calculation_batches")
    .select("id, status, created_at, result_summary")
    .eq("tenant_id", TENANT)
    .order("created_at", { ascending: false })
    .limit(3);
  console.log("\n=== CALCULATION_BATCHES ===");
  for (const b of batches || []) {
    console.log(`  batch=${b.id.substring(0,8)}, status=${b.status}, summary=${JSON.stringify(b.result_summary)?.substring(0, 200)}`);
  }
}

main().catch(console.error);
