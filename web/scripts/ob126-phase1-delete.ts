/**
 * OB-126 Phase 1: Delete stale LAB results
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob126-phase1-delete.ts
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  OB-126 PHASE 1: DELETE STALE LAB RESULTS           ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // Count before
  const { count: resultsBefore } = await sb.from("calculation_results")
    .select("*", { count: "exact", head: true }).eq("tenant_id", LAB);
  const { count: batchesBefore } = await sb.from("calculation_batches")
    .select("*", { count: "exact", head: true }).eq("tenant_id", LAB);
  const { count: outcomesBefore } = await sb.from("entity_period_outcomes")
    .select("*", { count: "exact", head: true }).eq("tenant_id", LAB);

  console.log("Before deletion:");
  console.log("  Results:", resultsBefore);
  console.log("  Batches:", batchesBefore);
  console.log("  Entity period outcomes:", outcomesBefore);

  // Delete results first (FK dependency on batch_id)
  const { error: resErr } = await sb.from("calculation_results").delete().eq("tenant_id", LAB);
  if (resErr) { console.error("Results DELETE failed:", resErr); process.exit(1); }
  console.log("\nDeleted calculation_results");

  // Delete entity_period_outcomes
  const { error: epoErr } = await sb.from("entity_period_outcomes").delete().eq("tenant_id", LAB);
  if (epoErr) { console.error("Entity period outcomes DELETE failed:", epoErr); process.exit(1); }
  console.log("Deleted entity_period_outcomes");

  // Delete batches
  const { error: batchErr } = await sb.from("calculation_batches").delete().eq("tenant_id", LAB);
  if (batchErr) { console.error("Batches DELETE failed:", batchErr); process.exit(1); }
  console.log("Deleted calculation_batches");

  // Verify
  const { count: resultsAfter } = await sb.from("calculation_results")
    .select("*", { count: "exact", head: true }).eq("tenant_id", LAB);
  const { count: batchesAfter } = await sb.from("calculation_batches")
    .select("*", { count: "exact", head: true }).eq("tenant_id", LAB);
  const { count: outcomesAfter } = await sb.from("entity_period_outcomes")
    .select("*", { count: "exact", head: true }).eq("tenant_id", LAB);

  console.log("\nAfter deletion:");
  console.log("  Results:", resultsAfter, "(should be 0)");
  console.log("  Batches:", batchesAfter, "(should be 0)");
  console.log("  Outcomes:", outcomesAfter, "(should be 0)");
  console.log("\nVERDICT:", (resultsAfter === 0 && batchesAfter === 0 && outcomesAfter === 0)
    ? "PASS — clean slate" : "FAIL");
}

main().catch(console.error);
