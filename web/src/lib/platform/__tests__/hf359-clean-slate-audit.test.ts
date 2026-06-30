/**
 * HF-359 Part C — Clean Slate audit of what was cleared. Runner: node --test --import tsx.
 *   PG-C1: deleteTenantScoped captures rowsBefore (present-before) alongside deleted; the completion audit
 *          payload carries per-table counts + who/when/tenant/categories/verified/residual; tenant-scoped.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteTenantScoped } from '../tenant-deletion';

// Mock the two reads deleteTenantScoped performs: select(count,head).eq('tenant_id') [rowsBefore] and
// delete({count}).eq('tenant_id') [deleted]. Captures the tenant predicates for the isolation assertion.
function mockClient(before: number | { error: string }, deleted: number | { error: string }) {
  const eqCalls: [string, unknown][] = [];
  const builder = {
    select() { return { eq(c: string, v: unknown) { eqCalls.push([c, v]); return typeof before === 'object'
      ? Promise.resolve({ count: null, error: { code: 'XX', message: before.error } })
      : Promise.resolve({ count: before, error: null }); } }; },
    delete() { return { eq(c: string, v: unknown) { eqCalls.push([c, v]); return typeof deleted === 'object'
      ? Promise.resolve({ count: null, error: { code: 'XX', message: deleted.error } })
      : Promise.resolve({ count: deleted, error: null }); } }; },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { from: () => builder } as any as SupabaseClient, eqCalls };
}

test('PG-C1: a delete records rowsBefore (present-before) AND deleted, both tenant-scoped', async () => {
  const { client, eqCalls } = mockClient(257, 257);
  const r = await deleteTenantScoped(client, 'committed_data', 'TENANT');
  assert.equal(r.table, 'committed_data');
  assert.equal(r.rowsBefore, 257, 'present-before captured');
  assert.equal(r.deleted, 257, 'deleted captured');
  assert.equal(r.status, 'deleted');
  // BOTH the pre-count read and the delete are tenant-scoped (SR-39)
  assert.deepEqual(eqCalls, [['tenant_id', 'TENANT'], ['tenant_id', 'TENANT']]);
});

test('PG-C1: rowsBefore is best-effort — a failed pre-count → null, the delete still runs + reports', async () => {
  const { client } = mockClient({ error: 'count denied' }, 100);
  const r = await deleteTenantScoped(client, 'entities', 'T');
  assert.equal(r.rowsBefore, null, 'unreadable pre-count → null');
  assert.equal(r.deleted, 100);
  assert.equal(r.status, 'deleted');
});

test('PG-C1: the completion audit threads per-table counts + who/when/tenant/categories/verified/residual', () => {
  const route = readFileSync(join(process.cwd(), 'src/app/api/platform/tenants/[tenantId]/clean-slate/route.ts'), 'utf8');
  // the per-table results (now carrying rowsBefore + deleted) go into the completion audit changes
  assert.ok(/perTable: result\.results/.test(route), 'per-table counts in the audit');
  assert.ok(/verified: result\.verified, residual: result\.residual/.test(route), 'verified + residual in the audit');
  assert.ok(/profile_id: gate\.caller\.profileId/.test(route) && /actor: gate\.caller\.email/.test(route), 'who');
  assert.ok(/tenant_id: tenantId/.test(route) && /categories/.test(route), 'tenant + categories');
  // rowsBefore is on the per-table result type that flows into perTable
  const engine = readFileSync(join(process.cwd(), 'src/lib/platform/tenant-deletion.ts'), 'utf8');
  assert.ok(/rowsBefore: number \| null/.test(engine) && /rowsBefore = before \?\? 0/.test(engine), 'rowsBefore captured pre-delete');
});
