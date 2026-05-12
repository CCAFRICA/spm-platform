// DIAG-029 D4 — BCL rule_sets.input_bindings + classification_signals state
// Read-only via Supabase JS client.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const BCL_TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

async function main() {
  // Confirm BCL tenant
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, name, currency')
    .eq('id', BCL_TENANT_ID)
    .single();
  if (tErr) { console.log('TENANT_ERROR:', JSON.stringify(tErr)); return; }
  console.log(`TENANT: ${tenant.name} (${tenant.id}, ${tenant.currency})`);

  // Rule sets + input_bindings shape
  console.log('\n=== RULE_SETS ===');
  const { data: ruleSets, error: rsErr } = await supabase
    .from('rule_sets')
    .select('id, name, input_bindings, updated_at')
    .eq('tenant_id', BCL_TENANT_ID)
    .order('updated_at', { ascending: false });
  if (rsErr) { console.log('RS_ERROR:', JSON.stringify(rsErr)); return; }
  for (const rs of ruleSets || []) {
    const ib = rs.input_bindings as Record<string, unknown> | null;
    const derivations = Array.isArray(ib?.metric_derivations) ? ib.metric_derivations as unknown[] : [];
    const bindings = Array.isArray(ib?.convergence_bindings) ? ib.convergence_bindings as unknown[] : [];
    const metricMappings = ib?.metric_mappings as Record<string, string> | null;
    console.log(`  ${rs.id} | ${rs.name}`);
    console.log(`    updated: ${rs.updated_at}`);
    console.log(`    input_bindings keys: ${ib ? Object.keys(ib).join(', ') : 'NULL'}`);
    console.log(`    derivation_count: ${derivations.length}`);
    console.log(`    binding_count: ${bindings.length}`);
    console.log(`    metric_mappings: ${metricMappings ? Object.keys(metricMappings).length + ' entries' : 'NULL'}`);
    if (derivations.length > 0) {
      console.log('    --- derivations ---');
      for (const d of derivations as Array<Record<string, unknown>>) {
        console.log(`      metric=${d.metric} op=${d.operation} source=${d.source_field ?? ''} filters=${JSON.stringify(d.filters ?? [])}`);
      }
    }
    if (bindings.length > 0) {
      console.log('    --- bindings ---');
      for (const b of bindings as Array<Record<string, unknown>>) {
        console.log(`      component_index=${b.component_index} ${JSON.stringify(b).substring(0,200)}`);
      }
    }
    if (metricMappings) {
      console.log('    --- metric_mappings ---');
      for (const [k, v] of Object.entries(metricMappings)) console.log(`      ${k} → ${v}`);
    }
  }

  // Classification signals — metric_comprehension
  console.log('\n=== CLASSIFICATION_SIGNALS — metric_comprehension ===');
  const { data: sigs, error: sigErr } = await supabase
    .from('classification_signals')
    .select('signal_type, rule_set_id, metric_name, component_index, signal_value, created_at')
    .eq('tenant_id', BCL_TENANT_ID)
    .eq('signal_type', 'metric_comprehension')
    .order('component_index')
    .order('metric_name');
  if (sigErr) {
    console.log('SIG_ERROR (signal_type=metric_comprehension):', JSON.stringify(sigErr));
  } else {
    for (const s of sigs || []) {
      const sv = s.signal_value as Record<string, unknown> | null;
      console.log(`  rule_set=${s.rule_set_id?.substring(0,8)} component=${s.component_index} metric=${s.metric_name}`);
      console.log(`    label=${sv?.metric_label ?? ''} intent=${(sv?.semantic_intent as string)?.substring(0,80) ?? ''}`);
      console.log(`    inputs=${JSON.stringify(sv?.metric_inputs ?? null).substring(0,200)}`);
      console.log(`    created=${s.created_at}`);
    }
    console.log(`  (${sigs?.length ?? 0} metric_comprehension signals)`);
  }

  // Classification signals — comprehension:plan_interpretation
  console.log('\n=== CLASSIFICATION_SIGNALS — comprehension:plan_interpretation ===');
  const { data: sigs2, error: sigErr2 } = await supabase
    .from('classification_signals')
    .select('signal_type, rule_set_id, metric_name, component_index, signal_value, created_at')
    .eq('tenant_id', BCL_TENANT_ID)
    .eq('signal_type', 'comprehension:plan_interpretation')
    .order('component_index')
    .order('metric_name');
  if (sigErr2) {
    console.log('SIG_ERROR (signal_type=comprehension:plan_interpretation):', JSON.stringify(sigErr2));
  } else {
    for (const s of sigs2 || []) {
      const sv = s.signal_value as Record<string, unknown> | null;
      console.log(`  rule_set=${s.rule_set_id?.substring(0,8)} component=${s.component_index} metric=${s.metric_name}`);
      console.log(`    label=${sv?.metric_label ?? ''} intent=${(sv?.semantic_intent as string)?.substring(0,80) ?? ''}`);
      console.log(`    inputs=${JSON.stringify(sv?.metric_inputs ?? null).substring(0,200)}`);
      console.log(`    created=${s.created_at}`);
    }
    console.log(`  (${sigs2?.length ?? 0} comprehension:plan_interpretation signals)`);
  }

  // Distinct signal_types for BCL
  console.log('\n=== DISTINCT signal_types (BCL) ===');
  const { data: allSigs } = await supabase
    .from('classification_signals')
    .select('signal_type')
    .eq('tenant_id', BCL_TENANT_ID);
  const typeCount = new Map<string, number>();
  for (const r of allSigs || []) typeCount.set(r.signal_type, (typeCount.get(r.signal_type) ?? 0) + 1);
  for (const [t, n] of Array.from(typeCount.entries()).sort((a,b)=>b[1]-a[1])) console.log(`  ${t}: ${n}`);
}

main().catch(e => { console.error('ERROR:', e?.message ?? e); process.exit(1); });
