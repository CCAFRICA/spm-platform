import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

  console.log('=== 2.1 CRP rule_sets metric_derivations + convergence_bindings ===');
  const { data: plans } = await sb
    .from('rule_sets')
    .select('id, name, input_bindings')
    .eq('tenant_id', tenantId);

  for (const p of plans ?? []) {
    const bindings = (p.input_bindings ?? {}) as Record<string, unknown>;
    const derivations = (bindings.metric_derivations ?? []) as Array<Record<string, unknown>>;
    const cb = (bindings.convergence_bindings ?? {}) as Record<string, unknown>;
    console.log(`\n--- ${p.name} (${p.id}) ---`);
    console.log(`metric_derivations (${derivations.length}):`);
    for (const d of derivations) {
      console.log(`  metric=${d.metric} op=${d.operation} source_pattern=${JSON.stringify(d.source_pattern)} source_field=${d.source_field ?? 'N/A'} filters=${JSON.stringify(d.filters ?? [])}`);
    }
    console.log(`convergence_bindings keys: ${Object.keys(cb).join(', ') || '(none)'}`);
    for (const [k, v] of Object.entries(cb)) {
      const binding = (v ?? {}) as Record<string, unknown>;
      for (const [role, entry] of Object.entries(binding)) {
        if (role === 'period' || role === 'entity_identifier') continue;
        const e = (entry ?? {}) as Record<string, unknown>;
        console.log(`  ${k}.${role} → column=${e.column ?? 'N/A'} filters=${JSON.stringify(e.filters ?? [])}`);
      }
    }
  }

  console.log('\n\n=== 2.2 Distinct data_type values in committed_data ===');
  const { data: types } = await sb
    .from('committed_data')
    .select('data_type')
    .eq('tenant_id', tenantId);
  const unique = Array.from(new Set((types ?? []).map(r => r.data_type)));
  console.log(`Distinct data_type values (${unique.length}):`);
  for (const dt of unique) {
    const { count } = await sb
      .from('committed_data')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('data_type', dt);
    console.log(`  ${JSON.stringify(dt)} → ${count ?? 0} rows`);
  }

  console.log('\n=== 2.2 Tyler Morrison (CRP-6007) committed_data sample ===');
  // Find Tyler by entity name first (entity_identifier column may not exist on committed_data)
  const { data: entities } = await sb
    .from('entities')
    .select('id, external_id, display_name')
    .eq('tenant_id', tenantId)
    .ilike('display_name', '%Tyler%Morrison%')
    .limit(3);
  for (const e of entities ?? []) {
    console.log(`Entity: ${e.display_name} ext=${e.external_id} id=${e.id}`);
  }
  const eid = entities?.[0]?.id;
  if (eid) {
    const { data: rows } = await sb
      .from('committed_data')
      .select('data_type, source_date, row_data')
      .eq('tenant_id', tenantId)
      .eq('entity_id', eid)
      .limit(8);
    for (const r of rows ?? []) {
      const rd = (r.row_data ?? {}) as Record<string, unknown>;
      const keys = Object.keys(rd).sort().join(',');
      console.log(`  data_type=${JSON.stringify(r.data_type)} source_date=${r.source_date} keys=${keys}`);
      if (rd.product_category) console.log(`    product_category=${rd.product_category}`);
      if (rd.order_type) console.log(`    order_type=${rd.order_type}`);
    }
  }

  console.log('\n\n=== 2.3 Regex test: each derivation source_pattern vs each data_type ===');
  const patterns = new Set<string>();
  for (const p of plans ?? []) {
    const bindings = (p.input_bindings ?? {}) as Record<string, unknown>;
    const derivations = (bindings.metric_derivations ?? []) as Array<Record<string, unknown>>;
    for (const d of derivations) {
      if (typeof d.source_pattern === 'string') patterns.add(d.source_pattern);
    }
  }
  for (const pat of patterns) {
    let regex: RegExp | null = null;
    try { regex = new RegExp(pat, 'i'); } catch { regex = null; }
    console.log(`pattern=${JSON.stringify(pat)}`);
    if (!regex) { console.log('  (invalid regex)'); continue; }
    for (const dt of unique) {
      console.log(`  vs ${JSON.stringify(dt)} → ${regex.test(String(dt))}`);
    }
  }
}

main();
