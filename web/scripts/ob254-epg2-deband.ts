// OB-254 EPG-2 — executed proof of the §3.2 de-bander on the ACTUAL file (SR-35).
// Downloads COMISIONES___AUTORIZADOS from storage (bucket ingestion-raw) at runtime — no customer data
// in the repo — and runs constructStructure on all 8 sheets, printing the required structural evidence.
// Run: cd web && node --env-file=.env.local --import tsx scripts/ob254-epg2-deband.ts
import { createClient } from '@supabase/supabase-js';
import { constructStructure, type ConstructOptions } from '../src/lib/sci/structural-construction';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';

async function run() {
  const { data: jobs } = await sb.from('processing_jobs').select('file_storage_path').eq('tenant_id', TENANT).ilike('file_name', '%COMISION%').order('created_at', { ascending: false }).limit(1);
  const path = jobs?.[0]?.file_storage_path as string;
  const { data: blob } = await sb.storage.from('ingestion-raw').download(path);
  const buf = Buffer.from(await blob!.arrayBuffer());
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false });
  console.log(`OB-254 EPG-2 — de-band on ${wb.SheetNames.length} sheets of ${path.split('/').pop()}`);

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true }) as unknown[][];
    const merges = (ws['!merges'] ?? []).map((m: { s: { r: number; c: number }; e: { r: number; c: number } }) => ({ s: { r: m.s.r, c: m.s.c }, e: { r: m.e.r, c: m.e.c } }));
    const opts: ConstructOptions = { fullGrid: true, mergedRanges: merges, sheetName: name };
    const res = constructStructure(grid, opts);

    const rec = res.units.find((u) => u.kind === 'records')!;
    const doc = res.units.find((u) => u.kind === 'documentation');
    const sidecarTally: Record<string, number> = {};
    for (const r of res.sidecar) sidecarTally[r.reason] = (sidecarTally[r.reason] ?? 0) + 1;
    const carryFills = res.transformMap.rows.filter((r) => r.carriedIdentity).length;
    const renames = rec.header.filter((h) => /__\d+$/.test(h));
    const sections = Array.from(new Set(res.transformMap.rows.filter((r) => r.tidy && r.section).map((r) => r.section)));
    const hasEmpty = rec.header.some((h) => h.includes('__EMPTY'));

    console.log(`\n===== ${name} =====`);
    console.log(`  header (${rec.header.length} cols, __EMPTY=${hasEmpty}): ${rec.header.map((h) => JSON.stringify(String(h).slice(0, 24))).join(', ')}`);
    console.log(`  header band rows: [${rec.headerRowIndices.join(',')}]   header-bands detected: ${res.observations.find((o) => o.kind === 'structure:blocks')?.detail.headerBands}`);
    console.log(`  sections lifted to __section (${sections.length}): ${sections.map((s) => JSON.stringify(String(s).slice(0, 28))).join(', ') || '(none)'}`);
    console.log(`  sidecar by reason: ${JSON.stringify(sidecarTally)}`);
    console.log(`  carry-down fills: ${carryFills}   duplicate-header renames: ${JSON.stringify(renames)}`);
    console.log(`  tidy records: ${rec.rows.length}${doc ? `   documentation unit: ${doc.rows.length} narrative rows` : ''}`);
    if (rec.rows.length) console.log(`  sample record: ${JSON.stringify(rec.rows[0]).slice(0, 200)}`);
  }
}
run().catch((e) => { console.error('FATAL:', e); process.exit(1); });
