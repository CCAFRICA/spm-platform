// DIAG-068 Q4 resolution — read-only. Does Cargas_Flota_Hub exist as a comprehended
// numeric measure column in the current Meridian import? SELECT only.
// Run from web/: set -a && source .env.local && set +a && npx tsx scripts/diag/diag068-q4-column.ts
import { createClient } from '@supabase/supabase-js';

const TENANT = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'; // resolved in diag068-meridian-reads.ts

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1) committed_data: which sheets/columns exist; does any row_data carry a fleet/cargas/capacidad key?
  const { data: cd } = await sb.from('committed_data')
    .select('row_data, sheet_name, source_file_name, entity_id, import_batch_id')
    .eq('tenant_id', TENANT)
    .limit(4000);
  console.log(`committed_data rows scanned: ${cd?.length ?? 0}`);
  const sheets = new Map<string, { rows: number; nullEnt: number; keys: Set<string> }>();
  for (const r of (cd ?? [])) {
    const s = r.sheet_name ?? '(null)';
    if (!sheets.has(s)) sheets.set(s, { rows: 0, nullEnt: 0, keys: new Set() });
    const e = sheets.get(s)!; e.rows++; if (!r.entity_id) e.nullEnt++;
    for (const k of Object.keys((r.row_data as any) ?? {})) e.keys.add(k);
  }
  console.log('\n=== sheets in committed_data (rows / entity_id-null rows / column keys) ===');
  for (const [s, v] of sheets) {
    const fleetKeys = Array.from(v.keys).filter(k => /carga|flota|capacid|hub|fleet|util/i.test(k));
    console.log(`  sheet="${s}"  rows=${v.rows}  entityNull=${v.nullEnt}  totalCols=${v.keys.size}`);
    console.log(`     fleet/cargas/capacidad/hub columns: [${fleetKeys.join(', ') || 'NONE'}]`);
  }

  // 2) For any row carrying cargas/capacidad keys, show a sample value + whether numeric
  console.log('\n=== sample values for fleet columns (numeric availability) ===');
  const seen = new Set<string>();
  for (const r of (cd ?? [])) {
    const rd = (r.row_data as any) ?? {};
    for (const k of Object.keys(rd)) {
      if (/carga|flota|capacid/i.test(k) && !seen.has(k)) {
        seen.add(k);
        const v = rd[k];
        console.log(`  col="${k}"  sample=${JSON.stringify(v)}  numeric=${typeof v === 'number' || (!isNaN(Number(v)) && v !== '' && v !== null)}  sheet="${r.sheet_name}" entityId=${r.entity_id ? 'set' : 'NULL'}`);
      }
    }
  }

  // 3) classification_signals broadened: any signal mentioning cargas/flota/capacidad
  const { data: sigs } = await sb.from('classification_signals')
    .select('signal_type, classification, decision_source, sheet_name, source_file_name, created_at, signal_value, header_comprehension, vocabulary_bindings')
    .eq('tenant_id', TENANT).order('created_at', { ascending: false }).limit(2000);
  const hits = (sigs ?? []).filter(s => /carga|flota|capacid/i.test(JSON.stringify(s)));
  console.log(`\n=== classification_signals mentioning cargas/flota/capacidad: ${hits.length} of ${sigs?.length ?? 0} ===`);
  for (const h of hits.slice(0, 10)) {
    console.log(`  [${h.created_at}] type=${h.signal_type} class=${h.classification} src=${h.decision_source} sheet=${h.sheet_name}`);
    const blob = JSON.stringify({ sv: h.signal_value, hc: h.header_comprehension, vb: h.vocabulary_bindings });
    const m = blob.match(/.{0,40}(carga|flota|capacid)[a-z_]*.{0,40}/i);
    if (m) console.log(`     …${m[0]}…`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
