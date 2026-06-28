/**
 * HF-352 — server-issued confirmation challenge (I2). Runner: node --test --import tsx.
 * Sets a deterministic secret so the HMAC is reproducible in-process.
 */
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'hf352-test-secret';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { issueChallenge, verifyChallenge } from '../confirm-challenge';

const NOW = 1_700_000_000_000;

test('a freshly issued challenge verifies for the same action+tenant', () => {
  const { challenge } = issueChallenge('clean-slate', 'tenant-A', NOW);
  assert.equal(verifyChallenge('clean-slate', 'tenant-A', challenge, NOW), true);
});

test('challenge is bound to action AND tenant (no cross-use)', () => {
  const { challenge } = issueChallenge('clean-slate', 'tenant-A', NOW);
  assert.equal(verifyChallenge('delete-tenant', 'tenant-A', challenge, NOW), false, 'wrong action rejected');
  assert.equal(verifyChallenge('clean-slate', 'tenant-B', challenge, NOW), false, 'wrong tenant rejected');
});

test('challenge survives the 2-minute window and expires after', () => {
  const { challenge } = issueChallenge('delete-tenant', 'T', NOW);
  assert.equal(verifyChallenge('delete-tenant', 'T', challenge, NOW + 59_000), true, 'same minute');
  assert.equal(verifyChallenge('delete-tenant', 'T', challenge, NOW + 90_000), true, 'previous-bucket window');
  assert.equal(verifyChallenge('delete-tenant', 'T', challenge, NOW + 180_000), false, 'expired after ~2 min');
});

test('empty / malformed / tampered challenges are rejected (no bypass)', () => {
  assert.equal(verifyChallenge('clean-slate', 'T', '', NOW), false);
  assert.equal(verifyChallenge('clean-slate', 'T', 'x'.repeat(64), NOW), false);
  assert.equal(verifyChallenge('clean-slate', 'T', 'short', NOW), false);
  const { challenge } = issueChallenge('clean-slate', 'T', NOW);
  assert.equal(verifyChallenge('clean-slate', 'T', challenge.slice(0, 63) + '0', NOW), false, 'one-char tamper rejected');
});
