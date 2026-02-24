/**
 * OB-90 Mission 4B: Investigate the 4 remaining optical mismatches
 * Engine assigns row=4 (>150% attainment) but GT says row=0 (<80%)
 */
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const PERIOD_ID = '30dbb4e9-d2d0-4f81-9b50-a6b9e44ba20c';
const BATCH_ID = 'ca74e12f-c259-4691-a8e3-c7750d7cde1c';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PROBLEM_EMPS = ['90309983', '90137090', '90339803', '90236492'];

async function main() {
  console.log('=== OB-90 Mission 4B: Investigate 4 Optical Mismatches ===\n');

  // 1. Check entity data for these employees
  for (const empId of PROBLEM_EMPS) {
    console.log(`\n--- Employee ${empId} ---`);

    // Find entity
    const { data: entities } = await sb.from('entities')
      .select('id, external_id, entity_data')
      .eq('tenant_id', TENANT_ID)
      .eq('external_id', empId);

    if (!entities?.length) {
      console.log('  Entity NOT FOUND');
      continue;
    }

    const entity = entities[0];
    console.log(`  Entity ID: ${entity.id}`);

    // Check committed_data for this entity
    const { data: viRows } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', PERIOD_ID)
      .eq('data_type', 'Base_Venta_Individual')
      .eq('entity_id', entity.id);

    if (viRows?.length) {
      for (const r of viRows) {
        const rd = r.row_data as Record<string, unknown>;
        console.log(`  Venta_Individual: ${rd.Venta_Individual}`);
        console.log(`  Cumplimiento: ${rd.Cumplimiento}`);
        console.log(`  Meta_Individual: ${rd.Meta_Individual}`);
        console.log(`  optical_sales_amount: ${rd.optical_sales_amount}`);
        console.log(`  num_tienda: ${rd.num_tienda}`);
        console.log(`  Puesto: ${rd.Puesto}`);
      }
    } else {
      console.log('  No Base_Venta_Individual rows');
    }

    // Check ALL data types for this entity
    const { data: allData } = await sb.from('committed_data')
      .select('data_type, row_data')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', PERIOD_ID)
      .eq('entity_id', entity.id);

    if (allData) {
      const types = new Set(allData.map(d => d.data_type));
      console.log(`  Data types: ${Array.from(types).join(', ')}`);

      // Check Cumplimiento across all data types
      for (const d of allData) {
        const rd = d.row_data as Record<string, unknown>;
        if (rd.Cumplimiento !== undefined) {
          console.log(`  ${d.data_type}: Cumplimiento=${rd.Cumplimiento}, Meta_Individual=${rd.Meta_Individual}, Venta_Individual=${rd.Venta_Individual}`);
        }
      }
    }

    // Check the engine result
    const { data: result } = await sb.from('calculation_results')
      .select('total_payout, components, metadata')
      .eq('batch_id', BATCH_ID)
      .eq('entity_id', entity.id)
      .single();

    if (result) {
      const comps = result.components as Array<Record<string, unknown>>;
      const optical = comps[0];
      console.log(`  Engine optical: payout=${optical?.payout}`);

      const meta = result.metadata as Record<string, unknown>;
      const traces = (meta?.intentTraces as unknown[]) || [];
      const trace = traces[0] as Record<string, unknown> | undefined;
      if (trace) {
        console.log(`  Intent trace:`);
        console.log(`    resolvedMetrics: ${JSON.stringify(trace.resolvedMetrics)}`);
        console.log(`    lookupResolution: ${JSON.stringify(trace.lookupResolution)}`);
        console.log(`    evaluationPath: ${trace.evaluationPath}`);
      }
    }
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
