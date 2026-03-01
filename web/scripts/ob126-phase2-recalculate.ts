/**
 * OB-126 Phase 2: Recalculate all LAB plans
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob126-phase2-recalculate.ts
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
  console.log("║  OB-126 PHASE 2: RECALCULATE ALL LAB PLANS          ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const { data: plans } = await sb.from("rule_sets")
    .select("id, name").eq("tenant_id", LAB).eq("status", "active");
  const { data: periods } = await sb.from("periods")
    .select("id, label, canonical_key").eq("tenant_id", LAB);

  console.log("Plans to calculate:");
  for (const p of plans || []) console.log("  ", p.name, "|", p.id.slice(0, 8));
  console.log("\nPeriods:");
  for (const p of (periods || []).sort((a, b) => a.canonical_key.localeCompare(b.canonical_key))) {
    console.log("  ", p.label || p.canonical_key, "|", p.id.slice(0, 8));
  }
  console.log();

  let success = 0;
  let errors = 0;

  for (const plan of plans || []) {
    for (const period of (periods || []).sort((a, b) => a.canonical_key.localeCompare(b.canonical_key))) {
      const label = `${plan.name} × ${period.label || period.canonical_key}`;
      try {
        const res = await fetch("http://localhost:3000/api/calculation/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId: LAB, ruleSetId: plan.id, periodId: period.id }),
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
  }

  console.log(`\nCompleted: ${success} success, ${errors} errors\n`);

  // Verify results
  console.log("=== VERIFICATION ===");
  const { count: resultCount } = await sb.from("calculation_results")
    .select("*", { count: "exact", head: true }).eq("tenant_id", LAB);
  const { count: batchCount } = await sb.from("calculation_batches")
    .select("*", { count: "exact", head: true }).eq("tenant_id", LAB);

  console.log("Results:", resultCount);
  console.log("Batches:", batchCount);
  console.log("Expected results: ~268 (CL:25×4=100 + MO:14×4=56 + IR:16×4=64 + DG:12×4=48)");

  // Per-plan breakdown
  const { data: results } = await sb.from("calculation_results")
    .select("rule_set_id, total_payout").eq("tenant_id", LAB);
  const { data: rsMap } = await sb.from("rule_sets")
    .select("id, name").eq("tenant_id", LAB).eq("status", "active");
  const idToName: Record<string, string> = {};
  for (const rs of rsMap || []) idToName[rs.id] = rs.name;

  const planTotals: Record<string, { count: number; total: number; nonZero: number }> = {};
  for (const r of results || []) {
    const name = idToName[r.rule_set_id] || r.rule_set_id.slice(0, 8);
    if (!planTotals[name]) planTotals[name] = { count: 0, total: 0, nonZero: 0 };
    planTotals[name].count++;
    planTotals[name].total += Number(r.total_payout) || 0;
    if (Number(r.total_payout) > 0) planTotals[name].nonZero++;
  }

  console.log("\nPer-plan results:");
  for (const [plan, stats] of Object.entries(planTotals).sort()) {
    console.log(`  ${plan}: ${stats.count} results, ${stats.nonZero} non-zero, $${stats.total.toFixed(2)}`);
  }

  const grandTotal = Object.values(planTotals).reduce((s, p) => s + p.total, 0);
  console.log(`\nGrand total: $${grandTotal.toFixed(2)}`);
  console.log(`Was: $9,337,311.77 (400 results, 100 assignments)`);
}

main().catch(console.error);
