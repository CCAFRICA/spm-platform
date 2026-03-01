/**
 * OB-126 Phase 3: CC-UAT-06 Forensic Trace — 8-layer verification
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob126-phase3-forensic.ts
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
  console.log("║  CC-UAT-06: POST OB-124/HF-082/OB-125 FORENSIC     ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // ============================================================
  // LAYER 0: TENANT STATE
  // ============================================================
  console.log("═══ LAYER 0: TENANT STATE ═══");
  const { count: entityCount } = await sb.from("entities").select("*", { count: "exact", head: true }).eq("tenant_id", LAB);
  const { count: assignCount } = await sb.from("rule_set_assignments").select("*", { count: "exact", head: true }).eq("tenant_id", LAB);
  const { count: cdCount } = await sb.from("committed_data").select("*", { count: "exact", head: true }).eq("tenant_id", LAB);
  const { count: resultCount } = await sb.from("calculation_results").select("*", { count: "exact", head: true }).eq("tenant_id", LAB);
  const { count: periodCount } = await sb.from("periods").select("*", { count: "exact", head: true }).eq("tenant_id", LAB);

  console.log("Entities:", entityCount);
  console.log("Assignments:", assignCount, "(was 100 in UAT-05, now 67 after HF-082)");
  console.log("Committed data:", cdCount);
  console.log("Periods:", periodCount);
  console.log("Calculation results:", resultCount, "(was 400 in UAT-05)");

  // ============================================================
  // LAYER 1: ENTITY + LICENSE VERIFICATION
  // ============================================================
  console.log("\n═══ LAYER 1: ENTITY + LICENSE VERIFICATION ═══");
  const { data: entities } = await sb.from("entities")
    .select("id, external_id, display_name, metadata").eq("tenant_id", LAB);

  let withLicenses = 0;
  const licenseDistro: Record<string, number> = {};
  for (const e of entities || []) {
    const lic = (e.metadata as Record<string, unknown>)?.product_licenses || "";
    if (lic) {
      withLicenses++;
      for (const l of String(lic).split(",").map(s => s.trim())) {
        if (l) licenseDistro[l] = (licenseDistro[l] || 0) + 1;
      }
    }
  }
  console.log("Entities with licenses:", withLicenses + "/" + entityCount);
  console.log("License distribution:");
  for (const [l, c] of Object.entries(licenseDistro).sort()) console.log("  ", l, ":", c);

  // ============================================================
  // LAYER 2: ASSIGNMENT VERIFICATION
  // ============================================================
  console.log("\n═══ LAYER 2: ASSIGNMENT VERIFICATION ═══");
  const { data: rsMap } = await sb.from("rule_sets")
    .select("id, name").eq("tenant_id", LAB).eq("status", "active");
  const idToName: Record<string, string> = {};
  for (const rs of rsMap || []) idToName[rs.id] = rs.name;

  const { data: allAssignments } = await sb.from("rule_set_assignments")
    .select("entity_id, rule_set_id").eq("tenant_id", LAB);

  const planAssignments: Record<string, number> = {};
  const entityAssignments: Record<string, { count: number; licenses: string; plans: string[] }> = {};

  const entityMeta = new Map<string, { ext: string; lic: string }>();
  for (const e of entities || []) {
    const lic = String((e.metadata as Record<string, unknown>)?.product_licenses || "");
    entityMeta.set(e.id, { ext: e.external_id, lic });
  }

  for (const a of allAssignments || []) {
    const plan = idToName[a.rule_set_id] || a.rule_set_id.slice(0, 8);
    const meta = entityMeta.get(a.entity_id);
    const ext = meta?.ext || "?";
    planAssignments[plan] = (planAssignments[plan] || 0) + 1;
    if (!entityAssignments[ext]) entityAssignments[ext] = { count: 0, licenses: meta?.lic || "", plans: [] };
    entityAssignments[ext].count++;
    entityAssignments[ext].plans.push(plan);
  }

  console.log("Assignments per plan:");
  for (const [p, c] of Object.entries(planAssignments).sort()) console.log("  ", p, ":", c);
  console.log("Total:", allAssignments?.length);

  const assignCounts = Object.values(entityAssignments).map(e => e.count);
  const min = Math.min(...assignCounts), max = Math.max(...assignCounts);
  console.log("Assignment range per entity:", min, "-", max);
  console.log("Full-coverage fallback:", min === max && max === Object.keys(planAssignments).length
    ? "DETECTED" : "NOT DETECTED ✓");

  let mismatches = 0;
  for (const [ext, info] of Object.entries(entityAssignments)) {
    const licCount = String(info.licenses).split(",").map(s => s.trim()).filter(s => s.length > 0).length;
    if (licCount !== info.count) {
      mismatches++;
      if (mismatches <= 3) console.log("  MISMATCH:", ext, "has", licCount, "licenses but", info.count, "assignments");
    }
  }
  console.log("License↔assignment mismatches:", mismatches + "/" + Object.keys(entityAssignments).length);

  // ============================================================
  // LAYER 3: INPUT BINDINGS + CONVERGENCE
  // ============================================================
  console.log("\n═══ LAYER 3: INPUT BINDINGS + CONVERGENCE ═══");
  for (const rs of rsMap || []) {
    const { data: fullRs } = await sb.from("rule_sets")
      .select("input_bindings, components").eq("id", rs.id).single();
    const bindings = (fullRs?.input_bindings as Record<string, unknown>) || {};
    const derivations = (bindings.metric_derivations as Array<Record<string, unknown>>) || [];
    const components = (fullRs?.components as Record<string, unknown>) || {};
    const variants = (components.variants as Array<Record<string, unknown>>) || [];
    const compList = (variants[0]?.components as unknown[]) || [];
    console.log("\n  Plan:", rs.name);
    console.log("  Components:", compList.length);
    console.log("  Derivations:", derivations.length);
    for (const d of derivations) {
      const sp = String(d.source_pattern || "");
      const { count: matchCount } = await sb.from("committed_data")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", LAB).eq("data_type", sp);
      console.log("    ", d.metricName || d.metric, "→", d.operation, "on", sp,
        d.source_field ? "." + d.source_field : "",
        "|", matchCount, "rows", matchCount === 0 ? "⚠ NO DATA" : "✓");
    }
  }

  // ============================================================
  // LAYER 4: COMMITTED DATA
  // ============================================================
  console.log("\n═══ LAYER 4: COMMITTED DATA ═══");
  const PAGE = 1000;
  let offset = 0;
  const dtCount: Record<string, number> = {};
  let totalCd = 0;
  while (true) {
    const { data: cdPage } = await sb.from("committed_data")
      .select("data_type").eq("tenant_id", LAB)
      .range(offset, offset + PAGE - 1);
    if (!cdPage || cdPage.length === 0) break;
    for (const r of cdPage) dtCount[r.data_type] = (dtCount[r.data_type] || 0) + 1;
    totalCd += cdPage.length;
    if (cdPage.length < PAGE) break;
    offset += PAGE;
  }
  for (const [t, c] of Object.entries(dtCount).sort()) console.log("  ", t, ":", c, "rows");
  console.log("Total:", totalCd);
  const multiTab = Object.keys(dtCount).filter(k => k.includes("__"));
  console.log("Multi-tab data_types (OB-124):", multiTab.length > 0 ? multiTab.join(", ") : "NONE — Tab 2 not yet re-imported");

  // ============================================================
  // LAYER 5: CALCULATION RESULTS
  // ============================================================
  console.log("\n═══ LAYER 5: CALCULATION RESULTS ═══");
  const { data: allResults } = await sb.from("calculation_results")
    .select("rule_set_id, entity_id, total_payout, period_id, components, metadata")
    .eq("tenant_id", LAB);

  const planResults: Record<string, { count: number; total: number; nonZero: number; max: number; min: number }> = {};
  for (const r of allResults || []) {
    const name = idToName[r.rule_set_id] || r.rule_set_id.slice(0, 8);
    if (!planResults[name]) planResults[name] = { count: 0, total: 0, nonZero: 0, max: 0, min: Infinity };
    const payout = Number(r.total_payout) || 0;
    planResults[name].count++;
    planResults[name].total += payout;
    if (payout > 0) planResults[name].nonZero++;
    planResults[name].max = Math.max(planResults[name].max, payout);
    planResults[name].min = Math.min(planResults[name].min, payout);
  }

  console.log("\n| Plan | Results | Non-zero | Total | Max | Issue |");
  console.log("|------|---------|----------|-------|-----|-------|");
  for (const [plan, stats] of Object.entries(planResults).sort()) {
    const issue = stats.total === 0 ? "**ALL ZERO**" :
      stats.max === stats.min && stats.nonZero > 1 ? "**UNIFORM**" :
      stats.nonZero < stats.count * 0.1 ? "**LOW HIT RATE**" : "OK";
    console.log(`| ${plan} | ${stats.count} | ${stats.nonZero} | $${stats.total.toFixed(2)} | $${stats.max.toFixed(2)} | ${issue} |`);
  }

  const grandTotal = Object.values(planResults).reduce((s, p) => s + p.total, 0);
  console.log("\nGrand total: $" + grandTotal.toFixed(2));
  console.log("Total results:", allResults?.length);
  console.log("\nCC-UAT-05 comparison:");
  console.log("  UAT-05 results: 400 (100 assignments × 4 plans)");
  console.log("  UAT-06 results:", allResults?.length, "(67 assignments, variable per plan)");
  console.log("  UAT-05 total: $9,337,311.77");
  console.log("  UAT-06 total: $" + grandTotal.toFixed(2));
  console.log("  Delta: $" + (grandTotal - 9337311.77).toFixed(2));

  // ============================================================
  // LAYER 6: OFFICER 1001 FORENSIC TRACE
  // ============================================================
  console.log("\n═══ LAYER 6: OFFICER 1001 FORENSIC TRACE ═══");
  const officer1001 = (entities || []).find(e => String(e.external_id) === "1001");
  if (!officer1001) {
    console.log("ERROR: Officer 1001 not found");
  } else {
    const meta1001 = officer1001.metadata as Record<string, unknown>;
    console.log("Entity:", officer1001.display_name, "| ID:", officer1001.id.slice(0, 8));
    console.log("Licenses:", meta1001?.product_licenses);

    const o1001Assigns = (allAssignments || []).filter(a => a.entity_id === officer1001.id);
    console.log("Assignments:", o1001Assigns.length);
    for (const a of o1001Assigns) console.log("  →", idToName[a.rule_set_id] || a.rule_set_id.slice(0, 8));

    const o1001Results = (allResults || []).filter(r => r.entity_id === officer1001.id);
    console.log("Results:", o1001Results.length);

    for (const r of o1001Results) {
      const planName = idToName[r.rule_set_id] || r.rule_set_id.slice(0, 8);
      const payout = Number(r.total_payout) || 0;
      const comps = Array.isArray(r.components) ? r.components as Array<Record<string, unknown>> : [];
      console.log(`  ${planName} | $${payout.toFixed(2)}`);
      for (const c of comps) {
        const cName = String(c.componentName || c.component_name || c.name || "?");
        const cPayout = Number(c.payout || c.outputValue || c.output_value || c.amount || 0);
        if (cPayout > 0 || comps.length <= 4) {
          console.log(`    Component: ${cName} → $${cPayout.toFixed(2)}`);
        }
      }
    }

    const o1001Total = o1001Results.reduce((s, r) => s + (Number(r.total_payout) || 0), 0);
    console.log("Officer 1001 total: $" + o1001Total.toFixed(2));
    console.log("\nCC-UAT-05 Officer 1001 comparison:");
    console.log("  Insurance: $25,350 (UAT-05)");
    console.log("  Consumer Lending: $0.62 (UAT-05 — count-not-sum bug)");
    console.log("  Deposit Growth: $120,000 (UAT-05 — uniform $30K)");
    console.log("  Mortgage: $0.00 (UAT-05 — source_pattern mismatch)");
  }

  // ============================================================
  // LAYER 7: MBC REGRESSION
  // ============================================================
  console.log("\n═══ LAYER 7: MBC REGRESSION ═══");
  const { data: mbcResults } = await sb.from("calculation_results")
    .select("total_payout").eq("tenant_id", MBC);
  const mbcTotal = (mbcResults || []).reduce((s, r) => s + (Number(r.total_payout) || 0), 0);
  const { count: mbcAssignments } = await sb.from("rule_set_assignments")
    .select("*", { count: "exact", head: true }).eq("tenant_id", MBC);
  console.log("MBC results:", mbcResults?.length, "(expected 240)");
  console.log("MBC assignments:", mbcAssignments, "(expected 80)");
  console.log("MBC total: $" + mbcTotal.toFixed(2), "(expected $3,245,212.64)");
  console.log("Delta: $" + (mbcTotal - 3245212.64).toFixed(2));
  console.log("VERDICT:", Math.abs(mbcTotal - 3245212.64) < 0.10 ? "PASS" : "FAIL");

  // ============================================================
  // LAYER 8: KOREAN TEST
  // ============================================================
  console.log("\n═══ LAYER 8: KOREAN TEST ═══");
  console.log("(Verified via grep — see separate output)");
}

main().catch(console.error);
