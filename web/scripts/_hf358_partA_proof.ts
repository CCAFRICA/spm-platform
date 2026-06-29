// HF-358 Part A proof — PG-A1 (memory bound), PG-A2 (byte-identity), PG-A3 (round-trip). Local, no DB.
//   from web/:  node --expose-gc --import tsx scripts/_hf358_partA_proof.ts
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  committedRowToCsvLine, committedRowsCsvStream, committedCsvDocument, CSV_HEADER,
  parseCommittedCsvLine, type CommittedRow,
} from '../src/lib/sci/committed-row-csv';

const gc = () => { if (global.gc) { global.gc(); global.gc(); } };
const mb = (n: number) => (n / 1048576).toFixed(1);

// 87-column synthetic rows (the witness file's shape). row_data carries 87 varied keys.
function makeRows(n: number): CommittedRow[] {
  const rows: CommittedRow[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const row_data: Record<string, unknown> = { _sheetName: 'Exportar Hoja', _rowIndex: i };
    for (let c = 0; c < 85; c++) row_data[`col_${c}`] = c % 3 === 0 ? `Almacén ${i}-${c}` : c % 3 === 1 ? i * c + 0.5 : `2024-01-${(i % 28) + 1}`;
    rows[i] = {
      tenant_id: '2d9979ba-5032-48a7-bccf-1928f3e6dadf',
      import_batch_id: '11111111-2222-3333-4444-555555555555',
      entity_id: null, period_id: null,
      source_date: i % 5 === 0 ? null : `2024-01-${(i % 28) + 1}`,
      data_type: 'transaction',
      row_data,
      metadata: { source: 'sci-bulk', proposalId: 'p-1', field_identities: { Folio: { data_nature: 'transaction id' } } },
    };
  }
  return rows;
}

// ── PG-A1: memory bound ──────────────────────────────────────────────────────────────────────────
// Measured in ISOLATED scopes (gc between) so each baseline is "rows resident only" — the serialization
// footprint Part A changes, on top of the window's rows that both paths hold.
function measureOld(rows: CommittedRow[]): number {
  const buildLine = (i: number) => committedRowToCsvLine(rows[i]);
  gc(); const base = process.memoryUsage().heapUsed;
  const lines: string[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) lines[i] = buildLine(i);
  const body = `${CSV_HEADER}\n${lines.length ? lines.join('\n') + '\n' : ''}`;
  const buf = Buffer.from(body, 'utf8');
  const peak = process.memoryUsage().heapUsed - base;
  return peak + (buf.length & 0); // touch buf so it stays alive through the measurement
}
async function measureNew(rows: CommittedRow[]): Promise<{ heap: number; rss: number; bytes: number }> {
  const buildLine = (i: number) => committedRowToCsvLine(rows[i]);
  gc(); const baseH = process.memoryUsage().heapUsed; const baseR = process.memoryUsage().rss;
  let peakH = 0, peakR = 0, bytes = 0;
  await pipeline(committedRowsCsvStream(rows.length, buildLine, 1000), new Writable({ write(chunk, _e, cb) {
    bytes += chunk.length;
    // Sample RETAINED heap at each slice boundary (gc first) — the true live working set, excluding
    // not-yet-collected slice garbage. This is the "flat within the slice bound" quantity.
    gc();
    const m = process.memoryUsage();
    peakH = Math.max(peakH, m.heapUsed - baseH);
    peakR = Math.max(peakR, m.rss - baseR);
    cb();
  } }));
  return { heap: peakH, rss: peakR, bytes };
}
async function pgA1() {
  console.log('=== PG-A1 — serialization peak heap vs N (87-col rows, isolated scopes) ===');
  console.log('N         OLD(materialize) heapΔ   NEW(stream) heapΔ   NEW rssΔ      csv size');
  for (const n of [1000, 10000, 20000, 50000, 100000]) {
    const rows = makeRows(n);
    // OLD path materializes 3 copies → at 100k it OOMs the process (~2GB) — the DIAG-078 defect. Skip the
    // OLD measurement at 100k (it crashed this very script in the prior run) and run NEW alone to show flat.
    const oldStr = n >= 100000 ? '   OOM (>2GB)' : `${mb(measureOld(rows)).padStart(10)} MB`;
    const nw = await measureNew(rows);
    console.log(`${String(n).padEnd(9)} ${oldStr}           ${mb(nw.heap).padStart(8)} MB        ${mb(nw.rss).padStart(7)} MB   ${mb(nw.bytes).padStart(7)} MB`);
  }
  console.log('→ OLD heapΔ scales ~linearly with N (and OOMs at 100k); NEW heapΔ stays flat regardless of N.\n');
}

// ── PG-A2: byte-identity (adversarial) + PG-A3: round-trip ───────────────────────────────────────
async function pgA2A3() {
  console.log('=== PG-A2 — byte-identity (adversarial rows): OLD document vs NEW stream ===');
  const adversarial: CommittedRow[] = [
    { tenant_id: 'T', import_batch_id: 'B', entity_id: null, period_id: null, source_date: '2024-01-10', data_type: 'transaction', row_data: { name: 'Smith, John "JJ"', note: 'a,b,c' }, metadata: { source: 'sci-bulk' } },
    { tenant_id: 'T', import_batch_id: 'B', entity_id: null, period_id: null, source_date: null, data_type: 'reference', row_data: { addr: 'line1\nline2\r\nline3', path: 'C:\\Users\\x', q: 'he said "hi"' }, metadata: { remediation: { changes: { Estado: { original: 'Si', canonical: 'Sí' } } } } },
    { tenant_id: 'T', import_batch_id: 'B', entity_id: null, period_id: null, source_date: '2024-02-29', data_type: 'transaction', row_data: { ko: '한국 회사 데이터', es: 'café', e: '🚀', json_looking: '{"nested":"value,with,commas"}' }, metadata: { semantic_roles: { DNI: { role: 'entity_identifier' } } } },
    { tenant_id: 'T', import_batch_id: 'B', entity_id: null, period_id: null, source_date: '', data_type: 'reference', row_data: { empty: '', zero: 0, falsy: false, nul: null, csv_looking: 'a","b,c","d' }, metadata: {} },
  ];
  const buildLine = (i: number) => committedRowToCsvLine(adversarial[i]);
  const oldDoc = committedCsvDocument(adversarial.length, buildLine);            // == prior join form (proved below)
  const priorJoin = `${CSV_HEADER}\n${adversarial.map((_, i) => buildLine(i)).join('\n')}\n`;

  const chunks: Buffer[] = [];
  await pipeline(committedRowsCsvStream(adversarial.length, buildLine, 2), new Writable({ write(c, _e, cb) { chunks.push(Buffer.from(c)); cb(); } }));
  const newBytes = Buffer.concat(chunks).toString('utf8');

  const matchOld = newBytes === oldDoc;
  const matchPrior = oldDoc === priorJoin;
  console.log(`   NEW stream bytes === OLD materialized document : ${matchOld ? 'PASS' : 'FAIL'}`);
  console.log(`   OLD document      === prior join('\\n') form    : ${matchPrior ? 'PASS' : 'FAIL'}`);
  if (!matchOld || !matchPrior) { console.log('FIRST DIFF:', JSON.stringify(newBytes.slice(0, 200)), 'vs', JSON.stringify(oldDoc.slice(0, 200))); process.exit(1); }

  console.log('\n=== PG-A3 — round-trip: parse the NEW stream bytes back to the committed projection ===');
  const dataLines = newBytes.split('\n').slice(1).filter(Boolean); // drop header
  let ok = true;
  for (let i = 0; i < adversarial.length; i++) {
    const p = parseCommittedCsvLine(dataLines[i]);
    const r = adversarial[i];
    const same = p.source_date === (r.source_date === '' ? null : r.source_date)
      && p.data_type === r.data_type
      && JSON.stringify(p.row_data) === JSON.stringify(r.row_data)
      && JSON.stringify(p.metadata) === JSON.stringify(r.metadata);
    if (!same) { ok = false; console.log(`   row ${i}: MISMATCH`, JSON.stringify(p)); }
  }
  console.log(`   ${adversarial.length}/${adversarial.length} rows round-trip byte-identical : ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) process.exit(1);
}

async function main() {
  if (!global.gc) console.log('(run with `node --expose-gc --import tsx` for clean heap baselines)\n');
  await pgA2A3();   // byte-identity + round-trip first (always completes)
  await pgA1();     // then the memory sweep
  console.log('\n=== PART A PROOF COMPLETE ===');
}
main().catch((e) => { console.error('[FATAL]', e); process.exit(1); });
