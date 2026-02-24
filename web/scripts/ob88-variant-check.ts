import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data } = await sb.from('rule_sets').select('components').eq('id', '180d1ecb-56c3-410d-87ba-892150010505').single();
  if (!data) throw new Error('not found');

  const variants = (data.components as Record<string, unknown>).variants as Array<Record<string, unknown>>;

  // Compare Optical Sales matrices between variants
  for (const v of variants) {
    const comps = v.components as Array<Record<string, unknown>>;
    const optical = comps.find(c => (c.name as string)?.includes('Optical'));
    if (optical) {
      const mc = optical.matrixConfig as Record<string, unknown>;
      const values = mc?.values as number[][];
      console.log(`\n${v.variantId} — ${optical.name}:`);
      console.log(`  Matrix values:`);
      for (let i = 0; i < values.length; i++) {
        console.log(`    Row ${i}: [${values[i].join(', ')}]`);
      }
    }
  }

  // Also check: which variant does each entity get assigned?
  // Check if variant assignment data exists
  const { data: results } = await sb.from('calculation_results')
    .select('metadata')
    .eq('batch_id', '98b96d6b-9b3a-4508-abda-f92c7ba5d708')
    .limit(5);

  console.log('\nSample entity variant assignments:');
  for (const r of results || []) {
    const md = r.metadata as Record<string, unknown>;
    console.log(`  ${md?.externalId}: variant=${md?.variant || md?.variantId || 'unknown'}`);
  }

  // Count variant distribution
  const variantCounts = new Map<string, number>();
  let page = 0;
  while (true) {
    const { data: batch } = await sb.from('calculation_results')
      .select('metadata')
      .eq('batch_id', '98b96d6b-9b3a-4508-abda-f92c7ba5d708')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!batch || batch.length === 0) break;
    for (const r of batch) {
      const md = r.metadata as Record<string, unknown>;
      const variant = String(md?.variant || md?.variantId || 'unknown');
      variantCounts.set(variant, (variantCounts.get(variant) || 0) + 1);
    }
    if (batch.length < 1000) break;
    page++;
  }
  console.log('\nVariant distribution:');
  for (const [v, c] of Array.from(variantCounts.entries())) {
    console.log(`  ${v}: ${c} entities`);
  }
}

main().catch(console.error);
