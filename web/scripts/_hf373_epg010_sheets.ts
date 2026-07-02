/** HF-373 EPG-0.10 read-only probe: find Casa Diaz plan workbook in storage, de-band the
 *  MAQUINARIA (2) / DIST Y SUC / COMISIÓN GARANTIZADA sheets, print structure (read-only). */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CASA_DIAZ = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';

async function main() {
  // Find the storage path from recent processing_jobs (introspect first, FP-49)
  const { data: pj1 } = await sb.from('processing_jobs').select('*').limit(1);
  console.log('=== processing_jobs Object.keys(row) ===');
  console.log(JSON.stringify(Object.keys(pj1![0] ?? {})));

  const { data: jobs, error: je } = await sb
    .from('processing_jobs')
    .select('id, tenant_id, status, created_at, metadata')
    .eq('tenant_id', CASA_DIAZ)
    .gte('created_at', '2026-06-30T00:00:00Z')
    .order('created_at', { ascending: false })
    .limit(10);
  if (je) throw je;
  console.log(`\n=== Casa Diaz processing_jobs since 06-30: ${jobs!.length} ===`);
  const paths = new Set<string>();
  for (const j of jobs!) {
    const md = j.metadata as Record<string, unknown> | null;
    const sp = (md?.storagePath ?? md?.storage_path ?? md?.filePath) as string | undefined;
    console.log(`job ${j.id} status=${j.status} created=${j.created_at} storagePath=${sp} metadataKeys=${JSON.stringify(Object.keys(md ?? {}))}`);
    if (sp && sp.includes('COMISIONES')) paths.add(sp);
  }

  // Fallback: list storage under tenant folder
  if (paths.size === 0) {
    const { data: listing } = await sb.storage.from('ingestion-raw').list(CASA_DIAZ, { limit: 100 });
    console.log(`\n=== storage listing under ${CASA_DIAZ}: ${JSON.stringify(listing?.map(f => f.name))}`);
    for (const f of listing ?? []) if (f.name.includes('COMISIONES')) paths.add(`${CASA_DIAZ}/${f.name}`);
  }
  console.log(`\ncandidate paths: ${JSON.stringify([...paths])}`);
  const path = [...paths][0];
  if (!path) { console.log('NO WORKBOOK PATH FOUND'); return; }

  const { data: fileData, error: de } = await sb.storage.from('ingestion-raw').download(path);
  if (de || !fileData) { console.log(`download failed: ${de?.message}`); return; }
  const XLSX = await import('xlsx');
  const buf = Buffer.from(await fileData.arrayBuffer());
  const wb = XLSX.read(buf, { type: 'buffer' });
  console.log(`\n=== workbook SheetNames: ${JSON.stringify(wb.SheetNames)}`);

  const { debandWorksheet } = await import('../src/lib/sci/deband-sheet');
  for (const sheetName of ['MAQUINARIA (2)', 'DIST Y SUC', 'COMISIÓN GARANTIZADA', 'MAQUINARIA']) {
    const ws = wb.Sheets[sheetName];
    if (!ws) { console.log(`\n--- sheet "${sheetName}" NOT FOUND`); continue; }
    // raw first rows (title banner evidence)
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
    console.log(`\n===== SHEET "${sheetName}" — raw first 8 rows =====`);
    for (const r of raw.slice(0, 8)) console.log(JSON.stringify(r));
    const db = debandWorksheet(XLSX, ws, sheetName);
    console.log(`--- de-banded columns: ${JSON.stringify(db.columns)}`);
    console.log(`--- de-banded rows (${db.rows.length} total, first 12):`);
    for (const row of db.rows.slice(0, 12)) console.log(JSON.stringify(row));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
