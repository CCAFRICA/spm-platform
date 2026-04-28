/**
 * OB-196 Phase 1.5 — Pre-migration query
 *
 * Surfaces the universe of `componentType` and nested `calculationMethod.type`
 * values across all rule_sets.components rows, with per-tenant per-value counts.
 *
 * Read-only. No mutations. Architect reviews output before migration drafted.
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Architect's directive — five legacy aliases to migrate
const LEGACY_ALIASES = new Set([
  'matrix_lookup',
  'tiered_lookup',
  'percentage',
  'flat_percentage',
  'conditional_percentage',
]);

// Foundational registry per OB-196 Phase 1
const FOUNDATIONAL = new Set([
  'bounded_lookup_1d',
  'bounded_lookup_2d',
  'scalar_multiply',
  'conditional_gate',
  'aggregate',
  'ratio',
  'constant',
  'weighted_blend',
  'temporal_window',
  'linear_function',
  'piecewise_linear',
  'scope_aggregate',
]);

type FlatComponent = {
  tenantId: string;
  ruleSetId: string;
  ruleSetName: string;
  ruleSetStatus: string;
  variantId: string;
  componentName: string;
  componentType: string | null;
  calculationMethodType: string | null;
  calcIntentOp: string | null;
};

function flattenComponents(rs: { id: string; tenant_id: string; name: string; status: string; components: unknown }): FlatComponent[] {
  const out: FlatComponent[] = [];
  if (!rs.components || typeof rs.components !== 'object') return out;
  const c = rs.components as Record<string, unknown>;

  const collectFromArr = (arr: unknown[], variantId: string) => {
    for (const k of arr) {
      if (!k || typeof k !== 'object') continue;
      const comp = k as Record<string, unknown>;
      const calcMethod = comp.calculationMethod as Record<string, unknown> | undefined;
      const intent = comp.calculationIntent as Record<string, unknown> | undefined;
      out.push({
        tenantId: rs.tenant_id,
        ruleSetId: rs.id,
        ruleSetName: rs.name,
        ruleSetStatus: rs.status,
        variantId,
        componentName: String(comp.name ?? '?'),
        componentType: typeof comp.componentType === 'string' ? comp.componentType : null,
        calculationMethodType: calcMethod && typeof calcMethod.type === 'string' ? calcMethod.type : null,
        calcIntentOp: intent && typeof intent.operation === 'string' ? intent.operation : null,
      });
    }
  };

  if (Array.isArray(c.variants)) {
    for (const v of c.variants as Array<Record<string, unknown>>) {
      const variantId = String(v.variantId ?? 'unknown');
      const comps = v.components;
      if (Array.isArray(comps)) collectFromArr(comps, variantId);
    }
  } else if (Array.isArray(c.components)) {
    collectFromArr(c.components, 'flat');
  } else if (Array.isArray(rs.components)) {
    collectFromArr(rs.components as unknown[], 'array_root');
  }
  return out;
}

async function main() {
  console.log('=== OB-196 Phase 1.5 pre-migration query ===');
  console.log(`Run date: ${new Date().toISOString()}`);
  console.log('');

  // Fetch ALL rule_sets across ALL tenants (any status), since persisted legacy
  // identifiers may live in inactive/draft rule_sets too.
  const { data: rs, error } = await sb
    .from('rule_sets')
    .select('id, tenant_id, name, status, components, created_at')
    .order('tenant_id, created_at', { ascending: false });

  if (error) { console.error('ERROR:', error.message); process.exit(1); }
  console.log(`Total rule_sets in DB (all tenants, all statuses): ${(rs || []).length}`);

  // Tenant labels for output readability
  const { data: tenants } = await sb.from('tenants').select('id, name');
  const tenantName = new Map<string, string>();
  for (const t of tenants || []) tenantName.set(t.id, t.name);

  // Flatten all components
  const allComponents: FlatComponent[] = [];
  for (const r of rs || []) {
    allComponents.push(...flattenComponents(r));
  }
  console.log(`Total flattened component objects: ${allComponents.length}`);
  console.log('');

  // ── Distinct componentType values, with counts ──
  console.log('=== Distinct componentType values (across all rule_sets, all tenants, all statuses) ===');
  const ctCounts = new Map<string, { total: number; tenants: Set<string>; ruleSets: Set<string> }>();
  for (const c of allComponents) {
    const key = c.componentType ?? '<null>';
    if (!ctCounts.has(key)) ctCounts.set(key, { total: 0, tenants: new Set(), ruleSets: new Set() });
    const e = ctCounts.get(key)!;
    e.total++;
    e.tenants.add(c.tenantId);
    e.ruleSets.add(c.ruleSetId);
  }
  console.log('value | total_count | distinct_tenants | distinct_rule_sets | classification');
  console.log('------|-------------|------------------|--------------------|----------------');
  for (const [val, e] of Array.from(ctCounts.entries()).sort((a, b) => b[1].total - a[1].total)) {
    let classification = 'UNKNOWN — REQUIRES ARCHITECT DISPOSITION';
    if (LEGACY_ALIASES.has(val)) classification = 'LEGACY ALIAS (in directive mapping)';
    else if (FOUNDATIONAL.has(val)) classification = 'FOUNDATIONAL (canonical)';
    else if (val === '<null>') classification = 'NULL componentType';
    console.log(`${val} | ${e.total} | ${e.tenants.size} | ${e.ruleSets.size} | ${classification}`);
  }
  console.log('');

  // ── Distinct calculationMethod.type values ──
  console.log('=== Distinct calculationMethod.type values ===');
  const cmtCounts = new Map<string, number>();
  for (const c of allComponents) {
    if (c.calculationMethodType !== null) {
      cmtCounts.set(c.calculationMethodType, (cmtCounts.get(c.calculationMethodType) ?? 0) + 1);
    }
  }
  if (cmtCounts.size === 0) {
    console.log('NO calculationMethod.type field present in any persisted component (importer does not persist this field).');
  } else {
    console.log('value | count');
    console.log('------|------');
    for (const [val, count] of Array.from(cmtCounts.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`${val} | ${count}`);
    }
  }
  console.log('');

  // ── Per-tenant per-componentType breakdown ──
  console.log('=== Per-tenant breakdown ===');
  const byTenant = new Map<string, Map<string, number>>();
  for (const c of allComponents) {
    if (!byTenant.has(c.tenantId)) byTenant.set(c.tenantId, new Map());
    const tm = byTenant.get(c.tenantId)!;
    const key = c.componentType ?? '<null>';
    tm.set(key, (tm.get(key) ?? 0) + 1);
  }
  for (const [tid, tm] of byTenant) {
    const label = tenantName.get(tid) ?? tid;
    console.log(`\nTenant: ${label} (${tid})`);
    for (const [val, count] of Array.from(tm.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${val}: ${count}`);
    }
  }
  console.log('');

  // ── Pairs: componentType vs calcIntentOp (DIAG-024 fingerprint) ──
  console.log('=== componentType ⇄ calculationIntent.operation pairs (DIAG-024 fingerprint) ===');
  const pairCounts = new Map<string, number>();
  for (const c of allComponents) {
    const ct = c.componentType ?? '<null>';
    const op = c.calcIntentOp ?? '<null>';
    const key = `${ct} | ${op}`;
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }
  console.log('componentType | calculationIntent.operation | count');
  console.log('--------------|------------------------------|------');
  for (const [pair, count] of Array.from(pairCounts.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`${pair} | ${count}`);
  }
  console.log('');

  // ── Migration impact summary ──
  console.log("=== Migration impact summary (rows that would be rewritten under directive's 5-alias mapping) ===");
  let inDirectiveScope = 0;
  let outOfDirectiveScope = 0;
  const outOfScopeValues = new Map<string, number>();
  for (const [val, e] of ctCounts.entries()) {
    if (val === '<null>') continue;
    if (LEGACY_ALIASES.has(val)) {
      inDirectiveScope += e.total;
    } else if (!FOUNDATIONAL.has(val)) {
      outOfDirectiveScope += e.total;
      outOfScopeValues.set(val, e.total);
    }
  }
  console.log(`Components with componentType in the 5 legacy aliases (would migrate cleanly): ${inDirectiveScope}`);
  console.log(`Components with componentType NOT in the 5 aliases AND NOT in foundational registry: ${outOfDirectiveScope}`);
  if (outOfScopeValues.size > 0) {
    console.log('  Values requiring architect disposition (Standing Rule 34 — no invented mapping):');
    for (const [val, count] of outOfScopeValues) {
      console.log(`    "${val}" — ${count} components`);
    }
  }
  console.log('');
}

main().catch((e) => { console.error(e); process.exit(1); });
