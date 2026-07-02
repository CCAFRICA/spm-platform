/**
 * HF-373 Phase D (D9) — single-fire commit dispatch decision core + generation-aware
 * finalize coalesce. Pure decision functions; no DB.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideCommitClaim, commitScopeHash, STALE_COMMIT_CLAIM_MS } from '../commit-coalesce';
import { decideFinalizeClaim } from '../finalize-coalesce';

const NOW = 1_800_000_000_000;
const iso = (ms: number) => new Date(ms).toISOString();

test('commit claim: first caller is granted', () => {
  const d = decideCommitClaim(undefined, null, NOW);
  assert.equal(d.granted, true);
});

test('commit claim: CONCURRENT duplicate of the same work coalesces loudly (inFlight)', () => {
  const d = decideCommitClaim('23505', { status: 'running', claimed_at: iso(NOW - 30_000) }, NOW);
  assert.equal(d.granted, false);
  assert.equal(d.inFlight, true);
});

test('commit claim: a re-POST after the prior pass finished is GRANTED (HF-296 recovery preserved; resume machinery no-ops it)', () => {
  const d = decideCommitClaim('23505', { status: 'done', claimed_at: iso(NOW - 60_000) }, NOW);
  assert.equal(d.granted, true);
  assert.match(d.reason, /resume idempotency/);
});

test('commit claim: failed prior pass is retryable; stale running claim is taken over; missing table degrades', () => {
  assert.equal(decideCommitClaim('23505', { status: 'failed', claimed_at: iso(NOW - 5_000) }, NOW).granted, true);
  assert.equal(decideCommitClaim('23505', { status: 'running', claimed_at: iso(NOW - STALE_COMMIT_CLAIM_MS - 1_000) }, NOW).granted, true);
  assert.equal(decideCommitClaim('42P01', null, NOW).granted, true);
});

test('commit scope: same units (any order) share a scope; different file groups never contend', () => {
  const a = commitScopeHash(['f.xlsx::A::0', 'f.xlsx::B::1']);
  const b = commitScopeHash(['f.xlsx::B::1', 'f.xlsx::A::0']);
  const c = commitScopeHash(['g.xlsx::C::0']);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('finalize claim: a done claim STILL coalesces when no batch landed after it (HF-371 behavior preserved)', () => {
  const d = decideFinalizeClaim('23505', { status: 'done', claimed_at: iso(NOW - 60_000) }, NOW, NOW - 120_000);
  assert.equal(d.granted, false);
  const dNull = decideFinalizeClaim('23505', { status: 'done', claimed_at: iso(NOW - 60_000) }, NOW, null);
  assert.equal(dNull.granted, false);
});

test('finalize claim: GENERATION TAKEOVER — a done claim yields when batches landed after it (the 2026-07-02 pre-data-finalize shape)', () => {
  // Claim completed at T-4min (the plan-arm premature pass); data batches landed T-30s.
  const d = decideFinalizeClaim('23505', { status: 'done', claimed_at: iso(NOW - 240_000) }, NOW, NOW - 30_000);
  assert.equal(d.granted, true);
  assert.match(d.reason, /generation takeover/);
});

test('finalize claim: running-fresh still coalesces; running-stale still takes over (unchanged)', () => {
  assert.equal(decideFinalizeClaim('23505', { status: 'running', claimed_at: iso(NOW - 10_000) }, NOW, NOW).granted, false);
  assert.equal(decideFinalizeClaim('23505', { status: 'running', claimed_at: iso(NOW - 16 * 60_000) }, NOW, null).granted, true);
});
