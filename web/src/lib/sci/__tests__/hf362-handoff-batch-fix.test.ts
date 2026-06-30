/**
 * HF-362 — Hand-Off Batch-Creation Fix + Dynamic Pulse Activation. Runner: node --test --import tsx.
 *   PG-A1: the hand-off batch insert is ERROR-CHECKED → a failed insert fails the commit cleanly (no orphan
 *          batchId in the manifest) — the real FK-failure fix. Migration allows 'staged'.
 *   PG-A2: the worker batch lifecycle staged → completed (success) / staged → failed (error).
 *   PG-A3: the synchronous path is unchanged (status='processing', no error-path divergence).
 *   PG-B1: the dynamic decision — shouldHandOff(estimatePulseTotal(...)): an 85-row file → 1 pulse → sync;
 *          an 86,607-row file → >1 pulse → hand off.
 *   PG-B2: byte-identical output — both branches call the SAME commitContentUnit / buildCommittedRow.
 *   PG-B3: single path — no second commit route; the PULSE_LOAD_HANDOFF env var is gone.
 *   PG-B4: no new threshold — the decision reuses estimatePulseTotal + the byte budget.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { estimatePulseTotal, shouldHandOff } from '../pulse-budget';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const COMMIT = read('src/lib/sci/commit-content-unit.ts');
const WINDOWED = read('src/lib/sci/windowed-commit.ts');
const EXECUTE = read('src/app/api/import/sci/execute-bulk/route.ts');
const MIGRATION = read('supabase/migrations/20260702_hf362_staged_batch_status.sql');

// ── PG-B1: the dynamic decision is real (behavioral) ────────────────────────────────────────────────────
test('PG-B1: shouldHandOff(estimatePulseTotal) — 85 rows commit synchronously, 86,607 rows hand off', () => {
  const BUDGET = Math.floor(0.8 * 40 * 1024 * 1024); // the HF-359 byte budget (0.8 × 40MB fallback)

  // an 85-row file (BCL): fits in ONE pulse → synchronous.
  const smallPulses = estimatePulseTotal(85, 600, BUDGET);
  assert.equal(smallPulses, 1, '85 rows estimate one pulse');
  assert.equal(shouldHandOff(smallPulses), false, '85-row file commits SYNCHRONOUSLY (no hand-off)');

  // an 86,607-row file (Casa Diaz, wide ERP rows): needs MANY pulses → hand off.
  const bigPulses = estimatePulseTotal(86607, 2000, BUDGET);
  assert.ok(bigPulses > 1, `86,607 rows estimate >1 pulse (got ${bigPulses})`);
  assert.equal(shouldHandOff(bigPulses), true, '86,607-row file HANDS OFF automatically');
});

test('PG-B1: the boundary is exactly "more than one pulse" — 1 pulse is sync, 2+ is hand off', () => {
  assert.equal(shouldHandOff(1), false);
  assert.equal(shouldHandOff(2), true);
  assert.equal(shouldHandOff(82), true);
});

test('PG-B4: NO new threshold — the decision derives from estimatePulseTotal + the byte budget', () => {
  // the only constant in the decision is "> 1" (more than one pass); no magic byte number is introduced.
  assert.ok(/return estTotalPulses > 1;/.test(read('src/lib/sci/pulse-budget.ts')), 'shouldHandOff = estTotalPulses > 1');
  // both drivers feed estimatePulseTotal into shouldHandOff — no separate threshold constant.
  assert.ok((WINDOWED.match(/const handOff = shouldHandOff\(estTotalPulses\);/g) ?? []).length === 2,
    'both drivers decide via shouldHandOff(estTotalPulses)');
  assert.ok(/estimatePulseTotal\(/.test(WINDOWED), 'estTotalPulses comes from estimatePulseTotal (the byte budget)');
});

// ── PG-A1 / PG-A3: the batch-creation fix (source-verified — commitContentUnit is not unit-isolatable) ──
test('PG-A1: the import_batches insert is ERROR-CHECKED and fails the commit cleanly (no orphan batchId)', () => {
  // the insert captures its error...
  assert.ok(/const \{ error: batchInsertErr \} = await supabase\.from\('import_batches'\)\.insert\(/.test(COMMIT),
    'the batch insert error is captured (was unchecked in HF-360)');
  // ...and a failure short-circuits with success:false (no orphan batchId returned to the manifest).
  assert.ok(/if \(batchInsertErr\) \{/.test(COMMIT), 'the insert error is handled');
  assert.ok(/import_batches insert failed/.test(COMMIT), 'the failure carries a clear reason');
  // the failure path returns success:false (so the driver/processX reports the unit failed, never enqueues).
  const idx = COMMIT.indexOf('if (batchInsertErr)');
  assert.ok(COMMIT.slice(idx, idx + 600).includes('success: false'), 'the insert-failure result is success:false');
});

test('PG-A1: the migration WIDENS import_batches_status_check to allow staged (preserving the four)', () => {
  assert.ok(/drop constraint if exists import_batches_status_check/i.test(MIGRATION), 'drops the old constraint');
  assert.ok(/check \(status in \('pending', 'processing', 'completed', 'failed', 'staged'\)\)/i.test(MIGRATION),
    'the new constraint includes staged AND the original four');
});

test('PG-A2: the worker lifecycle — staged → completed on success, staged → failed on error', () => {
  // success: the loaded pulse's batch becomes completed (existing).
  assert.ok(/update public\.import_batches set status = 'completed', row_count = v_count/.test(MIGRATION),
    'staged → completed on a successful load');
  // error + data-loss: the failed pulse's batch becomes failed (the HF-362 addition).
  assert.ok((MIGRATION.match(/update public\.import_batches set status = 'failed'/g) ?? []).length >= 2,
    'staged → failed on BOTH the load-error and data-loss paths');
});

test('PG-A3: the SYNCHRONOUS path is unchanged — status=processing, FK target created normally', () => {
  assert.ok(/status: params\.handOff \? 'staged' : 'processing'/.test(COMMIT),
    'synchronous commit still uses processing (only hand-off uses staged)');
  // the synchronous load path (RPC + completed-finalize) is untouched: it still calls bulk_commit_from_storage
  // inline and finalizes the batch to completed.
  assert.ok(/bulk_commit_from_storage/.test(COMMIT) && /status:\s*'completed'/.test(COMMIT),
    'the synchronous inline load + completed-finalize are intact');
});

// ── PG-B2 / PG-B3: behavioral equivalence + single path ─────────────────────────────────────────────────
test('PG-B2: byte-identical output — both branches build rows via the SAME commitContentUnit path', () => {
  // there is exactly ONE row builder (buildCommittedRow) + ONE CSV serializer (committedRowsCsvStream); the
  // hand-off branch returns BEFORE the RPC but builds the identical CSV. Neither branch has its own builder.
  assert.ok(/buildCommittedRow/.test(COMMIT) && /committedRowsCsvStream/.test(COMMIT), 'one shared row builder + CSV serializer');
  // the hand-off branch is an early return AFTER the upload — it does not re-serialize or alter the rows.
  assert.ok(/if \(params\.handOff\) \{[\s\S]*?stagedPulse:/.test(COMMIT), 'hand-off stages the already-built CSV (no separate row build)');
});

test('PG-B3: single path — the env-var mechanism is GONE; no second commit route', () => {
  // the static toggle is removed entirely.
  assert.ok(!/isPulseHandoffEnabled/.test(EXECUTE), 'execute-bulk no longer reads the env flag');
  assert.ok(!/PULSE_LOAD_HANDOFF\b/.test(EXECUTE.replace(/removed PULSE_LOAD_HANDOFF/g, '')), 'no PULSE_LOAD_HANDOFF read in execute-bulk');
  // the decision lives inside the ONE commit driver (a runtime branch), not a parallel commit function.
  assert.ok(/const handOff = shouldHandOff\(estTotalPulses\);/.test(WINDOWED), 'the branch point is inside the commit driver');
  // the enqueue is gated on staged pulses existing, not on a flag.
  assert.ok(/results\.filter\(\(r\) => r\.success\)\.flatMap\(\(r\) => r\.stagedPulses \?\? \[\]\)/.test(EXECUTE), 'enqueue collects staged pulses (no flag gate)');
});
