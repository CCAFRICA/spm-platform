/**
 * OB-167 Phase 3: Verify fix — simulate band-aware normalization
 * Runs the EXACT same logic as the fix to predict new totals
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

async function main() {
  console.log('=== OB-167 VERIFICATION: Band-Aware Normalization ===\n');

  // Load rule set
  const { data: rs } = await supabase
    .from('rule_sets')
    .select('components')
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'active')
    .single();

  const comps = rs?.components as Record<string, unknown>;
  const variants = comps?.variants as Array<Record<string, unknown>>;

  // Load all datos rows
  const { data: datosRows } = await supabase
    .from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('data_type', 'datos');

  // Load all personal rows (for variant routing)
  const { data: personalRows } = await supabase
    .from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('data_type', 'personal');

  if (!datosRows || !personalRows || !variants) {
    console.log('Missing data');
    return;
  }

  const entityDatos = new Map<string, Record<string, unknown>>();
  for (const r of datosRows) {
    if (r.entity_id) entityDatos.set(r.entity_id, r.row_data as Record<string, unknown>);
  }

  const entityPersonal = new Map<string, Record<string, unknown>>();
  for (const r of personalRows) {
    if (r.entity_id) entityPersonal.set(r.entity_id, r.row_data as Record<string, unknown>);
  }

  // Simulate calculation for each entity
  let grandTotal = 0;
  const compTotals = [0, 0, 0, 0];
  const anchors = new Map<string, Record<string, unknown>>();

  for (const [entityId, datos] of Array.from(entityDatos.entries())) {
    const personal = entityPersonal.get(entityId) ?? {};
    const nivel = String(personal.Nivel_Cargo ?? '');
    const isSenior = nivel.toLowerCase().includes('senior');
    const variant = isSenior ? variants[0] : variants[1];
    const vComps = variant.components as Array<Record<string, unknown>>;

    let entityTotal = 0;
    const compPayouts: number[] = [];

    for (let ci = 0; ci < vComps.length; ci++) {
      const comp = vComps[ci];
      let payout = 0;

      // Resolve metrics from datos
      const metrics: Record<string, number> = {};
      const metricFields = [
        'Cumplimiento_Colocacion', 'Indice_Calidad_Cartera',
        'Pct_Meta_Depositos', 'Cantidad_Productos_Cruzados',
        'Infracciones_Regulatorias'
      ];
      for (const f of metricFields) {
        if (datos[f] !== undefined && datos[f] !== null) {
          metrics[f] = Number(datos[f]);
        }
      }

      // OB-167: Band-aware normalization (EXACT same logic as the fix)
      const bandMaxByMetric: Record<string, number> = {};
      const mc = comp.matrixConfig as {
        rowMetric?: string; columnMetric?: string;
        rowBands?: Array<{ max: number }>; columnBands?: Array<{ max: number }>;
      } | undefined;
      if (mc?.rowMetric && mc.rowBands && mc.rowBands.length > 0) {
        bandMaxByMetric[mc.rowMetric] = mc.rowBands[0].max;
      }
      if (mc?.columnMetric && mc.columnBands && mc.columnBands.length > 0) {
        bandMaxByMetric[mc.columnMetric] = mc.columnBands[0].max;
      }
      const tc = comp.tierConfig as {
        metric?: string; tiers?: Array<{ max: number }>;
      } | undefined;
      if (tc?.metric && tc.tiers && tc.tiers.length > 0) {
        bandMaxByMetric[tc.metric] = tc.tiers[0].max;
      }

      for (const [key, value] of Object.entries(metrics)) {
        const bandMax = bandMaxByMetric[key];
        if (bandMax !== undefined && bandMax > 10 && value > 0 && value < 10) {
          metrics[key] = value * 100;
        }
      }

      // Evaluate component
      if (comp.matrixConfig) {
        const config = comp.matrixConfig as {
          values: number[][];
          rowMetric: string; columnMetric: string;
          rowBands: Array<{ min: number; max: number }>;
          columnBands: Array<{ min: number; max: number }>;
        };
        const rowVal = metrics[config.rowMetric] ?? 0;
        const colVal = metrics[config.columnMetric] ?? 0;
        const rowIdx = config.rowBands.findIndex(b => rowVal >= b.min && rowVal < b.max);
        const colIdx = config.columnBands.findIndex(b => colVal >= b.min && colVal < b.max);
        if (rowIdx >= 0 && colIdx >= 0) {
          payout = config.values[rowIdx][colIdx];
        }
      } else if (comp.tierConfig) {
        const config = comp.tierConfig as {
          metric: string;
          tiers: Array<{ min: number; max: number; value: number }>;
        };
        const val = metrics[config.metric] ?? 0;
        const tier = config.tiers.find(t => val >= t.min && val < t.max);
        payout = tier?.value ?? 0;
      } else if (comp.percentageConfig) {
        const config = comp.percentageConfig as { rate: number; appliedTo: string };
        payout = config.rate * (metrics[config.appliedTo] ?? 0);
      } else if (comp.conditionalConfig) {
        const config = comp.conditionalConfig as {
          conditions: Array<{ min: number; max: number; rate: number; metric: string }>;
        };
        const cond = config.conditions.find(c => {
          const val = metrics[c.metric] ?? 0;
          return val >= c.min && val <= c.max;
        });
        payout = cond?.rate ?? 0;
      }

      compPayouts.push(payout);
      compTotals[ci] += payout;
      entityTotal += payout;
    }

    grandTotal += entityTotal;

    // Track anchors
    const name = String(personal.Nombre_Completo ?? datos.Nombre_Completo ?? '');
    if (name.includes('Valentina Salazar') || name.includes('Diego Mora') || name.includes('Gabriela Vascones')) {
      anchors.set(name, {
        nivel,
        variant: isSenior ? 'Senior' : 'Standard',
        total: entityTotal,
        C1: compPayouts[0],
        C2: compPayouts[1],
        C3: compPayouts[2],
        C4: compPayouts[3],
        raw: {
          Cumplimiento: datos.Cumplimiento_Colocacion,
          Calidad: datos.Indice_Calidad_Cartera,
          Depositos: datos.Pct_Meta_Depositos,
          Productos: datos.Cantidad_Productos_Cruzados,
          Infracciones: datos.Infracciones_Regulatorias,
        },
        normalized: {
          Cumplimiento: Number(datos.Cumplimiento_Colocacion) * 100,
          Calidad: Number(datos.Indice_Calidad_Cartera) * 100,
          Depositos: Number(datos.Pct_Meta_Depositos) * 100,
        },
      });
    }
  }

  console.log('Component totals (with band-aware normalization):');
  const compNames = ['C1 Colocacion', 'C2 Depositos', 'C3 Productos', 'C4 Regulatorio'];
  for (let i = 0; i < 4; i++) {
    console.log(`  ${compNames[i]}: $${compTotals[i].toLocaleString()}`);
  }
  console.log(`\nGrand total: $${grandTotal.toLocaleString()}`);
  console.log(`GT: $48,314`);
  console.log(`Previous: $20,834`);
  console.log(`Delta from GT: $${(48314 - grandTotal).toLocaleString()}`);
  console.log(`Improvement: $${(grandTotal - 20834).toLocaleString()}`);

  console.log('\n--- Anchor entities ---');
  for (const [name, data] of Array.from(anchors.entries())) {
    console.log(`\n${name} (${data.variant}):`);
    console.log(`  Raw: Cumpl=${data.raw.Cumplimiento}, Calid=${data.raw.Calidad}, Dep=${data.raw.Depositos}`);
    console.log(`  Normalized: Cumpl=${data.normalized.Cumplimiento}%, Calid=${data.normalized.Calidad}%, Dep=${data.normalized.Depositos}%`);
    console.log(`  C1=$${data.C1}, C2=$${data.C2}, C3=$${data.C3}, C4=$${data.C4} → Total=$${data.total}`);
  }

  console.log('\n=== END VERIFICATION ===');
}

main().catch(console.error);
