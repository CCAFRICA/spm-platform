/**
 * OB-148 Phase 0: Diagnostic — Trace attainment values for Tienda + Óptica
 *
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob148-phase0-diagnostic.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const PAGE_SIZE = 1000;

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-148 PHASE 0: DIAGNOSTIC — ATTAINMENT TRACE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── 0A: Engine Contract (before) ──
  console.log('--- 0A: ENGINE CONTRACT (BEFORE) ---\n');

  const { count: resultCount } = await supabase
    .from('calculation_results')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  let totalPayout = 0;
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('calculation_results')
      .select('total_payout')
      .eq('tenant_id', tenantId)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    totalPayout += data.reduce((s, r) => s + (r.total_payout || 0), 0);
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  console.log(`result_count: ${resultCount}`);
  console.log(`total_payout: MX$${Math.round(totalPayout).toLocaleString()}`);

  // ── 0B: Rule set components and derivation rules ──
  console.log('\n\n--- 0B: RULE SET COMPONENTS + DERIVATION RULES ---\n');

  const { data: rs } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings, metadata')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single();

  if (!rs) { console.error('No active rule set'); return; }

  // Parse components
  const rawComponents = rs.components;
  let components: Array<Record<string, unknown>> = [];
  let variants: Array<Record<string, unknown>> = [];
  if (Array.isArray(rawComponents)) {
    components = rawComponents as Array<Record<string, unknown>>;
  } else {
    const cj = rawComponents as Record<string, unknown>;
    variants = (cj?.variants as Array<Record<string, unknown>>) ?? [];
    components = (variants[0]?.components as Array<Record<string, unknown>>) ?? [];
  }

  console.log(`Rule set: ${rs.name} (${rs.id})`);
  console.log(`Variants: ${variants.length}`);
  if (variants.length > 1) {
    for (const v of variants) {
      console.log(`  Variant: "${v.variantName}" — ${((v.components as unknown[]) ?? []).length} components`);
    }
  }
  console.log(`Default components: ${components.length}\n`);

  for (const comp of components) {
    const name = comp.name ?? 'unknown';
    const type = comp.componentType ?? 'unknown';
    console.log(`Component: "${name}" (${type})`);

    if (type === 'tier_lookup') {
      const tc = comp.tierConfig as Record<string, unknown> | undefined;
      if (tc) {
        console.log(`  metric: "${tc.metric}"`);
        const tiers = (tc.tiers ?? []) as Array<Record<string, unknown>>;
        for (const t of tiers) {
          console.log(`    ${t.label}: [${t.min}, ${t.max}] → $${t.value}`);
        }
      }
    } else if (type === 'matrix_lookup') {
      const mc = comp.matrixConfig as Record<string, unknown> | undefined;
      if (mc) {
        console.log(`  rowMetric: "${mc.rowMetric}"`);
        console.log(`  columnMetric: "${mc.columnMetric}"`);
        const rowBands = (mc.rowBands ?? []) as Array<Record<string, unknown>>;
        const colBands = (mc.columnBands ?? []) as Array<Record<string, unknown>>;
        console.log(`  rowBands: ${rowBands.map(b => `${b.label}[${b.min}-${b.max}]`).join(', ')}`);
        console.log(`  colBands: ${colBands.map(b => `${b.label}[${b.min}-${b.max}]`).join(', ')}`);
        const values = mc.values as number[][];
        if (values) {
          console.log(`  matrix values (${values.length}×${(values[0] || []).length}):`);
          for (let i = 0; i < values.length; i++) {
            console.log(`    row[${i}]: [${values[i].join(', ')}]`);
          }
        }
      }
    } else if (type === 'conditional_percentage') {
      const cc = comp.conditionalConfig as Record<string, unknown> | undefined;
      if (cc) {
        console.log(`  appliedTo: "${cc.appliedTo}"`);
        const conds = (cc.conditions ?? []) as Array<Record<string, unknown>>;
        for (const c of conds) {
          console.log(`    ${c.metricLabel}: [${c.min}, ${c.max}] → rate=${c.rate}`);
        }
      }
    } else if (type === 'percentage') {
      const pc = comp.percentageConfig as Record<string, unknown> | undefined;
      if (pc) {
        console.log(`  appliedTo: "${pc.appliedTo}", rate: ${pc.rate}`);
      }
    }
    console.log();
  }

  // Derivation rules
  const inputBindings = rs.input_bindings as Record<string, unknown> | null;
  const derivations = (inputBindings?.metric_derivations as Array<Record<string, unknown>>) ?? [];
  console.log(`\n--- METRIC DERIVATION RULES (${derivations.length}) ---\n`);
  for (const d of derivations) {
    console.log(`  metric: "${d.metric}"`);
    console.log(`  operation: ${d.operation}`);
    console.log(`  source_pattern: ${d.source_pattern}`);
    if (d.source_field) console.log(`  source_field: ${d.source_field}`);
    if (d.numerator_metric) console.log(`  numerator_metric: ${d.numerator_metric}`);
    if (d.denominator_metric) console.log(`  denominator_metric: ${d.denominator_metric}`);
    if (d.scale_factor) console.log(`  scale_factor: ${d.scale_factor}`);
    const filters = (d.filters ?? []) as Array<Record<string, unknown>>;
    if (filters.length > 0) {
      console.log(`  filters: ${JSON.stringify(filters)}`);
    }
    console.log();
  }

  // ── 0C: Get 5 stores with calculation results ──
  console.log('\n--- 0C: 5-STORE COMPARISON ---\n');

  // Get Enero 2024 period
  const { data: enero } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('canonical_key', '2024-01')
    .single();
  if (!enero) { console.error('No Enero period'); return; }

  // Collect sample entities with their component details
  const sampleEntities: Array<{
    entityId: string;
    externalId: string;
    storeId: string;
    totalPayout: number;
    tiendaPayout: number;
    tiendaDetails: Record<string, unknown>;
    opticaPayout: number;
    opticaDetails: Record<string, unknown>;
  }> = [];

  page = 0;
  const seenStores = new Set<string>();
  while (sampleEntities.length < 5) {
    const from = page * PAGE_SIZE;
    const { data: results } = await supabase
      .from('calculation_results')
      .select('entity_id, total_payout, components, metadata')
      .eq('tenant_id', tenantId)
      .range(from, from + PAGE_SIZE - 1);
    if (!results || results.length === 0) break;

    for (const r of results) {
      if (sampleEntities.length >= 5) break;
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const extId = String(meta.externalId ?? '');

      // Get entity store_id from entities table
      const { data: ent } = await supabase
        .from('entities')
        .select('metadata')
        .eq('id', r.entity_id)
        .single();
      const entMeta = (ent?.metadata ?? {}) as Record<string, unknown>;
      const storeId = String(entMeta.store_id ?? '');

      if (!storeId || seenStores.has(storeId)) continue;
      seenStores.add(storeId);

      const comps = (r.components ?? []) as Array<Record<string, unknown>>;
      const tienda = comps.find(c => String(c.componentName).includes('Tienda'));
      const optica = comps.find(c => String(c.componentName).includes('ptica'));

      sampleEntities.push({
        entityId: r.entity_id,
        externalId: extId,
        storeId,
        totalPayout: r.total_payout,
        tiendaPayout: Number(tienda?.payout ?? 0),
        tiendaDetails: (tienda?.details ?? {}) as Record<string, unknown>,
        opticaPayout: Number(optica?.payout ?? 0),
        opticaDetails: (optica?.details ?? {}) as Record<string, unknown>,
      });
    }
    if (results.length < PAGE_SIZE) break;
    page++;
  }

  // For each sample entity, trace the data
  for (const se of sampleEntities) {
    console.log(`\n═══ Entity ${se.externalId} | Store ${se.storeId} | Total MX$${se.totalPayout} ═══`);

    // Venta Tienda trace
    console.log(`\n  VENTA TIENDA: MX$${se.tiendaPayout}`);
    console.log(`    Details: ${JSON.stringify(se.tiendaDetails, null, 2)}`);

    // Venta Optica trace
    console.log(`\n  VENTA OPTICA: MX$${se.opticaPayout}`);
    console.log(`    Details: ${JSON.stringify(se.opticaDetails, null, 2)}`);

    // Get the entity's committed_data to see raw values
    const { data: entityRows } = await supabase
      .from('committed_data')
      .select('data_type, row_data')
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .eq('entity_id', se.entityId);

    console.log(`\n  RAW ENTITY DATA (${(entityRows ?? []).length} rows):`);
    for (const row of (entityRows ?? [])) {
      const rd = (row.row_data ?? {}) as Record<string, unknown>;
      const relevantKeys = ['Cumplimiento', 'cumplimiento', 'attainment',
        'Meta_Venta_Optica', 'Real_Venta_Optica', 'Venta_Optica',
        'Meta_Venta_Tienda', 'Real_Venta_Tienda',
        'storeId', 'num_tienda', 'No_Tienda', 'Tienda',
        'Rango_Tienda', 'LLave Tamano de Tienda', 'llave_tamano_de_tienda',
        'Certificado', 'certificado', 'Es_Certificado',
        'Puesto', 'puesto', 'role',
        'store_volume_tier', 'suma_nivel_tienda', 'Suma Nivel Tienda'];
      const found: Record<string, unknown> = {};
      for (const k of relevantKeys) {
        if (rd[k] !== undefined) found[k] = rd[k];
      }
      // Also capture any field containing these patterns
      for (const [k, v] of Object.entries(rd)) {
        if (/cumplimiento|attainment|rango|tamano|tienda|certificad|puesto|role|optic/i.test(k)) {
          found[k] = v;
        }
      }
      if (Object.keys(found).length > 0) {
        console.log(`    ${row.data_type}: ${JSON.stringify(found)}`);
      } else {
        // Show first 10 keys to understand structure
        const keys = Object.keys(rd).slice(0, 15);
        console.log(`    ${row.data_type}: [keys] ${keys.join(', ')}`);
      }
    }

    // Get store data (entity_id IS NULL) for this store
    const { data: storeRows } = await supabase
      .from('committed_data')
      .select('data_type, row_data')
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .is('entity_id', null)
      .limit(2000);

    const matchingStoreRows = (storeRows ?? []).filter(r => {
      const rd = (r.row_data ?? {}) as Record<string, unknown>;
      const sid = String(rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'] ?? rd['Tienda'] ?? '');
      return sid === se.storeId;
    });

    console.log(`\n  STORE DATA (store=${se.storeId}, ${matchingStoreRows.length} rows):`);
    for (const row of matchingStoreRows) {
      const rd = (row.row_data ?? {}) as Record<string, unknown>;
      const relevantKeys: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rd)) {
        if (/tienda|meta|real|cumplimiento|attainment|venta|optic/i.test(k)) {
          relevantKeys[k] = v;
        }
      }
      console.log(`    ${row.data_type}: ${JSON.stringify(relevantKeys)}`);
    }

    // Compute expected store attainment from Real_Venta_Tienda / Meta_Venta_Tienda
    for (const row of matchingStoreRows) {
      const rd = (row.row_data ?? {}) as Record<string, unknown>;
      const realVT = rd['Real_Venta_Tienda'] as number | undefined;
      const metaVT = rd['Meta_Venta_Tienda'] as number | undefined;
      if (typeof realVT === 'number' && typeof metaVT === 'number' && metaVT > 0) {
        const computedAtt = (realVT / metaVT) * 100;
        console.log(`\n  COMPUTED STORE ATTAINMENT: Real_Venta_Tienda=${realVT} / Meta_Venta_Tienda=${metaVT} = ${computedAtt.toFixed(2)}%`);
        console.log(`  ENGINE USED (from details): metricValue=${se.tiendaDetails.metricValue}`);
        const match = Math.abs(computedAtt - Number(se.tiendaDetails.metricValue ?? 0)) < 1;
        console.log(`  MATCH: ${match ? 'YES' : 'NO'}`);
      }
    }
  }

  // ── 0D: How does store_attainment_percent get resolved? ──
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('0D: DERIVATION TRACE — How does store_attainment_percent resolve?');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Check which derivation rule targets store_attainment_percent
  const storeAttRule = derivations.find(d => String(d.metric).includes('store_attainment'));
  if (storeAttRule) {
    console.log(`Found derivation rule for store_attainment:`);
    console.log(`  ${JSON.stringify(storeAttRule, null, 2)}`);
  } else {
    console.log('NO derivation rule for store_attainment_percent');
    console.log('  This means it resolves via buildMetricsForComponent() semantic resolution');
    console.log('  or directly from row_data field names');
  }

  // Check if store_volume_tier has a derivation
  const volumeTierRule = derivations.find(d => String(d.metric).includes('store_volume_tier') || String(d.metric).includes('volume_tier'));
  if (volumeTierRule) {
    console.log(`\nFound derivation rule for store_volume_tier:`);
    console.log(`  ${JSON.stringify(volumeTierRule, null, 2)}`);
  } else {
    console.log('\nNO derivation rule for store_volume_tier');
  }

  // ── 0E: Venta Optica column metric trace ──
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('0E: VENTA OPTICA — Column metric + variant analysis');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Check what Rango_Tienda / LLave Tamano de Tienda values exist in data
  const rangoValues = new Map<string, number>();
  const llaveValues = new Map<string, number>();
  const certificadoValues = new Map<string, number>();
  const puestoValues = new Map<string, number>();

  page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('committed_data')
      .select('row_data')
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .not('entity_id', 'is', null)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const rd = (row.row_data ?? {}) as Record<string, unknown>;
      // Check for Rango_Tienda / LLave fields
      for (const [k, v] of Object.entries(rd)) {
        if (/rango.*tienda/i.test(k) && v !== undefined && v !== null) {
          const val = String(v);
          rangoValues.set(val, (rangoValues.get(val) ?? 0) + 1);
        }
        if (/llave.*tama/i.test(k) && v !== undefined && v !== null) {
          const val = String(v);
          llaveValues.set(val, (llaveValues.get(val) ?? 0) + 1);
        }
        if (/certificad/i.test(k) && v !== undefined && v !== null) {
          const val = String(v);
          certificadoValues.set(val, (certificadoValues.get(val) ?? 0) + 1);
        }
        if (/puesto|role/i.test(k) && v !== undefined && v !== null && typeof v === 'string') {
          puestoValues.set(v, (puestoValues.get(v) ?? 0) + 1);
        }
      }
    }
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  console.log('Rango_Tienda values:');
  for (const [v, c] of Array.from(rangoValues.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  "${v}": ${c} rows`);
  }

  console.log('\nLLave Tamano de Tienda values:');
  for (const [v, c] of Array.from(llaveValues.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  "${v}": ${c} rows`);
  }

  console.log('\nCertificado values:');
  for (const [v, c] of Array.from(certificadoValues.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  "${v}": ${c} rows`);
  }

  console.log('\nPuesto/Role values (top 10):');
  for (const [v, c] of Array.from(puestoValues.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  "${v}": ${c} rows`);
  }

  // ── 0F: Tienda qualifying distribution ──
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('0F: VENTA TIENDA — Qualifying distribution');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const tiendaDist = new Map<string, number>();
  let tiendaTotal = 0;
  let tiendaNonZero = 0;
  page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await supabase
      .from('calculation_results')
      .select('components')
      .eq('tenant_id', tenantId)
      .range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const comps = (row.components ?? []) as Array<Record<string, unknown>>;
      const tienda = comps.find(c => String(c.componentName).includes('Tienda'));
      if (tienda) {
        const payout = Number(tienda.payout ?? 0);
        tiendaTotal += payout;
        if (payout > 0) tiendaNonZero++;
        const details = tienda.details as Record<string, unknown> | undefined;
        const tier = String(details?.matchedTier ?? 'none');
        const metricVal = Number(details?.metricValue ?? 0);
        tiendaDist.set(tier, (tiendaDist.get(tier) ?? 0) + 1);

        // Track the range of metricValues per tier
        const tierKey = `${tier}_range`;
        // We'll just log for the first entity per tier
      }
    }
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  console.log(`Tienda qualifying: ${tiendaNonZero} / ${tiendaNonZero + (tiendaDist.get('none') ?? 0)} entities`);
  console.log(`Tienda total: MX$${Math.round(tiendaTotal).toLocaleString()}`);
  console.log('\nTier distribution:');
  for (const [tier, count] of Array.from(tiendaDist.entries()).sort()) {
    console.log(`  ${tier}: ${count} entities`);
  }

  // ── Summary ──
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('PHASE 0 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`Engine Contract: ${resultCount} results, MX$${Math.round(totalPayout).toLocaleString()}`);
  console.log(`Components: ${components.length}`);
  console.log(`Derivation rules: ${derivations.length}`);
  console.log(`Variants: ${variants.length}`);
}

main().catch(console.error);
