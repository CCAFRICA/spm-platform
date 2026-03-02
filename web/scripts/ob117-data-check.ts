import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  // Check what data_types exist and sample row_data keys
  const { data: samples } = await supabase
    .from("committed_data")
    .select("data_type, row_data")
    .eq("tenant_id", TENANT)
    .limit(500);
  
  if (!samples) return;
  
  // Group by data_type, collect unique keys
  const byType = new Map<string, Set<string>>();
  const countByType = new Map<string, number>();
  
  for (const row of samples) {
    const dt = row.data_type || '_unknown';
    if (!byType.has(dt)) byType.set(dt, new Set());
    countByType.set(dt, (countByType.get(dt) || 0) + 1);
    
    const rd = row.row_data as Record<string, unknown>;
    if (rd) {
      for (const key of Object.keys(rd)) {
        byType.get(dt)!.add(key);
      }
    }
  }
  
  for (const [dt, keys] of Array.from(byType.entries())) {
    console.log(`\n=== ${dt} (${countByType.get(dt)} sample rows) ===`);
    console.log(`  Keys: ${Array.from(keys).join(', ')}`);
  }
  
  // Show a sample Insurance Referral row
  const refRow = samples.find(s => s.data_type?.includes('Insurance'));
  if (refRow) {
    console.log('\n=== SAMPLE Insurance Referral row_data ===');
    console.log(JSON.stringify(refRow.row_data, null, 2));
  }
  
  // Show a sample Mortgage row
  const mtgRow = samples.find(s => s.data_type?.includes('Mortgage'));
  if (mtgRow) {
    console.log('\n=== SAMPLE Mortgage row_data ===');
    console.log(JSON.stringify(mtgRow.row_data, null, 2));
  }
}

main().catch(console.error);
