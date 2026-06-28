/**
 * OB-252 — entitlement → capability → menu loop (deterministic, zero LLM). Runner: node --test.
 *
 * Proof gates:
 *  - PG-5/PG-6  : toggling an agent OFF/ON removes/restores its workspace (canAccessWorkspace).
 *  - PG-7       : Platform Core is never in the toggleable set (always-on; cannot be toggled off).
 *  - PG-13      : tenants.features is the single source of truth (the toggle keys derive from it).
 *  - PG-14      : the resolution path is pure boolean/structural — exercised here with no async/LLM.
 *  - DS-014 §9  : role capabilities ∩ tenant entitlement (tenantEntitlementRevocations).
 *  - Non-regression: default-ON for core agents (absent key → entitled) so existing tenants keep them.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isFeatureEnabled, isEntitledByDefault } from '@/lib/tenant/feature-flags';
import { getToggleableAgents, toggleableFeatureKeys, tenantEntitlementRevocations } from '../workspace-config';
import { canAccessWorkspace, getAccessibleWorkspaces } from '../role-workspaces';
import { hasCapability, getCapabilities } from '@/lib/auth/permissions';

test('isFeatureEnabled: default-ON core agents (absent key → entitled), default-OFF licensable', () => {
  // Core agents — entitled by default (DEFAULT_FEATURES.performance / .compensation = true).
  assert.equal(isFeatureEnabled({}, 'performance'), true, 'Intelligence default on');
  assert.equal(isFeatureEnabled({}, 'compensation'), true, 'Compensation default on');
  assert.equal(isFeatureEnabled(undefined, 'compensation'), true, 'null features → default on');
  // Licensable — off by default.
  assert.equal(isFeatureEnabled({}, 'financial'), false, 'Finance default off');
  assert.equal(isFeatureEnabled({}, 'prism_enabled'), false, 'PRISM default off');
  // Explicit value always wins both ways.
  assert.equal(isFeatureEnabled({ compensation: false }, 'compensation'), false, 'explicit off wins');
  assert.equal(isFeatureEnabled({ financial: true }, 'financial'), true, 'explicit on wins');
  // Unknown key → fail-closed.
  assert.equal(isFeatureEnabled({}, 'not_a_feature'), false);
});

test('PG-7/PG-13: toggleable agents derive structurally from workspace featureFlags; Platform Core excluded', () => {
  const keys = toggleableFeatureKeys().sort();
  assert.deepEqual(keys, ['compensation', 'financial', 'performance', 'prism_enabled'].sort(),
    'exactly the four agents that declare a featureFlag');
  const agents = getToggleableAgents();
  // Platform Core has no featureFlag → never appears (PG-7: cannot be toggled off).
  assert.ok(!agents.some((a) => a.workspaceId === 'platform-core'), 'Platform Core not toggleable');
  // entitledByDefault mirrors DEFAULT_FEATURES.
  const byKey = Object.fromEntries(agents.map((a) => [a.featureKey, a.entitledByDefault]));
  assert.equal(byKey['performance'], true);
  assert.equal(byKey['compensation'], true);
  assert.equal(byKey['financial'], false);
  assert.equal(byKey['prism_enabled'], false);
  assert.equal(isEntitledByDefault('performance'), true);
});

test('PG-5/PG-6: toggling Compensation OFF hides the calculate workspace; ON restores it (admin)', () => {
  // default (absent key) → visible (non-regression for existing tenants)
  assert.ok(getAccessibleWorkspaces('admin', {}).includes('calculate'), 'default-on: calculate visible');
  // explicit OFF → hidden (PG-5)
  assert.equal(canAccessWorkspace('admin', 'calculate', { compensation: false }), false, 'PG-5 off → hidden');
  assert.ok(!getAccessibleWorkspaces('admin', { compensation: false }).includes('calculate'));
  // explicit ON → visible (PG-6)
  assert.equal(canAccessWorkspace('admin', 'calculate', { compensation: true }), true, 'PG-6 on → visible');
});

test('PG-5/PG-6: toggling Intelligence OFF hides the decide workspace; default keeps it', () => {
  assert.ok(getAccessibleWorkspaces('admin', {}).includes('decide'), 'default-on: Intelligence visible');
  assert.equal(canAccessWorkspace('admin', 'decide', { performance: false }), false, 'off → hidden');
  assert.equal(canAccessWorkspace('admin', 'decide', { performance: true }), true, 'on → visible');
});

test('Platform Core is always accessible regardless of feature flags (PG-7)', () => {
  assert.equal(canAccessWorkspace('admin', 'platform-core', {}), true);
  assert.equal(canAccessWorkspace('admin', 'platform-core', { compensation: false, performance: false, financial: false, prism_enabled: false }), true);
});

test('DS-014 §9: capability ∩ entitlement — Compensation OFF revokes icm.* but NOT shared caps', () => {
  const rev = tenantEntitlementRevocations({ compensation: false });
  // icm.* is owned ONLY by the calculate workspace → revoked when Compensation is off.
  assert.equal(hasCapability('admin', 'icm.configure_plans', rev), false, 'icm.* cannot be held without Compensation');
  assert.equal(hasCapability('admin', 'data.calculate', rev), false, 'data.calculate revoked');
  assert.equal(hasCapability('admin', 'data.reconcile', rev), false, 'data.reconcile revoked');
  // data.import is shared with Platform Core (always entitled) → NEVER revoked.
  assert.equal(hasCapability('admin', 'data.import', rev), true, 'shared data.import retained');
  // view.team_results is shared with Intelligence (default-on) → retained.
  assert.equal(hasCapability('admin', 'view.team_results', rev), true, 'shared view.team_results retained');
  // Platform-owner caps untouched.
  assert.equal(hasCapability('admin', 'tenant.manage_users', rev), true);
  assert.equal(hasCapability('admin', 'view.audit_trail', rev), true);
});

test('DS-014 §9: a fully default tenant ({}) revokes NOTHING (all licensable caps are shared)', () => {
  const rev = tenantEntitlementRevocations({});
  // financial/prism are off by default, but their caps (view.team_results, data.import) are shared
  // with entitled workspaces, so nothing is revoked for a default tenant.
  assert.deepEqual(rev, {}, 'no revocations for a default tenant');
  assert.equal(hasCapability('admin', 'icm.configure_plans', rev), true);
  assert.equal(hasCapability('manager', 'view.team_results', rev), true);
});

test('DS-014 §9: revocation applies across ALL roles (a de-entitled agent cap is held by no one)', () => {
  const rev = tenantEntitlementRevocations({ compensation: false });
  // manager normally holds data.approve_results (a calculate-exclusive cap) — revoked too.
  assert.equal(getCapabilities('manager', rev).has('data.approve_results'), false);
  assert.equal(getCapabilities('admin', rev).has('icm.simulate'), false);
});
