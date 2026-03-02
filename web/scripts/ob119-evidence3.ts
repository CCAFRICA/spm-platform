import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  // Check calculation_results columns
  const { data: sample, error } = await sb.from("calculation_results")
    .select("*")
    .eq("tenant_id", TENANT)
    .limit(1);
  if (error) {
    console.log(`Error: ${error.message}`);
  } else if (sample?.length) {
    console.log("=== CALCULATION_RESULTS COLUMNS ===");
    console.log(Object.keys(sample[0]).join(", "));
    console.log(`Sample: ${JSON.stringify(sample[0]).substring(0, 500)}`);
  }

  // Get all outcomes with payouts
  const { data: allOutcomes } = await sb.from("entity_period_outcomes")
    .select("total_payout, payout, period_id, rule_set_id")
    .eq("tenant_id", TENANT);
  
  console.log("\n=== ALL ENTITY_PERIOD_OUTCOMES ===");
  console.log(`Count: ${allOutcomes?.length}`);
  
  // Check what fields exist
  if (allOutcomes?.length) {
    console.log(`Sample keys: ${Object.keys(allOutcomes[0]).join(", ")}`);
    console.log(`Sample: ${JSON.stringify(allOutcomes[0]).substring(0, 300)}`);
    
    // Sum payouts
    let grand = 0;
    for (const o of allOutcomes) {
      const pay = (o as any).total_payout || (o as any).payout || 0;
      grand += pay;
    }
    console.log(`Grand total: $${grand.toLocaleString()}`);
    
    // Group by period
    const byPeriod: Record<string, { count: number; total: number }> = {};
    for (const o of allOutcomes) {
      const pid = (o as any).period_id || "unknown";
      if (!byPeriod[pid]) byPeriod[pid] = { count: 0, total: 0 };
      byPeriod[pid].count++;
      byPeriod[pid].total += (o as any).total_payout || (o as any).payout || 0;
    }
    for (const [pid, data] of Object.entries(byPeriod)) {
      console.log(`  Period ${pid.substring(0, 8)}: ${data.count} outcomes, $${data.total.toLocaleString()}`);
    }
  }

  // Check what product_licenses table looks like
  const { data: plSample, error: plErr } = await sb.from("product_licenses")
    .select("*")
    .eq("tenant_id", TENANT)
    .limit(1);
  console.log("\n=== PRODUCT_LICENSES ===");
  if (plErr) console.log(`Error: ${plErr.message}`);
  if (plSample?.length) {
    console.log(`Columns: ${Object.keys(plSample[0]).join(", ")}`);
  } else {
    console.log("No product_licenses rows");
  }

  // Check rule_set_assignments instead
  const { data: rsa, count: rsaCount } = await sb.from("rule_set_assignments")
    .select("*", { count: "exact" })
    .eq("tenant_id", TENANT)
    .limit(5);
  console.log("\n=== RULE_SET_ASSIGNMENTS ===");
  console.log(`Count: ${rsaCount}`);
  if (rsa?.length) {
    console.log(`Columns: ${Object.keys(rsa[0]).join(", ")}`);
    for (const r of rsa) {
      console.log(`  entity=${(r as any).entity_id?.substring(0,8)}, rule_set=${(r as any).rule_set_id?.substring(0,8)}`);
    }
  }
}

main().catch(console.error);
