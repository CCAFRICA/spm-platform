// HF-285-D HALT-5 gate (local): measure the parsed-companion artifact size for the
// 162,956-row MX file — JSON vs gzip. >50MB JSON → try gzip; gzip >50MB → HALT-5.
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/diag/hf285-d-artifact-size.ts

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { gzipSync } from 'node:zlib';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MX_TENANT = '3d354bfa-b298-48dd-88a0-9f8c5a00be4e';
const MB = (b: number) => (b / 1024 / 1024).toFixed(1) + 'MB';

async function main() {
  const { data: objs } = await sb.storage.from('ingestion-raw').list(MX_TENANT, { limit: 200 });
  const mx = (objs ?? []).filter(o => /datos-cadena-restaurantes-mx\.xlsx$/i.test(o.name)).sort((a, b) => (a.name < b.name ? 1 : -1))[0];
  const { data } = await sb.storage.from('ingestion-raw').download(`${MX_TENANT}/${mx!.name}`);
  const buf = Buffer.from(await data!.arrayBuffer());
  console.log(`raw xlsx: ${MB(buf.length)}`);

  const wb = XLSX.read(buf, { type: 'buffer' });
  // The companion stores the full parsed representation the execute path uses:
  // per sheet, the raw rows (defval:'') + columns. (No semantic enrichment — that
  // happens in commitContentUnit, the persistence layer, never sampled.)
  const sheetMap: Record<string, { columns: string[]; rows: Record<string, unknown>[] }> = {};
  let totalRows = 0;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: '' });
    sheetMap[name] = { columns: rows.length ? Object.keys(rows[0]) : [], rows };
    totalRows += rows.length;
  }
  console.log(`parsed ${wb.SheetNames.length} sheets, ${totalRows} rows`);

  const json = Buffer.from(JSON.stringify(sheetMap), 'utf8');
  console.log(`companion JSON (uncompressed): ${MB(json.length)}  ${json.length > 50 * 1024 * 1024 ? '> 50MB → gzip required' : '<= 50MB'}`);

  const t0 = Date.now();
  const gz = gzipSync(json, { level: 6 });
  const gzMs = Date.now() - t0;
  console.log(`companion gzip (level 6): ${MB(gz.length)} (compress ${gzMs}ms)  ${gz.length > 50 * 1024 * 1024 ? '*** > 50MB → HALT-5 ***' : 'PASS (<= 50MB)'}`);

  // HALT-6 input: serialize+deserialize time vs raw xlsx parse time.
  const tp0 = Date.now();
  const wb2 = XLSX.read(buf, { type: 'buffer' });
  for (const name of wb2.SheetNames) XLSX.utils.sheet_to_json(wb2.Sheets[name], { defval: '' });
  const parseMs = Date.now() - tp0;
  const td0 = Date.now();
  const { gunzipSync } = await import('node:zlib');
  JSON.parse(gunzipSync(gz).toString('utf8'));
  const deserMs = Date.now() - td0;
  console.log(`\nHALT-6: raw xlsx parse=${parseMs}ms vs companion (read+gunzip+JSON.parse)=${deserMs}ms + serialize=${gzMs}ms`);
  console.log(`  net per use: companion read ${deserMs}ms replaces parse ${parseMs}ms → ${deserMs < parseMs ? `SAVES ~${parseMs - deserMs}ms (PASS)` : 'SLOWER (HALT-6)'}`);
  console.log(`  (serialize ${gzMs}ms is one-time at analyze/classify, amortized over execute + every resume re-read)`);
}

main().catch(e => { console.error('FATAL:', e instanceof Error ? e.message : e); process.exit(1); });
