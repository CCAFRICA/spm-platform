/**
 * OB-123 Phase 0 Detail: LAB entity metadata + data type analysis
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";
const MBC = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  // LAB entity metadata
  console.log("=== LAB ENTITY METADATA ===");
  const { data: labEntities } = await sb
    .from("entities")
    .select("id, external_id, display_name, entity_type, status, metadata")
    .eq("tenant_id", LAB)
    .limit(5);
  for (const e of labEntities || []) {
    console.log(`  ${e.external_id} (${e.display_name}) [${e.entity_type}/${e.status}]`);
    const meta = e.metadata as Record<string, unknown> | null;
    if (meta) console.log(`    metadata: ${JSON.stringify(meta)}`);
  }

  // MBC entity metadata for comparison
  console.log("\n=== MBC ENTITY METADATA (comparison) ===");
  const { data: mbcEntities } = await sb
    .from("entities")
    .select("id, external_id, display_name, metadata")
    .eq("tenant_id", MBC)
    .limit(3);
  for (const e of mbcEntities || []) {
    const meta = e.metadata as Record<string, unknown> | null;
    console.log(`  ${e.external_id} (${e.display_name}) → ${JSON.stringify(meta)}`);
  }

  // LAB committed_data — distinct data_types with counts
  console.log("\n=== LAB DATA TYPES (detail) ===");
  const { data: labData } = await sb
    .from("committed_data")
    .select("data_type")
    .eq("tenant_id", LAB);
  const typeCounts = new Map<string, number>();
  for (const r of labData || []) {
    const dt = (r.data_type as string) || "NULL";
    typeCounts.set(dt, (typeCounts.get(dt) || 0) + 1);
  }
  for (const [dt, count] of Array.from(typeCounts.entries())) {
    console.log(`  ${dt}: ${count} rows`);
  }

  // LAB sample row_data keys per data_type
  console.log("\n=== LAB ROW_DATA KEYS PER TYPE ===");
  for (const dt of Array.from(typeCounts.keys())) {
    const { data: samples } = await sb
      .from("committed_data")
      .select("row_data")
      .eq("tenant_id", LAB)
      .eq("data_type", dt)
      .limit(2);
    if (samples && samples.length > 0) {
      const rd = samples[0].row_data as Record<string, unknown>;
      console.log(`  ${dt}: ${Object.keys(rd || {}).join(", ")}`);
      // Show one sample value
      if (rd) {
        const sample: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rd).slice(0, 8)) {
          sample[k] = v;
        }
        console.log(`    sample: ${JSON.stringify(sample)}`);
      }
    }
  }

  // LAB rule_sets — full component structure
  console.log("\n=== LAB RULE SETS (components preview) ===");
  const { data: labRS } = await sb
    .from("rule_sets")
    .select("id, name, status, components, input_bindings")
    .eq("tenant_id", LAB);
  for (const rs of labRS || []) {
    const comps = rs.components as Record<string, unknown> | null;
    const variants = (comps?.variants as Array<Record<string, unknown>>) || [];
    const compList = (variants[0]?.components as Array<Record<string, unknown>>) || [];
    console.log(`  ${rs.name} [${rs.status}] — ${compList.length} components`);
    for (const c of compList.slice(0, 3)) {
      console.log(`    - ${c.name || c.id} (${(c as Record<string, unknown>).calculationMethod ? "legacy" : "intent"})`);
    }
  }

  // MBC data types for comparison
  console.log("\n=== MBC DATA TYPES (comparison) ===");
  const { data: mbcData } = await sb
    .from("committed_data")
    .select("data_type")
    .eq("tenant_id", MBC);
  const mbcTypes = new Map<string, number>();
  for (const r of mbcData || []) {
    const dt = (r.data_type as string) || "NULL";
    mbcTypes.set(dt, (mbcTypes.get(dt) || 0) + 1);
  }
  for (const [dt, count] of Array.from(mbcTypes.entries())) {
    console.log(`  ${dt}: ${count} rows`);
  }
}

main().catch(console.error);
