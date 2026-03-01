/**
 * HF-083 Phase 3: Regression check — CL, Mortgage, IR untouched + MBC unchanged
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/hf083-phase3-regression.ts
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";
const MBC = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

// OB-126 CC-UAT-06 baselines
const EXPECTED = {
  "Consumer Lending Commission Plan 2024": { results: 100, total: 6540774.36 },
  "Mortgage Origination Bonus Plan 2024": { results: 56, total: 989937.41 },
  "CFG Insurance Referral Program 2024": { results: 64, total: 366600.00 },
  "Deposit Growth Incentive — Q1 2024": { results: 48, total: 1440000.00 },
};

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  HF-083 PHASE 3: REGRESSION CHECK                   ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // Get plan names
  const { data: rsMap } = await sb.from("rule_sets")
    .select("id, name").eq("tenant_id", LAB).eq("status", "active");
  const idToName: Record<string, string> = {};
  for (const rs of rsMap || []) idToName[rs.id] = rs.name;

  // Step 3.1: Per-plan results
  console.log("═══ STEP 3.1: PER-PLAN RESULTS ═══\n");
  const { data: allResults } = await sb.from("calculation_results")
    .select("rule_set_id, total_payout").eq("tenant_id", LAB);

  const planStats: Record<string, { results: number; total: number }> = {};
  for (const r of allResults || []) {
    const name = idToName[r.rule_set_id] || r.rule_set_id.slice(0, 8);
    if (!planStats[name]) planStats[name] = { results: 0, total: 0 };
    planStats[name].results++;
    planStats[name].total += Number(r.total_payout) || 0;
  }

  console.log("| Plan | Results | Expected | Total | Expected | Verdict |");
  console.log("|------|---------|----------|-------|----------|---------|");

  let allPass = true;
  for (const [name, expected] of Object.entries(EXPECTED)) {
    const actual = planStats[name] || { results: 0, total: 0 };
    const resultsMatch = actual.results === expected.results;
    const totalMatch = Math.abs(actual.total - expected.total) < 0.10;
    const pass = resultsMatch && totalMatch;
    if (!pass) allPass = false;
    console.log(`| ${name.slice(0, 40)} | ${actual.results} | ${expected.results} | $${actual.total.toFixed(2)} | $${expected.total.toFixed(2)} | ${pass ? "PASS" : "FAIL"} |`);
  }

  const grandTotal = Object.values(planStats).reduce((s, p) => s + p.total, 0);
  console.log(`\nGrand total: $${grandTotal.toFixed(2)} (expected $9,337,311.77)`);
  console.log("Grand total match:", Math.abs(grandTotal - 9337311.77) < 0.10 ? "PASS" : "FAIL");
  console.log("Total results:", allResults?.length, "(expected 268)");

  // Step 3.2: MBC regression
  console.log("\n═══ STEP 3.2: MBC REGRESSION ═══");
  const { data: mbcResults } = await sb.from("calculation_results")
    .select("total_payout").eq("tenant_id", MBC);
  const mbcTotal = (mbcResults || []).reduce((s, r) => s + (Number(r.total_payout) || 0), 0);
  const { count: mbcAssignments } = await sb.from("rule_set_assignments")
    .select("*", { count: "exact", head: true }).eq("tenant_id", MBC);

  console.log("MBC results:", mbcResults?.length, "(expected 240)");
  console.log("MBC assignments:", mbcAssignments, "(expected 80)");
  console.log("MBC total: $" + mbcTotal.toFixed(2), "(expected $3,245,212.64 ± $0.10)");
  console.log("Delta: $" + (mbcTotal - 3245212.64).toFixed(2));
  const mbcPass = mbcResults?.length === 240 && mbcAssignments === 80 && Math.abs(mbcTotal - 3245212.64) < 0.10;
  console.log("MBC VERDICT:", mbcPass ? "PASS" : "FAIL");

  // Step 3.3: Committed data integrity
  console.log("\n═══ STEP 3.3: DATA INTEGRITY ═══");
  const { count: totalData } = await sb.from("committed_data")
    .select("*", { count: "exact", head: true }).eq("tenant_id", LAB);
  const { count: junkRows } = await sb.from("committed_data")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", LAB)
    .eq("data_type", "reference:CFG_Deposit_Growth_Incentive_Q1_2024");
  const { count: targetRows } = await sb.from("committed_data")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", LAB)
    .eq("data_type", "component_data:CFG_Deposit_Growth_Incentive_Q1_2024");

  console.log("Total committed_data:", totalData, "(expected 1600)");
  console.log("Junk rows:", junkRows, "(expected 0)");
  console.log("Target rows:", targetRows, "(expected 12)");

  // Grand verdict
  console.log("\n═══ GRAND VERDICT ═══");
  const dataPass = totalData === 1600 && junkRows === 0 && targetRows === 12;
  console.log("LAB per-plan:", allPass ? "PASS" : "FAIL");
  console.log("MBC regression:", mbcPass ? "PASS" : "FAIL");
  console.log("Data integrity:", dataPass ? "PASS" : "FAIL");
  console.log("OVERALL:", allPass && mbcPass && dataPass ? "PASS — all checks green" : "FAIL");
}

main().catch(console.error);
