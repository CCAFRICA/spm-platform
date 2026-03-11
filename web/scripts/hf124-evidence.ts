import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const MERIDIAN = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

async function go() {
  // ── 1A: Ingestion Events ──
  console.log('=== 1A: INGESTION EVENTS ===');
  const { count: ieCount, error: ieErr } = await sb.from('ingestion_events')
    .select('*', { count: 'exact', head: true }).eq('tenant_id', T);
  if (ieErr) {
    console.log(`Query error: ${ieErr.message}`);
  } else {
    console.log(`total: ${ieCount}`);
  }
  if (ieCount && ieCount > 0) {
    const { data: ieDates } = await sb.from('ingestion_events')
      .select('created_at').eq('tenant_id', T).order('created_at').limit(1);
    const { data: ieDatesMax } = await sb.from('ingestion_events')
      .select('created_at').eq('tenant_id', T).order('created_at', { ascending: false }).limit(1);
    console.log(`first_event: ${ieDates?.[0]?.created_at}`);
    console.log(`last_event: ${ieDatesMax?.[0]?.created_at}`);
  }

  // ── 1B: Classification Signals ──
  console.log('\n=== 1B: CLASSIFICATION SIGNALS ===');
  const { data: csAll } = await sb.from('classification_signals')
    .select('signal_type').eq('tenant_id', T);
  if (csAll && csAll.length > 0) {
    const counts: Record<string, number> = {};
    for (const r of csAll) counts[r.signal_type] = (counts[r.signal_type] || 0) + 1;
    for (const [type, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }
  } else {
    console.log('  (no classification signals found)');
  }

  // ── 1C: Convergence Mappings (from rule_sets.input_bindings) ──
  console.log('\n=== 1C: CONVERGENCE BINDINGS ===');
  const { data: rs } = await sb.from('rule_sets').select('input_bindings')
    .eq('id', 'b1c20001-aaaa-bbbb-cccc-222222222222').maybeSingle();
  if (rs?.input_bindings) {
    const ib = rs.input_bindings as Record<string, unknown>;
    const cb = ib.convergence_bindings as Record<string, Record<string, unknown>>;
    const mm = ib.metric_mappings as Record<string, string>;
    if (cb) {
      const bindingCount = Object.keys(cb).length;
      console.log(`convergence_bindings: ${bindingCount} component bindings`);
      for (const [compKey, bindings] of Object.entries(cb)) {
        for (const [role, binding] of Object.entries(bindings)) {
          const b = binding as Record<string, unknown>;
          console.log(`  ${compKey} / ${role} → column: ${b.column}, source: ${b.source}`);
        }
      }
    }
    if (mm) {
      console.log(`\nmetric_mappings: ${Object.keys(mm).length} mappings`);
      for (const [metric, field] of Object.entries(mm)) {
        console.log(`  ${metric} → ${field}`);
      }
    }
  }

  // ── 1D: Committed Data ──
  console.log('\n=== 1D: COMMITTED DATA ===');
  const { count: cdTotal } = await sb.from('committed_data')
    .select('*', { count: 'exact', head: true }).eq('tenant_id', T);
  const { data: cdDates } = await sb.from('committed_data')
    .select('source_date').eq('tenant_id', T).not('source_date', 'is', null);
  const dates = new Set(cdDates?.map(r => r.source_date));
  const sortedDates = Array.from(dates).sort();
  console.log(`total_rows: ${cdTotal}`);
  console.log(`distinct_dates: ${dates.size}`);
  console.log(`earliest: ${sortedDates[0] || 'null'}`);
  console.log(`latest: ${sortedDates[sortedDates.length - 1] || 'null'}`);

  // Also show by data_type
  const { data: cdByType } = await sb.from('committed_data')
    .select('data_type').eq('tenant_id', T);
  const typeCounts: Record<string, number> = {};
  for (const r of cdByType || []) typeCounts[r.data_type || 'null'] = (typeCounts[r.data_type || 'null'] || 0) + 1;
  console.log('by data_type:');
  for (const [t, c] of Object.entries(typeCounts)) console.log(`  ${t}: ${c}`);

  // ── 1E: Entities ──
  console.log('\n=== 1E: ENTITIES ===');
  const { count: entCount } = await sb.from('entities')
    .select('*', { count: 'exact', head: true }).eq('tenant_id', T);
  const { data: entTypes } = await sb.from('entities').select('entity_type').eq('tenant_id', T);
  const typeSet = new Set(entTypes?.map(e => e.entity_type || 'null'));
  console.log(`total: ${entCount}`);
  console.log(`entity_types: ${Array.from(typeSet).join(', ')}`);

  // ── 1F: Entity Relationships ──
  console.log('\n=== 1F: ENTITY RELATIONSHIPS ===');
  const { count: erCount } = await sb.from('entity_relationships')
    .select('*', { count: 'exact', head: true }).eq('tenant_id', T);
  const { data: erTypes } = await sb.from('entity_relationships')
    .select('relationship_type').eq('tenant_id', T);
  const relTypeSet = new Set(erTypes?.map(r => r.relationship_type));
  console.log(`total: ${erCount}`);
  console.log(`relationship_types: ${Array.from(relTypeSet).join(', ') || '(none)'}`);

  // ── 1G: Calculation Results per Period ──
  console.log('\n=== 1G: CALCULATION RESULTS PER PERIOD ===');
  const { data: periods } = await sb.from('periods').select('id, canonical_key, start_date')
    .eq('tenant_id', T).order('start_date');
  for (const p of periods || []) {
    const { data: crRows } = await sb.from('calculation_results').select('total_payout')
      .eq('tenant_id', T).eq('period_id', p.id);
    let sum = 0;
    const count = crRows?.length || 0;
    for (const r of crRows || []) sum += (r.total_payout as number) || 0;
    console.log(`${p.canonical_key}: entity_count=${count}, period_total=$${sum}`);
  }

  // ── 1H: Grand Total ──
  console.log('\n=== 1H: GRAND TOTAL ===');
  const { data: allCr } = await sb.from('calculation_results').select('total_payout')
    .eq('tenant_id', T);
  let grandTotal = 0;
  for (const r of allCr || []) grandTotal += (r.total_payout as number) || 0;
  console.log(`grand_total: $${grandTotal}`);
  console.log(`expected: $321,381`);
  console.log(`delta: $${grandTotal - 321381}`);

  // ── 1I: Anchor Entities — March 2026 ──
  console.log('\n=== 1I: ANCHOR ENTITIES — March 2026 ===');
  const marchPeriod = periods?.find(p => p.canonical_key === '2026-03');
  if (marchPeriod) {
    for (const extId of ['BCL-5012', 'BCL-5063', 'BCL-5003']) {
      const { data: ent } = await sb.from('entities').select('id, external_id, display_name')
        .eq('tenant_id', T).eq('external_id', extId).maybeSingle();
      if (!ent) { console.log(`${extId}: NOT FOUND`); continue; }
      const { data: cr } = await sb.from('calculation_results').select('total_payout, components')
        .eq('tenant_id', T).eq('entity_id', ent.id).eq('period_id', marchPeriod.id).maybeSingle();
      if (!cr) { console.log(`${extId}: NO RESULT`); continue; }
      console.log(`\n${extId} (${ent.display_name}): total=$${cr.total_payout}`);
      const comps = cr.components as Array<Record<string, unknown>>;
      for (const c of comps || []) {
        console.log(`  ${c.componentName}: $${c.payout}`);
      }
    }
  }

  // ── 1J: Meridian Regression ──
  console.log('\n=== 1J: MERIDIAN REGRESSION ===');
  const { data: meridianCr } = await sb.from('calculation_results').select('total_payout')
    .eq('tenant_id', MERIDIAN);
  let meridianTotal = 0;
  for (const r of meridianCr || []) meridianTotal += (r.total_payout as number) || 0;
  console.log(`meridian_total: $${meridianTotal}`);
  console.log(`expected: MX$185,063`);
  console.log(`delta: $${meridianTotal - 185063}`);
}
go();
