import { test } from 'node:test';
import assert from 'node:assert';
import { getCapabilities, hasCapability, resolveRole, canAccessWorkspace, type Capability } from '@/lib/auth/permissions';
import { landingPathForRole } from '@/lib/auth/landing';

// OB-247 DS-032 Slice A — the CDA persona falls out of the EXISTING RBAC primitives.

test('cda is a canonical role (resolveRole)', () => {
  assert.equal(resolveRole('cda'), 'cda');
});

test('gate 2: cda has EXACTLY {data.upload, view.own_uploads} and nothing else', () => {
  const caps = Array.from(getCapabilities('cda')).sort();
  assert.deepEqual(caps, ['data.upload', 'view.own_uploads']);
});

test('gate 2: cda has NO operator capabilities', () => {
  const operatorCaps: Capability[] = [
    'data.import',
    'data.calculate',
    'data.approve_results',
    'view.intelligence_stream',
    'view.all_results',
    'icm.configure_plans',
    'platform.system_config',
    'tenant.manage_users',
  ];
  for (const cap of operatorCaps) {
    assert.equal(hasCapability('cda', cap), false, `cda must NOT have ${cap}`);
  }
  assert.equal(hasCapability('cda', 'data.upload'), true);
  assert.equal(hasCapability('cda', 'view.own_uploads'), true);
});

test('R2 Phase 1: the membrane delivery capability (data.upload) is held by BOTH operator and CDA', () => {
  // The prism upload routes now gate on data.upload; operator Submit must not regress.
  assert.equal(hasCapability('platform', 'data.upload'), true);
  assert.equal(hasCapability('admin', 'data.upload'), true);
  assert.equal(hasCapability('cda', 'data.upload'), true);
  // data.import stays operator-only (the import wizard); the CDA never gets it.
  assert.equal(hasCapability('cda', 'data.import'), false);
  assert.equal(hasCapability('platform', 'data.import'), true);
});

test('gate 3: cda lands in the portal; operators land in /stream', () => {
  assert.equal(landingPathForRole('cda'), '/portal');
  assert.equal(landingPathForRole('admin'), '/stream');
  assert.equal(landingPathForRole('platform'), '/stream');
  assert.equal(landingPathForRole('manager'), '/stream');
  assert.equal(landingPathForRole('member'), '/stream');
});

test('gate 4: cda is access-blocked from EVERY operator route (no operator surface) but can reach /portal', () => {
  // The real Invariant-7 property is the access lockout (middleware canAccessWorkspace),
  // not nav-emptiness — OB-246's nav model shows un-capability-gated routes to all roles,
  // but the CDA portal is chromeless AND the CDA is access-blocked from operator routes.
  // This is the stable, stronger assertion (holds pre- and post-OB-246 merge).
  for (const route of ['/stream', '/data', '/operate', '/admin', '/configure', '/financial']) {
    assert.equal(canAccessWorkspace('cda', route), false, `cda must NOT access ${route}`);
  }
  assert.equal(canAccessWorkspace('cda', '/portal'), true, 'cda CAN reach its own portal');
  // operator Submit not regressed: operators reach the membrane surfaces.
  assert.equal(canAccessWorkspace('admin', '/data'), true);
  assert.equal(canAccessWorkspace('admin', '/portal'), true);
});
