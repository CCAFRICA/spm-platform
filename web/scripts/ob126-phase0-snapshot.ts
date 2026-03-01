/**
 * OB-126 Phase 0: Pre-recalculation state snapshot
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob126-phase0-snapshot.ts
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
  console.log("║  OB-126 PHASE 0: PRE-RECALCULATION SNAPSHOT         ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  console.log("=== LAB PRE-RECALCULATION STATE ===\n");

  // Entities
  const { count: entityCount } = await sb.from("entities")
    .select("*", { count: "exact", head: true }).eq("tenant_id", LAB);
  console.log("Entities:", entityCount);

  // Assignments with plan names
  const { data: assignments } = await sb.from("rule_set_assignments")
    .select("rule_set_id").eq("tenant_id", LAB);
  const { data: rsMap } = await sb.from("rule_sets")
    .select("id, name").eq("tenant_id", LAB).eq("status", "active");
  const idToName: Record<string, string> = {};
  for (const rs of rsMap || []) idToName[rs.id] = rs.name;

  const byPlan: Record<string, number> = {};
  for (const a of assignments || []) {
    const name = idToName[a.rule_set_id] || a.rule_set_id.slice(0, 8);
    byPlan[name] = (byPlan[name] || 0) + 1;
  }
  console.log("Assignments:", assignments?.length);
  for (const [p, c] of Object.entries(byPlan).sort()) console.log("  ", p, ":", c);

  // Periods
  const { data: periods } = await sb.from("periods")
    .select("id, label, canonical_key").eq("tenant_id", LAB);
  console.log("\nPeriods:", periods?.length);
  for (const p of (periods || []).sort((a, b) => a.canonical_key.localeCompare(b.canonical_key))) {
    console.log("  ", p.label || p.canonical_key, "| id:", p.id.slice(0, 8));
  }

  // Committed data types
  const PAGE = 1000;
  let offset = 0;
  const typeCount: Record<string, number> = {};
  let totalCd = 0;
  while (true) {
    const { data: cdPage } = await sb.from("committed_data")
      .select("data_type").eq("tenant_id", LAB)
      .range(offset, offset + PAGE - 1);
    if (!cdPage || cdPage.length === 0) break;
    for (const r of cdPage) typeCount[r.data_type] = (typeCount[r.data_type] || 0) + 1;
    totalCd += cdPage.length;
    if (cdPage.length < PAGE) break;
    offset += PAGE;
  }
  console.log("\nCommitted data:", totalCd, "rows");
  for (const [t, c] of Object.entries(typeCount).sort()) console.log("  ", t, ":", c);

  // Rule sets + input_bindings
  console.log("\nActive rule sets:", rsMap?.length);
  for (const rs of rsMap || []) {
    const { data: fullRs } = await sb.from("rule_sets")
      .select("input_bindings, components").eq("id", rs.id).single();
    const bindings = (fullRs?.input_bindings as Record<string, unknown>) || {};
    const derivations = (bindings.metric_derivations as Array<Record<string, unknown>>) || [];
    const components = (fullRs?.components as unknown[]) || [];
    console.log("\n  Plan:", rs.name);
    console.log("    Components:", components.length);
    console.log("    Derivations:", derivations.length);
    for (const d of derivations) {
      console.log("      ", d.metricName || d.metric, "→", d.operation, "on", d.source_pattern,
        d.source_field ? "." + d.source_field : "");
    }
  }

  // Current stale results
  const { data: results } = await sb.from("calculation_results")
    .select("rule_set_id, total_payout").eq("tenant_id", LAB);

  const planTotals: Record<string, { count: number; total: number; nonZero: number }> = {};
  for (const r of results || []) {
    const name = idToName[r.rule_set_id] || r.rule_set_id.slice(0, 8);
    if (!planTotals[name]) planTotals[name] = { count: 0, total: 0, nonZero: 0 };
    planTotals[name].count++;
    planTotals[name].total += Number(r.total_payout) || 0;
    if (Number(r.total_payout) > 0) planTotals[name].nonZero++;
  }

  console.log("\n\nCurrent (stale) results:", results?.length);
  for (const [plan, stats] of Object.entries(planTotals).sort()) {
    console.log("  ", plan, ":", stats.count, "results,", stats.nonZero, "non-zero, $" + stats.total.toFixed(2));
  }

  const grandTotal = Object.values(planTotals).reduce((s, p) => s + p.total, 0);
  console.log("  Grand total: $" + grandTotal.toFixed(2));

  // Batches
  const { count: batchCount } = await sb.from("calculation_batches")
    .select("*", { count: "exact", head: true }).eq("tenant_id", LAB);
  console.log("  Batches:", batchCount);

  // MBC baseline
  console.log("\n=== MBC REGRESSION BASELINE ===");
  const { data: mbcResults } = await sb.from("calculation_results")
    .select("total_payout").eq("tenant_id", MBC);
  const mbcTotal = (mbcResults || []).reduce((s, r) => s + (Number(r.total_payout) || 0), 0);
  const { count: mbcAssign } = await sb.from("rule_set_assignments")
    .select("*", { count: "exact", head: true }).eq("tenant_id", MBC);
  console.log("MBC results:", mbcResults?.length);
  console.log("MBC assignments:", mbcAssign);
  console.log("MBC total: $" + mbcTotal.toFixed(2));
}

main().catch(console.error);
