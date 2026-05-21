// DIAG-051 Probe 2: Plan 4 calculationIntent + DM entity metadata + cross-plan derivations.
import { createClient } from '@supabase/supabase-js';

const TENANT = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

(async () => {
  // 2A — Plan 4 input_bindings + components
  const { data: plan4 } = await sb
    .from('rule_sets')
    .select('id, name, input_bindings, components')
    .eq('tenant_id', TENANT)
    .eq('name', 'District Override Plan')
    .single();

  console.log('=== Probe 2A: Plan 4 row id + name ===');
  console.log('id:', plan4?.id);
  console.log('name:', plan4?.name);

  console.log('\n=== Probe 2A: Plan 4 input_bindings ===');
  console.log(JSON.stringify(plan4?.input_bindings, null, 2));

  console.log('\n=== Probe 2A: Plan 4 components ===');
  console.log(JSON.stringify(plan4?.components, null, 2));

  // 2B — DM entity metadata
  console.log('\n=== Probe 2B: DM-candidate entities (CRP-6001..CRP-6006) ===');
  const { data: dms } = await sb
    .from('entities')
    .select('external_id, display_name, metadata, temporal_attributes')
    .eq('tenant_id', TENANT)
    .in('external_id', ['CRP-6001', 'CRP-6002', 'CRP-6003', 'CRP-6004', 'CRP-6005', 'CRP-6006']);

  for (const e of dms ?? []) {
    console.log(
      e.external_id,
      JSON.stringify(e.display_name),
      'metadata=' + JSON.stringify(e.metadata),
      'temporal_attrs=' + JSON.stringify(e.temporal_attributes ?? []).slice(0, 200),
    );
  }

  // Also sample more broadly to find anyone with job_title=District Manager
  console.log('\n=== Probe 2B: entities with job_title=District Manager (search) ===');
  const { data: all } = await sb
    .from('entities')
    .select('external_id, display_name, metadata')
    .eq('tenant_id', TENANT)
    .limit(50);
  for (const e of all ?? []) {
    const m = e.metadata as Record<string, unknown> | null;
    const ta = (m?.temporal_attributes as Array<Record<string, unknown>> | undefined) ?? [];
    const role = m?.role || m?.job_title || ta.find(a => a.key === 'job_title' || a.key === 'role')?.value;
    if (typeof role === 'string' && /district|manager/i.test(role)) {
      console.log(e.external_id, JSON.stringify(e.display_name), 'role=' + role,
        'district=' + (m?.district ?? '-'),
        'region=' + (m?.region ?? '-'),
        'metaKeys=[' + Object.keys(m ?? {}).join(',') + ']');
    }
  }

  // 2C — cross-plan derivations (all four plans)
  console.log('\n=== Probe 2C: All CRP plans — metric_derivations ===');
  const { data: allPlans } = await sb
    .from('rule_sets')
    .select('name, input_bindings')
    .eq('tenant_id', TENANT);
  for (const rs of allPlans ?? []) {
    const ib = rs.input_bindings as Record<string, unknown> | null;
    const derivs = (ib?.metric_derivations as Array<Record<string, unknown>> | undefined) ?? [];
    console.log('--- ' + rs.name + ' (' + derivs.length + ' derivations) ---');
    for (const d of derivs) {
      const filters = d.filters as Array<Record<string, unknown>> | undefined;
      const filtersStr = filters && filters.length > 0
        ? filters.map(f => `${f.field}${f.operator}${JSON.stringify(f.value)}`).join('&')
        : '(none)';
      console.log(
        `  metric=${d.metric} op=${d.operation} source_field=${d.source_field ?? '-'} source_pattern=${d.source_pattern ?? '-'} filters=${filtersStr}`,
      );
    }
  }
})();
