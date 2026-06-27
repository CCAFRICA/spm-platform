import { test } from 'node:test';
import assert from 'node:assert';
import { getCapabilities, hasCapability, resolveRole, type Capability } from '@/lib/auth/permissions';
import { landingPathForRole } from '@/lib/auth/landing';
import { getAccessibleWorkspaces } from '@/lib/navigation/role-workspaces';

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

test('gate 3: cda lands in the portal; operators land in /stream', () => {
  assert.equal(landingPathForRole('cda'), '/portal');
  assert.equal(landingPathForRole('admin'), '/stream');
  assert.equal(landingPathForRole('platform'), '/stream');
  assert.equal(landingPathForRole('manager'), '/stream');
  assert.equal(landingPathForRole('member'), '/stream');
});

test('gate 4: cda has NO accessible operator workspaces (near-empty nav falls out of capabilities)', () => {
  // getAccessibleWorkspaces is typed to the navigation-layer UserRole (no 'cda'); the
  // runtime is a string filter, and a CDA — lacking every operator capability — resolves
  // to zero workspaces. (The nav is never rendered for the CDA anyway; the portal is chromeless.)
  type NavRole = Parameters<typeof getAccessibleWorkspaces>[0];
  const cdaWorkspaces = getAccessibleWorkspaces('cda' as NavRole);
  assert.equal(cdaWorkspaces.length, 0, `cda should see no operator workspaces, got: ${cdaWorkspaces.join(',')}`);
  // sanity: an operator DOES see workspaces
  assert.ok(getAccessibleWorkspaces('platform' as NavRole).length > 0);
});
