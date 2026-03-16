/**
 * OB-167 Phase 0 Part 2: Cross-entity diagnostics
 * Check variant routing, normalization impact, component payout distribution
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

async function main() {
  console.log('=== OB-167 PHASE 0 PART 2: CROSS-ENTITY DIAGNOSTICS ===\n');

  // 1. Distribution of Nivel_Cargo values
  console.log('--- 1. Nivel_Cargo distribution ---');
  const { data: personalRows } = await supabase
    .from('committed_data')
    .select('row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('data_type', 'personal');

  if (personalRows) {
    const nivelCounts = new Map<string, number>();
    for (const row of personalRows) {
      const rd = row.row_data as Record<string, unknown>;
      const nivel = String(rd?.Nivel_Cargo ?? 'UNKNOWN');
      nivelCounts.set(nivel, (nivelCounts.get(nivel) || 0) + 1);
    }
    console.log('Nivel_Cargo values:');
    for (const [nivel, count] of Array.from(nivelCounts.entries()).sort()) {
      console.log(`  ${nivel}: ${count}`);
    }
  }

  // 2. Check metric value distributions for the key problematic fields
  console.log('\n--- 2. Metric value distributions (datos sheet) ---');
  const { data: datosRows } = await supabase
    .from('committed_data')
    .select('row_data, entity_id')
    .eq('tenant_id', TENANT_ID)
    .eq('data_type', 'datos');

  if (datosRows) {
    const metrics = ['Cumplimiento_Colocacion', 'Indice_Calidad_Cartera', 'Pct_Meta_Depositos',
                     'Cantidad_Productos_Cruzados', 'Infracciones_Regulatorias'];

    for (const metric of metrics) {
      const values = datosRows.map(r => {
        const rd = r.row_data as Record<string, unknown>;
        return rd[metric] as number;
      }).filter(v => v !== undefined && v !== null);

      values.sort((a, b) => a - b);
      const min = values[0];
      const max = values[values.length - 1];
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      const median = values[Math.floor(values.length / 2)];

      console.log(`  ${metric}:`);
      console.log(`    count=${values.length} min=${min} max=${max} avg=${avg.toFixed(4)} median=${median}`);

      // For percentage metrics, show how many fall in each tier range
      if (['Pct_Meta_Depositos', 'Cumplimiento_Colocacion', 'Indice_Calidad_Cartera'].includes(metric)) {
        const belowPoint6 = values.filter(v => v < 0.6).length;
        const range6to8 = values.filter(v => v >= 0.6 && v < 0.8).length;
        const range8to10 = values.filter(v => v >= 0.8 && v < 1.0).length;
        const above10 = values.filter(v => v >= 1.0).length;
        console.log(`    Distribution (decimal): <0.6=${belowPoint6}, 0.6-0.8=${range6to8}, 0.8-1.0=${range8to10}, >=1.0=${above10}`);

        // If these were correctly as percentages (×100):
        if (max <= 2) { // definitely decimal values
          const below60 = values.filter(v => v * 100 < 60).length;
          const range60_80 = values.filter(v => v * 100 >= 60 && v * 100 < 80).length;
          const range80_100 = values.filter(v => v * 100 >= 80 && v * 100 < 100).length;
          const above100 = values.filter(v => v * 100 >= 100).length;
          console.log(`    If ×100: <60=${below60}, 60-80=${range60_80}, 80-100=${range80_100}, >=100=${above100}`);
        }
      }
    }
  }

  // 3. Check calculation_results component breakdown
  console.log('\n--- 3. Calculation results component analysis ---');
  const { data: calcResults } = await supabase
    .from('calculation_results')
    .select('entity_id, total_payout, components, metadata')
    .eq('tenant_id', TENANT_ID);

  if (calcResults && calcResults.length > 0) {
    console.log(`Total calculation results: ${calcResults.length}`);

    const grandTotal = calcResults.reduce((s, r) => s + Number(r.total_payout), 0);
    console.log(`Grand total: $${grandTotal.toLocaleString()}`);

    // Analyze per-component payouts
    const compPayouts: Record<string, number[]> = {};
    const variantCounts: Record<string, number> = {};

    for (const r of calcResults) {
      const comps = r.components as Array<Record<string, unknown>>;
      const meta = r.metadata as Record<string, unknown>;

      // Track variant from componentId
      const firstCompId = String(comps?.[0]?.componentId ?? '');
      if (firstCompId.includes('senior')) {
        variantCounts['senior'] = (variantCounts['senior'] || 0) + 1;
      } else if (firstCompId.includes('standard')) {
        variantCounts['standard'] = (variantCounts['standard'] || 0) + 1;
      } else {
        variantCounts['unknown'] = (variantCounts['unknown'] || 0) + 1;
      }

      for (const c of (comps ?? [])) {
        const name = String(c.componentName ?? c.componentId ?? 'unknown');
        const payout = Number(c.payout ?? 0);
        if (!compPayouts[name]) compPayouts[name] = [];
        compPayouts[name].push(payout);
      }
    }

    console.log('\nVariant distribution (from componentId):');
    for (const [variant, count] of Object.entries(variantCounts)) {
      console.log(`  ${variant}: ${count}`);
    }

    console.log('\nPer-component payout summary:');
    for (const [name, payouts] of Object.entries(compPayouts)) {
      const total = payouts.reduce((s, v) => s + v, 0);
      const nonZero = payouts.filter(v => v > 0).length;
      const zeros = payouts.filter(v => v === 0).length;
      console.log(`  ${name}:`);
      console.log(`    total=$${total}, nonZero=${nonZero}/${payouts.length}, zeros=${zeros}`);
      if (nonZero > 0) {
        const nonZeroVals = payouts.filter(v => v > 0);
        const avg = nonZeroVals.reduce((s, v) => s + v, 0) / nonZeroVals.length;
        const max = Math.max(...nonZeroVals);
        const min = Math.min(...nonZeroVals);
        console.log(`    nonZero: min=$${min}, max=$${max}, avg=$${avg.toFixed(2)}`);
      }
    }
  }

  // 4. Check GT-anchor entities
  console.log('\n--- 4. GT-anchor entities ---');
  const anchors = ['Diego Mora', 'Gabriela Vascones', 'Valentina Salazar'];
  for (const name of anchors) {
    const { data: ent } = await supabase
      .from('entities')
      .select('id, external_id, display_name')
      .eq('tenant_id', TENANT_ID)
      .ilike('display_name', `%${name}%`);

    if (ent && ent.length > 0) {
      const entityId = ent[0].id;

      // Get datos
      const { data: datos } = await supabase
        .from('committed_data')
        .select('row_data')
        .eq('tenant_id', TENANT_ID)
        .eq('entity_id', entityId)
        .eq('data_type', 'datos')
        .single();

      // Get personal
      const { data: personal } = await supabase
        .from('committed_data')
        .select('row_data')
        .eq('tenant_id', TENANT_ID)
        .eq('entity_id', entityId)
        .eq('data_type', 'personal')
        .single();

      // Get calc result
      const { data: calc } = await supabase
        .from('calculation_results')
        .select('total_payout, components')
        .eq('tenant_id', TENANT_ID)
        .eq('entity_id', entityId)
        .single();

      const rd = datos?.row_data as Record<string, unknown>;
      const pr = personal?.row_data as Record<string, unknown>;

      console.log(`\n  ${ent[0].display_name} (${ent[0].external_id}):`);
      console.log(`    Nivel_Cargo: ${pr?.Nivel_Cargo}`);
      console.log(`    Cumplimiento_Colocacion: ${rd?.Cumplimiento_Colocacion}`);
      console.log(`    Indice_Calidad_Cartera: ${rd?.Indice_Calidad_Cartera}`);
      console.log(`    Pct_Meta_Depositos: ${rd?.Pct_Meta_Depositos}`);
      console.log(`    Cantidad_Productos_Cruzados: ${rd?.Cantidad_Productos_Cruzados}`);
      console.log(`    Infracciones_Regulatorias: ${rd?.Infracciones_Regulatorias}`);
      console.log(`    Engine total: $${calc?.total_payout}`);

      if (calc?.components) {
        const comps = calc.components as Array<Record<string, unknown>>;
        for (const c of comps) {
          console.log(`    ${c.componentName}: $${c.payout} [${c.componentId}]`);
        }
      }
    }
  }

  // 5. What SHOULD the total be if Pct_Meta_Depositos were ×100?
  console.log('\n--- 5. Normalization impact simulation ---');
  if (datosRows && calcResults) {
    // Build entity → datos map
    const entityDatos = new Map<string, Record<string, unknown>>();
    for (const row of datosRows) {
      if (row.entity_id) {
        entityDatos.set(row.entity_id, row.row_data as Record<string, unknown>);
      }
    }

    // Build entity → personal map for variant
    const entityPersonal = new Map<string, Record<string, unknown>>();
    if (personalRows) {
      // Need to link personal to entity. Personal has entity_id too.
      const { data: personalWithEntity } = await supabase
        .from('committed_data')
        .select('entity_id, row_data')
        .eq('tenant_id', TENANT_ID)
        .eq('data_type', 'personal');
      if (personalWithEntity) {
        for (const row of personalWithEntity) {
          if (row.entity_id) {
            entityPersonal.set(row.entity_id, row.row_data as Record<string, unknown>);
          }
        }
      }
    }

    // Simulate tier_lookup for C2 with normalized Pct_Meta_Depositos
    const seniorTiers = [
      { min: 0, max: 60, value: 0 },
      { min: 60, max: 80, value: 150 },
      { min: 80, max: 100, value: 350 },
      { min: 100, max: 120, value: 550 },
      { min: 120, max: 999, value: 750 },
    ];
    const standardTiers = [
      { min: 0, max: 60, value: 0 },
      { min: 60, max: 80, value: 75 },
      { min: 80, max: 100, value: 175 },
      { min: 100, max: 120, value: 275 },
      { min: 120, max: 999, value: 375 },
    ];

    let currentC2Total = 0;
    let normalizedC2Total = 0;
    let entityCount = 0;

    for (const r of calcResults) {
      const entityId = r.entity_id;
      const datos = entityDatos.get(entityId);
      if (!datos) continue;

      entityCount++;
      const pct = datos.Pct_Meta_Depositos as number;
      const nivel = entityPersonal.get(entityId)?.Nivel_Cargo as string ?? '';
      const isSenior = nivel?.toLowerCase().includes('senior');
      const tiers = isSenior ? seniorTiers : standardTiers;

      // Current: raw value (0.xx)
      const currentTier = tiers.find(t => pct >= t.min && pct < t.max);
      currentC2Total += currentTier?.value ?? 0;

      // Normalized: ×100
      const normalizedPct = pct * 100;
      const normalizedTier = tiers.find(t => normalizedPct >= t.min && normalizedPct < t.max);
      normalizedC2Total += normalizedTier?.value ?? 0;
    }

    console.log(`C2 (Deposits) simulation (${entityCount} entities):`);
    console.log(`  Current (raw decimal): $${currentC2Total}`);
    console.log(`  Normalized (×100): $${normalizedC2Total}`);
    console.log(`  Delta: $${normalizedC2Total - currentC2Total}`);

    // Similarly for Indice_Calidad_Cartera in C1 matrix
    const seniorMatrix = [[0,0,50],[100,200,300],[200,400,600],[350,600,900]];
    const standardMatrix = [[0,0,25],[50,100,150],[100,200,300],[175,300,450]];
    const rowBands = [{min:0,max:70},{min:70,max:85},{min:85,max:100},{min:100,max:999}];
    const colBands = [{min:0,max:90},{min:90,max:95},{min:95,max:999}];

    let currentC1Total = 0;
    let normalizedC1Total = 0;

    for (const r of calcResults) {
      const entityId = r.entity_id;
      const datos = entityDatos.get(entityId);
      if (!datos) continue;

      const cumplimiento = (datos.Cumplimiento_Colocacion as number) * 100; // Already normalized by engine
      const calidad = datos.Indice_Calidad_Cartera as number;
      const nivel = entityPersonal.get(entityId)?.Nivel_Cargo as string ?? '';
      const isSenior = nivel?.toLowerCase().includes('senior');
      const matrix = isSenior ? seniorMatrix : standardMatrix;

      // Current: calidad unnormalized (0.xx)
      const currentRowIdx = rowBands.findIndex(b => cumplimiento >= b.min && cumplimiento < b.max);
      const currentColIdx = colBands.findIndex(b => calidad >= b.min && calidad < b.max);
      if (currentRowIdx >= 0 && currentColIdx >= 0) {
        currentC1Total += matrix[currentRowIdx][currentColIdx];
      }

      // Normalized: calidad ×100
      const normalizedCalidad = calidad * 100;
      const normalizedColIdx = colBands.findIndex(b => normalizedCalidad >= b.min && normalizedCalidad < b.max);
      if (currentRowIdx >= 0 && normalizedColIdx >= 0) {
        normalizedC1Total += matrix[currentRowIdx][normalizedColIdx];
      }
    }

    console.log(`\nC1 (Credit) matrix simulation (calidad normalization):`);
    console.log(`  Current (calidad raw): $${currentC1Total}`);
    console.log(`  Normalized (calidad ×100): $${normalizedC1Total}`);
    console.log(`  Delta: $${normalizedC1Total - currentC1Total}`);

    const currentTotal = calcResults.reduce((s, r) => s + Number(r.total_payout), 0);
    const projectedTotal = currentTotal + (normalizedC2Total - currentC2Total) + (normalizedC1Total - currentC1Total);
    console.log(`\nProjected total with both normalizations: $${projectedTotal}`);
    console.log(`Current total: $${currentTotal}`);
    console.log(`GT: $48,314`);
    console.log(`Remaining gap: $${48314 - projectedTotal}`);
  }

  console.log('\n=== END PHASE 0 PART 2 ===');
}

main().catch(console.error);
