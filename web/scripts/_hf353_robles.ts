import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const R = '74d71a1d-7d2f-45ef-93d4-e3e3e80a68d2';
(async () => {
  // 1. committed_data by data_type + sheet
  const { data: cd } = await sb.from('committed_data').select('data_type, metadata, row_data').eq('tenant_id', R).limit(5000);
  const bySheet = new Map<string, { dt: string; n: number; sample: any }>();
  for (const r of cd ?? []) {
    const sheet = (r.row_data as any)?._sheetName ?? (r.metadata as any)?.sheetName ?? '?';
    const k = `${r.data_type}::${sheet}`;
    if (!bySheet.has(k)) bySheet.set(k, { dt: r.data_type as string, n: 0, sample: r.row_data });
    bySheet.get(k)!.n++;
  }
  console.log('=== Robles committed_data by (data_type::sheet) ===');
  for (const [k, v] of Array.from(bySheet.entries())) console.log(`  ${k}: ${v.n} rows | cols=[${Object.keys(v.sample).filter(c=>!c.startsWith('_')).join(', ')}]`);

  // 2. comprehension_artifacts roles (esp. for __EMPTY columns)
  const { data: ca } = await sb.from('comprehension_artifacts').select('field_name, characterization, data_nature, identifies, relationships').eq('tenant_id', R).limit(200);
  console.log(`\n=== comprehension_artifacts (${ca?.length}) — __EMPTY / relational ones ===`);
  for (const a of (ca ?? []).filter(a => /__EMPTY|empty/i.test(a.field_name) || /reference|relational|pointer/i.test(`${a.data_nature} ${a.characterization}`))) {
    console.log(`  ${a.field_name}: nature="${a.data_nature}" char="${(a.characterization||'').slice(0,40)}" identifies="${a.identifies}" rel=${JSON.stringify(a.relationships)?.slice(0,60)}`);
  }

  // 3. entity_relationships
  const { data: er } = await sb.from('entity_relationships').select('relationship_type, source, source_entity_id, target_entity_id').eq('tenant_id', R);
  const typeCounts: Record<string, number> = {}; for (const e of er ?? []) typeCounts[`${e.relationship_type}/${e.source}`] = (typeCounts[`${e.relationship_type}/${e.source}`]??0)+1;
  console.log(`\n=== entity_relationships (${er?.length}) by type/source ===`); for (const [k,n] of Object.entries(typeCounts)) console.log(`  ${k}: ${n}`);

  // 4. rule_set components + convergence state
  const { data: rs } = await sb.from('rule_sets').select('id, name, components, input_bindings').eq('tenant_id', R);
  for (const r of rs ?? []) {
    console.log(`\n=== rule_set "${r.name}" (${r.id}) ===`);
    const comps = r.components as any;
    const variants = comps?.variants ?? [];
    for (const v of variants) console.log(`  variant ${v.variantId}: components=[${(v.components??[]).map((c:any)=>c.name).join(', ')}]`);
    const ib = r.input_bindings as any;
    console.log(`  input_bindings keys: ${ib ? Object.keys(ib).join(', ') : '(null)'} | convergence_version=${ib?.convergence_version}`);
  }
})().catch(e=>console.log('threw:',e instanceof Error?e.message:String(e)));
