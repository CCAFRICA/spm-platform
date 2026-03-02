import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";

async function main() {
  // Get one insurance result with full component details
  const { data } = await supabase
    .from("calculation_results")
    .select("entity_id, total_payout, components, metadata, metrics")
    .eq("tenant_id", TENANT)
    .eq("rule_set_id", "574faa83-6f14-4975-baca-36e7e3fd4937")
    .eq("period_id", "251c00c3-0a1d-41c1-8add-d7eafa83a5e9")
    .limit(1);
  
  if (!data || data.length === 0) { console.log("No results"); return; }
  
  const r = data[0];
  const name = (r.metadata as any)?.entityName ?? r.entity_id;
  console.log(`Entity: ${name}`);
  console.log(`Total payout: $${r.total_payout}`);
  console.log(`\nMetrics available:`, JSON.stringify(r.metrics, null, 2));
  
  const comps = r.components as any[];
  for (const c of comps) {
    console.log(`\n--- ${c.componentName} (${c.componentType}) ---`);
    console.log(`  Payout: $${c.payout}`);
    console.log(`  Details:`, JSON.stringify(c.details, null, 2));
  }
}

main().catch(console.error);
