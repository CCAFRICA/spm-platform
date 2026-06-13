// HF-285-C proof gate — cold analyze timing + classification equivalence (SCRATCH tenant).
// Downloads the real MX file from storage, cold-imports it on a fresh scratch tenant
// against a dev server running the HF-285 code (port from BASE_URL), times analyze, and
// compares the 16 classifications to the prior cold run (session 4ae71225).
//
// Run (dev server with the HF-285 code must be up on PORT):
//   cd web && set -a && source .env.local && set +a && BASE_URL=http://localhost:3002 npx tsx scripts/diag/hf285-cold-measure.ts

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3002';
const MX_TENANT = '3d354bfa-b298-48dd-88a0-9f8c5a00be4e';
const COLD_BASELINE_SESSION = '4ae71225-3a90-4462-8780-d83f176a7bbd';
const SAMPLE = 50;
const EMAIL = `hf285-cold-${Date.now()}@vialuce.test`;
const PASSWORD = `Hf285-${crypto.randomUUID()}-9X`;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function cookie(): Promise<string> {
  await sb.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  const anon = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw new Error(`auth: ${error.message}`);
  const ref = SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1] || '';
  return `sb-${ref}-auth-token=${encodeURIComponent(JSON.stringify({ access_token: data.session!.access_token, refresh_token: data.session!.refresh_token, expires_at: Math.floor(Date.now()/1000)+3600 }))}`;
}

async function downloadMx(): Promise<Buffer> {
  const { data: objs } = await sb.storage.from('ingestion-raw').list(MX_TENANT, { limit: 200 });
  const mx = (objs ?? []).filter(o => /datos-cadena-restaurantes-mx\.xlsx$/i.test(o.name)).sort((a,b)=> (a.name<b.name?1:-1))[0];
  if (!mx) throw new Error('MX file not in storage');
  const { data, error } = await sb.storage.from('ingestion-raw').download(`${MX_TENANT}/${mx.name}`);
  if (error || !data) throw new Error(`download: ${error?.message}`);
  console.log(`MX file: ${mx.name}`);
  return Buffer.from(await data.arrayBuffer());
}

async function coldBaselineClassifications(): Promise<Map<string,string>> {
  const { data } = await sb.storage.from('ingestion-raw').download(`${MX_TENANT}/proposals/${COLD_BASELINE_SESSION}.json`);
  const map = new Map<string,string>();
  if (data) for (const u of (JSON.parse(await data.text()).contentUnits as Array<Record<string,unknown>>)) map.set(u.tabName as string, u.classification as string);
  return map;
}

async function main() {
  const ck = await cookie();
  const baseline = await coldBaselineClassifications();
  console.log(`cold baseline (4ae71225): ${baseline.size} sheet classifications`);

  const buf = await downloadMx();
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheets = wb.SheetNames.map(name => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name]) as Record<string, unknown>[];
    return { sheetName: name, columns: rows.length ? Object.keys(rows[0]) : [], rows, totalRowCount: rows.length };
  });
  console.log(`parsed ${sheets.length} sheets, total rows ${sheets.reduce((s,x)=>s+x.totalRowCount,0)}`);

  const tenantId = crypto.randomUUID();
  await sb.from('tenants').insert({ id: tenantId, name: 'HF-285 Cold Measure', slug: `hf285-cold-${tenantId.slice(0,8)}`, settings: {}, hierarchy_labels: {}, entity_type_labels: {}, features: {} });
  const importSessionId = crypto.randomUUID();
  console.log(`scratch tenant ${tenantId}  session ${importSessionId}\n--- COLD ANALYZE (concurrency default 4) ---`);

  const payload = { tenantId, importSessionId, files: [{ fileName: 'datos-cadena-restaurantes-mx.xlsx', sheets: sheets.map(s => ({ sheetName: s.sheetName, columns: s.columns, rows: s.rows.slice(0, SAMPLE), totalRowCount: s.totalRowCount })) }] };

  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/api/import/sci/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: ck }, body: JSON.stringify(payload) });
  const ms = Date.now() - t0;
  if (!res.ok) { console.error(`analyze ${res.status}: ${(await res.text()).slice(0,300)}`); process.exit(1); }
  const proposal = await res.json() as { contentUnits: Array<{ tabName: string; classification: string; confidence: number }> };
  const analyzeS = (ms/1000).toFixed(1);
  console.log(`\nanalyze wall time: ${analyzeS}s  (baseline ~223s; HALT-4 threshold <134s = 40% improvement; target <80s)`);

  console.log('\n--- classification equivalence vs cold 4ae71225 ---');
  let mismatch = 0;
  for (const u of proposal.contentUnits.sort((a,b)=>a.tabName.localeCompare(b.tabName))) {
    const base = baseline.get(u.tabName);
    const ok = base === undefined || base === u.classification;
    if (!ok) mismatch++;
    console.log(`  ${u.tabName.padEnd(22)} ${u.classification.padEnd(12)} @${u.confidence.toFixed(2)}  baseline=${base ?? '(new)'} ${ok ? '' : '*** MISMATCH ***'}`);
  }
  console.log(`\n--- VERDICT ---`);
  console.log(`analyze < 80s:          ${Number(analyzeS) < 80 ? 'PASS' : 'FAIL'} (${analyzeS}s)`);
  console.log(`>= 40% vs 223s (<134s): ${Number(analyzeS) < 134 ? 'PASS' : 'FAIL (HALT-4)'}`);
  console.log(`classifications match:  ${mismatch === 0 ? 'PASS' : `FAIL — ${mismatch} mismatch`}`);
  console.log(`\nscratch tenant ${tenantId} retained (clear via src/scripts/clear-tenant.ts).`);
  process.exit(Number(analyzeS) < 134 && mismatch === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e instanceof Error ? e.message : e); process.exit(1); });
