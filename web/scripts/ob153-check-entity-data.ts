import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  // How many distinct entities have data in each sheet for January?
  for (const dt of [
    'backttest_optometrista_mar2025_proveedores__base_venta_individual',
    'backttest_optometrista_mar2025_proveedores__base_clientes_nuevos',
    'backttest_optometrista_mar2025_proveedores__base_club_proteccion',
  ]) {
    const { data } = await sb.from('committed_data')
      .select('entity_id')
      .eq('tenant_id', T)
      .eq('data_type', dt)
      .eq('source_date', '2024-01-31')
      .not('entity_id', 'is', null)
      .limit(1000);

    const uniqueEntities = new Set((data || []).map(r => r.entity_id));
    console.log(`${dt.split('__')[1]}: ${uniqueEntities.size} entities for Jan 2024`);
  }

  // Check entity with entityName "322" — find its entity_id
  const { data: entities } = await sb.from('entities')
    .select('id, external_id, display_name')
    .eq('tenant_id', T)
    .or('external_id.eq.322,display_name.eq.322')
    .limit(5);

  console.log('\nEntities matching "322":', entities?.map(e => `${e.id} (${e.external_id}/${e.display_name})`));

  if (entities && entities.length > 0) {
    const eid = entities[0].id;
    // Get all January data for this entity
    const { data: entityData } = await sb.from('committed_data')
      .select('data_type, row_data')
      .eq('tenant_id', T)
      .eq('entity_id', eid)
      .eq('source_date', '2024-01-31');

    console.log(`\nEntity ${eid} January data:`);
    for (const r of entityData || []) {
      const rd = r.row_data as Record<string, unknown>;
      const dt = (r.data_type as string).split('__')[1] || r.data_type;
      const numericVals: Record<string, number> = {};
      for (const [k, v] of Object.entries(rd)) {
        if (k.startsWith('_')) continue;
        if (typeof v === 'number') numericVals[k] = v;
      }
      console.log(`  ${dt}:`, JSON.stringify(numericVals));
    }
  }
}

run();
