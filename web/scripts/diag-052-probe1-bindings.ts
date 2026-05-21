// DIAG-052 Probe 1: stored bindings (full JSONB) across all rule_sets + structural_fingerprints state.

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

(async () => {
  const { data: tenants } = await sb.from('tenants').select('id, name').order('name');
  const tenantNameById = new Map((tenants ?? []).map(t => [t.id, t.name]));

  console.log('=== PROBE 1 — Stored bindings (rule_sets.input_bindings, full JSONB) ===\n');

  const { data: ruleSets, error } = await sb
    .from('rule_sets')
    .select('id, name, tenant_id, input_bindings, status')
    .order('tenant_id');
  if (error) { console.error('rule_sets error', error); process.exit(1); }

  for (const rs of (ruleSets ?? [])) {
    const tName = tenantNameById.get(rs.tenant_id) ?? rs.tenant_id;
    console.log(`──── ${tName} / "${rs.name}" [${rs.id}] status=${rs.status} ────`);
    const ib = rs.input_bindings;
    if (ib === null) {
      console.log('  input_bindings: NULL');
    } else if (ib === undefined) {
      console.log('  input_bindings: <undefined>');
    } else if (typeof ib === 'object' && Object.keys(ib).length === 0) {
      console.log('  input_bindings: {} (empty object)');
    } else if (typeof ib === 'object') {
      const obj = ib as Record<string, unknown>;
      const topKeys = Object.keys(obj);
      console.log(`  top-level keys: [${topKeys.join(', ')}]`);
      const cb = obj.component_bindings;
      const md = obj.metric_derivations;
      console.log(`  component_bindings: ${Array.isArray(cb) ? `array len=${cb.length}` : cb === undefined ? '<absent>' : typeof cb}`);
      console.log(`  metric_derivations: ${Array.isArray(md) ? `array len=${md.length}` : md === undefined ? '<absent>' : typeof md}`);
      const pretty = JSON.stringify(ib, null, 2);
      console.log(`  full content (truncated to 2000):`);
      console.log(pretty.length > 2000 ? pretty.slice(0, 2000) + '\n  ... [TRUNCATED]' : pretty);
    } else {
      console.log(`  input_bindings: ${String(ib)} (type=${typeof ib})`);
    }
    console.log();
  }

  console.log('\n=== structural_fingerprints state ===\n');
  for (const t of (tenants ?? [])) {
    const { data: fps, count } = await sb
      .from('structural_fingerprints')
      .select('cache_key, created_at, signature_type', { count: 'exact' })
      .eq('tenant_id', t.id);
    console.log(`── ${t.name} [${t.id}] ──`);
    console.log(`  count: ${count}`);
    for (const f of (fps ?? [])) {
      console.log(`  cache_key=${f.cache_key} signature_type=${f.signature_type} created_at=${f.created_at}`);
    }
  }
})();
