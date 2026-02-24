/**
 * OB-88: Entity matching diagnosis across all data types
 * Check which data types have entity_id set vs null,
 * and how the engine resolves store-level → entity
 */
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const PERIOD_ID = '30dbb4e9-d2d0-4f81-9b50-a6b9e44ba20c';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log('=== Entity Matching Diagnosis ===\n');

  // For each data type, check entity_id null vs non-null counts
  const dataTypes = [
    'Datos Colaborador',
    'Base_Venta_Individual',
    'Base_Venta_Tienda',
    'Base_Clientes_Nuevos',
    'Base_Cobranza',
    'Base_Club_Proteccion',
    'Base_Garantia_Extendida',
  ];

  for (const dt of dataTypes) {
    const { data: withEntity, count: entityCount } = await sb.from('committed_data')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
      .eq('data_type', dt)
      .not('entity_id', 'is', null);

    const { count: totalCount } = await sb.from('committed_data')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
      .eq('data_type', dt);

    const nullCount = (totalCount || 0) - (entityCount || 0);
    console.log(`  ${dt}: ${totalCount} total, ${entityCount} with entity_id, ${nullCount} null entity_id`);

    // Also check: sample row for store columns
    const { data: sample } = await sb.from('committed_data')
      .select('entity_id, row_data')
      .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
      .eq('data_type', dt)
      .limit(1);

    if (sample?.[0]) {
      const rd = sample[0].row_data as Record<string, unknown>;
      const storeKeys = Object.keys(rd).filter(k =>
        k.toLowerCase().includes('tienda') || k === 'storeId' || k === 'num_tienda' || k === 'No_Tienda'
      );
      const entityKeys = Object.keys(rd).filter(k =>
        k === 'entityId' || k === 'num_empleado' || k === 'Vendedor' || k === 'entityid'
      );
      console.log(`    entity keys: ${entityKeys.map(k => `${k}=${rd[k]}`).join(', ') || 'none'}`);
      console.log(`    store keys: ${storeKeys.map(k => `${k}=${rd[k]}`).join(', ') || 'none'}`);
    }
  }

  // Check how many roster entities have store data (from Base_Venta_Individual)
  console.log('\n=== Roster Entity → Store Mapping ===');
  const entityStoreMap = new Map<string, string>();
  let page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('entity_id, row_data')
      .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
      .eq('data_type', 'Base_Venta_Individual')
      .not('entity_id', 'is', null)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (!r.entity_id) continue;
      const rd = r.row_data as Record<string, unknown>;
      const store = String(rd.num_tienda || rd.No_Tienda || rd.storeId || '');
      if (store && store !== 'undefined') {
        entityStoreMap.set(r.entity_id, store);
      }
    }
    if (data.length < 1000) break;
    page++;
  }
  console.log(`  Entities with store: ${entityStoreMap.size} / 719`);

  // For store-level data types, check store overlap
  for (const dt of ['Base_Clientes_Nuevos', 'Base_Cobranza', 'Base_Venta_Tienda']) {
    const storesInData = new Set<string>();
    page = 0;
    while (true) {
      const { data } = await sb.from('committed_data')
        .select('row_data')
        .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
        .eq('data_type', dt)
        .is('entity_id', null)
        .range(page * 1000, (page + 1) * 1000 - 1);
      if (!data || data.length === 0) break;
      for (const r of data) {
        const rd = r.row_data as Record<string, unknown>;
        const store = String(rd.num_tienda || rd.No_Tienda || rd.storeId || rd.Tienda || '');
        if (store && store !== 'undefined') storesInData.add(store);
      }
      if (data.length < 1000) break;
      page++;
    }
    // How many entity stores are found in this data type
    let overlap = 0;
    const entityStoreValues = new Set(Array.from(entityStoreMap.values()));
    for (const s of Array.from(storesInData)) {
      if (entityStoreValues.has(s)) overlap++;
    }
    console.log(`  ${dt} null-entity stores: ${storesInData.size} | overlap with entity stores: ${overlap}`);
  }

  // For entity-level data types, check entity overlap with roster
  const rosterEntityIds = new Set<string>();
  page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('entity_id')
      .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
      .eq('data_type', 'Datos Colaborador')
      .not('entity_id', 'is', null)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    for (const r of data) if (r.entity_id) rosterEntityIds.add(r.entity_id);
    if (data.length < 1000) break;
    page++;
  }

  for (const dt of ['Base_Clientes_Nuevos', 'Base_Cobranza']) {
    const entityIds = new Set<string>();
    page = 0;
    while (true) {
      const { data } = await sb.from('committed_data')
        .select('entity_id')
        .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
        .eq('data_type', dt)
        .not('entity_id', 'is', null)
        .range(page * 1000, (page + 1) * 1000 - 1);
      if (!data || data.length === 0) break;
      for (const r of data) if (r.entity_id) entityIds.add(r.entity_id);
      if (data.length < 1000) break;
      page++;
    }
    let overlap = 0;
    for (const id of Array.from(entityIds)) {
      if (rosterEntityIds.has(id)) overlap++;
    }
    console.log(`  ${dt} entity-level: ${entityIds.size} unique entities | roster overlap: ${overlap}`);
  }

  // Critical check: Base_Clientes_Nuevos — are they entity-level or store-level?
  console.log('\n=== Base_Clientes_Nuevos Detail ===');
  const { data: ncSample } = await sb.from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
    .eq('data_type', 'Base_Clientes_Nuevos')
    .limit(5);
  for (const s of ncSample || []) {
    const rd = s.row_data as Record<string, unknown>;
    console.log(`  entity_id=${s.entity_id?.substring(0, 8) || 'null'}, entityId=${rd.entityId}, num_empleado=${rd.num_empleado}, storeId=${rd.storeId}, num_tienda=${rd.num_tienda}, No_Tienda=${rd.No_Tienda}, Tienda=${rd.Tienda}`);
  }

  console.log('\n=== Base_Cobranza Detail ===');
  const { data: cobSample } = await sb.from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', TENANT_ID).eq('period_id', PERIOD_ID)
    .eq('data_type', 'Base_Cobranza')
    .limit(5);
  for (const s of cobSample || []) {
    const rd = s.row_data as Record<string, unknown>;
    console.log(`  entity_id=${s.entity_id?.substring(0, 8) || 'null'}, entityId=${rd.entityId}, num_empleado=${rd.num_empleado}, storeId=${rd.storeId}, num_tienda=${rd.num_tienda}, No_Tienda=${rd.No_Tienda}, Tienda=${rd.Tienda}`);
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
