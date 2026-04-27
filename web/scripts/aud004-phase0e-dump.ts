import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false }});

async function main() {
  const { data } = await sb.from('rule_sets').select('id, tenant_id, name, components').eq('id', 'f7b82b93-b2f6-44c6-8a20-317eec182ce7');
  if (!data || !data[0]) { console.log('not found'); return; }
  const c = (data[0].components as { variants: Array<{ variantId: string; components: unknown[] }> }).variants;
  // Print one component per primitive type
  const seen = new Set<string>();
  for (const v of c) {
    for (const k of v.components as Array<Record<string, unknown>>) {
      const ci = k.calculationIntent as Record<string, unknown> | undefined;
      const op = String(ci?.operation ?? 'none');
      if (seen.has(op)) continue;
      seen.add(op);
      console.log(`\n========== variant=${v.variantId} | name="${k.name}" | componentType=${k.componentType} | calcIntent.operation=${op} ==========`);
      console.log(JSON.stringify(k, null, 2));
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
