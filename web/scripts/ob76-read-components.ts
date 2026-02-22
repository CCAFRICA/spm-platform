import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
async function main() {
  const { data } = await supabase
    .from('rule_sets')
    .select('id, name, components')
    .eq('tenant_id', 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd')
    .limit(1)
    .single();
  if (!data) { console.log('No rule set'); return; }
  console.log('Rule set:', data.name);
  const cJson = data.components as Record<string, unknown>;
  const variants = (cJson?.variants as Array<Record<string, unknown>>) ?? [];
  const components = (variants[0]?.components as Array<Record<string, unknown>>) ?? [];
  console.log(`Variants: ${variants.length}, Components: ${components.length}\n`);
  for (const c of components) {
    console.log(`--- ${c.name} (${c.componentType}) ---`);
    console.log(JSON.stringify(c, null, 2).slice(0, 600));
    console.log();
  }
}
main();
