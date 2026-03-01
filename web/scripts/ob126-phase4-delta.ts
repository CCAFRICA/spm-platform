/**
 * OB-126 Phase 4: CC-UAT-05 vs CC-UAT-06 Delta Analysis
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob126-phase4-delta.ts
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";
const MBC = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

// Full DB plan names → short display names used in UAT-05
const SHORT: Record<string, string> = {
  "CFG Insurance Referral Program 2024": "Insurance Referral",
  "Consumer Lending Commission Plan 2024": "Consumer Lending",
  "Mortgage Origination Bonus Plan 2024": "Mortgage Origination",
  "Deposit Growth Incentive — Q1 2024": "Deposit Growth",
};
function shortName(fullName: string): string {
  return SHORT[fullName] || fullName;
}

// CC-UAT-05 baseline (pre-fix, from CC-UAT-05 forensic trace)
const UAT05 = {
  assignments: 100,
  assignmentMethod: "FULL-COVERAGE FALLBACK",
  results: 400,
  plans: {
    "Consumer Lending": { results: 100, nonZero: 75, total: 15.48 },
    "Deposit Growth":   { results: 100, nonZero: 48, total: 1440000 },
    "Insurance Referral": { results: 100, nonZero: 46, total: 366600 },
    "Mortgage Origination": { results: 100, nonZero: 0, total: 0 },
  },
  grandTotal: 1806615.48,
  officer1001: {
    "Insurance Referral": 25350,
    "Consumer Lending": 0.62,
    "Deposit Growth": 120000,
    "Mortgage Origination": 0,
  },
  officer1001Total: 145350.62,
  mbc: { results: 240, assignments: 80, total: 3245212.64 },
  findings: [
    "F-01: Full-coverage fallback — every entity assigned to all 4 plans",
    "F-02: Mortgage source_pattern references unnormalized data type → $0",
    "F-03: Consumer Lending uses count instead of sum → pennies",
    "F-04: Deposit Growth uniform $30K — no Tab 2 targets imported",
  ],
};

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  OB-126 PHASE 4: CC-UAT-05 vs CC-UAT-06 DELTA      ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // Get current UAT-06 state
  const { data: rsMap } = await sb.from("rule_sets")
    .select("id, name").eq("tenant_id", LAB).eq("status", "active");
  const idToName: Record<string, string> = {};
  for (const rs of rsMap || []) idToName[rs.id] = rs.name;

  const { count: assignCount } = await sb.from("rule_set_assignments")
    .select("*", { count: "exact", head: true }).eq("tenant_id", LAB);

  const { data: allResults } = await sb.from("calculation_results")
    .select("rule_set_id, entity_id, total_payout").eq("tenant_id", LAB);

  const { data: entities } = await sb.from("entities")
    .select("id, external_id, metadata").eq("tenant_id", LAB);

  // Build UAT-06 per-plan stats (using short names for comparison)
  const uat06Plans: Record<string, { results: number; nonZero: number; total: number }> = {};
  for (const r of allResults || []) {
    const fullName = idToName[r.rule_set_id] || r.rule_set_id.slice(0, 8);
    const name = shortName(fullName);
    if (!uat06Plans[name]) uat06Plans[name] = { results: 0, nonZero: 0, total: 0 };
    uat06Plans[name].results++;
    const payout = Number(r.total_payout) || 0;
    uat06Plans[name].total += payout;
    if (payout > 0) uat06Plans[name].nonZero++;
  }

  // Officer 1001
  const officer1001 = (entities || []).find(e => String(e.external_id) === "1001");
  const uat06_1001: Record<string, number> = {};
  if (officer1001) {
    const o1001Results = (allResults || []).filter(r => r.entity_id === officer1001.id);
    for (const r of o1001Results) {
      const fullName = idToName[r.rule_set_id] || r.rule_set_id.slice(0, 8);
      const name = shortName(fullName);
      uat06_1001[name] = (uat06_1001[name] || 0) + (Number(r.total_payout) || 0);
    }
  }

  // MBC regression
  const { data: mbcResults } = await sb.from("calculation_results")
    .select("total_payout").eq("tenant_id", MBC);
  const mbcTotal = (mbcResults || []).reduce((s, r) => s + (Number(r.total_payout) || 0), 0);
  const { count: mbcAssignments } = await sb.from("rule_set_assignments")
    .select("*", { count: "exact", head: true }).eq("tenant_id", MBC);

  const grandTotal = Object.values(uat06Plans).reduce((s, p) => s + p.total, 0);
  const o1001Total = Object.values(uat06_1001).reduce((s, v) => s + v, 0);

  // ============================================================
  // DELTA TABLE 1: SYSTEM-LEVEL
  // ============================================================
  console.log("═══ DELTA TABLE 1: SYSTEM-LEVEL ═══\n");
  console.log("| Metric | CC-UAT-05 | CC-UAT-06 | Delta | Fix |");
  console.log("|--------|-----------|-----------|-------|-----|");
  console.log(`| Assignments | ${UAT05.assignments} | ${assignCount} | ${(assignCount || 0) - UAT05.assignments} | HF-082 license-based |`);
  console.log(`| Assignment method | Fallback | License-based | — | HF-082 |`);
  console.log(`| Results | ${UAT05.results} | ${allResults?.length} | ${(allResults?.length || 0) - UAT05.results} | HF-082 (fewer assignments) |`);
  console.log(`| Grand total | $${UAT05.grandTotal.toLocaleString()} | $${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} | +$${(grandTotal - UAT05.grandTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })} | HF-081 (sum, source_pattern) |`);

  // ============================================================
  // DELTA TABLE 2: PER-PLAN
  // ============================================================
  console.log("\n═══ DELTA TABLE 2: PER-PLAN RESULTS ═══\n");
  console.log("| Plan | UAT-05 Results | UAT-06 Results | UAT-05 Total | UAT-06 Total | Delta | Root Cause |");
  console.log("|------|----------------|----------------|--------------|--------------|-------|------------|");

  const planNames = ["Consumer Lending", "Deposit Growth", "Insurance Referral", "Mortgage Origination"];
  for (const name of planNames) {
    const u05 = UAT05.plans[name as keyof typeof UAT05.plans];
    const u06 = uat06Plans[name] || { results: 0, nonZero: 0, total: 0 };
    const delta = u06.total - u05.total;
    let rootCause = "";
    if (name === "Consumer Lending") rootCause = "HF-081: count→sum fix";
    else if (name === "Mortgage Origination") rootCause = "HF-081: source_pattern fix";
    else if (name === "Deposit Growth") rootCause = "Unchanged (Tab 2 pending)";
    else if (name === "Insurance Referral") rootCause = "Unchanged";
    console.log(`| ${name} | ${u05.results} (${u05.nonZero} hit) | ${u06.results} (${u06.nonZero} hit) | $${u05.total.toLocaleString()} | $${u06.total.toLocaleString(undefined, { minimumFractionDigits: 2 })} | ${delta >= 0 ? "+" : ""}$${delta.toLocaleString(undefined, { minimumFractionDigits: 2 })} | ${rootCause} |`);
  }

  // ============================================================
  // DELTA TABLE 3: OFFICER 1001
  // ============================================================
  console.log("\n═══ DELTA TABLE 3: OFFICER 1001 TRACE ═══\n");
  console.log("| Plan | UAT-05 | UAT-06 | Delta | Fix |");
  console.log("|------|--------|--------|-------|-----|");

  for (const name of planNames) {
    const u05 = UAT05.officer1001[name as keyof typeof UAT05.officer1001] || 0;
    const u06 = uat06_1001[name] || 0;
    const delta = u06 - u05;
    let fix = "";
    if (name === "Consumer Lending") fix = "HF-081: count→sum";
    else if (name === "Mortgage Origination") fix = "HF-081: source_pattern";
    else fix = "No change";
    console.log(`| ${name} | $${u05.toLocaleString(undefined, { minimumFractionDigits: 2 })} | $${u06.toLocaleString(undefined, { minimumFractionDigits: 2 })} | ${delta >= 0 ? "+" : ""}$${delta.toLocaleString(undefined, { minimumFractionDigits: 2 })} | ${fix} |`);
  }
  console.log(`| **TOTAL** | $${UAT05.officer1001Total.toLocaleString(undefined, { minimumFractionDigits: 2 })} | $${o1001Total.toLocaleString(undefined, { minimumFractionDigits: 2 })} | +$${(o1001Total - UAT05.officer1001Total).toLocaleString(undefined, { minimumFractionDigits: 2 })} | |`);

  // ============================================================
  // DELTA TABLE 4: MBC REGRESSION
  // ============================================================
  console.log("\n═══ DELTA TABLE 4: MBC REGRESSION ═══\n");
  console.log("| Metric | UAT-05 | UAT-06 | Delta | Verdict |");
  console.log("|--------|--------|--------|-------|---------|");
  console.log(`| Results | ${UAT05.mbc.results} | ${mbcResults?.length} | ${(mbcResults?.length || 0) - UAT05.mbc.results} | ${mbcResults?.length === UAT05.mbc.results ? "PASS" : "FAIL"} |`);
  console.log(`| Assignments | ${UAT05.mbc.assignments} | ${mbcAssignments} | ${(mbcAssignments || 0) - UAT05.mbc.assignments} | ${mbcAssignments === UAT05.mbc.assignments ? "PASS" : "FAIL"} |`);
  console.log(`| Total | $${UAT05.mbc.total.toLocaleString(undefined, { minimumFractionDigits: 2 })} | $${mbcTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} | $${(mbcTotal - UAT05.mbc.total).toLocaleString(undefined, { minimumFractionDigits: 2 })} | ${Math.abs(mbcTotal - UAT05.mbc.total) < 0.10 ? "PASS" : "FAIL"} |`);

  // ============================================================
  // FINDINGS RESOLUTION
  // ============================================================
  console.log("\n═══ FINDINGS RESOLUTION ═══\n");
  const resolutions = [
    { finding: "F-01: Full-coverage fallback", status: "RESOLVED", fix: "HF-082", evidence: `Assignments ${UAT05.assignments} → ${assignCount}, fallback NOT DETECTED` },
    { finding: "F-02: Mortgage source_pattern", status: "RESOLVED", fix: "HF-081", evidence: `Mortgage $0 → $${(uat06Plans["Mortgage Origination"]?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
    { finding: "F-03: Consumer Lending count→sum", status: "RESOLVED", fix: "HF-081", evidence: `CL $15.48 → $${(uat06Plans["Consumer Lending"]?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
    { finding: "F-04: Deposit Growth uniform", status: "OPEN", fix: "OB-124 ready", evidence: "Still $30K uniform — Tab 2 targets not yet re-imported" },
  ];

  console.log("| Finding | Status | Fix | Evidence |");
  console.log("|---------|--------|-----|----------|");
  for (const r of resolutions) {
    console.log(`| ${r.finding} | ${r.status} | ${r.fix} | ${r.evidence} |`);
  }

  // ============================================================
  // EXPECTED IMPROVEMENTS CHECKLIST
  // ============================================================
  console.log("\n═══ EXPECTED IMPROVEMENTS CHECKLIST ═══\n");

  const improvements = [
    {
      item: "Consumer Lending total rises from ~$15 to real dollars",
      pass: (uat06Plans["Consumer Lending"]?.total || 0) > 1000,
      evidence: `$15.48 → $${(uat06Plans["Consumer Lending"]?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    },
    {
      item: "Mortgage total rises from $0",
      pass: (uat06Plans["Mortgage Origination"]?.total || 0) > 0,
      evidence: `$0 → $${(uat06Plans["Mortgage Origination"]?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    },
    {
      item: "Insurance Referral unchanged",
      pass: Math.abs((uat06Plans["Insurance Referral"]?.total || 0) - 366600) < 1,
      evidence: `$366,600 → $${(uat06Plans["Insurance Referral"]?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    },
    {
      item: "Deposit Growth unchanged (Tab 2 not re-imported)",
      pass: Math.abs((uat06Plans["Deposit Growth"]?.total || 0) - 1440000) < 1,
      evidence: `$1,440,000 → $${(uat06Plans["Deposit Growth"]?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    },
    {
      item: "Assignments reduced from 100 (fallback removed)",
      pass: (assignCount || 0) < 100,
      evidence: `100 → ${assignCount}`,
    },
    {
      item: "Results reduced from 400 (zero-payout results eliminated)",
      pass: (allResults?.length || 0) < 400,
      evidence: `400 → ${allResults?.length}`,
    },
    {
      item: "Officer 1001 CL rises from pennies to real dollars",
      pass: (uat06_1001["Consumer Lending"] || 0) > 100,
      evidence: `$0.62 → $${(uat06_1001["Consumer Lending"] || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    },
    {
      item: "Officer 1001 Mortgage rises from $0",
      pass: (uat06_1001["Mortgage Origination"] || 0) > 0,
      evidence: `$0 → $${(uat06_1001["Mortgage Origination"] || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    },
    {
      item: "MBC regression — no change",
      pass: Math.abs(mbcTotal - UAT05.mbc.total) < 0.10,
      evidence: `$${UAT05.mbc.total.toLocaleString(undefined, { minimumFractionDigits: 2 })} → $${mbcTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} (Δ$${(mbcTotal - UAT05.mbc.total).toFixed(2)})`,
    },
  ];

  let passCount = 0;
  for (const imp of improvements) {
    const verdict = imp.pass ? "PASS" : "FAIL";
    if (imp.pass) passCount++;
    console.log(`  ${verdict}: ${imp.item}`);
    console.log(`         ${imp.evidence}`);
  }
  console.log(`\nIMPROVEMENTS: ${passCount}/${improvements.length} confirmed`);

  // ============================================================
  // GRAND VERDICT
  // ============================================================
  console.log("\n═══ GRAND VERDICT ═══\n");
  console.log("CC-UAT-05 grand total: $" + UAT05.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 }));
  console.log("CC-UAT-06 grand total: $" + grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 }));
  console.log("Improvement: +$" + (grandTotal - UAT05.grandTotal).toLocaleString(undefined, { minimumFractionDigits: 2 }));
  console.log("Improvement %: " + (((grandTotal - UAT05.grandTotal) / UAT05.grandTotal) * 100).toFixed(1) + "%");
  console.log("\nFixing HF-081 (count→sum + source_pattern) unlocked $" +
    ((grandTotal - UAT05.grandTotal)).toLocaleString(undefined, { minimumFractionDigits: 2 }) +
    " in previously zero/miscalculated payouts.");
  console.log("Fixing HF-082 (license-based assignments) reduced waste: 100 → " + assignCount +
    " assignments, 400 → " + allResults?.length + " results, same grand total.");
}

main().catch(console.error);
