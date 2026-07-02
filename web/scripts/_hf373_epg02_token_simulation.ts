/**
 * HF-373 EPG-0.2 probe 2 (READ-ONLY): reproduce HF-119 tokenizer/matcher against
 * live VLTEST2 committed_data, byte-for-byte per run/route.ts:2012-2434 logic.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';

// EXACT copy of run/route.ts:2012-2018
const variantTokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s_]/g, ' ')
    .split(/[\s_]+/)
    .filter(t => t.length > 2);

async function main() {
  // variants verbatim from the live rule_set
  const { data: rs } = await sb.from('rule_sets')
    .select('id, components').eq('tenant_id', VLTEST2).single();
  const variants = ((rs!.components as any)?.variants ?? []) as any[];

  // EXACT copy of run/route.ts:2020-2034
  const variantTokenSets = variants.map(v => {
    const text = [String(v.variantName ?? ''), String(v.description ?? ''), String(v.variantId ?? '')].join(' ');
    return new Set(variantTokenize(text));
  });
  const variantDiscriminants = variantTokenSets.map((tokens, i) => {
    const otherTokens = new Set<string>();
    variantTokenSets.forEach((t, j) => { if (j !== i) t.forEach(tok => otherTokens.add(tok)); });
    return new Set(Array.from(tokens).filter(t => !otherTokens.has(t)));
  });
  variantTokenSets.forEach((s, i) => console.log(`V${i} tokenSet = [${Array.from(s).join(',')}]  (from name="${variants[i].variantName}" desc="${variants[i].description}" id="${variants[i].variantId}")`));
  variantDiscriminants.forEach((s, i) => console.log(`V${i} DISCRIMINANTS = [${Array.from(s).join(',')}]`));

  // entities
  const { data: ents } = await sb.from('entities')
    .select('id, external_id, display_name, metadata')
    .eq('tenant_id', VLTEST2).order('external_id');
  const entById = new Map((ents ?? []).map(e => [e.id, e]));
  const extIdToUuid = new Map((ents ?? []).map(e => [String(e.external_id).trim(), e.id]));

  // committed_data (paged; both entity_id-FK and value-resolvable rows)
  const rows: any[] = [];
  for (let pageN = 0; ; pageN++) {
    const { data: page, error } = await sb.from('committed_data')
      .select('id, entity_id, data_type, row_data, metadata')
      .eq('tenant_id', VLTEST2)
      .range(pageN * 1000, pageN * 1000 + 999);
    if (error) { console.log('committed_data ERR', error.message); break; }
    if (!page || page.length === 0) break;
    rows.push(...page);
    if (page.length < 1000) break;
  }
  console.log(`\ncommitted_data rows fetched=${rows.length}`);
  const dtCounts = new Map<string, number>();
  for (const r of rows) dtCounts.set(r.data_type ?? 'NULL', (dtCounts.get(r.data_type ?? 'NULL') ?? 0) + 1);
  console.log('data_type counts:', JSON.stringify(Object.fromEntries(dtCounts)));

  // resolve entity per row like run/route.ts:880-917 (FK first, then metadata.entity_id_field, then fallback)
  let fallbackField: string | null = null;
  for (const r of rows) { const f = (r.metadata as any)?.entity_id_field; if (typeof f === 'string') { fallbackField = f; break; } }
  console.log(`fallbackEntityIdField=${JSON.stringify(fallbackField)}`);
  const flatByEntity = new Map<string, any[]>();
  for (const r of rows) {
    let eid = r.entity_id;
    if (!eid) {
      const f = ((r.metadata as any)?.entity_id_field as string) || fallbackField;
      if (f) {
        const ext = (r.row_data as any)?.[f];
        if (ext != null) eid = extIdToUuid.get(String(ext).trim()) || null;
      }
    }
    if (eid) { if (!flatByEntity.has(eid)) flatByEntity.set(eid, []); flatByEntity.get(eid)!.push(r); }
  }
  console.log(`flatByEntity: ${flatByEntity.size} entities with rows`);

  // simulate the matcher for every entity; report distribution
  const outcome = new Map<string, string[]>(); // outcomeKey -> [extIds]
  const sampleDetail: string[] = [];
  let detailCount = 0;
  for (const [eid, eRows] of flatByEntity) {
    const ent = entById.get(eid);
    const entityTokens = new Set<string>();
    const tokenSources = new Map<string, string>(); // token -> "column=value" first source
    for (const row of eRows) {
      const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data)) ? row.row_data : {};
      for (const [k, val] of Object.entries(rd)) {
        if (typeof val === 'string' && val.length > 1) {
          for (const token of variantTokenize(val)) {
            if (!entityTokens.has(token)) tokenSources.set(token, `${k}=${JSON.stringify(val)}`);
            entityTokens.add(token);
          }
        }
      }
    }
    const discScores = variantDiscriminants.map((disc, i) => ({
      index: i, matches: Array.from(disc).filter(t => entityTokens.has(t)).length,
      tokens: Array.from(disc).filter(t => entityTokens.has(t)),
    }));
    discScores.sort((a, b) => b.matches - a.matches);
    let selected = 0; let method = 'default_last';
    if (discScores[0].matches > (discScores[1]?.matches ?? 0)) { selected = discScores[0].index; method = 'discriminant_token'; }
    else {
      const overlapScores = variantTokenSets.map((tokens, i) => ({ index: i, overlap: Array.from(tokens).filter(t => entityTokens.has(t)).length }));
      overlapScores.sort((a, b) => b.overlap - a.overlap);
      if (overlapScores[0].overlap > (overlapScores[1]?.overlap ?? 0)) { selected = overlapScores[0].index; method = 'total_overlap'; }
      else { selected = variants.length - 1; method = 'default_last'; }
    }
    let excluded = false;
    if (method === 'default_last') {
      const bestDisc = discScores[0]?.matches ?? 0;
      const bestOverlap = variantTokenSets.reduce((b, tokens) => Math.max(b, Array.from(tokens).filter(t => entityTokens.has(t)).length), 0);
      if (bestDisc === 0 && bestOverlap === 0) excluded = true;
    }
    const metaRole = (ent?.metadata as any)?.role;
    const key = excluded ? `EXCLUDED (metaRole=${metaRole})` : `variant_${selected} via ${method} (metaRole=${metaRole})`;
    if (!outcome.has(key)) outcome.set(key, []);
    outcome.get(key)!.push(String(ent?.external_id ?? eid));
    if (detailCount < 4 && (excluded || method !== 'default_last' || detailCount < 2)) {
      detailCount++;
      const tk = Array.from(entityTokens).slice(0, 12);
      sampleDetail.push(`ENTITY ${ent?.external_id} "${ent?.display_name}" metaRole=${JSON.stringify(metaRole)} rows=${eRows.length} dataTypes=[${Array.from(new Set(eRows.map(r => r.data_type))).join(',')}]`);
      sampleDetail.push(`  tokens(first12)=[${tk.join(',')}]`);
      sampleDetail.push(`  tokenSources: ${tk.map(t => `${t}<-(${tokenSources.get(t)})`).join(' ; ')}`);
      sampleDetail.push(`  discScores=${JSON.stringify(discScores)} → ${key}`);
    }
  }
  console.log(`\n=== simulated matcher outcomes over ${flatByEntity.size} entities-with-rows:`);
  for (const [k, ids] of outcome) console.log(`  ${ids.length}x ${k}  e.g. [${ids.slice(0, 6).join(',')}]`);
  console.log(`\n=== per-entity detail samples:`);
  for (const l of sampleDetail) console.log(l);

  // does the token "senior" / "ejecutivo" appear in ANY committed row value? where?
  const hits: string[] = [];
  outer: for (const r of rows) {
    const rd = (r.row_data && typeof r.row_data === 'object' && !Array.isArray(r.row_data)) ? r.row_data : {};
    for (const [k, v] of Object.entries(rd)) {
      if (typeof v === 'string') {
        const toks = variantTokenize(v);
        if (toks.includes('senior') || toks.includes('ejecutivo')) {
          hits.push(`data_type=${r.data_type} col=${k} value=${JSON.stringify(v)} entity_id=${r.entity_id}`);
          if (hits.length >= 8) break outer;
        }
      }
    }
  }
  console.log(`\n=== rows containing 'senior'/'ejecutivo' tokens (first 8):`);
  hits.forEach(h => console.log('  ' + h));
  if (hits.length === 0) console.log('  NONE');
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
