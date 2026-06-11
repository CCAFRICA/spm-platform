/**
 * HF-284 A1.2 — error split: session-absent vs profile-missing are distinct.
 *
 * classifyProfileFetch is the pure core of fetchCurrentProfile (testable without a
 * live Supabase client): no user -> SESSION_ABSENT (session absent), user + no
 * identity -> null (profile-missing / zero-rows), user + identity -> AuthProfile.
 *
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { classifyProfileFetch, SESSION_ABSENT } from '../auth-service';
import type { ResolvedIdentity } from '@/lib/auth/resolve-identity';

const identity: ResolvedIdentity = {
  id: 'p1',
  authUserId: 'auth-1',
  tenantId: 't1',
  displayName: 'Carlos',
  email: 'admin@saborgrupo.mx',
  role: 'admin',
  canonicalRole: null,
  capabilities: ['admin'],
  locale: 'es-MX',
  avatarUrl: null,
};

test('getUser-null -> SESSION_ABSENT (NOT profile-missing null)', () => {
  assert.equal(classifyProfileFetch(null, identity), SESSION_ABSENT);
  assert.equal(classifyProfileFetch(undefined, null), SESSION_ABSENT);
  // The critical distinction: session-absent must NOT collapse to the null
  // (profile-missing) branch that the login surface labels "profile is missing".
  assert.notEqual(classifyProfileFetch(null, identity), null);
});

test('user present + identity null -> null (profile-missing / zero-rows)', () => {
  assert.equal(classifyProfileFetch({ id: 'auth-1' }, null), null);
});

test('user + identity -> mapped AuthProfile', () => {
  const p = classifyProfileFetch({ id: 'auth-1' }, identity);
  assert.notEqual(p, SESSION_ABSENT);
  assert.notEqual(p, null);
  assert.deepEqual(p, {
    id: 'p1',
    authUserId: 'auth-1',
    tenantId: 't1',
    displayName: 'Carlos',
    email: 'admin@saborgrupo.mx',
    role: 'admin',
    capabilities: ['admin'],
    locale: 'es-MX',
    avatarUrl: null,
  });
});
