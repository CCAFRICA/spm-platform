/**
 * HF-081 Phase 5: CC-UAT Verification Trace — Layers 2, 5, 6
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/hf081-phase5-verify.ts
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";
const MBC = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function layer2() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  HF-081 VERIFICATION: LAYER 2 — RULE SET BINDINGS   ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const { data: ruleSets } = await sb.from("rule_sets")
    .select("id, name, status, input_bindings")
    .eq("tenant_id", LAB)
    .eq("status", "active");

  let allBindingsValid = true;
  let countOpsFound = false;

  for (const rs of ruleSets || []) {
    const bindings = (rs.input_bindings || {}) as Record<string, unknown>;
    const derivations = ((bindings.metric_derivations || bindings.derivations || []) as Array<Record<string, unknown>>);

    console.log(`\n${rs.name}:`);
    for (const d of (Array.isArray(derivations) ? derivations : [])) {
      const sp = (d.source_pattern || d.data_type || "NONE") as string;
      const op = (d.operation || "NONE") as string;
      const sf = (d.source_field || "NONE") as string;
      const hasPrefix = sp.includes("component_data:");
      const isCount = op === "count";

      console.log(`  metric: ${d.metric || d.metric_name}`);
      console.log(`    source_pattern: ${sp} ${hasPrefix ? "FAIL — UNNORMALIZED" : "PASS"}`);
      console.log(`    operation: ${op}`);
      console.log(`    source_field: ${sf}`);

      if (hasPrefix) allBindingsValid = false;

      // Check for Consumer Lending count (should be sum now)
      if (rs.name.toLowerCase().includes("consumer") && rs.name.toLowerCase().includes("lending")) {
        if (isCount) {
          countOpsFound = true;
          allBindingsValid = false;
        }
      }
    }
  }

  console.log(`\n═══ LAYER 2 VERDICTS ═══`);
  console.log(`PG-02 Source patterns normalized: ${allBindingsValid ? "PASS" : "FAIL"}`);
  console.log(`PG-03 Consumer Lending uses sum: ${!countOpsFound ? "PASS" : "FAIL"}`);
  return allBindingsValid;
}

async function layer5() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  HF-081 VERIFICATION: LAYER 5 — CALCULATION RESULTS ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // Get rule_sets for name mapping
  const { data: ruleSets } = await sb.from("rule_sets")
    .select("id, name")
    .eq("tenant_id", LAB)
    .eq("status", "active");

  const rsMap = new Map<string, string>();
  for (const rs of ruleSets || []) rsMap.set(rs.id, rs.name);

  // Get all results
  const { data: results, count } = await sb.from("calculation_results")
    .select("total_payout, rule_set_id, entity_id", { count: "exact" })
    .eq("tenant_id", LAB);

  console.log("Total results:", count);

  const byPlan: Record<string, { count: number; total: number; nonZero: number; min: number; max: number }> = {};
  for (const r of results || []) {
    const plan = rsMap.get(r.rule_set_id as string) || (r.rule_set_id as string);
    if (!byPlan[plan]) byPlan[plan] = { count: 0, total: 0, nonZero: 0, min: Infinity, max: -Infinity };
    const payout = Number(r.total_payout) || 0;
    byPlan[plan].count++;
    byPlan[plan].total += payout;
    if (payout > 0) byPlan[plan].nonZero++;
    byPlan[plan].min = Math.min(byPlan[plan].min, payout);
    byPlan[plan].max = Math.max(byPlan[plan].max, payout);
  }

  let mortgageNonZero = false;
  let clReasonable = false;
  let insUnchanged = false;
  let grandTotal = 0;

  for (const [plan, s] of Object.entries(byPlan).sort()) {
    grandTotal += s.total;
    console.log(`\n${plan}:`);
    console.log(`  Results: ${s.count} | Non-zero: ${s.nonZero} | Total: $${s.total.toFixed(2)}`);
    console.log(`  Range: [$${s.min.toFixed(2)}, $${s.max.toFixed(2)}]`);

    if (plan.toLowerCase().includes("mortgage") && s.nonZero > 0) mortgageNonZero = true;
    if (plan.toLowerCase().includes("consumer") && s.max > 100) clReasonable = true;
    if (plan.toLowerCase().includes("insurance") && Math.abs(s.total - 366600) < 1) insUnchanged = true;

    if (s.nonZero === 0) console.log("  WARNING: ALL ZERO");
    if (s.max <= 1 && s.nonZero > 0) console.log("  WARNING: MAX <= $1 — rate-not-volume bug persists");
  }

  console.log(`\nGRAND TOTAL: $${grandTotal.toFixed(2)}`);

  console.log("\n═══ F-02 CHECK (Mortgage) ═══");
  console.log(mortgageNonZero ? "PASS — Mortgage produces non-zero results" : "FAIL — Mortgage still $0");

  console.log("\n═══ F-03 CHECK (Consumer Lending) ═══");
  console.log(clReasonable ? "PASS — Consumer Lending produces realistic amounts (max > $100)" : "FAIL — Consumer Lending still producing pennies");

  console.log("\n═══ Insurance Unchanged ═══");
  console.log(insUnchanged ? "PASS — Insurance total unchanged at $366,600" : `WARN — Insurance total changed`);

  // Officer 1001 trace
  console.log("\n═══ OFFICER 1001 TRACE ═══");
  const { data: entities } = await sb.from("entities")
    .select("id, external_id")
    .eq("tenant_id", LAB)
    .eq("external_id", "1001");

  if (entities && entities.length > 0) {
    const entityId = entities[0].id;
    const { data: o1001 } = await sb.from("calculation_results")
      .select("total_payout, rule_set_id, period_id")
      .eq("tenant_id", LAB)
      .eq("entity_id", entityId);

    const { data: periods } = await sb.from("periods")
      .select("id, label, canonical_key")
      .eq("tenant_id", LAB);
    const periodMap = new Map<string, string>();
    for (const p of periods || []) periodMap.set(p.id, p.label || p.canonical_key);

    for (const r of o1001 || []) {
      const planName = rsMap.get(r.rule_set_id as string) || "?";
      const periodLabel = periodMap.get(r.period_id as string) || "?";
      console.log(`  ${planName} | ${periodLabel}: $${Number(r.total_payout).toFixed(2)}`);
    }
  }

  return { mortgageNonZero, clReasonable, insUnchanged, grandTotal };
}

async function layer6() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  HF-081 VERIFICATION: LAYER 6 — MBC REGRESSION      ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const { data: tenant } = await sb.from("tenants").select("id, name").eq("id", MBC).single();
  console.log("MBC tenant:", tenant?.name, MBC);

  const { data: results, count } = await sb.from("calculation_results")
    .select("total_payout", { count: "exact" })
    .eq("tenant_id", MBC);

  const grandTotal = (results || []).reduce((sum, r) => sum + (Number(r.total_payout) || 0), 0);
  const expected = 3245212.64;
  const delta = Math.abs(grandTotal - expected);

  console.log(`Grand total:  $${grandTotal.toFixed(2)}`);
  console.log(`Expected:     $${expected.toFixed(2)}`);
  console.log(`Delta:        $${delta.toFixed(2)}`);
  console.log(`Row count:    ${count}`);

  const pass = delta < 0.10 && count === 240;
  console.log(`VERDICT:      ${pass ? "PASS" : "FAIL"}`);
  return pass;
}

async function main() {
  const l2 = await layer2();
  const l5 = await layer5();
  const l6 = await layer6();

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  HF-081 PROOF GATE SUMMARY                          ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log(`║ PG-02  Mortgage source_pattern normalized:   ${l2 ? "PASS" : "FAIL"}   ║`);
  console.log(`║ PG-03  Consumer Lending uses sum not count:  ${l2 ? "PASS" : "FAIL"}   ║`);
  console.log(`║ PG-05  Mortgage results > $0:                ${l5.mortgageNonZero ? "PASS" : "FAIL"}   ║`);
  console.log(`║ PG-06  Consumer Lending max > $100:          ${l5.clReasonable ? "PASS" : "FAIL"}   ║`);
  console.log(`║ PG-07  Insurance unchanged ($366,600):       ${l5.insUnchanged ? "PASS" : "FAIL"}   ║`);
  console.log(`║ PG-08  MBC grand total = $3,245,212.64:      ${l6 ? "PASS" : "FAIL"}   ║`);
  console.log("╚══════════════════════════════════════════════════════╝");
}

main().catch(console.error);
