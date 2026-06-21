/**
 * OB-228 Phase 1 — binding-resolution probe (READ-ONLY). Extracts the IMPLICIT bindings from each
 * MIR plan's prime-DAG calculationIntent (field references) and checks them against the per-sheet
 * committed_data.row_data column inventory + confirms source_date period scoping.
 * Run from web/:  set -a && source .env.local && set +a && npx tsx scripts/ob228-phase1-bindings.ts
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const TID = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';

type FieldRef = { field: string; via: string };
function collectFields(node: any, out: FieldRef[] = [], via = 'root'): FieldRef[] {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const n of node) collectFields(n, out, via); return out; }
  const p = node.prime;
  if (p === 'reference' && node.field) out.push({ field: node.field, via: 'reference' });
  if (p === 'aggregate' && node.field) out.push({ field: node.field, via: `aggregate:${node.op}` });
  if (p === 'scope' && node.boundary) out.push({ field: node.boundary, via: 'scope:boundary' });
  if (p === 'filter' && node.predicate?.field) out.push({ field: node.predicate.field, via: 'filter:predicate' });
  for (const [k, v] of Object.entries(node)) {
    if (k === 'prime' || k === 'op' || k === 'field' || k === 'boundary' || k === 'value' || k === 'predicate') continue;
    if (typeof v === 'object') collectFields(v, out, p ?? via);
  }
  if (p === 'filter' && node.predicate?.field) { /* predicate field already captured */ }
  return out;
}

async function main() {
  // 1. distinct sheets + per-sheet column inventory (sample by sheet)
  console.log('=== SHEET / COLUMN INVENTORY (sampled) ===');
  // pull a broad sample to discover sheets
  const { data: sample } = await sb.from('committed_data').select('data_type,row_data,source_date').eq('tenant_id', TID).limit(2000);
  const perSheetCols: Record<string, Set<string>> = {};
  const perSheetCount: Record<string, number> = {};
  const dataTypeCount: Record<string, number> = {};
  let withSourceDate = 0;
  const sourceDates = new Set<string>();
  for (const r of sample ?? []) {
    const sheet = (r.row_data?._sheetName as string) ?? `(no _sheetName · data_type=${r.data_type})`;
    perSheetCols[sheet] ??= new Set();
    perSheetCount[sheet] = (perSheetCount[sheet] ?? 0) + 1;
    dataTypeCount[r.data_type] = (dataTypeCount[r.data_type] ?? 0) + 1;
    for (const k of Object.keys(r.row_data ?? {})) perSheetCols[sheet].add(k);
    if (r.source_date) { withSourceDate++; sourceDates.add(r.source_date); }
  }
  console.log(`  sample size=${sample?.length}; data_type tally=${JSON.stringify(dataTypeCount)}`);
  console.log(`  rows with source_date=${withSourceDate}/${sample?.length}; distinct source_dates(sample)=${[...sourceDates].sort().slice(0, 12).join(', ')}${sourceDates.size > 12 ? ' …' : ''}`);
  const allCols = new Set<string>();
  for (const [sheet, cols] of Object.entries(perSheetCols)) {
    console.log(`  SHEET "${sheet}" (~${perSheetCount[sheet]} sampled): [${[...cols].sort().join(', ')}]`);
    for (const c of cols) allCols.add(c);
  }

  // 2. source_date scoping — count by month range (period scoping check)
  console.log('\n=== SOURCE_DATE PERIOD SCOPING ===');
  for (const [label, lo, hi] of [['Jan2025', '2025-01-01', '2025-01-31'], ['Feb2025', '2025-02-01', '2025-02-28'], ['Mar2025', '2025-03-01', '2025-03-31'], ['Jun2025', '2025-06-01', '2025-06-30']] as const) {
    const { count } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', TID).gte('source_date', lo).lte('source_date', hi);
    console.log(`  ${label} (source_date ${lo}..${hi}): ${count} rows`);
  }
  const { count: nullSd } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', TID).is('source_date', null);
  console.log(`  source_date IS NULL: ${nullSd} rows`);

  // 3. prime-DAG field extraction + resolution per plan
  console.log('\n=== PRIME-DAG IMPLICIT BINDINGS (field refs -> which sheet has the column?) ===');
  const { data: ruleSets } = await sb.from('rule_sets').select('id,name,components').eq('tenant_id', TID).order('created_at');
  for (const rs of ruleSets ?? []) {
    const variants = rs.components?.variants ?? [];
    console.log(`\n  PLAN "${rs.name}"`);
    for (const v of variants) {
      for (const c of v.components ?? []) {
        const refs = collectFields(c.calculationIntent);
        const uniq = [...new Map(refs.map((r) => [`${r.field}|${r.via}`, r])).values()];
        console.log(`    component "${c.name}" (${c.componentType}) field-refs:`);
        for (const r of uniq) {
          const sheetsWith = Object.entries(perSheetCols).filter(([, cols]) => cols.has(r.field)).map(([s]) => s);
          const resolved = sheetsWith.length > 0;
          console.log(`      ${r.field}  [${r.via}]  ->  ${resolved ? 'FOUND in: ' + sheetsWith.join(' | ') : 'NOT FOUND in any sampled sheet  <<< HALT-2 (interpreter token / cross-sheet / cross-period)'}`);
        }
      }
    }
  }
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
