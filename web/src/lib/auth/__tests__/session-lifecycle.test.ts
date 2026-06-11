/**
 * HF-284 A1 — session-ownership lifecycle tests (replaces the withdrawn clamp tests).
 *
 * Runner: node --test --import tsx. The residue signal is session IDENTITY, not age:
 * (a) stale cookies + new/absent sid -> reinit, NO kill (the login bug)
 * (b) sid-matched + last-activity 40m stale -> idle kill PRESERVED (token freshness irrelevant)
 * (c) sid-matched + session-start >8h -> absolute kill PRESERVED (despite recent iat)
 * (d) cookies absent entirely -> initialized (reinit), no kill
 * (e) legacy untagged cookies -> reinit, no kill (migration case)
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveSessionOwnership, decodeJwtSessionId, type SessionLimits } from '../session-lifecycle';

const LIMITS: SessionLimits = {
  IDLE_TIMEOUT_MS: 30 * 60 * 1000, // 30 min
  ABSOLUTE_TIMEOUT_MS: 8 * 60 * 60 * 1000, // 8 h
};
const NOW = 1_700_000_000_000;
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const SID_A = 'sid-aaaaaaaa';
const SID_NEW = 'sid-nnnnnnnn';

// Helper: what the OLD raw logic (pre-A1) would have decided — for fail-before proof.
function rawWouldKill(sessionStart: number, lastActivity: number): 'expired_absolute' | 'expired_idle' | 'pass' {
  if (NOW - sessionStart > LIMITS.ABSOLUTE_TIMEOUT_MS) return 'expired_absolute';
  if (NOW - lastActivity > LIMITS.IDLE_TIMEOUT_MS) return 'expired_idle';
  return 'pass';
}

// ── (a) the login bug: stale cookies from a prior session, new sign-in (new sid) ──
test('(a) stale residue + MISMATCHED sid -> reinit, NO kill', () => {
  const staleStart = NOW - 9 * HOUR;     // > 8h: raw absolute would kill
  const staleActivity = NOW - 40 * MIN;  // > 30m: raw idle would kill

  // fail-before: the raw check WOULD have killed the fresh session.
  assert.equal(rawWouldKill(staleStart, staleActivity), 'expired_absolute');

  // pass-after: ownership reinitializes instead of killing.
  const r = resolveSessionOwnership({
    now: NOW,
    sessionStartCookie: String(staleStart),
    lastActivityCookie: String(staleActivity),
    sidCookie: SID_A,        // prior session's tag
    tokenSessionId: SID_NEW, // this request's token = a NEW session
    limits: LIMITS,
  });
  assert.equal(r.action, 'reinit');
  assert.equal(r.reinit, true);
  assert.equal(r.hadPrior, true);
  assert.equal(r.priorSessionStartAgeMs, 9 * HOUR);
  assert.equal(r.priorLastActivityAgeMs, 40 * MIN);
});

test('(a2) stale residue + ABSENT sid -> reinit, NO kill', () => {
  const staleStart = NOW - 9 * HOUR;
  const staleActivity = NOW - 40 * MIN;
  const r = resolveSessionOwnership({
    now: NOW,
    sessionStartCookie: String(staleStart),
    lastActivityCookie: String(staleActivity),
    sidCookie: undefined,    // never tagged
    tokenSessionId: SID_NEW,
    limits: LIMITS,
  });
  assert.equal(r.action, 'reinit');
  assert.equal(r.hadPrior, true);
});

// ── (b) idle expiry preserved within an owned session (token freshness irrelevant) ──
test('(b) sid MATCH + last-activity 40m stale -> idle kill PRESERVED', () => {
  const r = resolveSessionOwnership({
    now: NOW,
    sessionStartCookie: String(NOW - 1 * HOUR), // within 8h
    lastActivityCookie: String(NOW - 40 * MIN), // > 30m idle
    sidCookie: SID_A,
    tokenSessionId: SID_A, // matched — even with a freshly refreshed token, sid is stable
    limits: LIMITS,
  });
  assert.equal(r.action, 'expired_idle');
  assert.equal(r.reinit, false);
});

// ── (c) absolute expiry preserved within an owned session (despite recent iat) ──
test('(c) sid MATCH + session-start >8h -> absolute kill PRESERVED', () => {
  const r = resolveSessionOwnership({
    now: NOW,
    sessionStartCookie: String(NOW - 9 * HOUR), // > 8h absolute
    lastActivityCookie: String(NOW - 1 * MIN),  // active
    sidCookie: SID_A,
    tokenSessionId: SID_A,
    limits: LIMITS,
  });
  assert.equal(r.action, 'expired_absolute');
  assert.equal(r.reinit, false);
});

// ── (d) cookies absent entirely -> initialized, no kill ──
test('(d) all cookies absent -> reinit (init), no kill, hadPrior false', () => {
  const r = resolveSessionOwnership({
    now: NOW,
    sessionStartCookie: undefined,
    lastActivityCookie: undefined,
    sidCookie: undefined,
    tokenSessionId: SID_NEW,
    limits: LIMITS,
  });
  assert.equal(r.action, 'reinit');
  assert.equal(r.hadPrior, false);
  assert.equal(r.priorSessionStartAgeMs, null);
  assert.equal(r.priorLastActivityAgeMs, null);
});

// ── (e) legacy untagged cookies (timestamps present, no sid) -> reinit, no kill ──
test('(e) legacy untagged cookies -> reinit, no kill', () => {
  const r = resolveSessionOwnership({
    now: NOW,
    sessionStartCookie: String(NOW - 2 * HOUR),
    lastActivityCookie: String(NOW - 5 * MIN),
    sidCookie: undefined, // legacy: never tagged
    tokenSessionId: SID_A,
    limits: LIMITS,
  });
  assert.equal(r.action, 'reinit');
  assert.equal(r.hadPrior, true);
});

// ── owned + alive -> pass (no kill, no reinit) ──
test('owned + within both windows -> pass', () => {
  const r = resolveSessionOwnership({
    now: NOW,
    sessionStartCookie: String(NOW - 1 * HOUR),
    lastActivityCookie: String(NOW - 2 * MIN),
    sidCookie: SID_A,
    tokenSessionId: SID_A,
    limits: LIMITS,
  });
  assert.equal(r.action, 'pass');
  assert.equal(r.reinit, false);
});

// ── decodeJwtSessionId ──
test('decodeJwtSessionId extracts session_id; null on malformed/absent', () => {
  const b64url = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const token = `header.${b64url({ session_id: 'sid-xyz', iat: 1 })}.sig`;
  assert.equal(decodeJwtSessionId(token), 'sid-xyz');
  assert.equal(decodeJwtSessionId(`header.${b64url({ iat: 1 })}.sig`), null); // no session_id claim
  assert.equal(decodeJwtSessionId(null), null);
  assert.equal(decodeJwtSessionId(undefined), null);
  assert.equal(decodeJwtSessionId('not-a-jwt'), null);
});
