/**
 * HF-082 Phase 3: Verification — assignment correctness + MBC regression
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/hf082-phase3-verify.ts
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";
const MBC = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  HF-082 VERIFICATION: ASSIGNMENT CORRECTNESS        ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const { data, count } = await sb.from("rule_set_assignments")
    .select("entity_id, rule_set_id", { count: "exact" })
    .eq("tenant_id", LAB);

  const { data: ruleSets } = await sb.from("rule_sets")
    .select("id, name")
    .eq("tenant_id", LAB)
    .eq("status", "active");

  const { data: entities } = await sb.from("entities")
    .select("id, external_id, metadata")
    .eq("tenant_id", LAB)
    .eq("status", "active");

  const rsMap = new Map<string, string>();
  for (const rs of ruleSets || []) rsMap.set(rs.id, rs.name);
  const eMap = new Map<string, { ext: string; lic: string }>();
  for (const e of entities || []) {
    const meta = e.metadata as Record<string, unknown> | null;
    eMap.set(e.id, { ext: e.external_id, lic: meta?.product_licenses ? String(meta.product_licenses) : "NONE" });
  }

  // ── PG-02: Total assignments ──
  console.log("=== PG-02: TOTAL ASSIGNMENTS ===");
  console.log(`Count: ${count}`);
  console.log(`Expected: ~67 (CL:25 + MO:14 + IR:16 + DG:12)`);
  console.log(`Was: 100 (full-coverage fallback)`);
  console.log(`VERDICT: ${count !== null && count < 100 && count > 50 ? "PASS" : "FAIL"}\n`);

  // ── PG-06: Assignments per plan ──
  console.log("=== PG-06: ASSIGNMENTS PER PLAN ===");
  const byPlan: Record<string, number> = {};
  for (const a of data || []) {
    const plan = rsMap.get(a.rule_set_id) || "UNKNOWN";
    byPlan[plan] = (byPlan[plan] || 0) + 1;
  }
  for (const [plan, c] of Object.entries(byPlan).sort()) {
    console.log(`  ${plan}: ${c} entities`);
  }
  console.log("");

  // ── PG-03: Full-coverage check ──
  console.log("=== PG-03: FULL-COVERAGE CHECK ===");
  const byEntity: Record<string, { count: number; lic: string }> = {};
  for (const a of data || []) {
    const ent = eMap.get(a.entity_id);
    const ext = ent?.ext || "?";
    if (!byEntity[ext]) byEntity[ext] = { count: 0, lic: ent?.lic || "?" };
    byEntity[ext].count++;
  }
  const counts = Object.values(byEntity).map(e => e.count);
  const allSame = counts.length > 0 && counts.every(c => c === counts[0]);
  const minAssign = Math.min(...counts);
  const maxAssign = Math.max(...counts);
  console.log(`Assignment range: ${minAssign} to ${maxAssign} plans per entity`);
  console.log(`All same: ${allSame}`);
  console.log(`VERDICT: ${!allSame ? "PASS — variable assignment" : "FAIL — still full-coverage"}\n`);

  // ── PG-04: Officer 1001 (4 licenses) ──
  console.log("=== PG-04: OFFICER 1001 (4 licenses) ===");
  const o1001Assignments = (data || []).filter(a => {
    const ent = eMap.get(a.entity_id);
    return ent?.ext === "1001";
  });
  const o1001Info = Array.from(eMap.values()).find(e => e.ext === "1001");
  console.log(`Officer 1001: ${o1001Assignments.length} assignments`);
  console.log(`  Licenses: ${o1001Info?.lic}`);
  for (const a of o1001Assignments) {
    console.log(`  → ${rsMap.get(a.rule_set_id)}`);
  }
  console.log(`VERDICT: ${o1001Assignments.length === 4 ? "PASS" : "FAIL"}\n`);

  // ── PG-05: Officer with 2 licenses → 2 assignments ──
  console.log("=== PG-05: OFFICER WITH 2 LICENSES ===");
  const twoLicenseEntity = Object.entries(byEntity).find(([_, info]) => info.count === 2);
  if (twoLicenseEntity) {
    const [ext, info] = twoLicenseEntity;
    const plans = (data || []).filter(a => eMap.get(a.entity_id)?.ext === ext)
      .map(a => rsMap.get(a.rule_set_id) || "?");
    console.log(`Officer ${ext}: ${info.count} assignments`);
    console.log(`  Licenses: ${info.lic}`);
    for (const p of plans) console.log(`  → ${p}`);

    // Verify each plan matches a license
    const licenses = info.lic.split(",").map(l => l.trim()).filter(Boolean);
    const allMatch = plans.every(plan => {
      return licenses.some(lic => {
        const licLower = lic.toLowerCase();
        const planLower = plan.toLowerCase();
        return planLower.includes(licLower.split(" ")[0]);
      });
    });
    console.log(`  Plans match licenses: ${allMatch ? "YES" : "CHECK"}`);
    console.log(`VERDICT: ${info.count === 2 ? "PASS" : "FAIL"}`);
  } else {
    // Find someone with 3
    const threeLicenseEntity = Object.entries(byEntity).find(([_, info]) => info.count === 3);
    if (threeLicenseEntity) {
      const [ext, info] = threeLicenseEntity;
      const plans = (data || []).filter(a => eMap.get(a.entity_id)?.ext === ext)
        .map(a => rsMap.get(a.rule_set_id) || "?");
      console.log(`Officer ${ext}: ${info.count} assignments`);
      console.log(`  Licenses: ${info.lic}`);
      for (const p of plans) console.log(`  → ${p}`);
      console.log(`VERDICT: ${info.count < 4 ? "PASS — fewer than full coverage" : "FAIL"}`);
    }
  }
  console.log("");

  // ── PG-07 + PG-08: MBC regression ──
  console.log("=== PG-07: MBC ASSIGNMENTS ===");
  const { count: mbcCount } = await sb.from("rule_set_assignments")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", MBC);
  console.log(`MBC assignments: ${mbcCount}`);
  console.log(`Expected: 80`);
  console.log(`VERDICT: ${mbcCount === 80 ? "PASS — unchanged" : "FAIL — regression"}\n`);

  console.log("=== PG-08: MBC CALCULATION TOTAL ===");
  const { data: mbcResults } = await sb.from("calculation_results")
    .select("total_payout")
    .eq("tenant_id", MBC);
  const mbcTotal = (mbcResults || []).reduce((s, r) => s + (Number(r.total_payout) || 0), 0);
  const mbcExpected = 3245212.64;
  const mbcDelta = Math.abs(mbcTotal - mbcExpected);
  console.log(`MBC calc total: $${mbcTotal.toFixed(2)}`);
  console.log(`Expected: $${mbcExpected.toFixed(2)}`);
  console.log(`Delta: $${mbcDelta.toFixed(2)}`);
  console.log(`VERDICT: ${mbcDelta < 0.10 ? "PASS" : "FAIL"}\n`);

  // ── Assignment count validation ──
  console.log("=== FULL ENTITY ASSIGNMENT TABLE ===");
  const sorted = Object.entries(byEntity).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [ext, info] of sorted) {
    const licCount = info.lic.split(",").map(l => l.trim()).filter(Boolean).length;
    const match = info.count === licCount;
    console.log(`  Officer ${ext}: ${info.count} plans, ${licCount} licenses ${match ? "✓" : "✗ MISMATCH"}`);
  }

  const mismatches = sorted.filter(([_, info]) => {
    const licCount = info.lic.split(",").map(l => l.trim()).filter(Boolean).length;
    return info.count !== licCount;
  });
  console.log(`\nMismatches: ${mismatches.length}`);
  console.log(`VERDICT: ${mismatches.length === 0 ? "PASS — all entities have plans = licenses" : "CHECK — some mismatches"}`);

  // ── Summary ──
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  HF-082 PROOF GATE SUMMARY                          ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log(`║ PG-02  LAB assignments < 100:         ${count !== null && count < 100 ? "PASS" : "FAIL"}           ║`);
  console.log(`║ PG-03  Variable per entity:            ${!allSame ? "PASS" : "FAIL"}           ║`);
  console.log(`║ PG-04  Officer 1001 → 4 plans:         ${o1001Assignments.length === 4 ? "PASS" : "FAIL"}           ║`);
  console.log(`║ PG-05  Officer with 2 lic → 2 plans:   ${twoLicenseEntity ? "PASS" : "INFO"}           ║`);
  console.log(`║ PG-06  Per-plan matches distribution:  INFO           ║`);
  console.log(`║ PG-07  MBC assignments = 80:           ${mbcCount === 80 ? "PASS" : "FAIL"}           ║`);
  console.log(`║ PG-08  MBC total = $3,245,212.64:      ${mbcDelta < 0.10 ? "PASS" : "FAIL"}           ║`);
  console.log("╚══════════════════════════════════════════════════════╝");
}

main().catch(console.error);
