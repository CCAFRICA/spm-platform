import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  // Check referral data for officer 1001 — what keys and values would buildMetrics produce?
  const { data: rows } = await supabase
    .from("committed_data")
    .select("data_type, row_data")
    .eq("tenant_id", TENANT)
    .ilike("data_type", "%Insurance%");
  
  if (!rows || rows.length === 0) { console.log("No insurance data"); return; }
  
  // Group by OfficerID
  const byOfficer = new Map<number, any[]>();
  for (const r of rows) {
    const rd = r.row_data as Record<string, any>;
    const oid = rd?.OfficerID;
    if (oid !== undefined) {
      if (!byOfficer.has(oid)) byOfficer.set(oid, []);
      byOfficer.get(oid)!.push(rd);
    }
  }
  
  // Show first officer's referral summary
  const firstOfficer = Array.from(byOfficer.entries())[0];
  if (firstOfficer) {
    const [oid, refRows] = firstOfficer;
    console.log(`\nOfficer ${oid}: ${refRows.length} referral rows`);
    
    // Count by ProductCode x Qualified
    const counts = new Map<string, { total: number; qualified: number }>();
    for (const r of refRows) {
      const pc = r.ProductCode || 'unknown';
      if (!counts.has(pc)) counts.set(pc, { total: 0, qualified: 0 });
      counts.get(pc)!.total++;
      if (r.Qualified === 'Yes') counts.get(pc)!.qualified++;
    }
    
    console.log('Product counts:');
    for (const [pc, c] of Array.from(counts.entries())) {
      console.log(`  ${pc}: ${c.qualified}/${c.total} qualified`);
    }
    
    // Show what aggregateMetrics would produce (sum of numeric fields)
    const agg: Record<string, number> = {};
    for (const r of refRows) {
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === 'number') agg[k] = (agg[k] || 0) + v;
      }
    }
    console.log('\naggregateMetrics would produce:', agg);
  }
  
  // Show unique ProductCodes
  const allCodes = new Set<string>();
  for (const r of rows) {
    const rd = r.row_data as Record<string, any>;
    if (rd?.ProductCode) allCodes.add(rd.ProductCode);
  }
  console.log('\nAll ProductCodes:', Array.from(allCodes));
}

main().catch(console.error);
