import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function run() {
  const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";
  const { data: results } = await sb.from("calculation_results")
    .select("rule_set_id, total_payout")
    .eq("tenant_id", TENANT);
  
  const { data: ruleSets } = await sb.from("rule_sets")
    .select("id, name").eq("tenant_id", TENANT);
  
  const names = Object.fromEntries((ruleSets || []).map(r => [r.id, r.name]));
  const byRS: Record<string, number> = {};
  for (const r of results || []) {
    const n = names[r.rule_set_id] || r.rule_set_id;
    byRS[n] = (byRS[n] || 0) + r.total_payout;
  }
  console.log("BASELINE:");
  for (const [k, v] of Object.entries(byRS)) console.log(`  ${k}: $${v.toFixed(2)}`);
  console.log("TOTAL: $" + Object.values(byRS).reduce((a, b) => a + b, 0).toFixed(2));
}
run().catch(console.error);
