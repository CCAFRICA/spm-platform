/**
 * OB-117 Phase 4: Clear old results and re-run all MBC calculations
 *
 * 1. Capture baseline totals
 * 2. Clear old calculation_results, calculation_batches, entity_period_outcomes
 * 3. Re-run all 4 rule sets × 3 periods via API
 * 4. Compare results
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";
const RULE_SETS = [
  { id: "9ab2c0d1-ced5-4dab-bda1-7de50dbbce94", name: "Consumer Lending Commission" },
  { id: "af511146-604f-4400-ad18-836eb13aace8", name: "Mortgage Origination Bonus" },
  { id: "ecc2507b-8012-49a7-ab3c-83b9ddeaeaec", name: "Deposit Growth Incentive" },
  { id: "574faa83-6f14-4975-baca-36e7e3fd4937", name: "Insurance Referral Program" },
];
const PERIODS = [
  { id: "251c00c3-0a1d-41c1-8add-d7eafa83a5e9", name: "Jan 2024" },
  { id: "7c23fa1e-2a07-4ebd-bd85-e41c615bd695", name: "Feb 2024" },
  { id: "59a6c2c1-5d94-404a-a355-8760677fcebc", name: "Mar 2024" },
];

async function main() {
  console.log("=== OB-117 Phase 4: Re-Calculate and Verify ===\n");

  // Step 1: Capture baseline
  console.log("--- Step 1: Baseline ---");
  const { data: baseline } = await supabase
    .from("calculation_results")
    .select("rule_set_id, period_id, total_payout")
    .eq("tenant_id", TENANT);

  const baselineTotals = new Map<string, number>();
  for (const r of baseline ?? []) {
    const key = `${r.rule_set_id}|${r.period_id}`;
    baselineTotals.set(key, (baselineTotals.get(key) || 0) + r.total_payout);
  }

  console.log(`Baseline: ${baseline?.length ?? 0} rows`);
  for (const rs of RULE_SETS) {
    let rsTotal = 0;
    for (const p of PERIODS) {
      const key = `${rs.id}|${p.id}`;
      rsTotal += baselineTotals.get(key) || 0;
    }
    console.log(`  ${rs.name}: $${rsTotal.toLocaleString()}`);
  }

  // Step 2: Clear old results
  console.log("\n--- Step 2: Clear Old Results ---");
  await supabase.from("calculation_results").delete().eq("tenant_id", TENANT);
  await supabase.from("calculation_batches").delete().eq("tenant_id", TENANT);
  await supabase.from("entity_period_outcomes").delete().eq("tenant_id", TENANT);
  console.log("Cleared calculation_results, calculation_batches, entity_period_outcomes");

  // Step 3: Re-run calculations
  console.log("\n--- Step 3: Re-Run Calculations ---");
  const results: Array<{ rs: string; period: string; total: number; entities: number; success: boolean }> = [];

  for (const rs of RULE_SETS) {
    for (const p of PERIODS) {
      try {
        const resp = await fetch("http://localhost:3000/api/calculation/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId: TENANT, periodId: p.id, ruleSetId: rs.id }),
        });
        const data = await resp.json();

        if (data.success) {
          results.push({ rs: rs.name, period: p.name, total: data.totalPayout, entities: data.entityCount, success: true });
          console.log(`  ✓ ${rs.name} | ${p.name}: $${data.totalPayout.toLocaleString()} (${data.entityCount} entities)`);
        } else {
          results.push({ rs: rs.name, period: p.name, total: 0, entities: 0, success: false });
          console.log(`  ✗ ${rs.name} | ${p.name}: ${data.error}`);
        }
      } catch (err) {
        results.push({ rs: rs.name, period: p.name, total: 0, entities: 0, success: false });
        console.log(`  ✗ ${rs.name} | ${p.name}: ${err}`);
      }
    }
  }

  // Step 4: Summary
  console.log("\n--- Step 4: Summary ---");
  console.log("| Rule Set | Period | Entities | Payout | Status |");
  console.log("|----------|--------|----------|--------|--------|");

  let grandTotal = 0;
  for (const r of results) {
    const status = r.success ? (r.total > 0 ? "NON-ZERO" : "ZERO") : "FAILED";
    console.log(`| ${r.rs} | ${r.period} | ${r.entities} | $${r.total.toLocaleString()} | ${status} |`);
    grandTotal += r.total;
  }
  console.log(`\nGrand total: $${grandTotal.toLocaleString()}`);

  // Step 5: Mortgage detail — check Ruiz specifically
  console.log("\n--- Step 5: Mortgage Detail (Ruiz check) ---");
  const { data: mtgResults } = await supabase
    .from("calculation_results")
    .select("entity_id, total_payout, components, metadata")
    .eq("tenant_id", TENANT)
    .eq("rule_set_id", "af511146-604f-4400-ad18-836eb13aace8")
    .gt("total_payout", 0)
    .order("total_payout", { ascending: false })
    .limit(5);

  if (mtgResults && mtgResults.length > 0) {
    console.log("Top 5 Mortgage payouts:");
    for (const r of mtgResults) {
      const name = (r.metadata as any)?.entityName ?? r.entity_id;
      const comps = r.components as any[];
      const details = comps?.[0]?.details ?? {};
      console.log(`  ${name}: $${r.total_payout.toLocaleString()}`);
      console.log(`    metricValue=${details.metricValue}, tier=${details.matchedTier}, rate=${details.tierPayout}, rateDetected=${details.rateDetected}`);
      if (details.rateApplied) console.log(`    rateApplied=${details.rateApplied}`);
    }
  } else {
    console.log("No Mortgage results with payout > 0");
  }

  // Step 6: Insurance detail — check calculationIntent fallback
  console.log("\n--- Step 6: Insurance Referral Detail ---");
  const { data: insResults } = await supabase
    .from("calculation_results")
    .select("entity_id, total_payout, components, metadata")
    .eq("tenant_id", TENANT)
    .eq("rule_set_id", "574faa83-6f14-4975-baca-36e7e3fd4937")
    .order("total_payout", { ascending: false })
    .limit(3);

  if (insResults && insResults.length > 0) {
    for (const r of insResults) {
      const name = (r.metadata as any)?.entityName ?? r.entity_id;
      const comps = r.components as any[];
      console.log(`  ${name}: $${r.total_payout.toLocaleString()}`);
      for (const c of (comps || []).slice(0, 2)) {
        console.log(`    ${c.componentName}: $${c.payout} fallbackSource=${c.details?.fallbackSource ?? 'none'}`);
      }
    }
  }

  // Step 7: Consumer Lending regression check
  console.log("\n--- Step 7: Consumer Lending Regression Check ---");
  const clTotals: number[] = [];
  for (const p of PERIODS) {
    const { data: clResults } = await supabase
      .from("calculation_results")
      .select("total_payout")
      .eq("tenant_id", TENANT)
      .eq("rule_set_id", "9ab2c0d1-ced5-4dab-bda1-7de50dbbce94")
      .eq("period_id", p.id);
    const total = (clResults ?? []).reduce((s, r) => s + r.total_payout, 0);
    clTotals.push(total);
    console.log(`  ${p.name}: $${total.toLocaleString()}`);
  }
  const clGrand = clTotals.reduce((a, b) => a + b, 0);
  console.log(`  Total: $${clGrand.toLocaleString()} (was $6,319,876)`);
  const regression = Math.abs(clGrand - 6319876) < 1000;
  console.log(`  Regression: ${regression ? "PASS ✓" : "CHECK - totals differ (expected if entities changed)"}`);
}

main().catch(console.error);
