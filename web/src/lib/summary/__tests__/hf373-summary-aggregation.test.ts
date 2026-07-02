/**
 * HF-373 Phase F (D8) — incremental aggregation equivalence: feeding pages into the
 * accumulator and finalizing equals the one-shot aggregation (byte-identical artifacts),
 * so the keyset-paged read changes ONLY memory/read behavior, never the numbers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateCommittedRows,
  createAggregationState,
  accumulateCommittedRows,
  finalizeAggregatedArtifacts,
  NovelAggregationMethodError,
  type CommittedRow,
} from '../summary-engine';

const rows: CommittedRow[] = [
  { entity_id: 'E1', source_date: '2026-01-01', data_type: 'transaction', row_data: { amount: 100, score: 0.5 } },
  { entity_id: 'E1', source_date: '2026-01-01', data_type: 'transaction', row_data: { amount: 50, score: 0.7 } },
  { entity_id: 'E2', source_date: '2026-01-01', data_type: 'transaction', row_data: { amount: 10 } },
  { entity_id: null, source_date: '2026-01-01', data_type: 'transaction', row_data: { amount: 999 } }, // skipped
  { entity_id: 'E1', source_date: '2026-01-02', data_type: 'transaction', row_data: { amount: 7 } },
];

test('paged accumulation === one-shot aggregation (any page boundary)', () => {
  const oneShot = aggregateCommittedRows(rows, {}, { score: 'last' });
  for (const pageSize of [1, 2, 3, 5]) {
    const state = createAggregationState();
    let skipped = 0;
    for (let i = 0; i < rows.length; i += pageSize) skipped += accumulateCommittedRows(state, rows.slice(i, i + pageSize));
    const paged = finalizeAggregatedArtifacts(state, {}, { score: 'last' });
    assert.deepEqual(paged, oneShot, `pageSize=${pageSize}`);
    assert.equal(skipped, 1);
  }
  const e1d1 = oneShot.find(a => a.entity_id === 'E1' && a.summary_date === '2026-01-01')!;
  assert.equal(e1d1.metrics.amount, 150);   // sum (no method)
  assert.equal(e1d1.metrics.score, 0.7);    // recognized 'last'
  assert.equal(e1d1.row_count, 2);
});

test('C2 fail-loud preserved: a novel recognized method still HALTs at finalize', () => {
  const state = createAggregationState();
  accumulateCommittedRows(state, rows.slice(0, 2));
  assert.throws(() => finalizeAggregatedArtifacts(state, {}, { amount: 'harmonic_mean' }), NovelAggregationMethodError);
});
