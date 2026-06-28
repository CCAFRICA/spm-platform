/**
 * OB-250 — the two-gate visibility, routing, and the exact-path feature gate. Runner: node --test.
 * Proof gates: P3 (the four-cell matrix), P4 (single derivation), P5 (no new role/no role-string),
 * the B2 getWorkspaceForRoute fix, and the I5/I6 "never gate /data or /operate prefix" guard.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canAccessWorkspace, getAccessibleWorkspaces } from '../role-workspaces';
import { getWorkspaceForRoute } from '../workspace-config';
import { requiredFeatureForPath, CANONICAL_ROLES } from '@/lib/auth/permissions';

const ON = { prism_enabled: true };
const OFF = { prism_enabled: false };

test('P3 two-gate matrix: data-operations visible only when (prism on) AND (user has data.import)', () => {
  // admin holds data.import → the USER gate passes; the TENANT gate is prism_enabled.
  assert.equal(canAccessWorkspace('admin', 'data-operations', ON), true,  'on × has-perm → visible');
  assert.equal(canAccessWorkspace('admin', 'data-operations', OFF), false, 'off × has-perm → hidden');
  // manager/sales_rep do NOT hold data.import → the USER gate fails regardless of the flag.
  assert.equal(canAccessWorkspace('manager', 'data-operations', ON), false, 'on × no-perm → hidden');
  assert.equal(canAccessWorkspace('manager', 'data-operations', OFF), false, 'off × no-perm → hidden');
});

test('getAccessibleWorkspaces reflects the two-gate: data-operations appears iff prism on (for an importer)', () => {
  assert.ok(getAccessibleWorkspaces('admin', ON).includes('data-operations'));
  assert.ok(!getAccessibleWorkspaces('admin', OFF).includes('data-operations'));
  // capability-only callers (no features) do NOT see it — fail-closed (the absent flag is not true).
  assert.ok(!getAccessibleWorkspaces('admin', {}).includes('data-operations'));
});

test('the featureFlag fix also correctly gates the licensable Finance workspace (latent gap closed)', () => {
  assert.ok(getAccessibleWorkspaces('admin', { financial: true }).includes('finance'));
  assert.ok(!getAccessibleWorkspaces('admin', { financial: false }).includes('finance'));
});

test('B2: PRISM subpaths route to data-operations, NOT the generic /data (platform-core)', () => {
  assert.equal(getWorkspaceForRoute('/data/submit'), 'data-operations');
  assert.equal(getWorkspaceForRoute('/data/in-progress'), 'data-operations');
  assert.equal(getWorkspaceForRoute('/data-operations/cleaned'), 'data-operations');
  // the bare /data console + transactions stay in platform-core (data-visibility)
  assert.equal(getWorkspaceForRoute('/data'), 'platform-core');
  assert.equal(getWorkspaceForRoute('/data/transactions'), 'platform-core');
});

test('requiredFeatureForPath gates ONLY the exact PRISM paths — never the /data or /operate prefix (I5/I6)', () => {
  assert.equal(requiredFeatureForPath('/data/submit'), 'prism_enabled');
  assert.equal(requiredFeatureForPath('/data/in-progress'), 'prism_enabled');
  assert.equal(requiredFeatureForPath('/data-operations/cleaned'), 'prism_enabled');
  // MUST stay reachable when PRISM is off:
  assert.equal(requiredFeatureForPath('/data/transactions'), null, 'I5: committed-data view never gated');
  assert.equal(requiredFeatureForPath('/data'), null, 'bare /data console never gated');
  assert.equal(requiredFeatureForPath('/operate/import'), null, 'I6: local import never gated');
  assert.equal(requiredFeatureForPath('/operate/import/quarantine'), null, 'I5: hold-resolution never gated');
  assert.equal(requiredFeatureForPath('/data/submitXYZ'), null, 'boundary-safe: no false prefix match');
});

test('P5: no NEW role added — the closed 6-role set is unchanged (I3)', () => {
  assert.deepEqual([...CANONICAL_ROLES].sort(), ['admin', 'cda', 'manager', 'member', 'platform', 'viewer'].sort());
});

test('P5: the gating/derivation path contains NO role-name string literal (I3 Korean Test at the access layer)', () => {
  const root = join(process.cwd(), 'src');
  const gatingFiles = [
    'lib/prism/capability.ts',
    'lib/prism/tenant-feature.ts',
    'lib/navigation/role-workspaces.ts',
  ];
  // role-name literals that would indicate role-string gating (vs capability gating).
  const ROLE_LITERAL = /===\s*['"](admin|manager|member|viewer|cda|sales_rep|vda)['"]|['"](admin|manager|member|viewer|cda|sales_rep|vda)['"]\s*===/;
  for (const rel of gatingFiles) {
    const src = readFileSync(join(root, rel), 'utf8');
    assert.equal(ROLE_LITERAL.test(src), false, `${rel} must gate on capability/feature, not a role-name literal`);
  }
});
