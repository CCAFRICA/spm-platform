/**
 * OB-88 Mission 3 Fix: Rule Set Structure + Data Enrichment
 *
 * Root causes of $0 payouts:
 * 1. Component configs missing `enabled: true` → all skipped
 * 2. AI interpretation format ≠ engine types (rowAxis vs rowMetric, payout vs value, etc.)
 * 3. Metric names from plan don't match field names in committed_data
 *
 * This script:
 * A) Transforms plan interpretation → proper PlanComponent format
 * B) Updates rule_set.components in Supabase
 * C) Enriches Jan 2024 committed_data with exact metric-name keys
 * D) Cleans old calculation data
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const RULE_SET_ID = '180d1ecb-56c3-410d-87ba-892150010505';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ═══════════════════════════════════════════════
// PART A: Transform Plan → Engine-Compatible Components
// ═══════════════════════════════════════════════

function buildVariants(interp: Record<string, unknown>) {
  const comps = interp.components as Array<Record<string, unknown>>;

  // Optical Sales matrix values from plan interpretation
  const certifiedOptical = comps.find(c => c.id === 'optica_sales_certified');
  const nonCertifiedOptical = comps.find(c => c.id === 'optica_sales_non_certified');
  const storeSales = comps.find(c => c.id === 'store_sales');
  const newCustomers = comps.find(c => c.id === 'new_customers');
  const collections = comps.find(c => c.id === 'collections');
  const insurance = comps.find(c => c.id === 'insurance_sales');
  const services = comps.find(c => c.id === 'services_sales');

  // Extract matrix values
  function getMatrix(comp: Record<string, unknown>) {
    const cm = comp.calculationMethod as Record<string, unknown>;
    const ra = cm.rowAxis as Record<string, unknown>;
    const ca = cm.columnAxis as Record<string, unknown>;
    return {
      rowRanges: (ra.ranges as Array<Record<string, unknown>>),
      colRanges: (ca.ranges as Array<Record<string, unknown>>),
      values: cm.values as number[][],
    };
  }

  function getTiers(comp: Record<string, unknown>) {
    const cm = comp.calculationMethod as Record<string, unknown>;
    return (cm.tiers as Array<Record<string, unknown>>);
  }

  // ── Build optical matrix component ──
  function buildOptical(comp: Record<string, unknown>, id: string, name: string, order: number) {
    const m = getMatrix(comp);
    return {
      id,
      name,
      description: String(comp.reasoning || ''),
      order,
      enabled: true,
      weight: 1,
      componentType: 'matrix_lookup',
      measurementLevel: 'store',
      matrixConfig: {
        rowMetric: 'optical_achievement_percentage',
        rowMetricLabel: '% Cumplimiento de meta de Óptica',
        rowBands: m.rowRanges.map(r => ({
          min: Number(r.min),
          max: Number(r.max),
          label: String(r.label),
        })),
        columnMetric: 'optical_sales_amount',
        columnMetricLabel: '$ Venta de Óptica de la tienda en el mes',
        columnBands: m.colRanges.map(r => ({
          min: Number(r.min),
          max: Number(r.max),
          label: String(r.label),
        })),
        values: m.values,
        currency: 'MXN',
      },
    };
  }

  // ── Build tier component ──
  function buildTier(
    id: string, name: string, metric: string, metricLabel: string,
    tiers: Array<Record<string, unknown>>, order: number,
  ) {
    return {
      id,
      name,
      description: '',
      order,
      enabled: true,
      weight: 1,
      componentType: 'tier_lookup',
      measurementLevel: 'store',
      tierConfig: {
        metric,
        metricLabel,
        tiers: tiers.map(t => ({
          min: Number(t.min),
          max: Number(t.max),
          label: `${t.min}% - ${t.max}%`,
          value: Number(t.payout), // AI uses "payout", engine uses "value"
        })),
        currency: 'MXN',
      },
    };
  }

  // ── Build shared components (same for both variants) ──
  function buildShared(startOrder: number) {
    return [
      buildTier(
        'store_sales', 'Store Sales Incentive',
        'store_achievement_percentage', '% Cumplimiento de meta de venta de tienda',
        getTiers(storeSales!), startOrder,
      ),
      buildTier(
        'new_customers', 'New Customers Incentive',
        'new_customers_achievement_percentage', '% de cumplimiento de Clientes nuevos',
        getTiers(newCustomers!), startOrder + 1,
      ),
      buildTier(
        'collections', 'Collections Incentive',
        'collections_achievement_percentage', '% de cumplimiento de monto cobranza',
        getTiers(collections!), startOrder + 2,
      ),
      // Insurance — conditional_percentage
      {
        id: 'insurance_sales',
        name: 'Insurance Sales Incentive',
        description: '',
        order: startOrder + 3,
        enabled: true,
        weight: 1,
        componentType: 'conditional_percentage',
        measurementLevel: 'individual',
        conditionalConfig: {
          appliedTo: 'reactivacion_club_proteccion_sales',
          appliedToLabel: 'Reactivación Club de Protección sales',
          conditions: [
            {
              metric: 'club_protection_achievement',
              metricLabel: 'Club Protection achievement %',
              min: 80,
              max: 99.99,
              rate: 0.03,
              label: '80-99.99%: 3%',
            },
            {
              metric: 'club_protection_achievement',
              metricLabel: 'Club Protection achievement %',
              min: 100,
              max: 999,
              rate: 0.05,
              label: '≥100%: 5%',
            },
          ],
        },
      },
      // Warranty/Services — percentage
      {
        id: 'services_sales',
        name: 'Services Sales Incentive',
        description: '',
        order: startOrder + 4,
        enabled: true,
        weight: 1,
        componentType: 'percentage',
        measurementLevel: 'individual',
        percentageConfig: {
          rate: 0.04,
          appliedTo: 'garantia_extendida_sales',
          appliedToLabel: 'Garantía Extendida sales amount',
        },
      },
    ];
  }

  const variants = [
    {
      variantId: 'certified',
      variantName: 'Optometrista Certificado',
      description: 'Optometrista Certificado',
      eligibilityCriteria: {},
      components: [
        buildOptical(certifiedOptical!, 'optica_sales_certified', 'Optical Sales Incentive - Certified', 0),
        ...buildShared(1),
      ],
    },
    {
      variantId: 'non_certified',
      variantName: 'Optometrista No Certificado',
      description: 'Optometrista No Certificado',
      eligibilityCriteria: {},
      components: [
        buildOptical(nonCertifiedOptical!, 'optica_sales_non_certified', 'Optical Sales Incentive - Non-Certified', 0),
        ...buildShared(1),
      ],
    },
  ];

  return { type: 'additive_lookup', variants };
}

// ═══════════════════════════════════════════════
// PART B: Enrich committed_data with metric-name keys
// ═══════════════════════════════════════════════

function getNum(row: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'number' && !isNaN(v)) return v;
  }
  return 0;
}

/** Add plan-metric-name keys to row_data based on sheet type */
function enrichRow(dataType: string, rowData: Record<string, unknown>): Record<string, unknown> | null {
  const enriched = { ...rowData };

  switch (dataType) {
    case 'Base_Venta_Individual': {
      const cumplimiento = getNum(rowData, 'Cumplimiento');
      const storeOptical = getNum(rowData, 'suma nivel tienda');
      // Convert decimal ratio to percentage (1.35 → 135)
      enriched['optical_achievement_percentage'] = cumplimiento > 0 && cumplimiento < 3
        ? cumplimiento * 100
        : cumplimiento;
      enriched['optical_sales_amount'] = storeOptical;
      // Also add generic semantic keys
      enriched['attainment'] = cumplimiento;
      enriched['amount'] = getNum(rowData, 'Venta_Individual');
      enriched['goal'] = getNum(rowData, 'Meta_Individual');
      return enriched;
    }

    case 'Base_Venta_Tienda': {
      const actual = getNum(rowData, 'Real_Venta_Tienda');
      const goal = getNum(rowData, 'Meta_Venta_Tienda');
      enriched['store_achievement_percentage'] = goal > 0 ? (actual / goal) * 100 : 0;
      enriched['attainment'] = goal > 0 ? actual / goal : 0;
      enriched['amount'] = actual;
      enriched['goal'] = goal;
      return enriched;
    }

    case 'Base_Clientes_Nuevos': {
      const actual = getNum(rowData, 'Clientes_Actuales');
      const goal = getNum(rowData, 'Clientes_Meta');
      enriched['new_customers_achievement_percentage'] = goal > 0 ? (actual / goal) * 100 : 0;
      enriched['attainment'] = goal > 0 ? actual / goal : 0;
      enriched['quantity'] = actual;
      enriched['goal'] = goal;
      return enriched;
    }

    case 'Base_Cobranza': {
      const actual = getNum(rowData, 'Monto_Recuperado_Actual');
      const goal = getNum(rowData, 'Monto_Recuperado_Meta');
      enriched['collections_achievement_percentage'] = goal > 0 ? (actual / goal) * 100 : 0;
      enriched['attainment'] = goal > 0 ? actual / goal : 0;
      enriched['amount'] = actual;
      enriched['goal'] = goal;
      return enriched;
    }

    case 'Base_Club_Proteccion': {
      const salesAmount = getNum(rowData, 'Monto Club Protection');
      const actualCount = getNum(rowData, 'No Actual Club Protection');
      const goalCount = getNum(rowData, 'No Meta Club Protection');
      enriched['reactivacion_club_proteccion_sales'] = salesAmount;
      enriched['club_protection_achievement'] = goalCount > 0 ? (actualCount / goalCount) * 100 : 0;
      enriched['amount'] = salesAmount;
      return enriched;
    }

    case 'Base_Garantia_Extendida': {
      const amount = getNum(rowData, 'Monto');
      enriched['garantia_extendida_sales'] = amount;
      enriched['amount'] = amount;
      return enriched;
    }

    default:
      return null; // No enrichment needed (e.g., Datos Colaborador)
  }
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

async function main() {
  const startTime = Date.now();
  console.log('=== OB-88 Mission 3 Fix ===\n');

  // ── Part A: Fix rule_set component structure ──
  console.log('PART A: Fixing rule_set component structure...');

  const interp = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'ob88-plan-interpretation.json'), 'utf-8')
  );

  const fixedComponents = buildVariants(interp);

  // Verify structure
  for (const v of fixedComponents.variants) {
    console.log(`  Variant "${v.variantName}": ${v.components.length} components`);
    for (const c of v.components) {
      const comp = c as Record<string, unknown>;
      console.log(`    ${comp.name} (${comp.componentType}) enabled=${comp.enabled}`);
      if (comp.matrixConfig) {
        const mc = comp.matrixConfig as Record<string, unknown>;
        console.log(`      rowMetric: ${mc.rowMetric}, colMetric: ${mc.columnMetric}`);
        console.log(`      rowBands: ${(mc.rowBands as unknown[]).length}, colBands: ${(mc.columnBands as unknown[]).length}`);
        console.log(`      values: ${(mc.values as unknown[][]).length}×${(mc.values as unknown[][])[0]?.length}`);
      }
      if (comp.tierConfig) {
        const tc = comp.tierConfig as Record<string, unknown>;
        console.log(`      metric: ${tc.metric}, tiers: ${(tc.tiers as unknown[]).length}`);
      }
      if (comp.percentageConfig) {
        const pc = comp.percentageConfig as Record<string, unknown>;
        console.log(`      appliedTo: ${pc.appliedTo}, rate: ${pc.rate}`);
      }
      if (comp.conditionalConfig) {
        const cc = comp.conditionalConfig as Record<string, unknown>;
        console.log(`      appliedTo: ${cc.appliedTo}, conditions: ${(cc.conditions as unknown[]).length}`);
      }
    }
  }

  // Update rule_set
  const { error: rsErr } = await sb
    .from('rule_sets')
    .update({ components: fixedComponents })
    .eq('id', RULE_SET_ID);

  if (rsErr) throw new Error(`Rule set update failed: ${rsErr.message}`);
  console.log('  Rule set updated successfully!\n');

  // ── Part B: Enrich committed_data for January 2024 ──
  console.log('PART B: Enriching January 2024 committed_data...');

  // Get Jan 2024 period ID
  const { data: period } = await sb
    .from('periods')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('canonical_key', '2024-01')
    .single();

  if (!period) throw new Error('January 2024 period not found');
  const periodId = period.id;
  console.log(`  Period ID: ${periodId}`);

  const DATA_TYPES = [
    'Base_Venta_Individual',
    'Base_Venta_Tienda',
    'Base_Clientes_Nuevos',
    'Base_Cobranza',
    'Base_Club_Proteccion',
    'Base_Garantia_Extendida',
  ];

  let totalEnriched = 0;

  for (const dataType of DATA_TYPES) {
    // Fetch all rows for this data_type in Jan 2024
    const allRows: Array<{
      id: string;
      entity_id: string | null;
      period_id: string | null;
      import_batch_id: string | null;
      data_type: string;
      row_data: Record<string, unknown>;
      metadata: Record<string, unknown> | null;
    }> = [];

    let page = 0;
    while (true) {
      const { data: rows, error: fetchErr } = await sb
        .from('committed_data')
        .select('id, entity_id, period_id, import_batch_id, data_type, row_data, metadata')
        .eq('tenant_id', TENANT_ID)
        .eq('period_id', periodId)
        .eq('data_type', dataType)
        .range(page * 1000, (page + 1) * 1000 - 1);

      if (fetchErr) throw new Error(`Fetch failed (${dataType}): ${fetchErr.message}`);
      if (!rows || rows.length === 0) break;
      allRows.push(...(rows as typeof allRows));
      if (rows.length < 1000) break;
      page++;
    }

    if (allRows.length === 0) {
      console.log(`  ${dataType}: 0 rows (skipping)`);
      continue;
    }

    // Enrich each row
    const enrichedRows = allRows.map(row => {
      const rd = row.row_data as Record<string, unknown>;
      const enriched = enrichRow(dataType, rd);
      return {
        ...row,
        tenant_id: TENANT_ID,
        row_data: enriched || rd,
      };
    });

    // Delete original rows
    const ids = allRows.map(r => r.id);
    const DEL_BATCH = 500;
    for (let i = 0; i < ids.length; i += DEL_BATCH) {
      const slice = ids.slice(i, i + DEL_BATCH);
      const { error: delErr } = await sb.from('committed_data').delete().in('id', slice);
      if (delErr) throw new Error(`Delete failed (${dataType}): ${delErr.message}`);
    }

    // Re-insert enriched rows (without id — let DB generate new ones)
    const insertRows = enrichedRows.map(r => ({
      tenant_id: TENANT_ID,
      entity_id: r.entity_id,
      period_id: r.period_id,
      import_batch_id: r.import_batch_id,
      data_type: r.data_type,
      row_data: r.row_data,
      metadata: r.metadata,
    }));

    const INS_BATCH = 2000;
    for (let i = 0; i < insertRows.length; i += INS_BATCH) {
      const slice = insertRows.slice(i, i + INS_BATCH);
      const { error: insErr } = await sb.from('committed_data').insert(slice);
      if (insErr) throw new Error(`Insert failed (${dataType}): ${insErr.message}`);
    }

    totalEnriched += allRows.length;

    // Show sample enriched values
    const sample = enrichedRows[0]?.row_data as Record<string, unknown>;
    const addedKeys = Object.keys(sample || {}).filter(k =>
      !Object.prototype.hasOwnProperty.call(allRows[0].row_data, k)
    );
    console.log(`  ${dataType}: ${allRows.length} rows enriched`);
    if (addedKeys.length > 0) {
      console.log(`    Added keys: ${addedKeys.join(', ')}`);
      for (const k of addedKeys) {
        console.log(`    Sample ${k}: ${sample[k]}`);
      }
    }
  }

  console.log(`  Total enriched: ${totalEnriched}\n`);

  // ── Part C: Clean old calculation data ──
  console.log('PART C: Cleaning old calculation data...');

  const { data: calcBatches } = await sb
    .from('calculation_batches')
    .select('id')
    .eq('tenant_id', TENANT_ID);

  if (calcBatches && calcBatches.length > 0) {
    for (const cb of calcBatches) {
      await sb.from('calculation_results').delete().eq('batch_id', cb.id);
    }
    await sb.from('calculation_batches').delete().eq('tenant_id', TENANT_ID);
    console.log(`  Cleared ${calcBatches.length} calculation batches`);
  } else {
    console.log('  No old calculation data');
  }

  // Also clear entity_period_outcomes
  await sb.from('entity_period_outcomes').delete().eq('tenant_id', TENANT_ID);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== Fix complete (${elapsed}s) ===`);
  console.log('Next: Run ob88-mission3-calculate.ts');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
