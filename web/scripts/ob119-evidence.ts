import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  // 1B: Entity linkage
  const { count: totalRows } = await sb.from("committed_data")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT);

  const { count: linkedRows } = await sb.from("committed_data")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT)
    .not("entity_id", "is", null);

  const { count: unlinkedRows } = await sb.from("committed_data")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT)
    .is("entity_id", null);

  const { count: periodLinked } = await sb.from("committed_data")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT)
    .not("period_id", "is", null);

  console.log("=== 1B: ENTITY & PERIOD LINKAGE ===");
  console.log(`Total rows: ${totalRows}`);
  console.log(`Entity-linked rows: ${linkedRows}`);
  console.log(`Unlinked rows: ${unlinkedRows}`);
  console.log(`Entity linkage: ${totalRows ? ((linkedRows || 0) / totalRows * 100).toFixed(1) : 0}%`);
  console.log(`Period-linked rows: ${periodLinked}`);
  console.log(`Period linkage: ${totalRows ? ((periodLinked || 0) / totalRows * 100).toFixed(1) : 0}%`);

  // 1C: Input bindings
  const { data: ruleSets } = await sb.from("rule_sets")
    .select("id, name, input_bindings, status")
    .eq("tenant_id", TENANT)
    .eq("status", "active");

  console.log("\n=== 1C: INPUT BINDINGS ===");
  console.log(`Active rule sets: ${ruleSets?.length}`);
  let nonEmpty = 0;
  for (const rs of ruleSets || []) {
    const bindings = rs.input_bindings as any;
    const derivations = bindings?.metric_derivations || [];
    const hasBindings = derivations.length > 0;
    if (hasBindings) nonEmpty++;
    console.log(`  ${rs.name}: ${derivations.length} derivations ${hasBindings ? "✓" : "✗"}`);
    if (derivations.length > 0) {
      for (const d of derivations) {
        console.log(`    → metric=${d.metric}, op=${d.operation}, source=${d.source_pattern}, field=${d.source_field}`);
      }
    }
  }
  console.log(`Non-empty input_bindings: ${nonEmpty}/${ruleSets?.length}`);

  // 1D: Semantic data_types
  const { data: dataTypes } = await sb.from("committed_data")
    .select("data_type")
    .eq("tenant_id", TENANT);

  const uniqueTypes = new Set((dataTypes || []).map(d => d.data_type));
  console.log("\n=== 1D: SEMANTIC DATA_TYPES ===");
  console.log(`Unique data_types: ${uniqueTypes.size}`);
  for (const dt of uniqueTypes) {
    const count = (dataTypes || []).filter(d => d.data_type === dt).length;
    console.log(`  ${dt}: ${count} rows`);
  }

  // Entity count
  const { count: entityCount } = await sb.from("entities")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT);
  console.log(`\nEntities: ${entityCount}`);

  // Period count
  const { data: periods } = await sb.from("periods")
    .select("canonical_key")
    .eq("tenant_id", TENANT)
    .order("canonical_key");
  console.log(`Periods: ${periods?.length} → ${periods?.map(p => p.canonical_key).join(", ")}`);

  // Calculation results
  const { data: calcResults } = await sb.from("calculation_results")
    .select("result_data")
    .eq("tenant_id", TENANT);

  console.log("\n=== CALCULATION RESULTS ===");
  console.log(`Total calculation_results rows: ${calcResults?.length}`);
  let grandTotal = 0;
  let periodTotals: Record<string, number> = {};
  for (const cr of calcResults || []) {
    const rd = cr.result_data as any;
    const payout = rd?.total_payout || rd?.payout || 0;
    grandTotal += payout;
  }
  console.log(`Grand total payout: $${grandTotal.toLocaleString()}`);

  // Product license assignments
  const { count: licenseCount } = await sb.from("product_licenses")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", TENANT);
  console.log(`Product license assignments: ${licenseCount}`);
}

main().catch(console.error);
