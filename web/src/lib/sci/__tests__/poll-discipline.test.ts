/**
 * HF-356 (I8) — client poll/retry discipline. Runner: node --test --import tsx.
 *
 * Proves the one shared rule every import poller now obeys: 401/403 stops; 5xx/network backs off
 * exponentially and stops after the cap; 2xx resets the streak. This is what breaks the retry storm.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  pollDecision, newPollState, POLL_MAX_SERVER_ERRORS, POLL_BACKOFF_CEILING_MS,
  POLL_UNAUTHORIZED_MESSAGE, POLL_SERVER_GAVE_UP_MESSAGE,
} from '../poll-discipline';

const BASE = 2000;

test('401 and 403 stop the poller immediately (auth does not self-heal)', () => {
  for (const status of [401, 403]) {
    const v = pollDecision(newPollState(), { ok: false, status }, BASE);
    assert.equal(v.action, 'stop');
    assert.equal(v.action === 'stop' && v.reason, 'unauthorized');
    assert.equal(v.action === 'stop' && v.message, POLL_UNAUTHORIZED_MESSAGE);
  }
});

test('2xx keeps polling at the base cadence and resets any prior streak', () => {
  const s = newPollState();
  s.serverErrors = 2;
  const v = pollDecision(s, { ok: true, status: 200 }, BASE);
  assert.deepEqual(v, { action: 'continue', delayMs: BASE });
  assert.equal(s.serverErrors, 0);
});

test('non-auth 4xx (404/409 — resource not ready) keeps polling at base cadence', () => {
  for (const status of [404, 409]) {
    const v = pollDecision(newPollState(), { ok: false, status }, BASE);
    assert.deepEqual(v, { action: 'continue', delayMs: BASE });
  }
});

test('5xx backs off exponentially, then STOPS exactly at the cap', () => {
  const s = newPollState();
  const delays: number[] = [];
  let stoppedAt = -1;
  for (let i = 1; i <= POLL_MAX_SERVER_ERRORS; i++) {
    const v = pollDecision(s, { ok: false, status: 503 }, BASE);
    if (v.action === 'continue') delays.push(v.delayMs);
    else { stoppedAt = i; assert.equal(v.reason, 'server'); assert.equal(v.message, POLL_SERVER_GAVE_UP_MESSAGE); }
  }
  // First (POLL_MAX_SERVER_ERRORS - 1) attempts back off; the cap-th stops.
  assert.equal(stoppedAt, POLL_MAX_SERVER_ERRORS);
  assert.deepEqual(delays, [BASE * 2, BASE * 4]); // 2^1, 2^2 for cap=3
});

test('network errors count the same as 5xx toward the cap', () => {
  const s = newPollState();
  assert.equal(pollDecision(s, { ok: false, networkError: true }, BASE).action, 'continue');
  assert.equal(pollDecision(s, { ok: false, networkError: true }, BASE).action, 'continue');
  assert.equal(pollDecision(s, { ok: false, networkError: true }, BASE).action, 'stop');
});

test('a recovered 2xx between errors clears the streak so the cap measures CONSECUTIVE failures', () => {
  const s = newPollState();
  pollDecision(s, { ok: false, status: 500 }, BASE); // 1
  pollDecision(s, { ok: true, status: 200 }, BASE);  // reset
  assert.equal(pollDecision(s, { ok: false, status: 500 }, BASE).action, 'continue'); // 1 again, not 2
  assert.equal(s.serverErrors, 1);
});

test('backoff is capped at the ceiling', () => {
  const s = newPollState();
  // A large base would exceed the ceiling on the first backoff — it must clamp.
  const v = pollDecision(s, { ok: false, status: 500 }, 60_000);
  assert.equal(v.action === 'continue' && v.delayMs, POLL_BACKOFF_CEILING_MS);
});
