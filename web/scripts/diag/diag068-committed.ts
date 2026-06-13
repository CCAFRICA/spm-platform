// DIAG-068 — read-only committed_data inspection (corrected). SELECT only.
import { createClient } from '@supabase/supabase-js';
const TENANT = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

  let from = 0; const PAGE = 1000; const all: any[] = [];
  for (;;) {
    const { data, error } = await sb.from('committed_data')
      .select('row_data, data_type, metadata, entity_id, import_batch_id')
      .eq('tenant_id', TENANT).range(from, from + PAGE - 1);
    if (error) { console.error('ERR:', error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data); if (data.length < PAGE) break; from += PAGE;
  }
  console.log(`committed_data rows pulled: ${all.length}`);

  const bySheet = new Map<string, { rows: number; entNull: number; entSet: number; cols: Set<string> }>();
  for (const r of all) {
    const s = (r.data_type ?? '(null)') + ' / ' + (((r.metadata as any)?.sheet_name) ?? ((r.metadata as any)?.sheetName) ?? '?');
    if (!bySheet.has(s)) bySheet.set(s, { rows: 0, entNull: 0, entSet: 0, cols: new Set() });
    const e = bySheet.get(s)!; e.rows++; r.entity_id ? e.entSet++ : e.entNull++;
    for (const k of Object.keys((r.row_data as any) ?? {})) e.cols.add(k);
  }
  for (const [s, v] of bySheet) {
    const fleet = Array.from(v.cols).filter(k => /carga|flota|capacid|hub/i.test(k));
    console.log(`\nsheet="${s}"  rows=${v.rows}  entityId(set/null)=${v.entSet}/${v.entNull}`);
    console.log(`  fleet/cargas/capacidad cols: [${fleet.join(', ') || 'NONE'}]`);
    console.log(`  all cols: [${Array.from(v.cols).join(', ')}]`);
  }

  // For each fleet column, null-rate over PAYEE rows (entity_id NOT NULL) — the population convergence scores
  console.log('\n=== fleet-column availability over PAYEE population (entity_id NOT NULL) ===');
  const fleetCols = new Set<string>();
  for (const r of all) for (const k of Object.keys((r.row_data as any) ?? {})) if (/carga|flota|capacid/i.test(k)) fleetCols.add(k);
  for (const col of fleetCols) {
    let payee = 0, payeeNonNull = 0, hub = 0, hubNonNull = 0;
    for (const r of all) {
      const rd = (r.row_data as any) ?? {};
      if (!(col in rd)) continue;
      const v = rd[col]; const has = v !== null && v !== undefined && v !== '';
      if (r.entity_id) { payee++; if (has) payeeNonNull++; } else { hub++; if (has) hubNonNull++; }
    }
    console.log(`  col="${col}": payeeRows=${payee} (nonNull=${payeeNonNull})  hubRows=${hub} (nonNull=${hubNonNull})`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
