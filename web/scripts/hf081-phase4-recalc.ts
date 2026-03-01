/**
 * HF-081 Phase 4: Delete LAB results and re-run calculation
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/hf081-phase4-recalc.ts
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  HF-081 Phase 4: Re-run LAB Calculation           ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // ── Step 1: Delete existing LAB results ──
  console.log("=== Step 1: Delete existing LAB calculation results ===\n");

  const { count: before } = await sb.from("calculation_results")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", LAB);
  console.log("Results before delete:", before);

  // Delete in order: outcomes → results → batches
  await sb.from("entity_period_outcomes").delete().eq("tenant_id", LAB);
  await sb.from("calculation_results").delete().eq("tenant_id", LAB);
  await sb.from("calculation_batches").delete().eq("tenant_id", LAB);

  const { count: after } = await sb.from("calculation_results")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", LAB);
  console.log("Results after delete:", after, "(should be 0)");

  // ── Step 2: Get rule_sets and periods ──
  console.log("\n=== Step 2: Trigger calculation for each plan x period ===\n");

  const { data: ruleSets } = await sb.from("rule_sets")
    .select("id, name")
    .eq("tenant_id", LAB)
    .eq("status", "active");

  const { data: periods } = await sb.from("periods")
    .select("id, label, canonical_key, start_date")
    .eq("tenant_id", LAB);

  console.log("Rule sets:", ruleSets?.map(r => r.name));
  console.log("Periods:", periods?.map(p => p.label || p.canonical_key || p.start_date));

  // ── Step 3: Run calculation via API ──
  let totalResults = 0;
  let grandTotal = 0;

  for (const plan of ruleSets || []) {
    for (const period of periods || []) {
      const label = period.label || period.canonical_key || period.start_date;
      try {
        const resp = await fetch("http://localhost:3000/api/calculation/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId: LAB,
            periodId: period.id,
            ruleSetId: plan.id,
          }),
        });
        const data = await resp.json();
        if (data.success) {
          const payout = data.totalPayout || 0;
          const count = data.entityCount || 0;
          grandTotal += payout;
          totalResults += count;
          console.log(`  OK ${plan.name} | ${label}: $${payout.toLocaleString()} (${count} entities)`);
        } else {
          console.log(`  FAIL ${plan.name} | ${label}: ${data.error}`);
        }
      } catch (err) {
        console.log(`  FAIL ${plan.name} | ${label}: ${err}`);
      }
    }
  }

  // ── Summary ──
  console.log("\n=== Calculation Summary ===\n");
  console.log(`Total entity-results: ${totalResults}`);
  console.log(`Grand total: $${grandTotal.toLocaleString()}`);

  // ── Verify from DB ──
  console.log("\n=== DB Verification ===\n");
  const { data: dbResults, count: dbCount } = await sb.from("calculation_results")
    .select("total_payout, rule_set_id", { count: "exact" })
    .eq("tenant_id", LAB);

  const byPlan: Record<string, { count: number; total: number; nonZero: number; min: number; max: number }> = {};
  for (const r of dbResults || []) {
    const rsId = r.rule_set_id as string;
    if (!byPlan[rsId]) byPlan[rsId] = { count: 0, total: 0, nonZero: 0, min: Infinity, max: -Infinity };
    const payout = Number(r.total_payout) || 0;
    byPlan[rsId].count++;
    byPlan[rsId].total += payout;
    if (payout > 0) byPlan[rsId].nonZero++;
    byPlan[rsId].min = Math.min(byPlan[rsId].min, payout);
    byPlan[rsId].max = Math.max(byPlan[rsId].max, payout);
  }

  for (const [rsId, stats] of Object.entries(byPlan)) {
    const rs = (ruleSets || []).find(r => r.id === rsId);
    console.log(`${rs?.name || rsId}:`);
    console.log(`  Results: ${stats.count} | Non-zero: ${stats.nonZero} | Total: $${stats.total.toFixed(2)}`);
    console.log(`  Range: [$${stats.min.toFixed(2)}, $${stats.max.toFixed(2)}]`);
  }

  const dbGrandTotal = Object.values(byPlan).reduce((s, v) => s + v.total, 0);
  console.log(`\nDB Grand Total: $${dbGrandTotal.toFixed(2)}`);
  console.log(`DB Result Count: ${dbCount}`);
}

main().catch(console.error);
