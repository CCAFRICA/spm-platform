// OB-255 continuation — the structural-independence signal that routes per-sheet vs batched.
// Self-contained commission programs (each with its own rate) → per-sheet; complementary parts of one
// plan (an overview/targets sheet with no rate) → batched (BCL/HF-130 preserved). Korean-clean.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { columnIsRateBearing, sheetIsSelfContainedProgram } from '../plan-interpretation';

test('OB-255c: a %-headed column is rate-bearing (universal symbol, no language token)', () => {
  assert.equal(columnIsRateBearing('% AUTORIZADO', [{ '% AUTORIZADO': 0.01 }]), true);
});

test('OB-255c: a fractional-value column (0,1] is rate-bearing even without a % header', () => {
  const rows = [{ tasa: 0.01 }, { tasa: 0.0025 }, { tasa: 0.05 }];
  assert.equal(columnIsRateBearing('tasa', rows), true);
});

test('OB-255c: a name/amount column is NOT rate-bearing', () => {
  assert.equal(columnIsRateBearing('NOMBRE', [{ NOMBRE: 'GARCIA' }, { NOMBRE: 'LOPEZ' }, { NOMBRE: 'MAY' }]), false);
  assert.equal(columnIsRateBearing('Monto', [{ Monto: 15000 }, { Monto: 22000 }, { Monto: 8000 }]), false); // >1 → not a fractional rate
});

test('OB-255c: a commission sheet (rate + base + formula) is a self-contained program → per-sheet', () => {
  const cols = ['DEPARTAMENTO', 'SUCURSAL', '% AUTORIZADO', 'BASE COMISION', 'FORMULA BASE COMISION'];
  const rows = [{ DEPARTAMENTO: 'PULL', '% AUTORIZADO': 0.002, 'BASE COMISION': 'Ventas' }];
  assert.equal(sheetIsSelfContainedProgram(cols, rows), true);
});

test('OB-255c: an overview/targets sheet with NO rate of its own is NOT self-contained → batched (BCL)', () => {
  const cols = ['Vendedor', 'Region', 'Meta_Anual'];
  const rows = [{ Vendedor: 'A', Region: 'Norte', Meta_Anual: 500000 }, { Vendedor: 'B', Region: 'Sur', Meta_Anual: 300000 }, { Vendedor: 'C', Region: 'Norte', Meta_Anual: 400000 }];
  assert.equal(sheetIsSelfContainedProgram(cols, rows), false);
  // → in executeBatchedPlanInterpretation, `allSelfContained` is false, so the file takes the BATCHED
  //   path (interpretPlanGroup with all units) — HF-130 cross-sheet interpretation preserved.
});

test('OB-255c: a too-narrow table (<3 cols) is not a standalone program', () => {
  assert.equal(sheetIsSelfContainedProgram(['A', '% rate'], [{ A: 'x', '% rate': 0.1 }]), false);
});
