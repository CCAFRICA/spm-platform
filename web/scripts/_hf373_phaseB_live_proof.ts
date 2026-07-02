/** HF-373 EPG-B1 — the REAL variant-selection functions (the ones the calc route
 * imports) executed over ALL live VLTEST2 entities for the 2025-11 period. */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { buildVariantIdentitySets, resolveMaterializedAttributes, selectVariantByRecognizedAttributes } from '../src/lib/calculation/variant-selection';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const T = '5b078b52-55c9-4612-8f86-96038c198bfe';
(async () => {
  const { data: rs } = await sb.from('rule_sets').select('components').eq('tenant_id', T).single();
  const variants = ((rs!.components as Record<string, unknown>).variants ?? []) as Array<Record<string, unknown>>;
  const sets = buildVariantIdentitySets(variants);
  console.log('variant identity sets:', sets.map((s, i) => `V${i}=[${Array.from(s).join(' | ')}]`).join('  '));
  const { data: ents } = await sb.from('entities').select('id, external_id, display_name, temporal_attributes, metadata').eq('tenant_id', T).order('external_id');
  const asOf = '2025-11-30';
  const counts = new Map<string, number>();
  const excluded: string[] = [];
  for (const e of ents ?? []) {
    const resolved = resolveMaterializedAttributes(
      e.temporal_attributes as never, e.metadata as Record<string, unknown>, asOf);
    const sel = selectVariantByRecognizedAttributes(sets, resolved);
    if (sel.kind === 'selected') {
      const label = `variant_${sel.index}(${String(variants[sel.index].variantName)})`;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    } else {
      excluded.push(`${e.external_id}:${sel.kind}`);
    }
  }
  console.log(`entities evaluated: ${(ents ?? []).length}`);
  console.log('variantDistribution:', Array.from(counts.entries()).map(([k, v]) => `${k}:${v}`).join(' | '));
  console.log(`exclusions: ${excluded.length}${excluded.length ? ' -> ' + excluded.join(', ') : ' (zero silent or otherwise)'}`);
  // sample lines showing per-entity assignment + correct labels
  for (const e of (ents ?? []).slice(0, 3)) {
    const resolved = resolveMaterializedAttributes(e.temporal_attributes as never, e.metadata as Record<string, unknown>, asOf);
    const sel = selectVariantByRecognizedAttributes(sets, resolved);
    console.log(`  ${e.external_id} ${e.display_name}: attrs=${JSON.stringify(resolved)} -> ${sel.kind === 'selected' ? `variant_${sel.index}(${String(variants[sel.index].variantName)})` : sel.kind}`);
  }
  const senior = (ents ?? []).find(e => (e.metadata as Record<string, unknown>)?.role === 'Ejecutivo');
  if (senior) {
    const resolved = resolveMaterializedAttributes(senior.temporal_attributes as never, senior.metadata as Record<string, unknown>, asOf);
    const sel = selectVariantByRecognizedAttributes(sets, resolved);
    console.log(`  ${senior.external_id} ${senior.display_name}: attrs=${JSON.stringify(resolved)} -> ${sel.kind === 'selected' ? `variant_${sel.index}(${String(variants[sel.index].variantName)})` : sel.kind}`);
  }
})().catch(e => { console.log('threw:', e instanceof Error ? e.stack : String(e)); process.exit(1); });
