/**
 * HF-083 Phase 2: Isolated DG recalculation — DG only, all 4 periods
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/hf083-phase2-recalculate.ts
 * Requires: dev server running on localhost:3000
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  HF-083 PHASE 2: ISOLATED DG RECALCULATION         ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // Find DG plan
  const { data: rsMap } = await sb.from("rule_sets")
    .select("id, name").eq("tenant_id", LAB).eq("status", "active");
  const dgPlan = (rsMap || []).find(rs => rs.name.toLowerCase().includes("deposit growth"));
  if (!dgPlan) { console.error("ERROR: DG plan not found"); process.exit(1); }
  console.log("DG plan:", dgPlan.name, "|", dgPlan.id.slice(0, 8));

  // Get periods
  const { data: periods } = await sb.from("periods")
    .select("id, label, canonical_key").eq("tenant_id", LAB);
  console.log("Periods:", (periods || []).length);

  // Step 2.1: Record pre-recalculation DG state
  console.log("\n═══ STEP 2.1: PRE-RECALCULATION DG STATE ═══");
  const { data: preResults } = await sb.from("calculation_results")
    .select("entity_id, period_id, total_payout, components")
    .eq("tenant_id", LAB)
    .eq("rule_set_id", dgPlan.id);

  const prePayouts = (preResults || []).map(r => Number(r.total_payout) || 0);
  const preTotal = prePayouts.reduce((s, v) => s + v, 0);
  const preUnique = new Set(prePayouts);
  console.log("Results:", preResults?.length);
  console.log("Total: $" + preTotal.toFixed(2));
  console.log("Unique payouts:", Array.from(preUnique).map(v => "$" + v.toFixed(2)).join(", "));
  console.log("Uniform:", preUnique.size === 1 ? "YES" : "NO");

  // Step 2.2: Delete DG results only
  console.log("\n═══ STEP 2.2: DELETE DG RESULTS ONLY ═══");

  // Delete calculation_results for DG
  const { error: resErr, count: resDeleted } = await sb.from("calculation_results")
    .delete({ count: "exact" })
    .eq("tenant_id", LAB)
    .eq("rule_set_id", dgPlan.id);
  if (resErr) { console.error("Results DELETE failed:", resErr); process.exit(1); }
  console.log("Deleted calculation_results:", resDeleted);

  // entity_period_outcomes has no rule_set_id (per-entity aggregate across all plans).
  // Skip targeted deletion — the calculation engine regenerates EPOs during recalculation.
  console.log("Skipped entity_period_outcomes (no rule_set_id — per-entity aggregate)");

  // Delete calculation_batches for DG
  const { error: batchErr, count: batchDeleted } = await sb.from("calculation_batches")
    .delete({ count: "exact" })
    .eq("tenant_id", LAB)
    .eq("rule_set_id", dgPlan.id);
  if (batchErr) { console.error("Batch DELETE failed:", batchErr); process.exit(1); }
  console.log("Deleted calculation_batches:", batchDeleted);

  // Verify other plans untouched
  const { count: otherResults } = await sb.from("calculation_results")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", LAB)
    .neq("rule_set_id", dgPlan.id);
  console.log("Other plan results (should be 220):", otherResults);

  // Step 2.3: Recalculate DG for all 4 periods
  console.log("\n═══ STEP 2.3: RECALCULATE DG ═══");
  let success = 0, errors = 0;
  for (const period of (periods || []).sort((a, b) => a.canonical_key.localeCompare(b.canonical_key))) {
    const label = `${dgPlan.name} × ${period.label || period.canonical_key}`;
    try {
      const res = await fetch("http://localhost:3000/api/calculation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: LAB, ruleSetId: dgPlan.id, periodId: period.id }),
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        const count = data.resultsCount || data.results?.length || "?";
        console.log(`  ✓ ${label} → ${count} results`);
        success++;
      } else {
        console.log(`  ✗ ${label} → ERROR: ${data.error || JSON.stringify(data).slice(0, 200)}`);
        errors++;
      }
    } catch (err) {
      console.log(`  ✗ ${label} → FETCH ERROR: ${err}`);
      errors++;
    }
  }
  console.log(`\nRecalculation: ${success} success, ${errors} errors`);

  // Step 2.4: Post-recalculation DG state
  console.log("\n═══ STEP 2.4: POST-RECALCULATION DG STATE ═══");
  const { data: postResults } = await sb.from("calculation_results")
    .select("entity_id, period_id, total_payout, components")
    .eq("tenant_id", LAB)
    .eq("rule_set_id", dgPlan.id);

  const postPayouts = (postResults || []).map(r => Number(r.total_payout) || 0);
  const postTotal = postPayouts.reduce((s, v) => s + v, 0);
  const postUnique = new Set(postPayouts);
  console.log("Results:", postResults?.length, "(expected 48)");
  console.log("Total: $" + postTotal.toFixed(2));
  console.log("Unique payouts:", Array.from(postUnique).map(v => "$" + v.toFixed(2)).join(", "));
  console.log("Uniform:", postUnique.size === 1 ? "YES — still $" + postPayouts[0]?.toFixed(2) : "NO — VARIABLE PAYOUTS!");

  // Per-entity breakdown
  console.log("\n  Per-entity payouts (first period):");
  const { data: entities } = await sb.from("entities")
    .select("id, external_id").eq("tenant_id", LAB);
  const extMap = new Map<string, string>();
  for (const e of entities || []) extMap.set(e.id, e.external_id);

  const firstPeriod = (periods || []).sort((a, b) => a.canonical_key.localeCompare(b.canonical_key))[0];
  const firstPeriodResults = (postResults || []).filter(r => r.period_id === firstPeriod?.id);
  for (const r of firstPeriodResults.sort((a, b) => (Number(b.total_payout) || 0) - (Number(a.total_payout) || 0))) {
    const ext = extMap.get(r.entity_id) || "?";
    const payout = Number(r.total_payout) || 0;
    console.log(`    Officer ${ext}: $${payout.toFixed(2)}`);
  }

  // KEY QUESTION
  console.log("\n═══ F-04 STATUS ═══");
  if (postUnique.size > 1) {
    console.log("TARGET DATA IS BEING CONSUMED — payouts vary by entity!");
    console.log("F-04 STATUS: CLOSING");
  } else {
    console.log("Payouts still uniform $" + postPayouts[0]?.toFixed(2));
    console.log("The engine uses deposit_growth_attainment → sum on deposit_balances .amount");
    console.log("The new target data (component_data:CFG_Deposit_Growth_Incentive_Q1_2024) is NOT referenced by any derivation.");
    console.log("F-04 STATUS: OPEN — engine wiring gap. Convergence needs to generate a derivation referencing the target data.");
  }

  // Compare pre vs post
  console.log("\n═══ COMPARISON ═══");
  console.log("Pre-recalculation:  ", preResults?.length, "results, $" + preTotal.toFixed(2));
  console.log("Post-recalculation: ", postResults?.length, "results, $" + postTotal.toFixed(2));
  console.log("Delta: $" + (postTotal - preTotal).toFixed(2));
}

main().catch(console.error);
