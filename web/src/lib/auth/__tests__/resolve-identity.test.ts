/**
 * HF-282 Phase 5.1 — resolveIdentity + tenant-gate deterministic tests.
 *
 * resolveIdentity: zero rows -> null; one row -> that row alias-normalized; two rows
 * (vl_admin older + platform newer = live platform@ shape) -> platform row; two rows
 * neither platform -> oldest; query error -> null. No single/maybeSingle anywhere.
 * tenant-gate: does not fire while loading; fires when hydration complete + no tenant.
 *
 * Runner: node --test --import tsx. (Anomaly logging is fire-and-forget and no-ops
 * without a service key in the test env; tests assert the resolution contract.)
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveIdentity } from '../resolve-identity';
import { shouldGateToSelectTenant } from '../tenant-gate';

// Mock SupabaseClient whose profiles query resolves to a fixed {data,error}.
function mockClient(result: { data: unknown[] | null; error: unknown }): SupabaseClient {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.order = () => chain;
  chain.limit = () => Promise.resolve(result);
  return { from: () => chain } as unknown as SupabaseClient;
}

const row = (o: Partial<Record<string, unknown>>) => ({
  id: 'id-x', auth_user_id: 'auth-1', tenant_id: null, display_name: 'X', email: 'x@y.z',
  role: 'platform', capabilities: [], locale: 'en', avatar_url: null, created_at: '2026-01-01T00:00:00Z', ...o,
});

test('HF-282: zero rows -> null', async () => {
  const r = await resolveIdentity(mockClient({ data: [], error: null }), 'auth-1');
  assert.equal(r, null);
});

test('HF-282: query error -> null', async () => {
  const r = await resolveIdentity(mockClient({ data: null, error: { message: 'boom' } }), 'auth-1');
  assert.equal(r, null);
});

test('HF-282: one row -> that row, role alias-normalized (vl_admin -> platform)', async () => {
  const r = await resolveIdentity(mockClient({ data: [row({ id: 'p1', role: 'vl_admin' })], error: null }), 'auth-1');
  assert.ok(r);
  assert.equal(r!.id, 'p1');
  assert.equal(r!.role, 'vl_admin');            // raw preserved
  assert.equal(r!.canonicalRole, 'platform');   // alias-normalized
});

test('HF-282: two rows (vl_admin older + platform newer = platform@ shape) -> platform row', async () => {
  // ordered ascending by created_at: vl_admin (03-05) first, platform (03-07) second
  const data = [
    row({ id: 'fd14-vladmin', role: 'vl_admin', created_at: '2026-03-05T04:21:40Z' }),
    row({ id: '9c17-platform', role: 'platform', created_at: '2026-03-07T14:20:20Z' }),
  ];
  const r = await resolveIdentity(mockClient({ data, error: null }), 'auth-1');
  assert.ok(r);
  assert.equal(r!.id, '9c17-platform', 'winner is the alias-normalized platform row, not the oldest');
  assert.equal(r!.canonicalRole, 'platform');
});

test('HF-282: two rows neither platform -> oldest (created_at ascending [0])', async () => {
  const data = [
    row({ id: 'old', role: 'tenant_admin', created_at: '2026-05-15T00:00:00Z' }),
    row({ id: 'new', role: 'tenant_admin', created_at: '2026-06-09T00:00:00Z' }),
  ];
  const r = await resolveIdentity(mockClient({ data, error: null }), 'auth-1');
  assert.ok(r);
  assert.equal(r!.id, 'old', 'no platform/manage_tenants row -> oldest wins');
  assert.equal(r!.canonicalRole, 'admin');  // tenant_admin -> admin
});

test('HF-282: manage_tenants capability wins when no platform-role row (DD-7 tiebreaker)', async () => {
  const data = [
    row({ id: 'plain', role: 'manager', capabilities: [], created_at: '2026-01-01T00:00:00Z' }),
    row({ id: 'caps', role: 'manager', capabilities: ['manage_tenants'], created_at: '2026-02-01T00:00:00Z' }),
  ];
  const r = await resolveIdentity(mockClient({ data, error: null }), 'auth-1');
  assert.equal(r!.id, 'caps');
});

// ── tenant-gate (HALT-3 behavior) ──
const base = { isLoading: false, tenantLoading: false, onMfaRoute: false, isAuthenticated: true, isVLAdmin: true, hasTenant: false, isTenantExempt: false };

test('HF-282: tenant gate does NOT fire while tenant hydration is loading', () => {
  assert.equal(shouldGateToSelectTenant({ ...base, tenantLoading: true }), false);
  assert.equal(shouldGateToSelectTenant({ ...base, isLoading: true }), false);
});

test('HF-282: tenant gate fires when hydration complete + platform admin + no tenant', () => {
  assert.equal(shouldGateToSelectTenant(base), true);
});

test('HF-282: tenant gate does NOT fire when a tenant is selected (DD-7)', () => {
  assert.equal(shouldGateToSelectTenant({ ...base, hasTenant: true }), false);
});

test('HF-282: tenant gate does NOT fire on exempt route or MFA route or non-admin', () => {
  assert.equal(shouldGateToSelectTenant({ ...base, isTenantExempt: true }), false);
  assert.equal(shouldGateToSelectTenant({ ...base, onMfaRoute: true }), false);
  assert.equal(shouldGateToSelectTenant({ ...base, isVLAdmin: false }), false);
});
