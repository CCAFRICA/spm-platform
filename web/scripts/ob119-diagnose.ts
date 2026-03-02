/**
 * OB-119 Phase 5 diagnostic: Why is entity linkage at 1.6%?
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  // 1. What do entities look like?
  const { data: entities } = await sb.from("entities").select("id, external_id, display_name").eq("tenant_id", TENANT).limit(5);
  console.log("=== Entities (sample) ===");
  for (const e of entities || []) console.log(`  ${e.external_id} → ${e.display_name} (${e.id})`);

  // 2. What do transaction rows look like?
  const { data: txRows } = await sb.from("committed_data")
    .select("data_type, row_data, entity_id")
    .eq("tenant_id", TENANT)
    .eq("data_type", "loan_disbursements")
    .limit(2);
  console.log("\n=== Transaction rows (loan_disbursements sample) ===");
  for (const r of txRows || []) {
    const rd = r.row_data as Record<string, unknown>;
    const keys = Object.keys(rd);
    console.log(`  entity_id: ${r.entity_id}`);
    console.log(`  Keys: ${keys.join(", ")}`);
    console.log(`  OfficerID: ${rd["OfficerID"]} | entity_id field: ${rd["entity_id"]}`);
    console.log(`  Full: ${JSON.stringify(rd).substring(0, 200)}`);
  }

  // 3. What about deposit balances?
  const { data: depRows } = await sb.from("committed_data")
    .select("data_type, row_data, entity_id")
    .eq("tenant_id", TENANT)
    .eq("data_type", "deposit_balances")
    .limit(2);
  console.log("\n=== Transaction rows (deposit_balances sample) ===");
  for (const r of depRows || []) {
    const rd = r.row_data as Record<string, unknown>;
    const keys = Object.keys(rd);
    console.log(`  entity_id: ${r.entity_id}`);
    console.log(`  Keys: ${keys.join(", ")}`);
    console.log(`  Full: ${JSON.stringify(rd).substring(0, 200)}`);
  }

  // 4. All data_type counts
  const { data: allRows } = await sb.from("committed_data").select("data_type").eq("tenant_id", TENANT);
  const counts: Record<string, number> = {};
  for (const r of allRows || []) {
    counts[r.data_type || "NULL"] = (counts[r.data_type || "NULL"] || 0) + 1;
  }
  console.log("\n=== Data type distribution ===");
  for (const [dt, c] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${dt}: ${c}`);
  }

  // 5. Entity linkage by data_type
  console.log("\n=== Entity linkage by data_type ===");
  for (const dt of Object.keys(counts)) {
    const { count: total } = await sb.from("committed_data").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT).eq("data_type", dt);
    const { count: linked } = await sb.from("committed_data").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT).eq("data_type", dt).not("entity_id", "is", null);
    console.log(`  ${dt}: ${linked}/${total} linked`);
  }

  // 6. Check input_bindings
  const { data: rsList } = await sb.from("rule_sets").select("name, input_bindings").eq("tenant_id", TENANT).eq("status", "active");
  console.log("\n=== input_bindings ===");
  for (const rs of rsList || []) {
    console.log(`  ${rs.name}: ${JSON.stringify(rs.input_bindings)}`);
  }

  // 7. Check server logs for AI mapping results
  console.log("\n=== Check server logs for OB-119 AI mapping results ===");
  console.log("Look for '[ImportCommit] OB-119 AI' lines in the dev server terminal");
}

main().catch(console.error);
