/** HF-373 Phase I (D4) — source-sheet identity resolution (explicit + legacy backfill). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSourceSheet } from '../plan-identity';

test('explicit metadata.sourceSheet wins', () => {
  assert.equal(planSourceSheet({ sourceSheet: 'DIST Y SUC', contentUnitId: 'f.xlsx::OTHER::1::split' }), 'DIST Y SUC');
});

test('legacy plans backfill-parse the HF-372 contentUnitId key', () => {
  assert.equal(planSourceSheet({ contentUnitId: 'COMISIONES___AUTORIZADOS_-_copia.xlsx::MAQUINARIA (2)::2::split' }), 'MAQUINARIA (2)');
});

test('no identity available → null (display renders nothing, never a fabrication)', () => {
  assert.equal(planSourceSheet({}), null);
  assert.equal(planSourceSheet(null), null);
  assert.equal(planSourceSheet({ contentUnitId: 'no-separators' }), null);
});
