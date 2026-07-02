/**
 * HF-373 Phase F (D7) — truthful terminal job state: phase rank guard + commit-stage
 * failure predicate (shared by the outcome-aware stamp and the requeue gate).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phaseMayAdvance, statusMayAdvance, isCommitStageFailure } from '../job-status';

test('phase rank: a terminal failed phase is never overwritten by a non-failed phase', () => {
  assert.equal(phaseMayAdvance('failed', 'completed'), false);
  assert.equal(phaseMayAdvance('failed', 'finalizing'), false);
  assert.equal(phaseMayAdvance('failed', 'failed'), false); // no-op, nothing to advance
  assert.equal(phaseMayAdvance('cancelled', 'completed'), false);
});

test('phase rank: phases only advance — a late duplicate writer cannot regress the record', () => {
  // the observed stuck shape: status finalized + a late "finalizing" landing over "completed"
  assert.equal(phaseMayAdvance('completed', 'finalizing'), false);
  assert.equal(phaseMayAdvance('finalizing', 'completed'), true);
  assert.equal(phaseMayAdvance('committing', 'loading'), true);
  assert.equal(phaseMayAdvance('loading', 'committing'), false);
  assert.equal(phaseMayAdvance(null, 'committing'), true);
  // a genuine failure may always terminalize a live phase
  assert.equal(phaseMayAdvance('finalizing', 'failed'), true);
  assert.equal(phaseMayAdvance('completed', 'failed'), true);
});

test('status rank preserved: finalized can never overwrite failed (HF-372 model unchanged)', () => {
  assert.equal(statusMayAdvance('failed', 'finalized'), false);
  assert.equal(statusMayAdvance('committed', 'finalized'), true);
  assert.equal(statusMayAdvance('finalized', 'failed'), false);
});

test('isCommitStageFailure: keyed on our own writers\' structural markers, never prose', () => {
  // the live 86K job's exact shape
  assert.equal(isCommitStageFailure('failed', 'completed', 'Commit failed — Abril...xlsx::Exportar Hoja de Trabajo::0: commit CSV upload failed'), true);
  assert.equal(isCommitStageFailure('failed', 'failed', null), true);
  assert.equal(isCommitStageFailure('failed', null, 'Commit error — TypeError: fetch failed'), true);
  assert.equal(isCommitStageFailure('failed', null, 'Hand-off enqueue failed — staged rows were not handed to the loader (re-import to retry).'), true);
  // classify-stage failures stay requeue-eligible
  assert.equal(isCommitStageFailure('failed', null, 'LLM comprehension timed out'), false);
  assert.equal(isCommitStageFailure('failed', 'classifying', null), false);
  // prose mentioning the words mid-string must NOT match (prefix-anchored mechanical marker)
  assert.equal(isCommitStageFailure('failed', null, 'worker crashed before Commit failed could be recorded'), false);
});
