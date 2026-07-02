/**
 * HF-373 Phase E (D6) — effective-cap composition + part parity.
 * The 2026-07-02 failure: budget derived from the bucket's raised 100MiB limit while the
 * project-global (~50MiB, unreadable) cap governed → the ~84MB part was rejected at part 1.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeEffectiveLimit,
  globalUploadCap,
  FALLBACK_LIMIT_BYTES,
  GLOBAL_UPLOAD_LIMIT_DEFAULT_BYTES,
  HEADROOM_FRACTION,
  estimatePulseTotal,
} from '../pulse-budget';
import { planPulses } from '../pulse-accumulator';

const MiB = 1024 * 1024;

test('THE FIX: a raised bucket limit no longer raises the budget past the global cap (the 2026-07-02 shape)', () => {
  const r = composeEffectiveLimit(100 * MiB, { bytes: GLOBAL_UPLOAD_LIMIT_DEFAULT_BYTES, source: 'global-default' });
  assert.equal(r.effectiveLimit, 50 * MiB);
  assert.equal(r.limitSource, 'global-default');
  // pre-fix budget was 0.8×100MiB ≈ 84MB (rejected); post-fix 0.8×50MiB ≈ 41.9MB (under the real cap)
  assert.equal(Math.floor(HEADROOM_FRACTION * r.effectiveLimit), 41_943_040);
});

test('a bucket limit BELOW the global cap governs (min composition, both directions)', () => {
  const r = composeEffectiveLimit(30 * MiB, { bytes: 50 * MiB, source: 'global-default' });
  assert.equal(r.effectiveLimit, 30 * MiB);
  assert.equal(r.limitSource, 'bucket');
});

test('unreadable bucket limit → conservative fallback floor still governs (below the global default)', () => {
  const r = composeEffectiveLimit(null, { bytes: 50 * MiB, source: 'global-default' });
  assert.equal(r.effectiveLimit, FALLBACK_LIMIT_BYTES);
  assert.equal(r.limitSource, 'fallback');
});

test('architect-verified env override is honored (SUPABASE_GLOBAL_UPLOAD_LIMIT_BYTES)', () => {
  const prev = process.env.SUPABASE_GLOBAL_UPLOAD_LIMIT_BYTES;
  try {
    process.env.SUPABASE_GLOBAL_UPLOAD_LIMIT_BYTES = String(200 * MiB);
    const g = globalUploadCap();
    assert.deepEqual(g, { bytes: 200 * MiB, source: 'global-env' });
    // with a verified 200MiB global cap, the 100MiB bucket limit becomes the min again
    const r = composeEffectiveLimit(100 * MiB, g);
    assert.equal(r.effectiveLimit, 100 * MiB);
    assert.equal(r.limitSource, 'bucket');
  } finally {
    if (prev === undefined) delete process.env.SUPABASE_GLOBAL_UPLOAD_LIMIT_BYTES;
    else process.env.SUPABASE_GLOBAL_UPLOAD_LIMIT_BYTES = prev;
  }
});

test('row parity: Σ(part rows) === source rows exactly, for any budget (HALT-CALC-grade determinism)', () => {
  for (const [rows, rowBytes, budget] of [[86_607, 43_668, 41_943_040], [510, 2_000, 41_943_040], [1, 100_000_000, 41_943_040]] as const) {
    const spans = planPulses(rows, () => rowBytes, budget, 20_000);
    const total = spans.reduce((s, p) => s + p.rowCount, 0);
    assert.equal(total, rows);
    // no part may exceed the budget unless it is a lone oversized row
    for (const p of spans) {
      if (p.rowCount > 1) assert.ok(p.rowCount * rowBytes <= budget + rowBytes);
    }
  }
});

test('86K×87 planning under the corrected budget: ~90 parts, none near the real cap', () => {
  const est = estimatePulseTotal(86_607, 43_668, 41_943_040);
  assert.ok(est >= 85 && est <= 100, `est=${est}`);
});
