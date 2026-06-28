import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { extractReferenceFields, recognizeComponentReference } from '../src/lib/intelligence/convergence-service';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const R = '74d71a1d-7d2f-45ef-93d4-e3e3e80a68d2';
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s_]/g,' ').split(/[\s_]+/).filter(w=>w.length>2 && !['del','los','las','por','con','the','and'].includes(w)));
(async () => {
  const { data: rs } = await sb.from('rule_sets').select('components').eq('tenant_id', R).limit(1);
  const variants = (rs?.[0]?.components as any)?.variants ?? [];
  // resolvable = a committed column OR reference value word-overlaps the token (simulates convergence's semantic mapping).
  const { data: cd } = await sb.from('committed_data').select('row_data').eq('tenant_id', R).limit(3000);
  const colWords = new Set<string>(); for (const r of cd ?? []) for (const k of Object.keys(r.row_data as any)) if (!k.startsWith('_')) for (const w of words(k)) colWords.add(w);
  const isColumnResolvable = (f: string) => { const fw = words(f); for (const w of fw) if (colWords.has(w)) return true; return false; };
  console.log('committed column words:', Array.from(colWords).join(', '), '\n');

  const comps: any[] = [];
  for (const v of variants) for (const c of (v.components ?? [])) comps.push({ index: c.index ?? comps.length, variantId: v.variantId, name: c.name, metadata: c.metadata });
  const candidates = comps.map(c => ({ index: c.index, variantId: c.variantId, referenceFields: extractReferenceFields(c) }));

  let crossRefs = 0, gaps = 0;
  for (const c of comps) {
    for (const token of extractReferenceFields(c).filter(f => !isColumnResolvable(f))) {
      const producer = recognizeComponentReference({ index: c.index, variantId: c.variantId }, candidates, isColumnResolvable, 'no column represents an already-accrued post-cap commission output');
      if (producer !== null) { crossRefs++; console.log(`✓ [${c.variantId}] "${c.name}": "${token}" → component_${producer} ("${comps.find(p=>p.index===producer)?.name}")`); }
      else { gaps++; console.log(`· [${c.variantId}] "${c.name}": "${token}" not column-resolvable, no grounded producer`); }
    }
  }
  console.log(`\n${crossRefs} cross-component references recognized, ${gaps} unresolved.`);
  console.log(crossRefs>0 && gaps===0 ? '✓ PG-3: cross-component tokens resolve via component_reference — convergence completes' : (crossRefs>0 ? '~ PG-3: Minimo resolved; some cascade tokens need convergence column-mapping (LLM)' : '✗'));
})().catch(e=>console.log('threw:',e instanceof Error?e.message:String(e)));
