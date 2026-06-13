/**
 * OB-203 Phase 6B Phase B — resume disposition (pure).
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { classifyUnitForResume, batchLivenessMs } from '../execute-resume';

const NOW = Date.parse('2026-06-12T12:00:00Z');
const LIVENESS = 6 * 60 * 1000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const c = (spineState: string | null, latestBatch: { status: string; createdAt: string } | null) =>
  classifyUnitForResume({ spineState, latestBatch, livenessMs: LIVENESS, nowMs: NOW });

test('terminal spine states skip (bound / resolved / failed_interpretation)', () => {
  assert.equal(c('bound', null), 'skip_terminal');
  assert.equal(c('resolved', null), 'skip_terminal');
  assert.equal(c('failed_interpretation', null), 'skip_terminal');
});

test('completed batch with non-terminal spine: commit landed, only the emission died', () => {
  assert.equal(c('classified', { status: 'completed', createdAt: ago(60_000) }), 'skip_completed_batch');
});

test('young processing batch is a live lease — never double-process', () => {
  assert.equal(c('classified', { status: 'processing', createdAt: ago(30_000) }), 'skip_in_flight');
});

test('stale processing batch (lease expired, reconcile sweeps it) reprocesses', () => {
  assert.equal(c('classified', { status: 'processing', createdAt: ago(LIVENESS + 1_000) }), 'process');
});

test('the A3 case: no batch row at all — the orphaned roster — processes', () => {
  assert.equal(c('classified', null), 'process');
  assert.equal(c(null, null), 'process');     // not even a spine snapshot yet
});

test('failed batch with non-terminal spine reprocesses (sweep already reclaimed rows)', () => {
  assert.equal(c('classified', { status: 'failed', createdAt: ago(60_000) }), 'process');
});

test('unparsable batch timestamp does not grant a lease', () => {
  assert.equal(c('classified', { status: 'processing', createdAt: 'not-a-date' }), 'process');
});

test('liveness default is 6 minutes; env override is read when set', () => {
  delete process.env.OB203_BATCH_LIVENESS_MS;
  assert.equal(batchLivenessMs(), 6 * 60 * 1000);
  process.env.OB203_BATCH_LIVENESS_MS = '15000';
  assert.equal(batchLivenessMs(), 15000);
  delete process.env.OB203_BATCH_LIVENESS_MS;
});
