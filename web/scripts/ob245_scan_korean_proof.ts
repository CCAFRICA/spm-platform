/**
 * OB-245 proof (DB-independent): Korean Test (magic-byte detection) + ScanProvider
 * correctness against the real ClamAV engine. No table/bucket needed → runnable
 * before the HALT-A migration apply.
 *
 * Run: npx tsx scripts/ob245_scan_korean_proof.ts   (clamd must be listening on 3310)
 */

import { detectMimeFromBytes } from '../src/lib/prism/mime-detect';
import { createScanProvider } from '../src/lib/prism/scan-provider';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
}

const EICAR = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
const CSV = Buffer.from('vendedor,monto,fecha\nA,100,2026-01-01\nB,200,2026-01-02\n');
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]); // PK.. (xlsx/zip)
const PDF_MAGIC = Buffer.from('%PDF-1.7\n...');

async function main() {
  console.log('=== Korean Test: detection follows CONTENT, never extension ===');
  // The bytes are CSV; the "filename" is irrelevant — detection never sees it.
  check('CSV bytes "named" data.xlsx → text/csv', detectMimeFromBytes(CSV) === 'text/csv', detectMimeFromBytes(CSV));
  check('ZIP/OOXML bytes "named" report.txt → application/zip', detectMimeFromBytes(ZIP_MAGIC) === 'application/zip', detectMimeFromBytes(ZIP_MAGIC));
  check('PDF bytes "named" sheet.csv → application/pdf', detectMimeFromBytes(PDF_MAGIC) === 'application/pdf', detectMimeFromBytes(PDF_MAGIC));
  check('EICAR bytes → text/plain (content-typed, not by .com)', detectMimeFromBytes(EICAR) === 'text/plain', detectMimeFromBytes(EICAR));

  console.log('\n=== ScanProvider against the real ClamAV engine ===');
  const provider = createScanProvider(async (p: string) => (p === 'eicar' ? EICAR : CSV));
  console.log(`provider: ${provider.name} (PRISM_SCAN_PROVIDER=${process.env.PRISM_SCAN_PROVIDER ?? 'clamd(default)'})`);

  const infected = await provider.scan('eicar');
  check('EICAR → infected', infected.verdict === 'infected', `${infected.verdict} / ${infected.detail ?? ''} / ${infected.engineVersion}`);

  const clean = await provider.scan('clean');
  check('clean CSV → clean', clean.verdict === 'clean', `${clean.verdict} / ${clean.engineVersion}`);

  console.log(`\n${failures === 0 ? '✅ ALL PROOFS PASS' : `❌ ${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('proof crashed:', e);
  process.exit(1);
});
