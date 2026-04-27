/**
 * AUD-004 Phase 0E (v2) — Production rule_set shape inventory
 * Components live at components.variants[].components[] (not a flat array).
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TENANTS: Record<string, string> = {
  'b1c2d3e4-aaaa-bbbb-cccc-111111111111': 'BCL (Banco Cumbre del Litoral)',
  'e44bbcb1-2710-4880-8c7d-a1bd902720b7': 'CRP (Cascade Revenue Partners)',
  '5035b1e8-0754-4527-b7ec-9f93f85e4c79': 'Meridian Logistics Group',
};

type Component = {
  id?: string;
  name?: string;
  componentType?: string;
  calculationIntent?: { operation?: string };
  metadata?: { intent?: { operation?: string } };
  tierConfig?: { tiers?: unknown[]; metric?: string };
  matrixConfig?: unknown;
  percentageConfig?: unknown;
  conditionalConfig?: unknown;
};

function flattenComponents(components: unknown): Array<{ variantId: string; comp: Component }> {
  const out: Array<{ variantId: string; comp: Component }> = [];
  if (!components || typeof components !== 'object') return out;
  const c = components as Record<string, unknown>;
  if (Array.isArray(c.variants)) {
    for (const v of c.variants as Array<Record<string, unknown>>) {
      const variantId = String(v.variantId ?? 'unknown');
      const comps = v.components;
      if (Array.isArray(comps)) {
        for (const k of comps as Component[]) out.push({ variantId, comp: k });
      }
    }
  } else if (Array.isArray(c.components)) {
    for (const k of c.components as Component[]) out.push({ variantId: 'flat', comp: k });
  } else if (Array.isArray(components)) {
    for (const k of components as Component[]) out.push({ variantId: 'array_root', comp: k });
  }
  return out;
}

async function main() {
  console.log('=== Step 0E.3-5 (corrected) — Per-tenant rule_set shapes ===\n');

  for (const [tid, tenantLabel] of Object.entries(TENANTS)) {
    console.log(`\n--- ${tenantLabel} (${tid}) ---`);
    const { data: rs, error } = await sb
      .from('rule_sets')
      .select('id, name, status, version, components, input_bindings, created_at')
      .eq('tenant_id', tid)
      .order('created_at', { ascending: false });
    if (error) { console.log('ERROR:', error.message); continue; }
    if (!rs || rs.length === 0) {
      console.log('  (zero rule_sets)');
      continue;
    }
    console.log(`  Total rule_sets: ${rs.length}, active: ${rs.filter(r => r.status === 'active').length}`);

    for (const r of rs) {
      const flat = flattenComponents(r.components);
      const ib = r.input_bindings as Record<string, unknown> | null;
      const hasSeeds = !!(ib && 'plan_agent_seeds' in ib);
      console.log(`\n  RuleSet ${r.id}`);
      console.log(`    name="${r.name}"`);
      console.log(`    status=${r.status}, v${r.version}, created=${r.created_at}`);
      console.log(`    flattened components: ${flat.length}, plan_agent_seeds: ${hasSeeds ? 'PRESENT' : 'absent'}`);
      const variants = new Set(flat.map(f => f.variantId));
      console.log(`    variants: ${Array.from(variants).join(', ')}`);

      if (r.status === 'active') {
        for (let i = 0; i < flat.length; i++) {
          const c = flat[i].comp;
          const ciOp = c.calculationIntent?.operation;
          const miOp = c.metadata?.intent?.operation;
          const tierLen = Array.isArray(c.tierConfig?.tiers) ? (c.tierConfig as { tiers: unknown[] }).tiers.length : null;
          console.log(`      [${flat[i].variantId}|${i}] name="${c.name ?? '?'}" componentType="${c.componentType ?? '?'}" calcIntentOp="${ciOp ?? '—'}" metaIntentOp="${miOp ?? '—'}" tierCount=${tierLen ?? '—'}`);
        }
      }
    }
  }

  console.log('\n=== Step 0E.6 (corrected) — Cross-tenant operation-vocabulary aggregation ===\n');
  const { data: allActive } = await sb
    .from('rule_sets')
    .select('tenant_id, components, name')
    .eq('status', 'active');

  type Key = { tenant: string; component_type: string; calc_intent_op: string };
  const counts = new Map<string, { key: Key; count: number; ruleSets: Set<string> }>();
  for (const r of (allActive || []) as Array<{ tenant_id: string; components: unknown; name: string }>) {
    const flat = flattenComponents(r.components);
    for (const { comp } of flat) {
      const ct = comp.componentType ?? 'NULL';
      const op = comp.calculationIntent?.operation ?? 'NULL';
      const tenant = TENANTS[r.tenant_id] ?? r.tenant_id;
      const key: Key = { tenant, component_type: ct, calc_intent_op: op };
      const ks = JSON.stringify(key);
      if (!counts.has(ks)) counts.set(ks, { key, count: 0, ruleSets: new Set() });
      counts.get(ks)!.count++;
      counts.get(ks)!.ruleSets.add(r.name);
    }
  }
  console.log('tenant | component_type | calc_intent_op | count');
  console.log('--------------------------------------------------');
  const sorted = Array.from(counts.values()).sort((a, b) => {
    if (a.key.tenant !== b.key.tenant) return a.key.tenant.localeCompare(b.key.tenant);
    return b.count - a.count;
  });
  for (const e of sorted) {
    console.log(`${e.key.tenant} | ${e.key.component_type} | ${e.key.calc_intent_op} | ${e.count}`);
  }

  console.log('\n=== Step 0E.7 — Components where componentType != calc_intent_op ===\n');
  const divergent = sorted.filter(e =>
    e.key.component_type !== 'NULL' && e.key.calc_intent_op !== 'NULL' && e.key.component_type !== e.key.calc_intent_op);
  if (divergent.length === 0) {
    console.log('NO DIVERGENT ROWS.');
  } else {
    console.log('tenant | component_type | calc_intent_op | count');
    console.log('--------------------------------------------------');
    for (const e of divergent) {
      console.log(`${e.key.tenant} | ${e.key.component_type} | ${e.key.calc_intent_op} | ${e.count}`);
    }
  }

  // No-intent components
  const noIntent = sorted.filter(e => e.key.calc_intent_op === 'NULL');
  console.log('\n=== Components with NO calculationIntent ===');
  if (noIntent.length === 0) {
    console.log('All components have a calculationIntent.');
  } else {
    for (const e of noIntent) {
      console.log(`${e.key.tenant} | componentType="${e.key.component_type}" | NO intent | ${e.count}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
