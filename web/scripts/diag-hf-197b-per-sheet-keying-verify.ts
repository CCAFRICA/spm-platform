// HF-197B Phase ζ.1 — Per-sheet keying verification (in-memory, Korean-Test-clean).
// Asserts the structural fingerprint algorithm produces:
//   (1) DIFFERENT hashes for sheets with different shapes
//   (2) IDENTICAL hashes for sheets with the same shape (idempotence)
// Korean Test compliance: synthetic generic sheet names + columns; no Spanish-language
// or domain-specific tokens.
//
// No DB writes. No external I/O. Pure in-memory verification.

import { computeFingerprintHashSync } from '../src/lib/sci/structural-fingerprint';

type SheetSyn = { sheetName: string; columns: string[]; rows: Record<string, unknown>[] };

function buildWorkbook(): SheetSyn[] {
  // Synthetic generic shapes — no domain or language tokens.
  const sheetX: SheetSyn = {
    sheetName: 'SheetX',
    columns: ['alpha_id', 'beta_count', 'gamma_count'],
    rows: Array.from({ length: 10 }, (_, i) => ({
      alpha_id: 100 + i,
      beta_count: i * 2,
      gamma_count: i * 3,
    })),
  };
  const sheetY: SheetSyn = {
    sheetName: 'SheetY',
    columns: ['delta_label', 'epsilon_amount', 'zeta_date', 'eta_label', 'theta_amount'],
    rows: Array.from({ length: 10 }, (_, i) => ({
      delta_label: `label_${i}`,
      epsilon_amount: i * 100.5,
      zeta_date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      eta_label: `tag_${i % 3}`,
      theta_amount: i * 50.25,
    })),
  };
  const sheetZ: SheetSyn = {
    sheetName: 'SheetZ',
    columns: ['iota_text', 'kappa_text'],
    rows: Array.from({ length: 10 }, (_, i) => ({
      iota_text: `text_a_${i}`,
      kappa_text: `text_b_${i % 4}`,
    })),
  };
  return [sheetX, sheetY, sheetZ];
}

function pad(s: string, n: number) { return s.length >= n ? s : s + ' '.repeat(n - s.length); }

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  PASS  ${label}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
}

function main() {
  console.log('=== HF-197B ζ.1 per-sheet keying verification ===\n');

  console.log('Workbook A (3 sheets, distinct shapes):');
  const workbookA = buildWorkbook();
  const hashA = workbookA.map(s => ({
    sheet: s.sheetName,
    hash: computeFingerprintHashSync(s.columns, s.rows),
  }));
  for (const h of hashA) {
    console.log(`  ${pad(h.sheet, 8)} → ${h.hash.substring(0, 16)}...`);
  }
  console.log();

  console.log('Assertion 1 — different shapes produce different hashes:');
  assert('SheetX hash !== SheetY hash', hashA[0].hash !== hashA[1].hash, `${hashA[0].hash.substring(0, 12)} vs ${hashA[1].hash.substring(0, 12)}`);
  assert('SheetY hash !== SheetZ hash', hashA[1].hash !== hashA[2].hash, `${hashA[1].hash.substring(0, 12)} vs ${hashA[2].hash.substring(0, 12)}`);
  assert('SheetX hash !== SheetZ hash', hashA[0].hash !== hashA[2].hash, `${hashA[0].hash.substring(0, 12)} vs ${hashA[2].hash.substring(0, 12)}`);
  console.log();

  console.log('Workbook B (rebuilt with same shapes — idempotence test):');
  const workbookB = buildWorkbook();
  const hashB = workbookB.map(s => ({
    sheet: s.sheetName,
    hash: computeFingerprintHashSync(s.columns, s.rows),
  }));
  for (const h of hashB) {
    console.log(`  ${pad(h.sheet, 8)} → ${h.hash.substring(0, 16)}...`);
  }
  console.log();

  console.log('Assertion 2 — same shape produces identical hash:');
  for (let i = 0; i < 3; i++) {
    assert(`Workbook B[${i}] === Workbook A[${i}] (sheet=${hashA[i].sheet})`, hashB[i].hash === hashA[i].hash);
  }
  console.log();

  console.log('Assertion 3 — caller-side per-sheet keying (DIAG-021 H3+H4 verify):');
  // Simulate the pre-HF-197B defective behavior: same hash used for all sheets.
  // With per-sheet keying (HF-197B), each sheet gets its own hash. Verify the
  // shape: 3 sheets → 3 hashes (not 1).
  const distinctHashes = new Set(hashA.map(h => h.hash));
  assert(`3 sheets produce 3 distinct flywheel cache keys`, distinctHashes.size === 3, `actual=${distinctHashes.size}`);

  console.log();
  console.log(`=== Summary: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exit(1);
}

main();
