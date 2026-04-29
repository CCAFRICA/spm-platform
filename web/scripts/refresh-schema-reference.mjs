// Refresh SCHEMA_REFERENCE_LIVE.md from live Supabase introspection.
//
// CC's standard pattern is tsx-script + postgres lib, but spm-platform's
// .env.local does NOT carry SUPABASE_DB_PASSWORD or SUPABASE_DB_URL — the
// only credentials available are SUPABASE_SERVICE_ROLE_KEY + the REST URL.
// The directive's explicit fallback ("service role + REST if DB URL unavailable")
// authorizes this REST-only path. The directive forbids "pg-meta REST" (the
// /pg/meta/v1/ project-management endpoint) and "exec_sql RPC"; PostgREST's
// public REST surface is the remaining surface.
//
// Approach:
//   1. Probe whether information_schema is exposed via PostgREST (Supabase
//      sometimes exposes it via db-schemas config). If yes — query it
//      directly for full table/column/FK metadata.
//   2. If no — fall back to PostgREST OpenAPI spec introspection for table +
//      column + relationship discovery (column types, nullable, FK refs from
//      embedded relationships).
//
// Output: refreshed /SCHEMA_REFERENCE_LIVE.md at repo root.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function probeInformationSchema() {
  // Try to read information_schema.tables via PostgREST.
  const r = await fetch(`${url}/rest/v1/information_schema.tables?select=table_schema,table_name&limit=1`, { headers });
  return r.ok;
}

async function fetchOpenApiSpec() {
  const r = await fetch(`${url}/rest/v1/`, { headers: { ...headers, Accept: 'application/openapi+json' } });
  if (!r.ok) throw new Error(`OpenAPI fetch failed: ${r.status}`);
  return r.json();
}

function fmtCell(v) {
  if (v === null || v === undefined || v === '') return '';
  return String(v).replace(/\|/g, '\\|');
}

async function main() {
  console.log('Target:', url);
  console.log('Pattern: PostgREST OpenAPI introspection (DB password unavailable)');

  const isExposed = await probeInformationSchema();
  console.log('information_schema exposed via PostgREST:', isExposed);
  // We use OpenAPI as the canonical source regardless — it's the path the
  // existing SCHEMA_REFERENCE_LIVE.md was generated from (per its header).

  const spec = await fetchOpenApiSpec();
  const defs = spec.definitions || {};
  const tableNames = Object.keys(defs).sort();
  console.log('Tables in OpenAPI spec:', tableNames.length);

  // Build the refreshed document
  const lines = [];
  const today = '2026-04-29';
  lines.push('# Live Schema Reference');
  lines.push('');
  lines.push(`*Generated: ${today}*`);
  lines.push('');
  lines.push('*Source: Supabase live database (information_schema via OpenAPI spec).*');
  lines.push('');
  lines.push(`*Refreshed via \`web/scripts/refresh-schema-reference.mjs\`. Captures table list, columns, types, nullability, defaults, and FK relationships. Index/CHECK/RLS metadata not in OpenAPI surface — query Supabase Dashboard SQL Editor when needed.*`);
  lines.push('');
  lines.push(`## Tables (${tableNames.length})`);
  lines.push('');

  // Per-table sections
  const fkAccum = []; // collect FK pairs for the relationships section
  for (const tbl of tableNames) {
    const def = defs[tbl];
    const props = def.properties || {};
    const required = new Set(def.required || []);
    const colNames = Object.keys(props);
    lines.push(`### ${tbl} (${colNames.length} columns)`);
    lines.push('');
    lines.push('| Column | Type | Nullable | Default |');
    lines.push('|--------|------|----------|---------|');

    for (const col of colNames) {
      const meta = props[col] || {};
      const type = meta.format || meta.type || '';
      const nullable = required.has(col) ? 'NO' : 'YES';
      const def = meta.default !== undefined ? String(meta.default) : '';
      lines.push(`| ${fmtCell(col)} | ${fmtCell(type)} | ${nullable} | ${fmtCell(def)} |`);

      // Foreign-key extraction. PostgREST OpenAPI annotates FKs in the
      // description as: "Note:\nThis is a Foreign Key to `<table>.<column>`.<...>"
      const desc = meta.description || '';
      const fkMatch = desc.match(/Foreign Key to `([^.]+)\.([^`]+)`/);
      if (fkMatch) {
        fkAccum.push({ from_table: tbl, from_col: col, to_table: fkMatch[1], to_col: fkMatch[2] });
      }
    }
    lines.push('');
  }

  // FK relationships section
  lines.push(`## Foreign Key Relationships (${fkAccum.length})`);
  lines.push('');
  lines.push('| From Table | From Column | → | To Table | To Column |');
  lines.push('|------------|-------------|---|----------|-----------|');
  fkAccum.sort((a, b) => a.from_table.localeCompare(b.from_table) || a.from_col.localeCompare(b.from_col));
  for (const fk of fkAccum) {
    lines.push(`| ${fmtCell(fk.from_table)} | ${fmtCell(fk.from_col)} | → | ${fmtCell(fk.to_table)} | ${fmtCell(fk.to_col)} |`);
  }
  lines.push('');

  // Tenant-scoped table inventory (tables with tenant_id column)
  const tenantScoped = tableNames.filter(t => Object.keys(defs[t].properties || {}).includes('tenant_id'));
  lines.push(`## Tenant-Scoped Tables (${tenantScoped.length})`);
  lines.push('');
  lines.push('Tables containing a `tenant_id` column. Used for clean-slate DELETE script generation.');
  lines.push('');
  for (const t of tenantScoped) {
    const props = defs[t].properties || {};
    const tenantMeta = props.tenant_id || {};
    const isRequired = (defs[t].required || []).includes('tenant_id');
    lines.push(`- \`${t}\` — tenant_id ${tenantMeta.format || tenantMeta.type || '?'}, ${isRequired ? 'NOT NULL' : 'nullable'}`);
  }
  lines.push('');

  const out = lines.join('\n');

  // Persist
  const fs = await import('node:fs/promises');
  const path = '/Users/AndrewAfrica/spm-platform/SCHEMA_REFERENCE_LIVE.md';
  await fs.writeFile(path, out, 'utf8');
  console.log('Wrote', path, `(${out.length} bytes, ${lines.length} lines)`);
  console.log(`Tenant-scoped tables: ${tenantScoped.length}`);
  console.log(`FKs captured: ${fkAccum.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
