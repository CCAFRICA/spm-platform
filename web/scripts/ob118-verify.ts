/**
 * OB-118 Phase 4: Clear old results, re-run all MBC calculations, verify
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
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
  console.log("=== OB-118 Phase 4: Re-Calculate and Verify ===\n");

  // Step 1: Clear old results
  console.log("--- Step 1: Clear Old Results ---");
  await sb.from("calculation_results").delete().eq("tenant_id", TENANT);
  await sb.from("calculation_batches").delete().eq("tenant_id", TENANT);
  await sb.from("entity_period_outcomes").delete().eq("tenant_id", TENANT);
  console.log("Cleared calculation_results, calculation_batches, entity_period_outcomes");

  // Step 2: Re-run calculations
  console.log("\n--- Step 2: Re-Run Calculations ---");
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
          console.log(`  OK ${rs.name} | ${p.name}: $${data.totalPayout.toLocaleString()} (${data.entityCount} entities)`);
        } else {
          results.push({ rs: rs.name, period: p.name, total: 0, entities: 0, success: false });
          console.log(`  FAIL ${rs.name} | ${p.name}: ${data.error}`);
        }
      } catch (err) {
        results.push({ rs: rs.name, period: p.name, total: 0, entities: 0, success: false });
        console.log(`  FAIL ${rs.name} | ${p.name}: ${err}`);
      }
    }
  }

  // Step 3: Summary
  console.log("\n--- Step 3: Summary ---");
  console.log("| Rule Set | Period | Entities | Payout | Status |");
  console.log("|----------|--------|----------|--------|--------|");

  let grandTotal = 0;
  for (const r of results) {
    const status = r.success ? (r.total > 0 ? "NON-ZERO" : "ZERO") : "FAILED";
    console.log(`| ${r.rs} | ${r.period} | ${r.entities} | $${r.total.toLocaleString()} | ${status} |`);
    grandTotal += r.total;
  }
  console.log(`\nGrand total: $${grandTotal.toLocaleString()}`);

  // Step 4: Regression checks
  console.log("\n--- Step 4: Regression Checks ---");
  const clTotal = results.filter(r => r.rs.includes("Consumer")).reduce((s, r) => s + r.total, 0);
  const mtTotal = results.filter(r => r.rs.includes("Mortgage")).reduce((s, r) => s + r.total, 0);
  const irTotal = results.filter(r => r.rs.includes("Insurance")).reduce((s, r) => s + r.total, 0);
  const dgTotal = results.filter(r => r.rs.includes("Deposit")).reduce((s, r) => s + r.total, 0);

  console.log(`Consumer Lending: $${clTotal.toFixed(2)} (expected ~$6,319,876)`);
  console.log(`  Status: ${Math.abs(clTotal - 6319876) < 320000 ? "PASS" : "REGRESSION"}`);
  console.log(`Mortgage: $${mtTotal.toFixed(2)} (expected ~$985,410)`);
  console.log(`  Status: ${Math.abs(mtTotal - 985410) < 50000 ? "PASS" : "REGRESSION"}`);
  console.log(`Insurance Referral: $${irTotal.toFixed(2)} (was $0)`);
  console.log(`  Status: ${irTotal > 0 ? "NON-ZERO — METRIC DERIVATION WORKING" : "STILL $0"}`);
  console.log(`Deposit Growth: $${dgTotal.toFixed(2)}`);

  // Step 5: Insurance detail — show sample with derived metrics
  console.log("\n--- Step 5: Insurance Referral Detail ---");
  const { data: insResults } = await sb
    .from("calculation_results")
    .select("entity_id, total_payout, components, metadata, metrics")
    .eq("tenant_id", TENANT)
    .eq("rule_set_id", "574faa83-6f14-4975-baca-36e7e3fd4937")
    .order("total_payout", { ascending: false })
    .limit(5);

  if (insResults && insResults.length > 0) {
    for (const r of insResults.slice(0, 3)) {
      const name = (r.metadata as any)?.entityName ?? r.entity_id;
      console.log(`\n  ${name}: $${r.total_payout.toLocaleString()}`);

      // Show derived metrics from the metrics JSONB
      const metrics = r.metrics as Record<string, number>;
      const derivedKeys = Object.keys(metrics).filter(k => k.includes("qualified_referrals"));
      if (derivedKeys.length > 0) {
        console.log("  Derived metrics:", derivedKeys.map(k => `${k}=${metrics[k]}`).join(", "));
      }

      const comps = r.components as any[];
      for (const c of comps) {
        if (c.payout > 0 || c.details?.fallbackSource) {
          console.log(`    ${c.componentName}: $${c.payout} (${c.details?.fallbackSource || "legacy"}) ${c.details?.intentOperation || ""}`);
        }
      }
    }
  }

  // Step 6: Mortgage detail — verify rate detection still works
  console.log("\n--- Step 6: Mortgage Top 3 (rate detection check) ---");
  const { data: mtgResults } = await sb
    .from("calculation_results")
    .select("entity_id, total_payout, components, metadata")
    .eq("tenant_id", TENANT)
    .eq("rule_set_id", "af511146-604f-4400-ad18-836eb13aace8")
    .order("total_payout", { ascending: false })
    .limit(3);

  for (const r of mtgResults || []) {
    const name = (r.metadata as any)?.entityName ?? r.entity_id;
    const details = (r.components as any[])?.[0]?.details;
    console.log(`  ${name}: $${r.total_payout.toLocaleString()} (rateDetected=${details?.rateDetected})`);
  }
}

main().catch(console.error);
