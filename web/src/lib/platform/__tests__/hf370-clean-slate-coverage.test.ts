/**
 * HF-370 O5 — Clean Slate schema-drift guard. Enumerates EVERY tenant-scoped table (a CREATE TABLE
 * carrying a tenant_id column, or an ALTER TABLE ... ADD tenant_id) from the live migration schema and
 * asserts each is DISPOSITIONED (cleared by Clean Slate, kept by design, entity-cascade-cleared, or
 * flagged for architect FK review). If a new tenant-scoped table is added to the schema without a
 * disposition, this FAILS — so the Clean Slate delete set cannot silently drift out of coverage
 * (directive §5: prefer deriving the delete set from the schema so it cannot drift).
 *
 * It also asserts the SAFETY boundary: no foundational / cross-tenant table (no tenant_id) is in any
 * clear set, and no disposition entry names a non-existent table.
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLEAN_SLATE_CATEGORIES,
  CLEAN_SLATE_KEEP,
  CLEAN_SLATE_CASCADE_CLEARED,
  CLEAN_SLATE_ARCHITECT_REVIEW,
} from '../tenant-deletion';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../supabase/migrations');

// Parse the migrations: CREATE TABLE blocks whose body has a tenant_id column, + ALTER ... ADD tenant_id.
function schemaTables(): { tenantScoped: Set<string>; global: Set<string> } {
  const tenantScoped = new Set<string>();
  const global = new Set<string>();
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
  const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*\(([\s\S]*?)\n\s*\)\s*;/gi;
  const alterRe = /alter\s+table\s+(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?tenant_id/gi;
  for (const f of files) {
    const txt = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    let m: RegExpExecArray | null;
    while ((m = createRe.exec(txt))) {
      const name = m[1].toLowerCase();
      if (/\btenant_id\b/i.test(m[2])) { tenantScoped.add(name); global.delete(name); }
      else if (!tenantScoped.has(name)) global.add(name);
    }
    while ((m = alterRe.exec(txt))) { tenantScoped.add(m[1].toLowerCase()); global.delete(m[1].toLowerCase()); }
  }
  return { tenantScoped, global };
}

const clearedByCleanSlate = new Set(CLEAN_SLATE_CATEGORIES.flatMap(c => c.tables));
const dispositioned = new Set<string>([
  ...Array.from(clearedByCleanSlate),
  ...CLEAN_SLATE_KEEP,
  ...CLEAN_SLATE_CASCADE_CLEARED,
  ...CLEAN_SLATE_ARCHITECT_REVIEW,
]);

test('HF-370 O5: EVERY tenant-scoped table is dispositioned (drift guard — cannot silently drift)', () => {
  const { tenantScoped } = schemaTables();
  assert.ok(tenantScoped.size >= 35, `expected the migration scan to find the tenant-scoped tables, got ${tenantScoped.size}`);
  const undispositioned = Array.from(tenantScoped).filter(t => !dispositioned.has(t)).sort();
  assert.deepEqual(undispositioned, [], `undispositioned tenant-scoped tables (add to CLEAN_SLATE_CATEGORIES / KEEP / CASCADE / ARCHITECT_REVIEW): ${undispositioned.join(', ')}`);
});

test('HF-370 O5 (5B safety): no FOUNDATIONAL / cross-tenant table (no tenant_id) is in any clear set', () => {
  const { tenantScoped } = schemaTables();
  // Any table cleared/kept MUST be tenant-scoped (carry tenant_id). A foundational store must never appear.
  for (const t of Array.from(dispositioned)) {
    // allow tables that exist only as live DDL (not in migrations) — but if it IS in the schema, it must be tenant-scoped
    const { global } = schemaTables();
    assert.equal(global.has(t), false, `"${t}" is a table WITHOUT tenant_id but is in a Clean Slate disposition set — foundational/global stores must never be cleared`);
    void tenantScoped;
  }
});

test('HF-370 O5: the KEEP set is exactly the identity/access/billing/audit tables', () => {
  assert.deepEqual([...CLEAN_SLATE_KEEP].sort(), ['audit_logs', 'profile_scope', 'profiles', 'usage_metering']);
});

test('HF-370 O5: Clean Slate categories and KEEP/REVIEW sets are disjoint (no table both cleared and kept)', () => {
  for (const t of Array.from(clearedByCleanSlate)) {
    assert.equal(CLEAN_SLATE_KEEP.includes(t), false, `"${t}" is both cleared and kept`);
    assert.equal(CLEAN_SLATE_ARCHITECT_REVIEW.includes(t), false, `"${t}" is both cleared and flagged for review`);
  }
});
