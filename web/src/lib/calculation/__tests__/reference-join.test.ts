/**
 * HF-329 — reference-sheet join resolution (unit). Runner: node --test --import tsx.
 *
 * Proves the classified join path and, critically, PG-6: the graceful fallback — when a
 * convergence-bound column is in a reference batch but NO value-overlap join exists, the
 * resolver returns null (the same behaviour as before HF-329). Korean Test: the join is by
 * value-overlap, not column names — the test fixtures use opaque/foreign-looking names.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveReferenceJoinRows } from '../reference-join';

// Meridian shape: an employee row carrying a dimensional key (Hub) + a reference sheet of
// one row per hub per period carrying the bound measure. Period scoping is applied upstream
// (referenceRows here are already the calc period's rows).
const entityRow = (hub: string, extra: Record<string, unknown> = {}) => ({
  No_Empleado: '70024', Hub: hub, Region: 'Norte', _sheetName: 'Datos_Rendimiento', ...extra,
});
const refRow = (hub: string, region: string, loads: number, cap: number) => ({
  Hub: hub, Region: region, Cargas_Totales: loads, Capacidad_Total: cap, _sheetName: 'Datos_Flota_Hub',
});
const FLOTA = [
  refRow('Monterrey Hub', 'Norte', 1083, 1306),
  refRow('Chihuahua Hub', 'Norte', 540, 720),
  refRow('CDMX Hub', 'Centro', 2100, 2400),
];

test('PG-3 positive: entity → value-overlap key (Hub) → reference row → bound column', () => {
  const matched = resolveReferenceJoinRows('Cargas_Totales', [entityRow('Monterrey Hub')], FLOTA);
  assert.ok(matched, 'a join row is resolved');
  assert.equal(matched!.length, 1, 'exactly one reference row (one hub per period)');
  assert.equal(matched![0].Cargas_Totales, 1083);
  // and the capacity column resolves to the SAME hub row
  const cap = resolveReferenceJoinRows('Capacidad_Total', [entityRow('Monterrey Hub')], FLOTA);
  assert.equal(cap![0].Capacidad_Total, 1306);
});

test('most-specific join wins: Hub (one row) beats Region (many rows)', () => {
  // The entity overlaps BOTH Hub ("CDMX Hub") and Region ("Centro" — but entity Region is Norte here).
  // Use an entity whose Region matches multiple ref rows to prove Hub (fewest matched) is chosen.
  const matched = resolveReferenceJoinRows('Cargas_Totales', [entityRow('Chihuahua Hub', { Region: 'Norte' })], FLOTA);
  assert.equal(matched!.length, 1, 'Region(Norte) matches 2 rows; Hub matches 1 — the specific key wins');
  assert.equal(matched![0].Hub, 'Chihuahua Hub');
  assert.equal(matched![0].Cargas_Totales, 540);
});

test('PG-6 graceful fallback: bound column in reference batch, NO overlapping key → null', () => {
  // The entity carries NO value that appears in any reference column (no reference_key join path).
  const orphanEntity = [{ No_Empleado: '99999', SomeOtherField: 'zzz-unmatchable', _sheetName: 'X' }];
  const result = resolveReferenceJoinRows('Cargas_Totales', orphanEntity, FLOTA);
  assert.equal(result, null, 'no value-overlap join exists → null (identical to pre-HF-329 behaviour)');
});

test('PG-5 fallback: no reference data at all → null (BCL — no reference sheets)', () => {
  assert.equal(resolveReferenceJoinRows('Cargas_Totales', [entityRow('Monterrey Hub')], []), null);
});

test('fallback: reference rows exist but none carry the bound column → null', () => {
  const noMeasure = [{ Hub: 'Monterrey Hub', Region: 'Norte', _sheetName: 'Y' }];
  assert.equal(resolveReferenceJoinRows('Cargas_Totales', [entityRow('Monterrey Hub')], noMeasure), null);
});

test('Korean Test: join is value-overlap, not column names (opaque names, mismatched key column names)', () => {
  // entity's key column is "콜럼" and the reference's is "참조" — DIFFERENT names, same VALUE "X9".
  const entity = [{ '콜럼': 'X9', 직원: '1', _sheetName: 'e' }];
  const ref = [
    { 참조: 'X9', 측정: 4242, _sheetName: 'r' },
    { 참조: 'Y2', 측정: 11, _sheetName: 'r' },
  ];
  const matched = resolveReferenceJoinRows('측정', entity, ref);
  assert.ok(matched, 'join resolves across differently-named columns by VALUE overlap');
  assert.equal(matched![0]['측정'], 4242);
});
