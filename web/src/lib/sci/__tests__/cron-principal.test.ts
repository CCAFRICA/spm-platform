/**
 * HF-356 (RC2) — the internal/cron principal gate. Runner: node --test --import tsx.
 *
 * Proves the worker accepts the trusted cron caller (the bug: it 401'd every cron-fired job) and rejects
 * an anonymous one once CRON_SECRET is set, and that the dispatcher forwards the matching credential.
 */
import { test, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { isInternalCronCaller, internalCronHeaders } from '../cron-principal';

// Minimal NextRequest-shaped stub: only .headers.get is consulted by the gate.
const reqWith = (headers: Record<string, string>) =>
  ({ headers: { get: (name: string) => headers[name.toLowerCase()] ?? null } } as unknown as import('next/server').NextRequest);

const ORIGINAL = process.env.CRON_SECRET;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL;
});

test('dev (CRON_SECRET unset): any caller is accepted and no credential is forwarded', () => {
  delete process.env.CRON_SECRET;
  assert.equal(isInternalCronCaller(reqWith({})), true);
  assert.deepEqual(internalCronHeaders(), {});
});

test('prod (CRON_SECRET set): matching bearer is accepted', () => {
  process.env.CRON_SECRET = 's3cr3t';
  assert.equal(isInternalCronCaller(reqWith({ authorization: 'Bearer s3cr3t' })), true);
});

test('prod: the x-vercel-cron header (Vercel scheduled invocation) is accepted', () => {
  process.env.CRON_SECRET = 's3cr3t';
  assert.equal(isInternalCronCaller(reqWith({ 'x-vercel-cron': '1' })), true);
});

test('prod: anonymous / wrong-secret callers are rejected', () => {
  process.env.CRON_SECRET = 's3cr3t';
  assert.equal(isInternalCronCaller(reqWith({})), false);
  assert.equal(isInternalCronCaller(reqWith({ authorization: 'Bearer wrong' })), false);
  assert.equal(isInternalCronCaller(reqWith({ authorization: 's3cr3t' })), false); // missing "Bearer "
});

test('prod: the dispatcher forwards exactly the bearer the worker expects (round-trip)', () => {
  process.env.CRON_SECRET = 's3cr3t';
  const forwarded = internalCronHeaders();
  assert.deepEqual(forwarded, { Authorization: 'Bearer s3cr3t' });
  // The worker, given the dispatcher's forwarded header, accepts it.
  assert.equal(isInternalCronCaller(reqWith({ authorization: forwarded.Authorization })), true);
});
