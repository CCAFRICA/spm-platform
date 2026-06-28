/**
 * OB-250 — the PRISM capability predicate. Runner: node --test --import tsx.
 * I1 (single read) + I9 (off by default) + §1.7 nesting default.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PRISM_FEATURE_KEY, isPrismEnabled, getPrismScanMode } from '../capability';

test('PRISM_FEATURE_KEY is the single canonical key', () => {
  assert.equal(PRISM_FEATURE_KEY, 'prism_enabled');
});

test('isPrismEnabled: true only when the flag is === true (off by default / fail-closed, I9)', () => {
  assert.equal(isPrismEnabled({ prism_enabled: true }), true);
  assert.equal(isPrismEnabled({ prism_enabled: false }), false);
  assert.equal(isPrismEnabled({}), false);            // absent key → off (no DDL needed)
  assert.equal(isPrismEnabled(null), false);
  assert.equal(isPrismEnabled(undefined), false);
  assert.equal(isPrismEnabled({ prism_enabled: 'true' } as unknown as Record<string, unknown>), false); // not a boolean true
  assert.equal(isPrismEnabled({ financial: true }), false); // a different flag does not enable PRISM
});

test('getPrismScanMode: nested under settings.prism, default enforce (byte-identical, §1.7)', () => {
  assert.equal(getPrismScanMode(null), 'enforce');
  assert.equal(getPrismScanMode({}), 'enforce');
  assert.equal(getPrismScanMode({ prism: {} }), 'enforce');
  assert.equal(getPrismScanMode({ prism: { mode: 'interim' } }), 'interim');
  assert.equal(getPrismScanMode({ prism: { mode: 'garbage' } }), 'enforce'); // unknown → enforce
});
