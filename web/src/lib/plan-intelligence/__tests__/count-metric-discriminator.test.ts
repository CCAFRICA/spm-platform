/**
 * HF-322 — count-vs-metric discriminator unit tests.
 *
 * Verifies the structural data-property override (Decision 158): a counting aggregate is
 * flipped to a metric reference ONLY when the tenant's committed_data makes `count`
 * degenerate (one-row-per-(entity,period) grid) AND a varying-numeric measure exists.
 * Non-count sources, multi-row tenants, flag-only tenants, and plan-before-data are no-ops.
 *
 * Runner: node --test --import tsx (per package.json "test" script).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { applyCountMetricDiscriminator, _clearDataShapeCache } from '../count-metric-discriminator';
import type { CompositionalIntent } from '../compositional-intent';

// Minimal chainable/thenable mock returning canned counts + a numeric sample.
function mockSupabase(shape: { entities: number; periods: number; rows: number; sample: Record<string, unknown>[] }) {
  const make = (table: string) => {
    const ctx = { table, head: false };
    const chain: Record<string, unknown> = {
      select(_cols: string, opts?: { head?: boolean }) { ctx.head = !!opts?.head; return chain; },
      eq() { return chain; },
      neq() { return chain; },
      limit() { return chain; },
      then(resolve: (v: unknown) => void) {
        if (ctx.head) {
          const count = table === 'entities' ? shape.entities : table === 'periods' ? shape.periods : shape.rows;
          resolve({ count, error: null });
        } else {
          resolve({ data: shape.sample.map(row_data => ({ row_data })), error: null });
        }
      },
    };
    return chain;
  };
  return { from: (table: string) => make(table) } as never;
}

const bclSample = Array.from({ length: 100 }, (_, i) => ({
  Cantidad_Productos_Cruzados: (i % 16) + 1, // varying 1..16 (measure)
  Monto_Colocacion: 50000 + i * 137.5,
  Periodo: `2025-${(i % 6) + 1}`,
  ID_Empleado: `E${i % 85}`,
}));
const flagSample = Array.from({ length: 100 }, (_, i) => ({ verified: i % 2, status: i % 3 === 0 ? 'pending' : 'done' }));

const countIntent = (rate: number): CompositionalIntent => ({
  component_id: 'c3', component_name: 'Productos Cruzados',
  structure: { shape: 'arithmetic', operation: 'multiply', operands: [
    { kind: 'reference', source: { type: 'aggregate', op: 'count', field: 'cross_sold_products' } },
    { kind: 'constant', value: rate },
  ] }, scale: null, output_precision: 0,
}) as unknown as CompositionalIntent;

const srcOf = (intent: CompositionalIntent): Record<string, unknown> =>
  ((intent as unknown as { structure: { operands: Array<{ source: Record<string, unknown> }> } }).structure.operands[0].source);

test('one-row grid + varying measure → count flips to metric', async () => {
  _clearDataShapeCache();
  const intent = countIntent(25);
  const res = await applyCountMetricDiscriminator(intent, 'BCL', mockSupabase({ entities: 85, periods: 6, rows: 510, sample: bclSample }));
  assert.equal(res.applied, true);
  assert.deepEqual(res.overriddenFields, ['cross_sold_products']);
  assert.equal(srcOf(intent).type, 'metric');
  assert.equal(srcOf(intent).op, undefined);
  assert.equal(srcOf(intent).field, 'cross_sold_products'); // field token preserved for convergence
});

test('banded_lookup (no count) is untouched', async () => {
  _clearDataShapeCache();
  const intent = {
    component_id: 'c1', component_name: 'Colocación',
    structure: { shape: 'banded_lookup', dimensions: [
      { reference_field: 'attainment', reference_source: { type: 'metric', field: 'attainment' }, breaks: [100, 110] },
    ], outputs: [0, 150, 300] }, scale: null, output_precision: 0,
  } as unknown as CompositionalIntent;
  const before = JSON.stringify(intent);
  const res = await applyCountMetricDiscriminator(intent, 'BCL', mockSupabase({ entities: 85, periods: 6, rows: 510, sample: bclSample }));
  assert.equal(res.applied, false);
  assert.equal(JSON.stringify(intent), before); // byte-identical
});

test('aggregate/sum is NOT flipped (only count)', async () => {
  _clearDataShapeCache();
  const intent = {
    component_id: 'cx', component_name: 'Volume',
    structure: { shape: 'arithmetic', operation: 'multiply', operands: [
      { kind: 'reference', source: { type: 'aggregate', op: 'sum', field: 'monto' } },
      { kind: 'constant', value: 0.02 },
    ] }, scale: null, output_precision: 0,
  } as unknown as CompositionalIntent;
  const res = await applyCountMetricDiscriminator(intent, 'BCL', mockSupabase({ entities: 85, periods: 6, rows: 510, sample: bclSample }));
  assert.equal(res.applied, false);
  assert.equal(srcOf(intent).type, 'aggregate');
  assert.equal(srcOf(intent).op, 'sum');
});

test('multi-row tenant (count not degenerate) → no override', async () => {
  _clearDataShapeCache();
  const intent = countIntent(25);
  const res = await applyCountMetricDiscriminator(intent, 'MULTI', mockSupabase({ entities: 10, periods: 3, rows: 5000, sample: bclSample }));
  assert.equal(res.applied, false);
  assert.equal(srcOf(intent).op, 'count');
});

test('one-row grid but flag/categorical only (no varying measure) → no override', async () => {
  _clearDataShapeCache();
  const intent = countIntent(25);
  const res = await applyCountMetricDiscriminator(intent, 'FLAGS', mockSupabase({ entities: 50, periods: 2, rows: 100, sample: flagSample }));
  assert.equal(res.applied, false);
  assert.equal(res.shape?.hasVaryingNumericMeasure, false);
  assert.equal(srcOf(intent).op, 'count');
});

test('plan-before-data (no committed_data) → additive no-op', async () => {
  _clearDataShapeCache();
  const intent = countIntent(25);
  const res = await applyCountMetricDiscriminator(intent, 'EMPTY', mockSupabase({ entities: 0, periods: 0, rows: 0, sample: [] }));
  assert.equal(res.applied, false);
  assert.equal(srcOf(intent).op, 'count');
});
