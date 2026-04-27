/**
 * AUD-004 Phase 0E — Production rule_set shape inventory
 * Read-only DB queries.
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const REFERENCE_TENANT_IDS = [
  'b1c2d3e4-aaaa-bbbb-cccc-111111111111', // BCL
  'e44bbcb1-2710-4880-8c7d-a1bd902720b7', // CRP
];

async function main() {
  console.log('=== Step 0E.1 — Tenant Identification ===\n');

  // (a) reference tenants by ID + name match
  const { data: refTenants, error: e1 } = await sb
    .from('tenants')
    .select('id, name, slug, created_at')
    .or(
      `id.in.(${REFERENCE_TENANT_IDS.join(',')}),name.ilike.%meridian%,name.ilike.%cumbre%,name.ilike.%cascade%`
    );
  if (e1) {
    console.log('ERROR:', e1.message);
  } else {
    console.log('Reference-pattern matches:');
    for (const t of refTenants || []) {
      console.log(`  ${t.id} | ${t.name} | ${t.slug} | ${t.created_at}`);
    }
  }

  // (b) all OTHER tenants
  const { data: allTenants, error: e2 } = await sb
    .from('tenants')
    .select('id, name, slug, created_at')
    .order('created_at', { ascending: false });
  if (e2) {
    console.log('ERROR:', e2.message);
  } else {
    const refIds = new Set((refTenants || []).map(t => t.id));
    console.log(`\nAll tenants in DB (total ${(allTenants || []).length}):`);
    for (const t of allTenants || []) {
      const isRef = refIds.has(t.id) ? ' [REF]' : '';
      console.log(`  ${t.id} | ${t.name} | ${t.slug} | ${t.created_at}${isRef}`);
    }
  }

  console.log('\n=== Step 0E.2 — JSONB SQL Gate (Raw column dump) ===\n');

  const { data: oneRs, error: e3 } = await sb
    .from('rule_sets')
    .select('id, tenant_id, name, status, components')
    .eq('status', 'active')
    .limit(1);
  if (e3) {
    console.log('ERROR:', e3.message);
  } else if (!oneRs || oneRs.length === 0) {
    console.log('NO ACTIVE rule_sets in DB');
  } else {
    const r = oneRs[0];
    console.log(`id=${r.id}, tenant_id=${r.tenant_id}, name="${r.name}", status=${r.status}`);
    console.log(`components is array: ${Array.isArray(r.components)}, components.length: ${Array.isArray(r.components) ? r.components.length : 'N/A'}`);
    if (Array.isArray(r.components)) {
      console.log('First component (verbatim):');
      console.log(JSON.stringify(r.components[0], null, 2));
    } else {
      console.log('Raw components value:');
      console.log(JSON.stringify(r.components, null, 2).slice(0, 2000));
    }
  }

  console.log('\n=== Step 0E.3-5 — Per-tenant rule_set shapes ===\n');

  // Look at all rule_sets per reference tenant + active state
  for (const tid of REFERENCE_TENANT_IDS) {
    console.log(`\n--- Tenant ${tid} ---`);
    const { data: rs, error: ers } = await sb
      .from('rule_sets')
      .select('id, name, status, version, created_at, components, input_bindings')
      .eq('tenant_id', tid)
      .order('created_at', { ascending: false });
    if (ers) { console.log('ERROR:', ers.message); continue; }
    if (!rs || rs.length === 0) { console.log('  (no rule_sets at all for this tenant)'); continue; }
    console.log(`  Total rule_sets: ${rs.length}`);
    const activeCount = rs.filter(r => r.status === 'active').length;
    console.log(`  Active: ${activeCount}, non-active: ${rs.length - activeCount}`);
    for (const r of rs) {
      const compCount = Array.isArray(r.components) ? r.components.length : 'N/A';
      console.log(`  ${r.id} | name="${r.name}" | status=${r.status} | v${r.version} | ${compCount} components | ${r.created_at}`);
      if (r.status === 'active' && Array.isArray(r.components)) {
        for (let i = 0; i < r.components.length; i++) {
          const c: Record<string, unknown> = r.components[i] as Record<string, unknown>;
          const intent = c.calculationIntent as Record<string, unknown> | undefined;
          const intentOp = intent?.operation;
          const tier = c.tierConfig as Record<string, unknown> | undefined;
          const tierLen = tier?.tiers as unknown[] | undefined;
          const meta = c.metadata as Record<string, unknown> | undefined;
          const metaIntent = meta?.intent as Record<string, unknown> | undefined;
          const metaIntentOp = metaIntent?.operation;
          console.log(`    [${i}] name="${c.name}" componentType="${c.componentType}" calcIntentOp="${intentOp ?? '—'}" metaIntentOp="${metaIntentOp ?? '—'}" tierCount=${Array.isArray(tierLen) ? tierLen.length : '—'}`);
        }
      }
    }
  }

  console.log('\n=== Step 0E.5b — Meridian search (any name pattern) ===\n');
  const { data: meri } = await sb.from('tenants').select('id, name, slug').ilike('name', '%meridian%');
  console.log(`Meridian-name tenants: ${(meri || []).length}`);
  for (const t of meri || []) console.log(`  ${t.id} | ${t.name} | ${t.slug}`);

  console.log('\n=== Step 0E.6 — Cross-tenant operation-vocabulary aggregation (active rule_sets) ===\n');

  const { data: allActive, error: eaa } = await sb
    .from('rule_sets')
    .select('tenant_id, components, status, name')
    .eq('status', 'active');
  if (eaa) { console.log('ERROR:', eaa.message); return; }

  const { data: allTenList } = await sb.from('tenants').select('id, name');
  const tenName = new Map<string, string>();
  for (const t of allTenList || []) tenName.set(t.id, t.name);

  type Key = { tenant: string; component_type: string | null; calc_intent_op: string | null };
  const counts = new Map<string, { key: Key; count: number; ruleSets: Set<string> }>();

  for (const r of (allActive || []) as Array<{ tenant_id: string; components: unknown; name: string }>) {
    if (!Array.isArray(r.components)) continue;
    for (const c of r.components as Record<string, unknown>[]) {
      const componentType = (c.componentType as string) ?? null;
      const intent = c.calculationIntent as Record<string, unknown> | undefined;
      const calcOp = (intent?.operation as string) ?? null;
      const key: Key = { tenant: tenName.get(r.tenant_id) ?? r.tenant_id, component_type: componentType, calc_intent_op: calcOp };
      const ks = JSON.stringify(key);
      if (!counts.has(ks)) counts.set(ks, { key, count: 0, ruleSets: new Set() });
      const e = counts.get(ks)!;
      e.count++;
      e.ruleSets.add(r.name);
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
    e.key.component_type !== null && e.key.calc_intent_op !== null && e.key.component_type !== e.key.calc_intent_op);
  if (divergent.length === 0) {
    console.log('NO DIVERGENT ROWS.');
  } else {
    console.log('tenant | component_type | calc_intent_op | count');
    console.log('--------------------------------------------------');
    for (const e of divergent) {
      console.log(`${e.key.tenant} | ${e.key.component_type} | ${e.key.calc_intent_op} | ${e.count}`);
    }
  }

  // Also: what about components where calc_intent_op is null (no intent at all)?
  const noIntent = sorted.filter(e => e.key.calc_intent_op === null);
  console.log('\n=== Components with NO calculationIntent at all ===');
  if (noIntent.length === 0) {
    console.log('All components have a calculationIntent.');
  } else {
    for (const e of noIntent) {
      console.log(`${e.key.tenant} | componentType="${e.key.component_type}" | NO calcIntent | ${e.count}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
