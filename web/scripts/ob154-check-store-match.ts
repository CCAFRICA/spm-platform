/**
 * Check if entity storeId matches store-level data keys
 */
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  // Sample entity roster row with No_Tienda
  const { data: roster } = await sb.from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', T)
    .eq('data_type', 'backttest_optometrista_mar2025_proveedores__datos_colaborador')
    .gte('source_date', '2024-01-01')
    .lte('source_date', '2024-01-31')
    .limit(3);

  console.log('=== Entity roster rows ===');
  for (const r of roster || []) {
    const rd = r.row_data as Record<string, unknown>;
    console.log(`  entity ${r.entity_id?.substring(0, 8)}... No_Tienda=${rd['No_Tienda']}`);
  }

  // Check: engine resolves storeId from row_data at line 1290:
  // rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda']
  // Entity data has No_Tienda from roster
  // But venta_individual also has num_tienda
  const { data: vi } = await sb.from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', T)
    .eq('data_type', 'backttest_optometrista_mar2025_proveedores__base_venta_individual')
    .gte('source_date', '2024-01-01')
    .lte('source_date', '2024-01-31')
    .limit(3);

  console.log('\n=== Venta Individual rows ===');
  for (const r of vi || []) {
    const rd = r.row_data as Record<string, unknown>;
    console.log(`  entity ${r.entity_id?.substring(0, 8)}... num_tienda=${rd['num_tienda']}`);
  }

  // Store-level data keys
  // base_venta_tienda uses Tienda
  // base_clientes_nuevos uses No_Tienda
  // base_cobranza uses No_Tienda
  const { data: vt } = await sb.from('committed_data')
    .select('row_data')
    .eq('tenant_id', T)
    .eq('data_type', 'backttest_optometrista_mar2025_proveedores__base_venta_tienda')
    .gte('source_date', '2024-01-01')
    .lte('source_date', '2024-01-31')
    .limit(3);

  console.log('\n=== Store keys in base_venta_tienda ===');
  for (const r of vt || []) {
    const rd = r.row_data as Record<string, unknown>;
    console.log(`  Tienda=${rd['Tienda']}, storeId=${rd['storeId']}, No_Tienda=${rd['No_Tienda']}`);
  }

  // Count unique store IDs in entity data vs store data
  const entityStores = new Set<string>();
  let offset = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', T)
      .eq('data_type', 'backttest_optometrista_mar2025_proveedores__datos_colaborador')
      .gte('source_date', '2024-01-01')
      .lte('source_date', '2024-01-31')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const rd = r.row_data as Record<string, unknown>;
      const s = String(rd['No_Tienda'] ?? '');
      if (s) entityStores.add(s);
    }
    offset += data.length;
    if (data.length < 1000) break;
  }

  const storeStores = new Set<string>();
  offset = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', T)
      .eq('data_type', 'backttest_optometrista_mar2025_proveedores__base_venta_tienda')
      .gte('source_date', '2024-01-01')
      .lte('source_date', '2024-01-31')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const rd = r.row_data as Record<string, unknown>;
      const s = String(rd['Tienda'] ?? '');
      if (s) storeStores.add(s);
    }
    offset += data.length;
    if (data.length < 1000) break;
  }

  console.log(`\nEntity stores (from roster No_Tienda): ${entityStores.size} unique`);
  console.log(`Store data (from venta_tienda Tienda): ${storeStores.size} unique`);

  // Check overlap
  let overlap = 0;
  for (const s of entityStores) {
    if (storeStores.has(s)) overlap++;
  }
  console.log(`Overlap: ${overlap}`);
  console.log(`Entity stores not in store data: ${entityStores.size - overlap}`);

  // Show first 5 entity stores
  const eStores = Array.from(entityStores).slice(0, 10);
  const sStores = Array.from(storeStores).slice(0, 10);
  console.log(`\nSample entity stores: ${eStores.join(', ')}`);
  console.log(`Sample store data stores: ${sStores.join(', ')}`);
}
run().catch(console.error);
