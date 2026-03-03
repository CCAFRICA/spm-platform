// CC-UAT-06: Optica Luminar Full Diagnostic
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/cc-uat-06-optica-diagnostic.ts

import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SEP = '='.repeat(50);

function section(title: string) {
  console.log(`\n${SEP}`);
  console.log(`SECTION ${title}`);
  console.log(SEP);
}

async function main() {
  console.log(SEP);
  console.log('CC-UAT-06: OPTICA LUMINAR FULL DIAGNOSTIC');
  console.log(SEP);

  // Resolve tenant
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, name, slug, currency')
    .ilike('slug', '%optica%')
    .limit(1)
    .single();

  if (tErr || !tenant) {
    console.log('FATAL: No tenant with slug like optica found');
    return;
  }
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`Currency: ${tenant.currency}`);
  const tid = tenant.id;

  // ════════════════════════════════════════════════
  // SECTION 1: ENGINE CONTRACT STATUS
  // ════════════════════════════════════════════════
  section('1: ENGINE CONTRACT STATUS');
  try {
    const [
      { count: entityCount },
      { count: periodCount },
      { count: assignmentCount },
      { count: totalDataCount },
    ] = await Promise.all([
      supabase.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', tid),
      supabase.from('periods').select('*', { count: 'exact', head: true }).eq('tenant_id', tid),
      supabase.from('rule_set_assignments').select('*', { count: 'exact', head: true }).eq('tenant_id', tid),
      supabase.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', tid),
    ]);

    const { data: activePlans } = await supabase
      .from('rule_sets')
      .select('id, name, status, components, input_bindings')
      .eq('tenant_id', tid)
      .eq('status', 'active');

    const activeRS = activePlans?.[0];
    const components = Array.isArray(activeRS?.components) ? activeRS.components : [];

    // Bound rows (both entity_id AND period_id not null)
    const { count: boundCount } = await supabase
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tid)
      .not('entity_id', 'is', null)
      .not('period_id', 'is', null);

    const orphanedCount = (totalDataCount ?? 0) - (boundCount ?? 0);

    console.log(`  entity_count:       ${entityCount}`);
    console.log(`  period_count:       ${periodCount}`);
    console.log(`  active_plans:       ${activePlans?.length ?? 0}`);
    console.log(`  component_count:    ${components.length}`);
    console.log(`  assignment_count:   ${assignmentCount}`);
    console.log(`  total_data_rows:    ${totalDataCount}`);
    console.log(`  bound_data_rows:    ${boundCount}`);
    console.log(`  orphaned_data_rows: ${orphanedCount}`);
  } catch (e) {
    console.log(`  ERROR: ${e}`);
  }

  // ════════════════════════════════════════════════
  // SECTION 2: DATA LANDSCAPE
  // ════════════════════════════════════════════════
  section('2: DATA LANDSCAPE');

  // 2A: Row counts by binding status
  console.log('\n--- 2A: Row counts by binding status ---');
  try {
    const [
      { count: fullyBound },
      { count: entityOnly },
      { count: periodOnly },
      { count: fullyOrphaned },
      { count: total },
    ] = await Promise.all([
      supabase.from('committed_data').select('*', { count: 'exact', head: true })
        .eq('tenant_id', tid).not('entity_id', 'is', null).not('period_id', 'is', null),
      supabase.from('committed_data').select('*', { count: 'exact', head: true })
        .eq('tenant_id', tid).not('entity_id', 'is', null).is('period_id', null),
      supabase.from('committed_data').select('*', { count: 'exact', head: true })
        .eq('tenant_id', tid).is('entity_id', null).not('period_id', 'is', null),
      supabase.from('committed_data').select('*', { count: 'exact', head: true })
        .eq('tenant_id', tid).is('entity_id', null).is('period_id', null),
      supabase.from('committed_data').select('*', { count: 'exact', head: true })
        .eq('tenant_id', tid),
    ]);
    console.log(`  fully_bound (entity+period):  ${fullyBound}`);
    console.log(`  entity_only (no period):      ${entityOnly}`);
    console.log(`  period_only (no entity):       ${periodOnly}`);
    console.log(`  fully_orphaned (neither):      ${fullyOrphaned}`);
    console.log(`  total:                         ${total}`);
  } catch (e) {
    console.log(`  ERROR: ${e}`);
  }

  // 2B: Bound rows by period
  console.log('\n--- 2B: Bound rows by period ---');
  try {
    const { data: periods } = await supabase
      .from('periods')
      .select('id, label, canonical_key')
      .eq('tenant_id', tid)
      .order('start_date');

    for (const p of periods || []) {
      const { count: boundInPeriod } = await supabase
        .from('committed_data')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tid)
        .eq('period_id', p.id)
        .not('entity_id', 'is', null);

      const { count: totalInPeriod } = await supabase
        .from('committed_data')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tid)
        .eq('period_id', p.id);

      console.log(`  ${p.label} (${p.canonical_key}): ${boundInPeriod} bound, ${totalInPeriod} total`);
    }
  } catch (e) {
    console.log(`  ERROR: ${e}`);
  }

  // 2C: Bound rows by data_type (sheet name)
  console.log('\n--- 2C: Bound rows by data_type ---');
  try {
    // Get distinct data_types from bound rows
    const { data: boundSample } = await supabase
      .from('committed_data')
      .select('data_type')
      .eq('tenant_id', tid)
      .not('entity_id', 'is', null)
      .not('period_id', 'is', null)
      .limit(1000);

    const dtCounts = new Map<string, number>();
    for (const r of boundSample || []) {
      const dt = r.data_type || '(null)';
      dtCounts.set(dt, (dtCounts.get(dt) || 0) + 1);
    }
    for (const [dt, count] of Array.from(dtCounts.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${dt}: ${count} bound rows`);
    }
    if ((boundSample?.length ?? 0) >= 1000) console.log('  (sample limited to 1000 rows)');
  } catch (e) {
    console.log(`  ERROR: ${e}`);
  }

  // 2D: ALL rows by data_type
  console.log('\n--- 2D: ALL rows by data_type ---');
  try {
    // Sample up to 5000 rows to count data_types
    const allDtCounts = new Map<string, { total: number; withEntity: number; withPeriod: number; bound: number }>();
    let offset = 0;
    const PAGE = 1000;
    let totalFetched = 0;
    while (totalFetched < 10000) {
      const { data: page } = await supabase
        .from('committed_data')
        .select('data_type, entity_id, period_id')
        .eq('tenant_id', tid)
        .range(offset, offset + PAGE - 1);

      if (!page || page.length === 0) break;
      for (const r of page) {
        const dt = r.data_type || '(null)';
        if (!allDtCounts.has(dt)) allDtCounts.set(dt, { total: 0, withEntity: 0, withPeriod: 0, bound: 0 });
        const c = allDtCounts.get(dt)!;
        c.total++;
        if (r.entity_id) c.withEntity++;
        if (r.period_id) c.withPeriod++;
        if (r.entity_id && r.period_id) c.bound++;
      }
      totalFetched += page.length;
      if (page.length < PAGE) break;
      offset += PAGE;
    }

    console.log(`  (sampled ${totalFetched} of total rows)`);
    console.log(`  ${'data_type'.padEnd(40)} total    bound    entity   period`);
    for (const [dt, c] of Array.from(allDtCounts.entries()).sort((a, b) => b[1].total - a[1].total)) {
      console.log(`  ${dt.padEnd(40)} ${String(c.total).padStart(6)}   ${String(c.bound).padStart(6)}   ${String(c.withEntity).padStart(6)}   ${String(c.withPeriod).padStart(6)}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${e}`);
  }

  // 2E: Entity coverage
  console.log('\n--- 2E: Entity coverage ---');
  try {
    // How many entities have ANY committed_data row with matching entity_id?
    const { data: entitiesWithData } = await supabase
      .from('committed_data')
      .select('entity_id')
      .eq('tenant_id', tid)
      .not('entity_id', 'is', null)
      .limit(5000);

    const uniqueEntityIds = new Set((entitiesWithData || []).map(r => r.entity_id));
    console.log(`  Entities with committed_data rows (entity_id set): ${uniqueEntityIds.size}`);

    // How many of those also have period_id?
    const { data: entitiesWithBound } = await supabase
      .from('committed_data')
      .select('entity_id')
      .eq('tenant_id', tid)
      .not('entity_id', 'is', null)
      .not('period_id', 'is', null)
      .limit(5000);

    const uniqueBoundEntityIds = new Set((entitiesWithBound || []).map(r => r.entity_id));
    console.log(`  Entities with BOUND rows (entity+period): ${uniqueBoundEntityIds.size}`);
  } catch (e) {
    console.log(`  ERROR: ${e}`);
  }

  // 2F: Sample bound rows - show row_data keys
  console.log('\n--- 2F: Sample bound row_data keys ---');
  try {
    const { data: sampleBound } = await supabase
      .from('committed_data')
      .select('entity_id, period_id, data_type, row_data')
      .eq('tenant_id', tid)
      .not('entity_id', 'is', null)
      .not('period_id', 'is', null)
      .limit(5);

    for (let i = 0; i < (sampleBound?.length ?? 0); i++) {
      const r = sampleBound![i];
      const rd = r.row_data as Record<string, unknown>;
      console.log(`\n  Sample ${i + 1}: data_type="${r.data_type}"`);
      console.log(`    entity_id: ${r.entity_id}`);
      console.log(`    period_id: ${r.period_id}`);
      const keys = Object.keys(rd);
      console.log(`    row_data keys (${keys.length}): ${keys.join(', ')}`);
      // Show first few values
      for (const k of keys.slice(0, 10)) {
        const v = rd[k];
        const vStr = typeof v === 'string' ? `"${v.slice(0, 80)}"` : JSON.stringify(v);
        console.log(`      ${k}: ${vStr}`);
      }
    }

    // Also sample unbound rows to see what they look like
    console.log('\n  --- Sample UNBOUND rows (entity_id IS NULL) ---');
    const { data: sampleUnbound } = await supabase
      .from('committed_data')
      .select('entity_id, period_id, data_type, row_data')
      .eq('tenant_id', tid)
      .is('entity_id', null)
      .limit(3);

    for (let i = 0; i < (sampleUnbound?.length ?? 0); i++) {
      const r = sampleUnbound![i];
      const rd = r.row_data as Record<string, unknown>;
      console.log(`\n  Unbound ${i + 1}: data_type="${r.data_type}", period_id=${r.period_id}`);
      const keys = Object.keys(rd);
      console.log(`    row_data keys (${keys.length}): ${keys.join(', ')}`);
      for (const k of keys.slice(0, 10)) {
        const v = rd[k];
        const vStr = typeof v === 'string' ? `"${v.slice(0, 80)}"` : JSON.stringify(v);
        console.log(`      ${k}: ${vStr}`);
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${e}`);
  }

  // ════════════════════════════════════════════════
  // SECTION 3: RULE SET ANATOMY
  // ════════════════════════════════════════════════
  section('3: RULE SET ANATOMY');

  const { data: activeRS } = await supabase
    .from('rule_sets')
    .select('id, name, status, components, input_bindings')
    .eq('tenant_id', tid)
    .eq('status', 'active')
    .single();

  if (!activeRS) {
    console.log('  ERROR: No active rule set found');
  } else {
    // 3A: Components
    console.log('\n--- 3A: Components ---');
    const comps = Array.isArray(activeRS.components) ? activeRS.components as any[] : [];
    for (let i = 0; i < comps.length; i++) {
      const c = comps[i];
      console.log(`\n  Component ${i + 1}: ${c.name}`);
      console.log(`    id: ${c.id}`);
      console.log(`    component_type: ${c.component_type}`);
      console.log(`    measurement_level: ${c.measurement_level}`);
      console.log(`    enabled: ${c.enabled}`);
      console.log(`    order: ${c.order}`);

      const config = c.config || {};
      if (c.component_type === 'tier_lookup') {
        console.log(`    metric: ${config.metric}`);
        console.log(`    tiers:`);
        for (const t of config.tiers || []) {
          console.log(`      ${t.min}-${t.max}: ${t.value}`);
        }
      } else if (c.component_type === 'matrix_lookup') {
        console.log(`    row_metric: ${config.row_metric}`);
        console.log(`    column_metric: ${config.column_metric}`);
        console.log(`    variant_matrices: ${Object.keys(config.variant_matrices || {}).join(', ')}`);
        for (const [variant, matrix] of Object.entries(config.variant_matrices || {})) {
          const m = matrix as any;
          console.log(`      ${variant} values: ${JSON.stringify(m.values)}`);
        }
      } else if (c.component_type === 'percentage_with_gate') {
        console.log(`    metric: ${config.metric}`);
        console.log(`    gate_metric: ${config.gate_metric}`);
        console.log(`    rates:`);
        for (const r of config.rates || []) {
          console.log(`      gate ${r.gate_min}-${r.gate_max}: rate=${r.rate}`);
        }
      } else if (c.component_type === 'flat_percentage') {
        console.log(`    metric: ${config.metric}`);
        console.log(`    rate: ${config.rate}`);
      } else {
        console.log(`    config: ${JSON.stringify(config).slice(0, 300)}`);
      }
    }

    // 3B: Input bindings
    console.log('\n--- 3B: Input bindings ---');
    const bindings = activeRS.input_bindings;
    if (bindings) {
      console.log(`  ${JSON.stringify(bindings, null, 2).slice(0, 2000)}`);
    } else {
      console.log('  input_bindings: NULL');
    }

    // 3C: Component-to-metric mapping
    console.log('\n--- 3C: Component-to-metric mapping ---');
    console.log('  What metrics does each component need? What data has those metrics?\n');

    // Gather all required metrics
    const requiredMetrics = new Set<string>();
    for (const c of comps) {
      const config = c.config || {};
      if (config.metric) requiredMetrics.add(config.metric);
      if (config.row_metric) requiredMetrics.add(config.row_metric);
      if (config.column_metric) requiredMetrics.add(config.column_metric);
      if (config.gate_metric) requiredMetrics.add(config.gate_metric);
    }

    console.log(`  Required metrics across all components:`);
    for (const m of requiredMetrics) {
      console.log(`    - ${m}`);
    }

    // Check if any row_data keys match these metrics
    console.log(`\n  Searching committed_data for these metric names in row_data...`);
    const { data: sampleRows } = await supabase
      .from('committed_data')
      .select('row_data, data_type, entity_id, period_id')
      .eq('tenant_id', tid)
      .limit(100);

    const allRowKeys = new Set<string>();
    for (const r of sampleRows || []) {
      const rd = r.row_data as Record<string, unknown>;
      for (const k of Object.keys(rd)) allRowKeys.add(k);
    }

    console.log(`  All unique row_data keys in sample (${allRowKeys.size}):`);
    const sortedKeys = Array.from(allRowKeys).sort();
    console.log(`    ${sortedKeys.join(', ')}`);

    console.log(`\n  Metric-to-key match check:`);
    for (const m of requiredMetrics) {
      const found = allRowKeys.has(m);
      const similar = sortedKeys.filter(k => k.toLowerCase().includes(m.toLowerCase().split('_')[0]));
      console.log(`    ${m}: ${found ? 'FOUND' : 'NOT FOUND'} ${similar.length > 0 ? `(similar: ${similar.join(', ')})` : ''}`);
    }
  }

  // ════════════════════════════════════════════════
  // SECTION 4: SINGLE-ENTITY CALCULATION TRACE
  // ════════════════════════════════════════════════
  section('4: SINGLE-ENTITY CALCULATION TRACE');

  // Find entity with most bound data
  try {
    const { data: periods } = await supabase
      .from('periods')
      .select('id, label, canonical_key')
      .eq('tenant_id', tid)
      .order('start_date');

    // Find Enero 2024
    const enero = periods?.find(p => p.canonical_key === '2024-01');
    const targetPeriod = enero || periods?.[0];
    console.log(`\n  Target period: ${targetPeriod?.label} (${targetPeriod?.canonical_key})`);

    // Find entity with most bound rows for target period
    const { data: boundEntities } = await supabase
      .from('committed_data')
      .select('entity_id')
      .eq('tenant_id', tid)
      .eq('period_id', targetPeriod?.id || '')
      .not('entity_id', 'is', null)
      .limit(5000);

    const entityRowCounts = new Map<string, number>();
    for (const r of boundEntities || []) {
      if (r.entity_id) entityRowCounts.set(r.entity_id, (entityRowCounts.get(r.entity_id) || 0) + 1);
    }

    if (entityRowCounts.size === 0) {
      console.log(`\n  *** NO ENTITIES HAVE BOUND DATA FOR ${targetPeriod?.label} ***`);
      console.log('  This means the engine receives ZERO rows for every entity in this period.');
      console.log('  Root cause: period_id binding is missing from committed_data rows.');

      // Check if there are ANY bound rows for ANY period
      for (const p of periods || []) {
        const { count: cnt } = await supabase
          .from('committed_data')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tid)
          .eq('period_id', p.id)
          .not('entity_id', 'is', null);
        console.log(`    ${p.label}: ${cnt} bound rows`);
      }

      // Check period-agnostic data (NULL period_id)
      console.log('\n  Checking period-agnostic data (period_id IS NULL)...');
      const { data: nullPeriodData } = await supabase
        .from('committed_data')
        .select('entity_id, data_type')
        .eq('tenant_id', tid)
        .is('period_id', null)
        .not('entity_id', 'is', null)
        .limit(1000);

      const nullPeriodEntities = new Set((nullPeriodData || []).map(r => r.entity_id));
      const nullPeriodTypes = new Map<string, number>();
      for (const r of nullPeriodData || []) {
        const dt = r.data_type || '(null)';
        nullPeriodTypes.set(dt, (nullPeriodTypes.get(dt) || 0) + 1);
      }
      console.log(`  Entities with NULL period_id data: ${nullPeriodEntities.size}`);
      for (const [dt, count] of Array.from(nullPeriodTypes.entries()).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${dt}: ${count} rows`);
      }
    }

    // Regardless, let's also trace with whatever entity has the MOST data (any period)
    console.log('\n  --- Finding entity with most data (any binding state) ---');
    const { data: allEntityData } = await supabase
      .from('committed_data')
      .select('entity_id')
      .eq('tenant_id', tid)
      .not('entity_id', 'is', null)
      .limit(5000);

    const allEntityCounts = new Map<string, number>();
    for (const r of allEntityData || []) {
      if (r.entity_id) allEntityCounts.set(r.entity_id, (allEntityCounts.get(r.entity_id) || 0) + 1);
    }

    let traceEntityId: string | null = null;
    let maxRows = 0;
    for (const [eid, count] of allEntityCounts) {
      if (count > maxRows) {
        maxRows = count;
        traceEntityId = eid;
      }
    }

    if (traceEntityId) {
      // 4A: Entity identity
      console.log('\n--- 4A: Entity identity ---');
      const { data: entity } = await supabase
        .from('entities')
        .select('id, external_id, display_name, entity_type, status')
        .eq('id', traceEntityId)
        .single();

      console.log(`  UUID: ${entity?.id}`);
      console.log(`  external_id: ${entity?.external_id}`);
      console.log(`  display_name: ${entity?.display_name}`);
      console.log(`  entity_type: ${entity?.entity_type}`);
      console.log(`  total committed_data rows: ${maxRows}`);

      // 4B: Committed data for this entity
      console.log('\n--- 4B: Committed data for trace entity ---');
      const { data: entityData } = await supabase
        .from('committed_data')
        .select('id, period_id, data_type, row_data')
        .eq('entity_id', traceEntityId)
        .eq('tenant_id', tid)
        .limit(50);

      // Group by period
      const byPeriod = new Map<string, typeof entityData>();
      for (const r of entityData || []) {
        const pKey = r.period_id || 'NULL';
        if (!byPeriod.has(pKey)) byPeriod.set(pKey, []);
        byPeriod.get(pKey)!.push(r);
      }

      for (const [pKey, rows] of byPeriod) {
        const periodLabel = periods?.find(p => p.id === pKey)?.label || pKey;
        console.log(`\n  Period: ${periodLabel} (${pKey}) — ${rows.length} rows`);
        for (const r of rows.slice(0, 3)) {
          console.log(`    data_type: ${r.data_type}`);
          const rd = r.row_data as Record<string, unknown>;
          const keys = Object.keys(rd);
          // Show numeric fields specifically
          const numericFields: Record<string, number> = {};
          const stringFields: Record<string, string> = {};
          for (const k of keys) {
            if (typeof rd[k] === 'number') numericFields[k] = rd[k] as number;
            else if (typeof rd[k] === 'string') stringFields[k] = (rd[k] as string).slice(0, 60);
          }
          if (Object.keys(numericFields).length > 0) {
            console.log(`    numeric fields: ${JSON.stringify(numericFields)}`);
          }
          if (Object.keys(stringFields).length > 0) {
            console.log(`    string fields: ${JSON.stringify(stringFields)}`);
          }
        }
      }

      // 4C: Calculation results
      console.log('\n--- 4C: Calculation results for trace entity ---');
      const { data: calcResults } = await supabase
        .from('calculation_results')
        .select('total_payout, components, metrics, period_id')
        .eq('entity_id', traceEntityId)
        .eq('tenant_id', tid)
        .limit(10);

      if (!calcResults || calcResults.length === 0) {
        console.log('  No calculation_results found for this entity');
      } else {
        for (const cr of calcResults) {
          const pLabel = periods?.find(p => p.id === cr.period_id)?.label || cr.period_id;
          console.log(`\n  Period: ${pLabel}`);
          console.log(`  total_payout: ${cr.total_payout}`);
          console.log(`  metrics: ${JSON.stringify(cr.metrics, null, 2).slice(0, 500)}`);
          console.log(`  components: ${JSON.stringify(cr.components, null, 2).slice(0, 1000)}`);
        }
      }

      // 4D: Trace each component
      console.log('\n--- 4D: Component-by-component trace ---');
      if (activeRS) {
        const comps = Array.isArray(activeRS.components) ? activeRS.components as any[] : [];
        for (const comp of comps) {
          const config = comp.config || {};
          console.log(`\n  Component: ${comp.name} (${comp.component_type})`);

          // What metric does it need?
          const neededMetrics: string[] = [];
          if (config.metric) neededMetrics.push(config.metric);
          if (config.row_metric) neededMetrics.push(config.row_metric);
          if (config.column_metric) neededMetrics.push(config.column_metric);
          if (config.gate_metric) neededMetrics.push(config.gate_metric);
          console.log(`    Needs metrics: ${neededMetrics.join(', ')}`);

          // Does the entity's row_data have these fields?
          for (const m of neededMetrics) {
            let found = false;
            let foundValue: unknown = undefined;
            for (const r of entityData || []) {
              const rd = r.row_data as Record<string, unknown>;
              if (rd[m] !== undefined) {
                found = true;
                foundValue = rd[m];
                break;
              }
            }
            console.log(`    ${m}: ${found ? `FOUND (value: ${foundValue})` : 'NOT FOUND in any row'}`);
          }

          // What would the calc produce?
          if (comp.component_type === 'tier_lookup') {
            console.log(`    Tier boundaries: ${(config.tiers || []).map((t: any) => `${t.min}-${t.max}:$${t.value}`).join(', ')}`);
          } else if (comp.component_type === 'matrix_lookup') {
            console.log(`    Matrix variants: ${Object.keys(config.variant_matrices || {}).join(', ')}`);
          }
        }
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${e}`);
  }

  // ════════════════════════════════════════════════
  // SECTION 5: THE $0 ROOT CAUSE ANALYSIS
  // ════════════════════════════════════════════════
  section('5: THE $0 ROOT CAUSE ANALYSIS');

  try {
    const { data: periods } = await supabase
      .from('periods')
      .select('id, label, canonical_key')
      .eq('tenant_id', tid)
      .order('start_date');

    const enero = periods?.find(p => p.canonical_key === '2024-01');

    // Check bound rows for Enero
    const { count: eneroBound } = await supabase
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tid)
      .eq('period_id', enero?.id || '')
      .not('entity_id', 'is', null);

    // Check null-period entity rows
    const { count: nullPeriodEntityRows } = await supabase
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tid)
      .is('period_id', null)
      .not('entity_id', 'is', null);

    // Check null-entity period rows
    const { count: nullEntityPeriodRows } = await supabase
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tid)
      .is('entity_id', null)
      .not('period_id', 'is', null);

    // Check fully orphaned
    const { count: fullyOrphaned } = await supabase
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tid)
      .is('entity_id', null)
      .is('period_id', null);

    console.log('\n  HYPOTHESIS A: No bound data for Enero 2024');
    console.log(`    Enero 2024 bound rows: ${eneroBound}`);
    console.log(`    ${(eneroBound ?? 0) === 0 ? '>>> CONFIRMED: Zero bound rows for target period' : 'REJECTED: has bound rows'}`);

    console.log('\n  HYPOTHESIS B: Data bound but engine cannot resolve metrics');
    if ((eneroBound ?? 0) > 0) {
      console.log('    Needs investigation — bound rows exist');
    } else {
      console.log('    N/A — no bound rows to evaluate');
    }

    console.log('\n  HYPOTHESIS C: Metrics resolve but tier lookup returns 0');
    console.log('    Cannot evaluate without bound rows reaching the engine');

    console.log('\n  HYPOTHESIS D: Data has entity_id but no period_id (or vice versa)');
    console.log(`    Rows with entity_id but NULL period_id: ${nullPeriodEntityRows}`);
    console.log(`    Rows with period_id but NULL entity_id: ${nullEntityPeriodRows}`);
    console.log(`    Rows with both NULL: ${fullyOrphaned}`);

    console.log('\n  HYPOTHESIS E: Bound rows are from wrong sheet/period');
    if ((eneroBound ?? 0) > 0) {
      console.log('    Check section 2C for sheet distribution');
    } else {
      console.log('    N/A — no bound rows');
    }

    // The engine also fetches NULL period rows — do those have entity_id?
    console.log('\n  HYPOTHESIS F: Engine fetches NULL-period rows but they lack entity_id');
    console.log(`    NULL-period rows with entity_id: ${nullPeriodEntityRows}`);
    console.log(`    These ARE fetched by the engine (OB-128 period-agnostic fetch)`);
    if ((nullPeriodEntityRows ?? 0) > 0) {
      console.log('    >>> These rows reach the engine as entity-level data');
      console.log('    But components need specific metric keys — check if row_data has them');
    }

    // The engine data flow recap
    console.log('\n  === ENGINE DATA FLOW RECAP ===');
    console.log('  1. Engine fetches committed_data WHERE period_id = <selected> → gets period-specific rows');
    console.log('  2. Engine fetches committed_data WHERE period_id IS NULL → gets period-agnostic rows');
    console.log('  3. Rows with entity_id → grouped by entity → per-entity metrics');
    console.log('  4. Rows without entity_id → grouped by storeId → store-level metrics');
    console.log('  5. Per entity: resolve metrics → evaluate components → payout');

    // Final diagnosis
    console.log('\n  === CONCLUSION ===');
    const totalBound = (eneroBound ?? 0);
    if (totalBound === 0) {
      console.log('  ROOT CAUSE: The committed_data rows for Enero 2024 do not have');
      console.log('  entity_id bound. The ENGINE_CONTRACT_BINDING.sql either:');
      console.log('    a) Did not bind entity_id to the rows, OR');
      console.log('    b) Bound entity_id but not period_id, OR');
      console.log('    c) Bound to a different period_id');
      console.log('');
      console.log('  The engine queries:');
      console.log('    WHERE tenant_id=? AND period_id=<enero>');
      console.log('  If no rows match, every entity gets 0 data rows → 0 metrics → $0 payout.');
      console.log('');
      console.log('  HOWEVER: The engine also fetches NULL-period rows (OB-128).');
      if ((nullPeriodEntityRows ?? 0) > 0) {
        console.log(`  There are ${nullPeriodEntityRows} rows with entity_id but NULL period_id.`);
        console.log('  These DO reach the engine. If they have the right metric keys,');
        console.log('  the calculation should produce non-zero. The fact that it still produces $0');
        console.log('  means EITHER:');
        console.log('    - These rows lack the metric keys the components need');
        console.log('    - The data_type (sheet name) does not match component expectations');
        console.log('    - The metric values resolve to 0 or fall outside tier boundaries');
      } else {
        console.log('  No NULL-period rows have entity_id either.');
        console.log('  The engine receives ZERO entity-level data for every entity → all $0.');
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${e}`);
  }

  // ════════════════════════════════════════════════
  // SECTION 6: REMEDIATION ROADMAP
  // ════════════════════════════════════════════════
  section('6: REMEDIATION ROADMAP');

  try {
    // Check the actual state
    const { count: totalRows } = await supabase
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tid);

    const { count: hasEntityId } = await supabase
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tid)
      .not('entity_id', 'is', null);

    const { count: hasPeriodId } = await supabase
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tid)
      .not('period_id', 'is', null);

    const { count: hasBoth } = await supabase
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tid)
      .not('entity_id', 'is', null)
      .not('period_id', 'is', null);

    console.log(`\n  Current state: ${totalRows} total rows`);
    console.log(`    Has entity_id:  ${hasEntityId} (${((hasEntityId ?? 0) / (totalRows ?? 1) * 100).toFixed(1)}%)`);
    console.log(`    Has period_id:  ${hasPeriodId} (${((hasPeriodId ?? 0) / (totalRows ?? 1) * 100).toFixed(1)}%)`);
    console.log(`    Has both:       ${hasBoth} (${((hasBoth ?? 0) / (totalRows ?? 1) * 100).toFixed(1)}%)`);

    // Check what identifier fields exist in the rows for binding
    console.log('\n  --- Identifier fields available for binding ---');
    const { data: idSample } = await supabase
      .from('committed_data')
      .select('row_data')
      .eq('tenant_id', tid)
      .is('entity_id', null)
      .limit(10);

    const idFields = new Set<string>();
    for (const r of idSample || []) {
      const rd = r.row_data as Record<string, unknown>;
      for (const k of Object.keys(rd)) {
        if (k.toLowerCase().includes('emple') || k.toLowerCase().includes('tienda') ||
            k.toLowerCase().includes('store') || k.toLowerCase().includes('entity') ||
            k.toLowerCase().includes('nombre') || k.toLowerCase().includes('num') ||
            k.toLowerCase().includes('id') || k.toLowerCase().includes('period') ||
            k.toLowerCase().includes('mes') || k.toLowerCase().includes('month') ||
            k.toLowerCase().includes('fecha') || k.toLowerCase().includes('date')) {
          const v = rd[k];
          idFields.add(`${k}: ${typeof v === 'string' ? `"${v.slice(0, 40)}"` : v}`);
        }
      }
    }
    for (const f of idFields) console.log(`    ${f}`);

    // Remediation steps
    console.log('\n  === REMEDIATION ACTIONS ===');
    console.log('');
    console.log('  1. BIND entity_id to committed_data rows');
    console.log('     Match committed_data.row_data->>num_empleado to entities.external_id');
    console.log('     UPDATE committed_data SET entity_id = e.id');
    console.log('     FROM entities e WHERE cd.row_data->>num_empleado = e.external_id');
    console.log(`     Estimated impact: up to ${(totalRows ?? 0) - (hasEntityId ?? 0)} rows`);
    console.log('');
    console.log('  2. BIND period_id to committed_data rows');
    console.log('     Match row_data period indicator (Mes, month field, or date) to periods');
    console.log('     UPDATE committed_data SET period_id = p.id');
    console.log('     FROM periods p WHERE <period matching logic>');
    console.log(`     Estimated impact: up to ${(totalRows ?? 0) - (hasPeriodId ?? 0)} rows`);
    console.log('');
    console.log('  3. VERIFY metric resolution');
    console.log('     After binding, check that component metric keys');
    console.log('     (store_attainment_percent, new_customers_attainment_percent, etc.)');
    console.log('     either exist in row_data OR can be derived via input_bindings');
    console.log('');
    console.log('  4. RE-RUN calculation');
    console.log('     With bound data, the engine should produce non-zero payouts');
    console.log('');
    console.log('  PRIORITY ORDER: Actions 1+2 (binding) before 3+4 (verification)');
    console.log('  Binding is the prerequisite — without it, the engine has no data.');

    // Check the component type mapping
    console.log('\n  === COMPONENT TYPE COMPATIBILITY CHECK ===');
    if (activeRS) {
      const comps = Array.isArray(activeRS.components) ? activeRS.components as any[] : [];
      for (const comp of comps) {
        const ct = comp.component_type;
        // The engine uses evaluateComponent which maps component_type to evaluator
        // Check if these types are handled
        const handled = ['tier_lookup', 'matrix_lookup', 'percentage', 'flat_percentage',
                         'conditional_percentage', 'percentage_with_gate'].includes(ct);
        console.log(`  ${comp.name}: type="${ct}" — ${handled ? 'HANDLED by engine' : 'NOT HANDLED (may need code fix)'}`);
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${e}`);
  }

  console.log(`\n${SEP}`);
  console.log('CC-UAT-06 DIAGNOSTIC COMPLETE');
  console.log(SEP);
}

main().catch(console.error);
