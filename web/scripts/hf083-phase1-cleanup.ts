/**
 * HF-083 Phase 1: Delete 17 junk rows from Tab 1 plan rules import
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/hf083-phase1-cleanup.ts
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  HF-083 PHASE 1: DELETE JUNK DATA                   ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // Step 1.1: Count before
  console.log("═══ STEP 1.1: PRE-DELETE STATE ═══");
  const { count: totalBefore } = await sb.from("committed_data")
    .select("*", { count: "exact", head: true }).eq("tenant_id", LAB);
  const { count: junkBefore } = await sb.from("committed_data")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", LAB)
    .eq("data_type", "reference:CFG_Deposit_Growth_Incentive_Q1_2024");
  const { count: targetBefore } = await sb.from("committed_data")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", LAB)
    .eq("data_type", "component_data:CFG_Deposit_Growth_Incentive_Q1_2024");

  console.log("Total committed_data:", totalBefore);
  console.log("Junk rows (reference:CFG_Deposit_Growth...):", junkBefore);
  console.log("Target rows (component_data:CFG_Deposit_Growth...):", targetBefore);

  // Step 1.2: Delete junk rows — the 17 rows from Tab 1 plan rules
  console.log("\n═══ STEP 1.2: DELETE JUNK ROWS ═══");
  const { error: delErr, count: delCount } = await sb.from("committed_data")
    .delete({ count: "exact" })
    .eq("tenant_id", LAB)
    .eq("data_type", "reference:CFG_Deposit_Growth_Incentive_Q1_2024");

  if (delErr) {
    console.error("DELETE FAILED:", delErr);
    process.exit(1);
  }
  console.log("Deleted:", delCount, "rows (expected 17)");

  // Step 1.3: Verify deletion
  console.log("\n═══ STEP 1.3: POST-DELETE VERIFICATION ═══");
  const { count: junkAfter } = await sb.from("committed_data")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", LAB)
    .eq("data_type", "reference:CFG_Deposit_Growth_Incentive_Q1_2024");
  const { count: targetAfter } = await sb.from("committed_data")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", LAB)
    .eq("data_type", "component_data:CFG_Deposit_Growth_Incentive_Q1_2024");
  const { count: totalAfter } = await sb.from("committed_data")
    .select("*", { count: "exact", head: true }).eq("tenant_id", LAB);

  console.log("Junk rows remaining:", junkAfter, "(should be 0)");
  console.log("Target rows remaining:", targetAfter, "(should be 12)");
  console.log("Total committed_data:", totalAfter, `(should be ${(totalBefore || 0) - 17})`);

  // Step 1.4: Verify no __EMPTY rows remain
  console.log("\n═══ STEP 1.4: __EMPTY SCAN ═══");
  const PAGE = 1000;
  let offset = 0;
  let emptyCount = 0;
  while (true) {
    const { data: page } = await sb.from("committed_data")
      .select("id, data_type, row_data")
      .eq("tenant_id", LAB)
      .range(offset, offset + PAGE - 1);
    if (!page || page.length === 0) break;
    for (const r of page) {
      if (JSON.stringify(r.row_data).includes("__EMPTY")) emptyCount++;
    }
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  console.log("Rows with __EMPTY fields:", emptyCount, "(should be 0)");

  // Step 1.5: Full data_type breakdown
  console.log("\n═══ STEP 1.5: FULL DATA_TYPE BREAKDOWN ═══");
  offset = 0;
  const typeCount: Record<string, number> = {};
  let total = 0;
  while (true) {
    const { data: page } = await sb.from("committed_data")
      .select("data_type")
      .eq("tenant_id", LAB)
      .range(offset, offset + PAGE - 1);
    if (!page || page.length === 0) break;
    for (const r of page) typeCount[r.data_type] = (typeCount[r.data_type] || 0) + 1;
    total += page.length;
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  for (const [t, c] of Object.entries(typeCount).sort()) console.log(`  ${t}: ${c} rows`);
  console.log(`Total: ${total} (OB-126 baseline: 1588, +12 targets = 1600 expected)`);

  // Verdict
  console.log("\n═══ VERDICT ═══");
  const pass = junkAfter === 0 && targetAfter === 12 && emptyCount === 0;
  console.log(pass ? "PASS — Junk removed, targets preserved" : "FAIL");
}

main().catch(console.error);
