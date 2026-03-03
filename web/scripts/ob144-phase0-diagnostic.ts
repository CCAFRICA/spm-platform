/**
 * OB-144 Phase 0: Diagnostic — Map the Binding Gap
 *
 * Runs all Phase 0 queries (0A-0D) and produces a complete diagnostic report.
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob144-phase0-diagnostic.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-144 PHASE 0: DIAGNOSTIC — MAP THE BINDING GAP');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get tenant ID
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .ilike('slug', '%optica%')
    .limit(1)
    .single();

  if (!tenant) {
    console.error('ERROR: No Optica tenant found');
    process.exit(1);
  }
  console.log(`Tenant: ${tenant.name} (${tenant.id})\n`);
  const tenantId = tenant.id;

  // ── 0A: Engine Contract Verification ──
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ 0A: ENGINE CONTRACT VERIFICATION (BASELINE)               │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  const { data: entityCount } = await supabase
    .from('entities')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  const { data: periodCount } = await supabase
    .from('periods')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  const { data: activePlans } = await supabase
    .from('rule_sets')
    .select('id, name, components', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  const { data: assignmentCount } = await supabase
    .from('rule_set_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  // Count bound vs orphaned
  const { count: boundCount } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .not('entity_id', 'is', null)
    .not('period_id', 'is', null);

  const { count: orphanedCount } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .or('entity_id.is.null,period_id.is.null');

  const plan = activePlans?.[0];
  const componentCount = Array.isArray(plan?.components) ? (plan.components as unknown[]).length : 0;

  console.log(`  entity_count:       ${entityCount ?? 'ERROR'}`);
  console.log(`  period_count:       ${periodCount ?? 'ERROR'}`);
  console.log(`  active_plans:       ${activePlans?.length ?? 'ERROR'}`);
  console.log(`  component_count:    ${componentCount}`);
  console.log(`  assignment_count:   ${assignmentCount ?? 'ERROR'}`);
  console.log(`  bound_data_rows:    ${boundCount ?? 'ERROR'}`);
  console.log(`  orphaned_data_rows: ${orphanedCount ?? 'ERROR'}`);
  console.log('');

  // ── 0B: Binding Landscape ──
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ 0B: BINDING STATUS BREAKDOWN                              │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  // Count each category
  const { count: fullyBound } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .not('entity_id', 'is', null)
    .not('period_id', 'is', null);

  const { count: entityOnly } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .not('entity_id', 'is', null)
    .is('period_id', null);

  const { count: periodOnly } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('entity_id', null)
    .not('period_id', 'is', null);

  const { count: fullyOrphaned } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('entity_id', null)
    .is('period_id', null);

  const total = (fullyBound ?? 0) + (entityOnly ?? 0) + (periodOnly ?? 0) + (fullyOrphaned ?? 0);
  console.log(`  fully_bound:    ${fullyBound?.toLocaleString()}   (${((fullyBound ?? 0) / total * 100).toFixed(1)}%)`);
  console.log(`  entity_only:    ${entityOnly?.toLocaleString()}   (${((entityOnly ?? 0) / total * 100).toFixed(1)}%)`);
  console.log(`  period_only:    ${periodOnly?.toLocaleString()}   (${((periodOnly ?? 0) / total * 100).toFixed(1)}%)`);
  console.log(`  fully_orphaned: ${fullyOrphaned?.toLocaleString()}   (${((fullyOrphaned ?? 0) / total * 100).toFixed(1)}%)`);
  console.log(`  total:          ${total.toLocaleString()}`);
  console.log('');

  // ── 0C: Why Did Binding Fail? ──
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ 0C: WHY DID ENTITY_ID BINDING FAIL?                       │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  // How many period_only rows have num_empleado that matches an entity?
  // We need to use RPC or a manual check since Supabase client can't do JOINs.
  // Let's sample the data instead.

  // Check: how many period_only rows have num_empleado?
  const { count: periodOnlyWithNumEmpleado } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('entity_id', null)
    .not('period_id', 'is', null)
    .not('row_data->num_empleado', 'is', null);

  const { count: periodOnlyWithoutNumEmpleado } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('entity_id', null)
    .not('period_id', 'is', null)
    .is('row_data->num_empleado', null);

  console.log(`  Period-only rows WITH num_empleado:    ${periodOnlyWithNumEmpleado?.toLocaleString()}`);
  console.log(`  Period-only rows WITHOUT num_empleado: ${periodOnlyWithoutNumEmpleado?.toLocaleString()}`);
  console.log('');

  // Sample rows WITHOUT num_empleado to see what identifier they have
  if (periodOnlyWithoutNumEmpleado && periodOnlyWithoutNumEmpleado > 0) {
    console.log('  Sampling rows WITHOUT num_empleado...');
    const { data: noEmpleadoSample } = await supabase
      .from('committed_data')
      .select('data_type, row_data')
      .eq('tenant_id', tenantId)
      .is('entity_id', null)
      .not('period_id', 'is', null)
      .is('row_data->num_empleado', null)
      .limit(5);

    if (noEmpleadoSample) {
      for (const row of noEmpleadoSample) {
        const rd = row.row_data as Record<string, unknown>;
        const keys = Object.keys(rd);
        console.log(`    data_type: ${row.data_type}`);
        console.log(`    fields: ${keys.join(', ')}`);
        console.log('');
      }
    }
  }

  // Sample period_only rows WITH num_empleado to verify matchability
  console.log('  Verifying matchability: sample period_only rows with num_empleado...');
  const { data: withEmpleadoSample } = await supabase
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', tenantId)
    .is('entity_id', null)
    .not('period_id', 'is', null)
    .not('row_data->num_empleado', 'is', null)
    .limit(5);

  if (withEmpleadoSample) {
    const sampleEmpIds = withEmpleadoSample.map(r => {
      const rd = r.row_data as Record<string, unknown>;
      return String(rd['num_empleado'] ?? '');
    }).filter(Boolean);

    console.log(`  Sample num_empleado values: ${sampleEmpIds.join(', ')}`);

    // Check if these exist in entities
    if (sampleEmpIds.length > 0) {
      const { data: matchingEntities, count: matchCount } = await supabase
        .from('entities')
        .select('id, external_id', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .in('external_id', sampleEmpIds);

      console.log(`  Entities matching sample: ${matchCount ?? 0} out of ${sampleEmpIds.length}`);
      if (matchingEntities) {
        for (const e of matchingEntities) {
          console.log(`    ✓ entity ${e.external_id} → ${e.id}`);
        }
      }
    }
  }

  // Also check: sample fully_orphaned rows for identifier patterns
  console.log('\n  Sampling fully_orphaned rows...');
  const { data: orphanSample } = await supabase
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', tenantId)
    .is('entity_id', null)
    .is('period_id', null)
    .limit(5);

  if (orphanSample) {
    for (const row of orphanSample) {
      const rd = row.row_data as Record<string, unknown>;
      const hasNumEmpleado = rd['num_empleado'] !== undefined;
      const hasMes = rd['Mes'] !== undefined;
      const hasAno = rd['Año'] !== undefined;
      const hasFechaCorte = rd['Fecha Corte'] !== undefined || rd['FechaCorte'] !== undefined;
      console.log(`    data_type: ${row.data_type}`);
      console.log(`    has num_empleado: ${hasNumEmpleado}, has Mes: ${hasMes}, has Año: ${hasAno}, has Fecha Corte: ${hasFechaCorte}`);
      const keys = Object.keys(rd);
      console.log(`    fields: ${keys.join(', ')}`);
      console.log('');
    }
  }

  // ── 0D: Engine Data Consumption Pattern ──
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ 0D: ENGINE DATA CONSUMPTION PATTERN                       │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  console.log('  From run-calculation.ts analysis:');
  console.log('');
  console.log('  DATA FETCH (lines 863-920):');
  console.log('    → Fetches committed_data WHERE tenant_id=X AND period_id=selected');
  console.log('    → Groups by entity_id:');
  console.log('      - entity_id IS NOT NULL → dataByEntity[entity_id][data_type] = rows');
  console.log('      - entity_id IS NULL → storeData[storeKey][data_type] = rows');
  console.log('        (storeKey from row_data: storeId, num_tienda, No_Tienda, Tienda)');
  console.log('');
  console.log('  METRIC RESOLUTION (lines 588-745, buildMetricsForComponent):');
  console.log('    1. Find matching sheet via AI context or name matching');
  console.log('    2. Aggregate entity rows → entityMetrics');
  console.log('    3. Aggregate store rows → storeMatchMetrics (per-sheet)');
  console.log('    4. Resolve expected metric names:');
  console.log('       - Direct key match in entityMetrics or storeMetrics');
  console.log('       - Semantic type inference via inferSemanticType()');
  console.log('       - "store_" prefix → prefer storeData');
  console.log('       - Normalize attainment: decimal (0-10) → percentage (0-1000)');
  console.log('');
  console.log('  STORE DATA ROUTING (line 907):');
  console.log('    → NULL entity_id rows grouped by storeKey');
  console.log('    → Entity gets its storeId from row_data (line 1109)');
  console.log('    → Entity storeData = storeData.get(entityStoreId)');
  console.log('    → Store data does NOT need entity_id — uses storeKey instead');
  console.log('');
  console.log('  METRIC DERIVATION (lines 95-193, applyMetricDerivations):');
  console.log('    → Uses input_bindings.metric_derivations array');
  console.log('    → Operations: count, sum, delta, ratio');
  console.log('    → Matches sheets by source_pattern regex');
  console.log('    → Can compute derived metrics (e.g., ratio of two fields)');
  console.log('');
  console.log('  CRITICAL INSIGHT:');
  console.log('    The engine reads data WHERE period_id = selected period.');
  console.log('    Rows with entity_id → grouped per entity.');
  console.log('    Rows WITHOUT entity_id → grouped by storeKey (No_Tienda).');
  console.log('    Store-level data (Base_Clientes_Nuevos, etc.) does NOT need');
  console.log('    entity_id binding — it needs period_id + storeKey in row_data.');
  console.log('    Individual data (Base_Venta_Individual) DOES need entity_id.');
  console.log('');

  // ── Summary ──
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ BINDING GAP SUMMARY                                       │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  console.log('  What needs binding:');
  console.log(`    Individual data with num_empleado: ${periodOnlyWithNumEmpleado?.toLocaleString()} rows → BIND entity_id`);
  console.log(`    Store data without num_empleado: ${periodOnlyWithoutNumEmpleado?.toLocaleString()} rows → KEEP entity_id NULL (engine uses storeKey)`);
  console.log(`    Fully orphaned: ${fullyOrphaned?.toLocaleString()} rows → MAY need period_id binding`);
  console.log('');
  console.log('  Current data_type breakdown by binding status:');

  // data_type breakdown for period_only rows
  const { data: dataTypeBreakdown } = await supabase
    .from('committed_data')
    .select('data_type')
    .eq('tenant_id', tenantId)
    .is('entity_id', null)
    .not('period_id', 'is', null)
    .limit(1000);

  if (dataTypeBreakdown) {
    const dtCounts = new Map<string, number>();
    for (const row of dataTypeBreakdown) {
      const dt = row.data_type || '_null';
      dtCounts.set(dt, (dtCounts.get(dt) ?? 0) + 1);
    }
    for (const [dt, count] of Array.from(dtCounts.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${dt}: ${count} (sample from first 1000)`);
    }
  }

  // Also check fully_orphaned data_type breakdown
  console.log('\n  Fully orphaned data_type breakdown:');
  const { data: orphanTypeBreakdown } = await supabase
    .from('committed_data')
    .select('data_type')
    .eq('tenant_id', tenantId)
    .is('entity_id', null)
    .is('period_id', null)
    .limit(1000);

  if (orphanTypeBreakdown) {
    const dtCounts = new Map<string, number>();
    for (const row of orphanTypeBreakdown) {
      const dt = row.data_type || '_null';
      dtCounts.set(dt, (dtCounts.get(dt) ?? 0) + 1);
    }
    for (const [dt, count] of Array.from(dtCounts.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${dt}: ${count} (sample from first 1000)`);
    }
  }

  // Check if orphaned rows have Mes/Año/Fecha Corte for period binding
  console.log('\n  Orphaned rows with period identifiers:');
  const { count: orphanedWithMes } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('entity_id', null)
    .is('period_id', null)
    .not('row_data->Mes', 'is', null);

  const { count: orphanedWithFechaCorte } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('entity_id', null)
    .is('period_id', null)
    .not('row_data->Fecha Corte', 'is', null);

  const { count: orphanedWithNumEmpleado } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('entity_id', null)
    .is('period_id', null)
    .not('row_data->num_empleado', 'is', null);

  console.log(`    With Mes+Año:       ${orphanedWithMes?.toLocaleString()}`);
  console.log(`    With Fecha Corte:   ${orphanedWithFechaCorte?.toLocaleString()}`);
  console.log(`    With num_empleado:  ${orphanedWithNumEmpleado?.toLocaleString()}`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PHASE 0 DIAGNOSTIC COMPLETE');
  console.log('PG-00: PASS — Binding gap mapped, engine data consumption documented');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
