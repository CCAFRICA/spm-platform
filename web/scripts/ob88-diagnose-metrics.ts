/**
 * OB-88 Diagnostic: Compare plan metric names vs data field names
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TENANT = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';

async function main() {
  // Check what metrics the plan expects
  const interp = JSON.parse(fs.readFileSync(path.join(__dirname, 'ob88-plan-interpretation.json'), 'utf-8'));
  console.log('=== PLAN COMPONENT METRICS ===');
  for (const c of interp.components as Array<Record<string, unknown>>) {
    const cm = c.calculationMethod as Record<string, unknown>;
    console.log(`\n${c.name} (${c.type})`);
    if (cm.type === 'matrix_lookup') {
      const row = cm.rowAxis as Record<string, unknown>;
      const col = cm.columnAxis as Record<string, unknown>;
      console.log('  Row metric:', row?.metric);
      console.log('  Col metric:', col?.metric);
    } else if (cm.type === 'tiered_lookup') {
      console.log('  Metric:', cm.metric);
    } else if (cm.type === 'flat_percentage') {
      console.log('  Metric:', cm.metric);
    } else if (cm.type === 'conditional_percentage') {
      console.log('  Metric:', cm.metric);
      console.log('  Condition metric:', cm.conditionMetric);
    }
  }

  // Get one entity with roster data
  const { data: roster } = await sb.from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', TENANT)
    .eq('data_type', 'Datos Colaborador')
    .not('entity_id', 'is', null)
    .limit(1);

  if (!roster || roster.length === 0) {
    console.error('No roster data found');
    return;
  }

  const entityId = roster[0].entity_id;
  const rosterData = roster[0].row_data as Record<string, unknown>;
  console.log('\n=== SAMPLE ENTITY ===');
  console.log('Entity ID:', entityId);
  console.log('Roster data:', JSON.stringify(rosterData, null, 2));

  // Get store ID from roster
  const storeId = rosterData['No_Tienda'] || rosterData['store_id'];
  console.log('Store ID:', storeId);

  // Get ALL data for this entity
  const { data: entityRows } = await sb.from('committed_data')
    .select('data_type, row_data')
    .eq('entity_id', entityId)
    .eq('tenant_id', TENANT);

  console.log('\n=== ALL ENTITY DATA ===');
  for (const r of entityRows || []) {
    const rd = r.row_data as Record<string, unknown>;
    const keys = Object.keys(rd).filter(k => k[0] !== '_');
    console.log(`\nSheet: ${r.data_type}`);
    console.log('  Fields:', keys.join(', '));
    console.log('  Values:', JSON.stringify(rd, null, 2).substring(0, 500));
  }

  // Get store data for this entity's store
  if (storeId) {
    const sheets = ['Base_Venta_Tienda', 'Base_Clientes_Nuevos', 'Base_Cobranza'];
    for (const sheet of sheets) {
      const { data: storeRows } = await sb.from('committed_data')
        .select('row_data')
        .eq('tenant_id', TENANT)
        .eq('data_type', sheet)
        .is('entity_id', null)
        .limit(3);

      if (storeRows && storeRows.length > 0) {
        // Find row matching this store
        let found = false;
        for (const sr of storeRows) {
          const srd = sr.row_data as Record<string, unknown>;
          const sid = srd['storeId'] || srd['store_id'] || srd['Tienda'] || srd['No_Tienda'];
          if (String(sid) === String(storeId)) {
            console.log(`\nStore sheet: ${sheet} (store=${storeId})`);
            const keys = Object.keys(srd).filter(k => k[0] !== '_');
            console.log('  Fields:', keys.join(', '));
            console.log('  Values:', JSON.stringify(srd, null, 2).substring(0, 500));
            found = true;
            break;
          }
        }
        if (!found) {
          // Show any row to see fields
          const srd = storeRows[0].row_data as Record<string, unknown>;
          const keys = Object.keys(srd).filter(k => k[0] !== '_');
          console.log(`\nStore sheet: ${sheet} (sample, not matched)`);
          console.log('  Fields:', keys.join(', '));
          console.log('  Sample:', JSON.stringify(srd, null, 2).substring(0, 500));
        }
      }
    }
  }
}

main().catch(console.error);
