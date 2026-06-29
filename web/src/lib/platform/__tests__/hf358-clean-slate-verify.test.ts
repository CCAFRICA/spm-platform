/**
 * HF-358 Part C — Clean Slate true-delete + verify-before-success. Runner: node --test --import tsx.
 *   PG-C2: verifyCleanSlate re-counts every selected table; success only when all are 0 (committed_data
 *          residual → not verified → the route reports failure, never silent success).
 *   PG-C3: tenant isolation — every delete in the engine is tenant-scoped; the route issues no raw delete.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyCleanSlate, CLEAN_SLATE_CATEGORIES } from '../tenant-deletion';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mock the count read verifyCleanSlate performs: from(table).select('*',{count,head}).eq('tenant_id', id).
function mockCountClient(counts: Record<string, number | { error: string } | 'missing'>): SupabaseClient {
  const client = { from(table: string) { return { select() { return { eq() {
    const v = counts[table];
    if (v === 'missing') return Promise.resolve({ count: null, error: { code: '42P01', message: 'undefined_table' } });
    if (typeof v === 'object') return Promise.resolve({ count: null, error: { code: 'XX000', message: v.error } });
    return Promise.resolve({ count: v ?? 0, error: null });
  } }; } }; } };
  return client as unknown as SupabaseClient;
}

const dataTables = CLEAN_SLATE_CATEGORIES.find(c => c.key === 'data')!.tables;

test('PG-C2: committed_data is in the data category (so a data wipe targets + verifies it)', () => {
  assert.ok(dataTables.includes('committed_data'), `data category = ${dataTables.join(', ')}`);
});

test('PG-C2: all selected tables empty → verified, no residual', async () => {
  const counts = Object.fromEntries(dataTables.map(t => [t, 0]));
  const r = await verifyCleanSlate(mockCountClient(counts), 'TENANT', ['data']);
  assert.equal(r.verified, true);
  assert.deepEqual(r.residual, []);
});

test('PG-C2: committed_data still populated → NOT verified, residual names it (no silent success)', async () => {
  const counts: Record<string, number> = Object.fromEntries(dataTables.map(t => [t, 0]));
  counts['committed_data'] = 257; // the DIAG-078 residual shape
  const r = await verifyCleanSlate(mockCountClient(counts), 'TENANT', ['data']);
  assert.equal(r.verified, false);
  assert.deepEqual(r.residual, [{ table: 'committed_data', count: 257 }]);
  // the route's success gate is ok = !hadError && verified → false here
  const ok = !false && r.verified;
  assert.equal(ok, false);
});

test('PG-C2: a non-42P01 read error fails CLOSED (residual count -1, not silently verified)', async () => {
  const counts: Record<string, number | { error: string }> = Object.fromEntries(dataTables.map(t => [t, 0]));
  counts['committed_data'] = { error: 'permission denied' };
  const r = await verifyCleanSlate(mockCountClient(counts), 'TENANT', ['data']);
  assert.equal(r.verified, false);
  assert.deepEqual(r.residual, [{ table: 'committed_data', count: -1 }]);
});

test('PG-C2: a missing table (42P01) counts as empty', async () => {
  const counts: Record<string, number | 'missing'> = Object.fromEntries(dataTables.map(t => [t, 0]));
  counts['ingestion_events'] = 'missing';
  const r = await verifyCleanSlate(mockCountClient(counts), 'TENANT', ['data']);
  assert.equal(r.verified, true);
});

test('PG-C2: verify only checks SELECTED categories (entity not selected → entities not re-counted)', async () => {
  // entities has rows but is NOT selected → not in the verify set → does not block a data-only success.
  const counts = { ...Object.fromEntries(dataTables.map(t => [t, 0])), entities: 999 };
  const r = await verifyCleanSlate(mockCountClient(counts), 'TENANT', ['data']);
  assert.equal(r.verified, true);
});

// ── PG-C3: tenant isolation ──────────────────────────────────────────────────────────────────────
test('PG-C3: every delete in the deletion engine is tenant-scoped; the route issues no raw delete', () => {
  const engine = readFileSync(join(process.cwd(), 'src/lib/platform/tenant-deletion.ts'), 'utf8');
  // Find every `.delete(` and require a tenant predicate within the same statement window.
  const deleteSites = Array.from(engine.matchAll(/\.delete\([\s\S]{0,160}?(?=;|\n\s*\n)/g)).map(m => m[0]);
  assert.ok(deleteSites.length >= 1, 'at least one delete site');
  for (const site of deleteSites) {
    assert.ok(/\.eq\(\s*['"]tenant_id['"]/.test(site) || /\.eq\(\s*['"]id['"],\s*tenantId\)/.test(site),
      `every delete must be tenant-scoped — unscoped site: ${site.slice(0, 100)}`);
  }
  // The clean-slate route must NOT contain a raw committed_data/table delete (it delegates to the engine).
  const route = readFileSync(join(process.cwd(), 'src/app/api/platform/tenants/[tenantId]/clean-slate/route.ts'), 'utf8');
  assert.ok(!/\.delete\(/.test(route), 'the clean-slate route issues no raw delete — it delegates to runCleanSlate');
});
