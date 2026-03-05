/**
 * OB-154: Inspect committed_data field names per data_type
 */
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  const dataTypes = [
    'backttest_optometrista_mar2025_proveedores__datos_colaborador',
    'backttest_optometrista_mar2025_proveedores__base_venta_individual',
    'backttest_optometrista_mar2025_proveedores__base_venta_tienda',
    'backttest_optometrista_mar2025_proveedores__base_clientes_nuevos',
    'backttest_optometrista_mar2025_proveedores__base_cobranza',
    'backttest_optometrista_mar2025_proveedores__base_club_proteccion',
    'backttest_optometrista_mar2025_proveedores__base_garantia_extendida',
  ];

  for (const dt of dataTypes) {
    const shortName = dt.split('__')[1];
    const { data } = await sb.from('committed_data')
      .select('entity_id, row_data')
      .eq('tenant_id', T)
      .eq('data_type', dt)
      .gte('source_date', '2024-01-01')
      .lte('source_date', '2024-01-31')
      .limit(3);

    console.log(`\n=== ${shortName} (${data?.length || 0} sample rows, Jan 2024) ===`);
    if (!data || data.length === 0) {
      console.log('  No January data');
      continue;
    }

    console.log(`  entity_id: ${data[0].entity_id ? data[0].entity_id.substring(0, 8) + '...' : 'NULL'}`);
    const rd = data[0].row_data as Record<string, unknown>;
    const keys = Object.keys(rd);
    console.log(`  Fields (${keys.length}):`);
    for (const k of keys) {
      const v = rd[k];
      console.log(`    ${k}: ${typeof v === 'number' ? v : JSON.stringify(v)?.substring(0, 50)}`);
    }

    // For store-level, show the store key
    if (!data[0].entity_id) {
      const storeKeys = ['No_Tienda', 'num_tienda', 'Tienda', 'storeId'];
      for (const k of storeKeys) {
        if (rd[k] !== undefined) {
          console.log(`  Store key: ${k} = ${rd[k]}`);
          break;
        }
      }
    }
  }
}
run().catch(console.error);
