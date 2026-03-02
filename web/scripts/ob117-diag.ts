import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RULE_SET_IDS = [
  "af511146-604f-4400-ad18-836eb13aace8", // Mortgage
  "574faa83-6f14-4975-baca-36e7e3fd4937", // Insurance
];

async function main() {
  for (const rsId of RULE_SET_IDS) {
    const { data: rs } = await supabase
      .from("rule_sets")
      .select("id, name, components")
      .eq("id", rsId)
      .single();
    
    if (!rs) { console.log(`Rule set ${rsId} not found`); continue; }
    
    const comps = (rs.components as any)?.variants?.[0]?.components ?? [];
    console.log(`\n=== ${rs.name} (${comps.length} components) ===`);
    
    for (const c of comps) {
      console.log(`\nComponent: ${c.name} (${c.componentType})`);
      console.log(`  tierConfig:`, JSON.stringify(c.tierConfig, null, 2));
      console.log(`  calculationIntent:`, JSON.stringify(c.calculationIntent, null, 2));
    }
  }
}

main().catch(console.error);
