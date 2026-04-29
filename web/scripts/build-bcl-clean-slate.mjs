// Build BCL clean-slate DELETE script with FK dependency-order topological sort.
//
// Reads the refreshed SCHEMA_REFERENCE_LIVE.md, extracts:
//   - tenant-scoped tables (those with a tenant_id column)
//   - inter-table FK relationships (excluding tenant_id → tenants edges,
//     which are universal and don't constrain ordering among data tables)
//   - intra-table FK self-references (e.g., calculation_batches.superseded_by → calculation_batches.id)
//
// Topologically sorts so DELETEs run dependents → referents (a table is
// deleted before any table it references via a non-tenant-id FK).
//
// Emits the SQL script to stdout for architect review. Does NOT execute.

import { readFile } from 'node:fs/promises';

const TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'; // BCL — Banco Cumbre del Litoral
const SCHEMA_REF = '/Users/AndrewAfrica/spm-platform/SCHEMA_REFERENCE_LIVE.md';

const md = await readFile(SCHEMA_REF, 'utf8');

// 1. Extract tenant-scoped tables from the "Tenant-Scoped Tables" section
const tenantScoped = [];
const tsSectionMatch = md.match(/## Tenant-Scoped Tables[\s\S]*?(?=\n## |\n# |$)/);
if (tsSectionMatch) {
  const lines = tsSectionMatch[0].split('\n');
  for (const line of lines) {
    const m = line.match(/^- `([^`]+)` — tenant_id [^,]+, (.+)$/);
    if (m) tenantScoped.push({ name: m[1], tenantNullability: m[2] });
  }
}
console.error(`Tenant-scoped tables found: ${tenantScoped.length}`);
const tsSet = new Set(tenantScoped.map(t => t.name));

// 2. Extract FK edges from the "Foreign Key Relationships" section
//    Filter to edges where BOTH endpoints are tenant-scoped tables
//    (we don't care about FKs into 'tenants' or other non-scoped tables for ordering).
const fkEdges = []; // { from, to } where both are in tsSet
const fkSectionMatch = md.match(/## Foreign Key Relationships[\s\S]*?(?=\n## |\n# |$)/);
if (fkSectionMatch) {
  const lines = fkSectionMatch[0].split('\n');
  for (const line of lines) {
    const m = line.match(/^\| ([a-z_]+) \| ([a-z_]+) \| → \| ([a-z_]+) \| ([a-z_]+) \|$/);
    if (!m) continue;
    const [, fromTbl, fromCol, toTbl] = m;
    if (toTbl === 'tenants') continue; // universal — every tenant-scoped table has this
    if (toTbl === 'profiles' && fromCol === 'profile_id') continue; // entities.profile_id is tenant-cross-cut to platform users; not a tenant-data dep
    if (!tsSet.has(fromTbl) || !tsSet.has(toTbl)) continue;
    if (fromTbl === toTbl) continue; // self-loop (e.g., calculation_batches.superseded_by); irrelevant for ordering since DELETE is bulk
    fkEdges.push({ from: fromTbl, to: toTbl });
  }
}
console.error(`Inter-table FK edges (tenant-scoped, non-self): ${fkEdges.length}`);

// 3. Topological sort: dependents first.
//    Edge from→to means "from depends on to" (from has FK referencing to).
//    DELETE order: from BEFORE to (so referenced rows still exist when dependents are deleted).
//    Equivalent: reverse-topological-order of (to→from) graph.
//    Standard Kahn's algorithm: emit nodes whose dependents are already emitted.
const dependents = new Map(); // to → [from, from, ...] (who depends on me)
const remainingDeps = new Map(); // from → count of `to`s still un-emitted
for (const t of tenantScoped) {
  dependents.set(t.name, []);
  remainingDeps.set(t.name, 0);
}
for (const e of fkEdges) {
  dependents.get(e.to).push(e.from);
  remainingDeps.set(e.from, (remainingDeps.get(e.from) || 0) + 1);
}

const order = [];
// Start with tables that depend on nothing — but those are the LEAFS of the dep graph,
// they should be deleted LAST. We want: tables that are NOT depended on BY anyone
// (no incoming dependency edges) come first in DELETE order.
// Re-frame: for each table, count how many other tenant-scoped tables reference it.
const incomingRefs = new Map();
for (const t of tenantScoped) incomingRefs.set(t.name, 0);
for (const e of fkEdges) {
  incomingRefs.set(e.to, (incomingRefs.get(e.to) || 0) + 1);
}
// DELETE order: tables with zero incoming refs first (nothing depends on them).
// Then tables whose dependents have all been deleted.
const queue = tenantScoped.filter(t => incomingRefs.get(t.name) === 0).map(t => t.name);
while (queue.length > 0) {
  const t = queue.shift();
  order.push(t);
  // For each table this table depends on, decrement its incoming ref count
  for (const e of fkEdges) {
    if (e.from === t) {
      const newCount = incomingRefs.get(e.to) - 1;
      incomingRefs.set(e.to, newCount);
      if (newCount === 0) queue.push(e.to);
    }
  }
}
if (order.length !== tenantScoped.length) {
  console.error(`Topological sort incomplete: ${order.length}/${tenantScoped.length}. Possible FK cycle.`);
  console.error('Remaining tables:', tenantScoped.filter(t => !order.includes(t.name)).map(t => t.name));
  process.exit(1);
}

// 4. Emit SQL
const out = [];
out.push('-- BCL clean-slate DELETE script');
out.push(`-- Generated 2026-04-29 from refreshed SCHEMA_REFERENCE_LIVE.md`);
out.push(`-- Tenant: BCL — Banco Cumbre del Litoral`);
out.push(`-- Tenant ID: ${TENANT_ID}`);
out.push(`-- ${tenantScoped.length} tenant-scoped tables, ${fkEdges.length} inter-table FK edges`);
out.push('-- DELETE order: dependents first (tables referenced by no other tenant-scoped table)');
out.push("-- The 'tenants' table itself is NOT touched — only owned data is deleted.");
out.push('-- Wrapped in BEGIN/COMMIT for atomicity. Aborts on any error.');
out.push('');
out.push('BEGIN;');
out.push('');
for (const t of order) {
  out.push(`DELETE FROM public.${t} WHERE tenant_id = '${TENANT_ID}';`);
}
out.push('');
out.push('COMMIT;');
out.push('');
out.push('-- Post-cleanup verification (run after COMMIT to confirm zero rows remain):');
out.push("SELECT '== row counts post-cleanup ==';");
for (const t of order) {
  out.push(`SELECT '${t}' AS table, COUNT(*) AS row_count FROM public.${t} WHERE tenant_id = '${TENANT_ID}';`);
}

console.log(out.join('\n'));

// Diagnostic: show the order with reference counts on stderr
console.error('\n=== DELETE order (top = first to delete) ===');
for (let i = 0; i < order.length; i++) {
  const t = order[i];
  const refsTo = fkEdges.filter(e => e.from === t).map(e => e.to);
  console.error(`${String(i + 1).padStart(2)}. ${t.padEnd(30)} ${refsTo.length > 0 ? '→ ' + refsTo.join(', ') : ''}`);
}
