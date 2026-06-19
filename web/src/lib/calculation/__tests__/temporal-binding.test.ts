/**
 * OB-220 — temporal (wide-format) column binding. Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { detectTemporalColumnMap, resolveTemporalColumn, periodKeyFromStartDate, isTemporalBinding } from '@/lib/calculation/temporal-binding';

test('detect: MIR Cuotas wide-format (Spanish months) → 6-entry columnMap', () => {
  const cols = ['DNI', 'Almacen', 'Mayo_2025', 'Abril_2025', 'Enero_2025', 'Junio_2025', 'Marzo_2025', 'Febrero_2025', 'Nombre_Vendedor'];
  const r = detectTemporalColumnMap(cols);
  assert.ok(r);
  assert.equal(Object.keys(r!.columnMap).length, 6);
  assert.equal(r!.columnMap['2025-01'], 'Enero_2025');
  assert.equal(r!.columnMap['2025-06'], 'Junio_2025');
  assert.equal(r!.type, 'temporal_map');
});

test('detect: English month names + numeric months', () => {
  assert.equal(detectTemporalColumnMap(['January_2024', 'February_2024'])!.columnMap['2024-02'], 'February_2024');
  assert.equal(detectTemporalColumnMap(['Q_2025_01', 'Q_2025_02'])!.columnMap['2025-01'], 'Q_2025_01');
});

test('detect: non-temporal columns → null', () => {
  assert.equal(detectTemporalColumnMap(['Folio', 'Monto_Total', 'Categoria', 'DNI_Vendedor']), null);
  assert.equal(detectTemporalColumnMap(['Enero_2025']), null); // single column → not a temporal set
});

test('resolve: period key → column; unmapped → null (SR-34)', () => {
  const map = { '2025-01': 'Enero_2025', '2025-02': 'Febrero_2025' };
  assert.equal(resolveTemporalColumn(map, '2025-01'), 'Enero_2025');
  assert.equal(resolveTemporalColumn(map, '2025-12'), null);
});

test('periodKeyFromStartDate', () => {
  assert.equal(periodKeyFromStartDate('2025-01-01'), '2025-01');
  assert.equal(periodKeyFromStartDate('2025-06-15'), '2025-06');
  assert.equal(periodKeyFromStartDate(null), null);
});

test('isTemporalBinding', () => {
  assert.equal(isTemporalBinding({ columnMap: { '2025-01': 'Enero_2025' } }), true);
  assert.equal(isTemporalBinding({ column: 'Monto_Total' }), false);
  assert.equal(isTemporalBinding(null), false);
});
