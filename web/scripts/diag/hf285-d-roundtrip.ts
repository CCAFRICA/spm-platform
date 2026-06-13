// HF-285-D proof — companion round-trip against LIVE Supabase Storage (the real
// write/read path used by process-job → execute-bulk), on the real MX parse.
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/diag/hf285-d-roundtrip.ts

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { computeFileHashSha256 } from '@/lib/sci/file-content-hash';
import { writeParsedCompanion, readParsedCompanion, companionPath, type ParsedSheets } from '@/lib/sci/parsed-companion';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MX_TENANT = '3d354bfa-b298-48dd-88a0-9f8c5a00be4e';
const SCRATCH = crypto.randomUUID();

async function main() {
  const { data: objs } = await sb.storage.from('ingestion-raw').list(MX_TENANT, { limit: 200 });
  const mx = (objs ?? []).filter(o => /datos-cadena-restaurantes-mx\.xlsx$/i.test(o.name)).sort((a, b) => (a.name < b.name ? 1 : -1))[0];
  const { data } = await sb.storage.from('ingestion-raw').download(`${MX_TENANT}/${mx!.name}`);
  const buffer = await data!.arrayBuffer();
  const fileHash = computeFileHashSha256(buffer);

  // Parse exactly as process-job / execute-bulk do.
  const parseT0 = Date.now();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheets: ParsedSheets = {};
  let totalRows = 0;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: '' });
    sheets[name] = { columns: rows.length ? Object.keys(rows[0]) : [], rows };
    totalRows += rows.length;
  }
  const parseMs = Date.now() - parseT0;
  console.log(`direct parse: ${wb.SheetNames.length} sheets, ${totalRows} rows, ${parseMs}ms  fileHash=${fileHash.slice(0, 12)}`);

  // WRITE (process-job side) → READ (execute-bulk side), live storage.
  await writeParsedCompanion(sb, SCRATCH, fileHash, sheets);
  const readT0 = Date.now();
  const back = await readParsedCompanion(sb, SCRATCH, fileHash);
  const readMs = Date.now() - readT0;
  if (!back) { console.error('FAIL: companion read returned null'); process.exit(1); }

  // Equivalence: identical sheet set, columns, row counts, and a deep-equal spot check.
  const backRows = Object.values(back).reduce((s, sd) => s + sd.rows.length, 0);
  const sameSheets = Object.keys(back).sort().join(',') === Object.keys(sheets).sort().join(',');
  const sameTotal = backRows === totalRows;
  let cellsMatch = true;
  for (const name of Object.keys(sheets)) {
    if (JSON.stringify(back[name].columns) !== JSON.stringify(sheets[name].columns)) { cellsMatch = false; break; }
    if (back[name].rows.length !== sheets[name].rows.length) { cellsMatch = false; break; }
  }
  // Deep spot-check the largest sheet's first + last rows.
  const big = Object.entries(sheets).sort((a, b) => b[1].rows.length - a[1].rows.length)[0][0];
  const firstEq = JSON.stringify(back[big].rows[0]) === JSON.stringify(sheets[big].rows[0]);
  const lastEq = JSON.stringify(back[big].rows.at(-1)) === JSON.stringify(sheets[big].rows.at(-1));

  console.log(`companion read: ${readMs}ms (replaces ${parseMs}ms parse → net −${parseMs - readMs}ms per use)`);
  console.log(`same sheet set:        ${sameSheets ? 'PASS' : 'FAIL'}`);
  console.log(`same total rows:       ${sameTotal ? `PASS (${backRows})` : `FAIL (${backRows} vs ${totalRows})`}`);
  console.log(`columns+counts match:  ${cellsMatch ? 'PASS' : 'FAIL'}`);
  console.log(`${big} first/last row:  ${firstEq && lastEq ? 'PASS (deep-equal)' : 'FAIL'}`);

  await sb.storage.from('ingestion-raw').remove([companionPath(SCRATCH, fileHash)]);
  console.log('cleanup: companion removed');
  const ok = sameSheets && sameTotal && cellsMatch && firstEq && lastEq && readMs < parseMs;
  console.log(`\nROUND-TRIP ${ok ? 'PASS' : 'FAIL'}`);
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e instanceof Error ? e.message : e); process.exit(1); });
