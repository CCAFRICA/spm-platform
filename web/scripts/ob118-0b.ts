import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function run() {
  const TENANT = "fa6a48c5-56dc-416d-9b7d-9c93d4882251";
  const RS_ID = "574faa83-6f14-4975-baca-36e7e3fd4937"; // Insurance Referral
  const { data: rs } = await sb.from("rule_sets").select("id, name, components, input_bindings").eq("id", RS_ID).single();
  if (!rs) { console.log("Not found"); return; }
  
  console.log("=== Rule Set:", rs.name, "===");
  console.log("\ninput_bindings:", JSON.stringify(rs.input_bindings, null, 2));
  
  const comps = (rs.components as any)?.variants?.[0]?.components ?? [];
  for (const c of comps) {
    console.log("\n=== Component:", c.name, "===");
    console.log("componentType:", c.componentType);
    console.log("tierConfig:", JSON.stringify(c.tierConfig, null, 2));
    console.log("calculationIntent:", JSON.stringify(c.calculationIntent, null, 2));
  }
}
run().catch(console.error);
