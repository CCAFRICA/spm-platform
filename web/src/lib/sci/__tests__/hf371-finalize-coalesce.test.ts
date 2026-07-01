/**
 * HF-371 O1/Root-1 — deterministic single finalize. The claim decision core: exactly one concurrent
 * pass per (tenant, proposal) runs; duplicates coalesce; stale/failed claims are retryable; a 'done'
 * claim coalesces; the claim degrades gracefully when the table is absent (migration pending).
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { decideFinalizeClaim, finalizeClaimKey, STALE_CLAIM_MS } from '../finalize-coalesce';

const NOW = 1_000_000_000_000;
const iso = (ms: number) => new Date(ms).toISOString();

test('HF-371: first caller (insert succeeded) is granted', () => {
  assert.equal(decideFinalizeClaim(undefined, null, NOW).granted, true);
});

test('HF-371: claim table absent (42P01, migration pending) → granted, proceeds on idempotency', () => {
  const d = decideFinalizeClaim('42P01', null, NOW);
  assert.equal(d.granted, true);
  assert.match(d.reason, /migration pending/);
});

test('HF-371: concurrent duplicate of a FRESH running claim → coalesced (no-op)', () => {
  const d = decideFinalizeClaim('23505', { status: 'running', claimed_at: iso(NOW - 5_000) }, NOW);
  assert.equal(d.granted, false);
  assert.match(d.reason, /in flight/);
});

test('HF-371: duplicate of a STALE running claim (crashed pass) → taken over (retry)', () => {
  const d = decideFinalizeClaim('23505', { status: 'running', claimed_at: iso(NOW - STALE_CLAIM_MS - 1000) }, NOW);
  assert.equal(d.granted, true);
  assert.match(d.reason, /stale/);
});

test('HF-371: duplicate of a FAILED claim → retried', () => {
  assert.equal(decideFinalizeClaim('23505', { status: 'failed', claimed_at: iso(NOW - 1000) }, NOW).granted, true);
});

test('HF-371: duplicate of a DONE claim → coalesced (import already finalized)', () => {
  const d = decideFinalizeClaim('23505', { status: 'done', claimed_at: iso(NOW - 1000) }, NOW);
  assert.equal(d.granted, false);
  assert.match(d.reason, /already finalized/);
});

test('HF-371: duplicate but the claim row vanished → granted (proceed)', () => {
  assert.equal(decideFinalizeClaim('23505', null, NOW).granted, true);
});

test('HF-371: any other insert error → granted (never block the import on the claim)', () => {
  assert.equal(decideFinalizeClaim('40001', null, NOW).granted, true);
});

test('HF-371: claim key coalesces the double-fire for ONE import (same proposalId); falls back to tenant', () => {
  assert.equal(finalizeClaimKey('prop-abc'), 'prop-abc');
  assert.equal(finalizeClaimKey(''), '__tenant__');
  assert.equal(finalizeClaimKey(null), '__tenant__');
  assert.equal(finalizeClaimKey(undefined), '__tenant__');
});
