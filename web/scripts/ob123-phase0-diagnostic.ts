/**
 * OB-123 Phase 0: Wiring Gap Diagnostic
 * Maps the import-to-calculation chain for all tenants.
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MBC_TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";
const PTC_TENANT = "f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd";

async function main() {
  console.log("============================================");
  console.log("OB-123 PHASE 0: WIRING GAP DIAGNOSTIC");
  console.log("============================================\n");

  // 0A: All tenants
  console.log("=== 0A: ALL TENANTS ===");
  const { data: tenants } = await sb.from("tenants").select("id, name, slug, created_at");
  for (const t of tenants || []) {
    console.log(`  ${t.name} (${t.slug}) = ${t.id} [${(t.created_at as string)?.slice(0, 10)}]`);
  }

  // Find non-MBC, non-PTC tenants (potential LAB)
  const otherTenants = (tenants || []).filter(
    (t) => t.id !== MBC_TENANT && t.id !== PTC_TENANT
  );
  console.log(`\nNon-MBC/PTC tenants: ${otherTenants.length}`);
  for (const t of otherTenants) {
    console.log(`  Candidate LAB: ${t.name} = ${t.id}`);
  }

  // For each tenant, check wiring state
  for (const t of tenants || []) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`TENANT: ${t.name} (${t.id})`);
    console.log("=".repeat(60));

    // Entities
    const { count: entityCount } = await sb
      .from("entities")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", t.id);
    console.log(`  Entities: ${entityCount ?? 0}`);

    // Rule sets
    const { data: ruleSets } = await sb
      .from("rule_sets")
      .select("id, name, status, input_bindings")
      .eq("tenant_id", t.id);
    console.log(`  Rule sets: ${ruleSets?.length ?? 0}`);
    for (const rs of ruleSets || []) {
      const bindings = rs.input_bindings as Record<string, unknown> | null;
      const derivCount = Array.isArray((bindings as Record<string, unknown>)?.metric_derivations)
        ? ((bindings as Record<string, unknown>).metric_derivations as unknown[]).length
        : 0;
      console.log(`    ${rs.name} [${rs.status}] → bindings: ${derivCount > 0 ? derivCount + " derivations" : "EMPTY"}`);
    }

    // Assignments
    const { count: assignCount } = await sb
      .from("rule_set_assignments")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", t.id);
    console.log(`  Assignments: ${assignCount ?? 0}`);

    // Committed data
    const { count: dataCount } = await sb
      .from("committed_data")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", t.id);
    console.log(`  Committed data rows: ${dataCount ?? 0}`);

    // Distinct data types
    const { data: dtSample } = await sb
      .from("committed_data")
      .select("data_type")
      .eq("tenant_id", t.id)
      .not("data_type", "is", null)
      .limit(500);
    const dataTypes = Array.from(new Set((dtSample || []).map((r) => r.data_type as string)));
    console.log(`  Data types: ${dataTypes.length} → ${dataTypes.join(", ")}`);

    // Periods
    const { data: periods } = await sb
      .from("periods")
      .select("label, start_date, end_date")
      .eq("tenant_id", t.id)
      .order("start_date", { ascending: true });
    console.log(`  Periods: ${periods?.length ?? 0}`);
    for (const p of periods || []) {
      console.log(`    ${p.label}: ${p.start_date} → ${p.end_date}`);
    }

    // Calculation results
    const { count: calcCount } = await sb
      .from("calculation_results")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", t.id);
    console.log(`  Calculation results: ${calcCount ?? 0}`);

    // Import batches
    const { data: batches } = await sb
      .from("import_batches")
      .select("id, file_name, status, row_count")
      .eq("tenant_id", t.id)
      .order("created_at", { ascending: false })
      .limit(10);
    console.log(`  Import batches: ${batches?.length ?? 0}`);
    for (const b of batches || []) {
      console.log(`    ${b.file_name} [${b.status}] ${b.row_count ?? "?"} rows`);
    }
  }

  // 0G: MBC deep dive — how its wiring works
  console.log(`\n${"=".repeat(60)}`);
  console.log("MBC WIRING DEEP DIVE");
  console.log("=".repeat(60));

  // Sample assignments
  const { data: mbcAssignments } = await sb
    .from("rule_set_assignments")
    .select("entity_id, rule_set_id")
    .eq("tenant_id", MBC_TENANT)
    .limit(5);
  console.log("  Sample assignments:");
  for (const a of mbcAssignments || []) {
    console.log(`    entity ${a.entity_id} → rule_set ${a.rule_set_id}`);
  }

  // Sample entity metadata
  const { data: mbcEntities } = await sb
    .from("entities")
    .select("id, external_id, display_name, metadata")
    .eq("tenant_id", MBC_TENANT)
    .limit(3);
  console.log("  Sample entities:");
  for (const e of mbcEntities || []) {
    const meta = e.metadata as Record<string, unknown> | null;
    console.log(`    ${e.external_id} (${e.display_name}) → metadata keys: ${meta ? Object.keys(meta).join(", ") : "none"}`);
  }

  // MBC input_bindings detail
  const { data: mbcRS } = await sb
    .from("rule_sets")
    .select("name, input_bindings")
    .eq("tenant_id", MBC_TENANT);
  console.log("  Input bindings detail:");
  for (const rs of mbcRS || []) {
    const bindings = rs.input_bindings as Record<string, unknown> | null;
    const derivs = Array.isArray(bindings?.metric_derivations) ? bindings.metric_derivations : [];
    console.log(`    ${rs.name}: ${(derivs as unknown[]).length} derivations`);
    for (const d of (derivs as Array<Record<string, unknown>>).slice(0, 2)) {
      console.log(`      ${d.metric} → ${d.operation} on ${d.source_pattern} ${d.source_field ? "(field: " + d.source_field + ")" : ""}`);
    }
  }

  // For non-MBC/PTC tenants, check committed_data sample
  for (const t of otherTenants) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`${t.name} — COMMITTED DATA SAMPLE`);
    console.log("=".repeat(60));

    const { data: samples } = await sb
      .from("committed_data")
      .select("data_type, row_data, entity_id, period_id")
      .eq("tenant_id", t.id)
      .limit(5);
    for (const s of samples || []) {
      const rd = s.row_data as Record<string, unknown> | null;
      const keys = rd ? Object.keys(rd).slice(0, 10).join(", ") : "no row_data";
      console.log(`  data_type=${s.data_type}, entity_id=${s.entity_id ? "linked" : "NULL"}, period_id=${s.period_id ? "linked" : "NULL"}`);
      console.log(`    row_data keys: ${keys}`);
    }
  }

  console.log("\n\n=== DIAGNOSTIC COMPLETE ===");
}

main().catch(console.error);
