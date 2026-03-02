import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  const { data: periods } = await supabase
    .from("periods")
    .select("id, canonical_key, start_date, end_date")
    .eq("tenant_id", TENANT)
    .order("start_date");
  
  console.log("Periods for MBC tenant:");
  for (const p of periods ?? []) {
    console.log(`  ${p.canonical_key}: ${p.id} (${p.start_date} - ${p.end_date})`);
  }
  
  // Also check what periods have committed_data
  const { data: dataTypes } = await supabase
    .from("committed_data")
    .select("period_id")
    .eq("tenant_id", TENANT)
    .limit(1000);
  
  const periodCounts = new Map<string, number>();
  for (const r of dataTypes ?? []) {
    periodCounts.set(r.period_id, (periodCounts.get(r.period_id) || 0) + 1);
  }
  console.log("\nPeriods with committed_data:");
  for (const [pid, cnt] of Array.from(periodCounts.entries())) {
    const p = periods?.find(x => x.id === pid);
    console.log(`  ${p?.canonical_key ?? 'unknown'} (${pid}): ${cnt} rows`);
  }
}

main().catch(console.error);
