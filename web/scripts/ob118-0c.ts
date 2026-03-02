import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function run() {
  const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

  const { data: rows } = await sb.from("committed_data")
    .select("entity_id, row_data, data_type")
    .eq("tenant_id", TENANT)
    .ilike("data_type", "%Insurance%");

  console.log("Total insurance rows:", rows?.length);
  console.log("data_type:", rows?.[0]?.data_type);

  if (rows && rows.length > 0) {
    const keys = Object.keys((rows[0].row_data as any) || {});
    console.log("\nFields:", keys);

    console.log("\nSample rows (first 5):");
    for (const row of rows.slice(0, 5)) {
      console.log(JSON.stringify(row.row_data));
    }
  }

  // Count unique entities
  const entities = new Set(rows?.map(r => r.entity_id));
  console.log("\nUnique entities:", entities.size);

  // Show product/qualified breakdown for first entity
  const firstEntity = rows?.[0]?.entity_id;
  const entityRows = rows?.filter(r => r.entity_id === firstEntity);
  console.log("\nEntity", firstEntity, "- rows:", entityRows?.length);
  const byProduct: Record<string, number> = {};
  for (const r of entityRows || []) {
    const rd = r.row_data as any;
    const product = rd?.ProductCode || "unknown";
    const qualified = rd?.Qualified || "unknown";
    const key = `${product}|${qualified}`;
    byProduct[key] = (byProduct[key] || 0) + 1;
  }
  console.log("Breakdown:", byProduct);

  // Show unique ProductCodes and Qualified values
  const allProducts = new Set<string>();
  const allQualified = new Set<string>();
  for (const r of rows || []) {
    const rd = r.row_data as any;
    if (rd?.ProductCode) allProducts.add(rd.ProductCode);
    if (rd?.Qualified) allQualified.add(rd.Qualified);
  }
  console.log("\nAll ProductCodes:", Array.from(allProducts));
  console.log("All Qualified values:", Array.from(allQualified));
}
run().catch(console.error);
