/**
 * CLT-118 Pre-Test: Record current state, clean slate, verify
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  console.log("=== CLT-118 PRE-TEST: Clean Reset ===\n");

  // Step 1: Record what exists before clearing
  console.log("--- BEFORE STATE ---");
  const tables = [
    { name: "committed_data", query: sb.from("committed_data").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT) },
    { name: "calculation_results", query: sb.from("calculation_results").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT) },
    { name: "calculation_batches", query: sb.from("calculation_batches").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT) },
    { name: "import_batches", query: sb.from("import_batches").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT) },
    { name: "entity_period_outcomes", query: sb.from("entity_period_outcomes").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT) },
    { name: "entities", query: sb.from("entities").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT) },
    { name: "periods", query: sb.from("periods").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT) },
  ];

  for (const t of tables) {
    const { count } = await t.query;
    console.log(`  ${t.name}: ${count ?? 0}`);
  }

  // Rule sets (with names)
  const { data: ruleSets } = await sb
    .from("rule_sets")
    .select("id, name, status, input_bindings")
    .eq("tenant_id", TENANT);
  console.log(`  rule_sets: ${ruleSets?.length ?? 0}`);
  for (const rs of ruleSets || []) {
    const hasBindings = rs.input_bindings && Object.keys(rs.input_bindings as object).length > 0;
    console.log(`    - ${rs.name} (${rs.status}) ${hasBindings ? "[has input_bindings]" : ""}`);
  }

  // Rule set components
  const rsIds = (ruleSets || []).map(rs => rs.id);
  if (rsIds.length > 0) {
    const { count: rcCount } = await sb
      .from("rule_set_components")
      .select("*", { count: "exact", head: true })
      .in("rule_set_id", rsIds);
    console.log(`  rule_set_components: ${rcCount ?? 0}`);

    const { count: rsaCount } = await sb
      .from("rule_set_assignments")
      .select("*", { count: "exact", head: true })
      .in("rule_set_id", rsIds);
    console.log(`  rule_set_assignments: ${rsaCount ?? 0}`);
  }

  // Step 2: List files in Supabase Storage (imports bucket)
  console.log("\n--- STORAGE FILES ---");
  const { data: storageFiles, error: storageErr } = await sb.storage
    .from("imports")
    .list(TENANT, { limit: 100 });
  if (storageErr) {
    console.log(`  Storage error: ${storageErr.message}`);
  } else {
    console.log(`  Files in imports/${TENANT}: ${storageFiles?.length ?? 0}`);
    for (const f of storageFiles || []) {
      console.log(`    - ${f.name} (${f.metadata?.size ?? "?"}b)`);
    }
  }

  // Step 3: CLEAR EVERYTHING
  console.log("\n--- CLEARING ALL MBC DATA ---");

  // Calculation results & batches
  const { error: e1 } = await sb.from("calculation_results").delete().eq("tenant_id", TENANT);
  console.log(`  calculation_results: ${e1 ? "ERROR: " + e1.message : "cleared"}`);

  const { error: e2 } = await sb.from("calculation_batches").delete().eq("tenant_id", TENANT);
  console.log(`  calculation_batches: ${e2 ? "ERROR: " + e2.message : "cleared"}`);

  const { error: e3 } = await sb.from("entity_period_outcomes").delete().eq("tenant_id", TENANT);
  console.log(`  entity_period_outcomes: ${e3 ? "ERROR: " + e3.message : "cleared"}`);

  // Rule set assignments and components (must go before rule_sets)
  if (rsIds.length > 0) {
    const { error: e4 } = await sb.from("rule_set_assignments").delete().in("rule_set_id", rsIds);
    console.log(`  rule_set_assignments: ${e4 ? "ERROR: " + e4.message : "cleared"}`);

    const { error: e5 } = await sb.from("rule_set_components").delete().in("rule_set_id", rsIds);
    console.log(`  rule_set_components: ${e5 ? "ERROR: " + e5.message : "cleared"}`);
  }

  const { error: e6 } = await sb.from("rule_sets").delete().eq("tenant_id", TENANT);
  console.log(`  rule_sets: ${e6 ? "ERROR: " + e6.message : "cleared"}`);

  const { error: e7 } = await sb.from("committed_data").delete().eq("tenant_id", TENANT);
  console.log(`  committed_data: ${e7 ? "ERROR: " + e7.message : "cleared"}`);

  const { error: e8 } = await sb.from("import_batches").delete().eq("tenant_id", TENANT);
  console.log(`  import_batches: ${e8 ? "ERROR: " + e8.message : "cleared"}`);

  const { error: e9 } = await sb.from("entities").delete().eq("tenant_id", TENANT);
  console.log(`  entities: ${e9 ? "ERROR: " + e9.message : "cleared"}`);

  const { error: e10 } = await sb.from("periods").delete().eq("tenant_id", TENANT);
  console.log(`  periods: ${e10 ? "ERROR: " + e10.message : "cleared"}`);

  // Step 4: Verify clean slate
  console.log("\n--- VERIFY CLEAN SLATE ---");
  const postTables = [
    { name: "committed_data", query: sb.from("committed_data").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT) },
    { name: "calculation_results", query: sb.from("calculation_results").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT) },
    { name: "rule_sets", query: sb.from("rule_sets").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT) },
    { name: "entities", query: sb.from("entities").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT) },
    { name: "periods", query: sb.from("periods").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT) },
    { name: "import_batches", query: sb.from("import_batches").select("*", { count: "exact", head: true }).eq("tenant_id", TENANT) },
  ];

  let allZero = true;
  for (const t of postTables) {
    const { count } = await t.query;
    const c = count ?? 0;
    console.log(`  ${t.name}: ${c}`);
    if (c > 0) allZero = false;
  }
  console.log(`\n  CLEAN SLATE: ${allZero ? "YES — all tables empty" : "NO — some tables still have data"}`);
}

main().catch(console.error);
