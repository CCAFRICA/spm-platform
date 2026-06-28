// OB-250 PG-11 / HALT-DATA-LOSS + HALT-CALC byte-identity proof.
// Commits the SAME synthetic sheet two ways into a disposable tenant — once single-batch
// (commitContentUnit, the proven path) and once windowed (commitUnitWindowed, the OOM path) —
// then proves the committed_data rows are BYTE-IDENTICAL (same row_data incl file-global _rowIndex,
// same per-row source_date, same data_type) and committed count == parsed count. If this holds, the
// windowed parse/commit cannot move any calc figure (the engine reads committed_data identically).
//   from web/:  npx tsx scripts/_ob250_pg11_windowed_byteidentity.ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { commitContentUnit } from '../src/lib/sci/commit-content-unit';
import { commitUnitWindowed } from '../src/lib/sci/windowed-commit';
import { openSheetWindow } from '../src/lib/sci/sheet-window';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const N = 25_000;
const WINDOW = 10_000; // → 3 windows
// real UUIDs (commitContentUnit's telemetry accumulator keys importSessionId as a uuid).
const P_SINGLE = crypto.randomUUID();
const P_WINDOW = crypto.randomUUID();

function buildSheet() {
  const aoa: unknown[][] = [['rep_id', 'amount', 'fecha', 'region']];
  for (let i = 0; i < N; i++) aoa.push([`R${i % 500}`, (i * 7) % 9999, `2024-${String((i % 12) + 1).padStart(2, '0')}-15`, `Z${i % 8}`]);
  return XLSX.utils.aoa_to_sheet(aoa);
}

async function cleanup(tenantId: string) {
  for (const pid of [P_SINGLE, P_WINDOW]) {
    const b = await sb.from('import_batches').select('id').eq('tenant_id', tenantId).eq('metadata->>proposalId', pid);
    const ids = (b.data ?? []).map((r) => r.id as string);
    if (ids.length) {
      await sb.from('committed_data').delete().in('import_batch_id', ids);
      await sb.from('import_batches').delete().in('id', ids);
    }
  }
}

async function readCommitted(tenantId: string, pid: string) {
  const b = await sb.from('import_batches').select('id').eq('tenant_id', tenantId).eq('metadata->>proposalId', pid);
  const ids = (b.data ?? []).map((r) => r.id as string);
  if (!ids.length) return { batches: 0, rows: [] as Array<Record<string, unknown>> };
  const rows: Array<Record<string, unknown>> = [];
  for (const id of ids) {
    // PostgREST caps a select at 1000 rows — paginate with .range() to read ALL committed rows.
    for (let from = 0; ; from += 1000) {
      const r = await sb.from('committed_data').select('source_date, data_type, row_data').eq('import_batch_id', id).range(from, from + 999);
      const batch = r.data ?? [];
      rows.push(...batch);
      if (batch.length < 1000) break;
    }
  }
  rows.sort((a, b2) => Number((a.row_data as Record<string, unknown>)._rowIndex) - Number((b2.row_data as Record<string, unknown>)._rowIndex));
  return { batches: ids.length, rows };
}

async function main() {
  // disposable tenant
  const t = await sb.from('tenants').select('id,name').or('name.ilike.%Trial%,name.ilike.%VLTEST%,name.ilike.%Test%');
  const tenant = (t.data ?? [])[0];
  if (!tenant) { console.log('no disposable tenant found'); process.exit(1); }
  const tenantId = tenant.id as string;
  console.log(`=== OB-250 PG-11 byte-identity (disposable tenant: ${tenant.name} ${tenantId.slice(0, 8)}) ===`);

  await cleanup(tenantId);

  const ws = buildSheet();
  const fullRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  console.log(`synthetic sheet: ${fullRows.length} rows × ${Object.keys(fullRows[0]).length} cols`);

  const unit = { contentUnitId: `${P_SINGLE}::Sheet1`, confirmedBindings: [], classificationTrace: undefined };

  // single-batch (proven path)
  const single = await commitContentUnit(sb, {
    unit: { ...unit, contentUnitId: `${P_SINGLE}::Sheet1` }, rows: fullRows, classification: 'reference',
    tenantId, proposalId: P_SINGLE, tabName: 'Sheet1', fileName: 'pg11', source: 'sci-bulk', fileHashSha256: 'pg11hash',
  });
  console.log(`single-batch: success=${single.success} inserted=${single.totalInserted}`);

  // windowed path
  const reader = openSheetWindow(XLSX, ws, 'Sheet1');
  const windowed = await commitUnitWindowed(sb, {
    unit: { ...unit, contentUnitId: `${P_WINDOW}::Sheet1` }, reader, classification: 'reference',
    tenantId, proposalId: P_WINDOW, tabName: 'Sheet1', fileName: 'pg11', fileHashSha256: 'pg11hash', windowRows: WINDOW,
  });
  console.log(`windowed: success=${windowed.success} inserted=${windowed.totalInserted} windows=${windowed.batchIds.length}`);

  // compare
  const a = await readCommitted(tenantId, P_SINGLE);
  const b = await readCommitted(tenantId, P_WINDOW);
  let pass = true;
  if (a.rows.length !== N) { console.log(`[FAIL] single committed ${a.rows.length} ≠ ${N}`); pass = false; }
  if (b.rows.length !== N) { console.log(`[FAIL] windowed committed ${b.rows.length} ≠ ${N} (HALT-DATA-LOSS)`); pass = false; }
  console.log(`batches: single=${a.batches} windowed=${b.batches} (windowed is multi-batch by design)`);

  let mism = 0;
  for (let i = 0; i < Math.min(a.rows.length, b.rows.length); i++) {
    const ra = a.rows[i], rb = b.rows[i];
    const rda = JSON.stringify(ra.row_data), rdb = JSON.stringify(rb.row_data);
    if (rda !== rdb || ra.source_date !== rb.source_date || ra.data_type !== rb.data_type) {
      if (mism < 3) console.log(`[MISMATCH @${i}] single=${rda.slice(0, 120)} | windowed=${rdb.slice(0, 120)} | sd ${ra.source_date}/${rb.source_date}`);
      mism++;
    }
  }
  if (mism > 0) { console.log(`[FAIL] ${mism} row_data/source_date/data_type mismatches`); pass = false; }
  else console.log(`[OK] all ${a.rows.length} committed rows BYTE-IDENTICAL (row_data incl _rowIndex, source_date, data_type)`);

  await cleanup(tenantId);
  console.log(`\n=== ${pass ? 'PASS' : 'FAIL'} === (cleaned up)`);
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
