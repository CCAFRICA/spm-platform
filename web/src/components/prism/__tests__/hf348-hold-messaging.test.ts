import { test } from 'node:test';
import assert from 'node:assert';
import { stateSummary, holdKind } from '@/components/prism/prism-status';

// HF-348 — a held file's two verdicts must read very differently and from the RECORDED
// verdict (not the filename): error = our scanner (temporary, "Under review"); infected =
// the file (rejected, "Not accepted").

test('HF-348: only a KNOWN-infected verdict reads as a rejection; everything else is "Under review"', () => {
  assert.equal(holdKind('infected'), 'infected');
  assert.equal(holdKind('error'), 'error');
  // Never falsely reject a good file: unknown/raced/unrecorded → Under review (UX-only; bytes held regardless).
  assert.equal(holdKind(null), 'error');
  assert.equal(holdKind(undefined), 'error');
  assert.equal(holdKind('timeout'), 'error');
});

test('HF-348: scan ERROR → "Under review" (calm/warning), NEVER framed as a rejection', () => {
  const s = stateSummary('infected_held', 'customer', 'error');
  assert.equal(s.label, 'Under review');
  assert.equal(s.tone, 'warning');
  assert.match(s.message, /expert will review/i);
  assert.doesNotMatch(s.message, /couldn't accept|threat|reject|not accepted/i);
});

test('HF-348: INFECTED → "Not accepted" (danger) with a proximate action', () => {
  const s = stateSummary('infected_held', 'customer', 'infected');
  assert.equal(s.label, 'Not accepted');
  assert.equal(s.tone, 'danger');
  assert.match(s.message, /upload a clean copy/i);
});

test('HF-348: operator gets the same two distinct verdict labels (honest for everyone)', () => {
  assert.equal(stateSummary('infected_held', 'operator', 'error').label, 'Under review');
  assert.equal(stateSummary('infected_held', 'operator', 'infected').label, 'Not accepted');
});

test('HF-348: non-held states unchanged (clean/promoted still "Cleared"/"Promoted")', () => {
  assert.equal(stateSummary('promoted', 'customer').label, 'Promoted');
  assert.equal(stateSummary('promoted', 'customer').tone, 'success');
  assert.equal(stateSummary('scanning', 'customer').tone, 'info');
});
