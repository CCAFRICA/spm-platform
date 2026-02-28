/**
 * OB-121 Phase 5: Convergence gap report for all MBC plans
 *
 * Runs convergence analysis on all 4 active rule sets and reports:
 * - Matched data types → derivations generated
 * - Unmatched components → gaps with resolution guidance
 */
import { createClient } from "@supabase/supabase-js";
import { convergeBindings } from "../src/lib/intelligence/convergence-service";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  console.log("=== OB-121 PHASE 5: CONVERGENCE GAP REPORT ===\n");

  // Get all active rule sets
  const { data: ruleSets } = await sb
    .from("rule_sets")
    .select("id, name")
    .eq("tenant_id", TENANT)
    .eq("status", "active")
    .order("name");

  if (!ruleSets?.length) {
    console.error("No active rule sets found!");
    return;
  }

  let totalDerivations = 0;
  let totalGaps = 0;

  for (const rs of ruleSets) {
    console.log(`\n── ${rs.name} (${rs.id}) ──\n`);

    const result = await convergeBindings(TENANT, rs.id, sb);

    // Derivations
    if (result.derivations.length > 0) {
      console.log(`  Derivations (${result.derivations.length}):`);
      for (const d of result.derivations) {
        const filters = d.filters.length > 0
          ? ` [${d.filters.map(f => `${f.field}=${f.value}`).join(", ")}]`
          : "";
        console.log(`    ${d.metric}: ${d.operation}(${d.source_pattern}${d.source_field ? "." + d.source_field : ""})${filters}`);
      }
    }

    // Match report
    if (result.matchReport.length > 0) {
      console.log(`\n  Matches (${result.matchReport.length}):`);
      for (const m of result.matchReport) {
        console.log(`    ${m.component} → ${m.dataType} (${(m.confidence * 100).toFixed(0)}% — ${m.reason})`);
      }
    }

    // Gaps
    if (result.gaps.length > 0) {
      console.log(`\n  GAPS (${result.gaps.length}):`);
      for (const g of result.gaps) {
        console.log(`    [${g.componentIndex}] ${g.component}`);
        console.log(`      Op: ${g.calculationOp}`);
        console.log(`      Metrics: ${g.requiredMetrics.join(", ") || "(none extracted)"}`);
        console.log(`      Reason: ${g.reason}`);
        console.log(`      Resolution: ${g.resolution}`);
      }
    }

    if (result.gaps.length === 0 && result.derivations.length > 0) {
      console.log(`\n  STATUS: FULLY CONVERGED`);
    } else if (result.gaps.length > 0 && result.derivations.length > 0) {
      console.log(`\n  STATUS: PARTIALLY CONVERGED (${result.derivations.length} derivations, ${result.gaps.length} gaps)`);
    } else if (result.gaps.length > 0) {
      console.log(`\n  STATUS: NOT CONVERGED (${result.gaps.length} gaps)`);
    }

    totalDerivations += result.derivations.length;
    totalGaps += result.gaps.length;
  }

  console.log("\n\n── SUMMARY ──\n");
  console.log(`Plans analyzed: ${ruleSets.length}`);
  console.log(`Total derivations: ${totalDerivations}`);
  console.log(`Total gaps: ${totalGaps}`);
  console.log(`\nGap report complete.`);
}

main().catch(console.error);
