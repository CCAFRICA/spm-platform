import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  // Check how many rows each entity has in base_venta_individual for January
  const entityCounts = new Map<string, number>();
  let offset = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('entity_id')
      .eq('tenant_id', T)
      .eq('data_type', 'backttest_optometrista_mar2025_proveedores__base_venta_individual')
      .eq('source_date', '2024-01-31')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.entity_id) entityCounts.set(r.entity_id, (entityCounts.get(r.entity_id) || 0) + 1);
    }
    offset += data.length;
    if (data.length < 1000) break;
  }

  // Distribution of row counts per entity
  const dist = new Map<number, number>();
  for (const [, count] of Array.from(entityCounts.entries())) {
    dist.set(count, (dist.get(count) || 0) + 1);
  }

  console.log('base_venta_individual row count per entity (Jan 2024):');
  for (const [rows, count] of Array.from(dist.entries()).sort(([a], [b]) => a - b)) {
    console.log(`  ${rows} rows: ${count} entities`);
  }
  console.log(`Total entities: ${entityCounts.size}`);

  // Same for base_clientes_nuevos
  const entityCounts2 = new Map<string, number>();
  offset = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('entity_id')
      .eq('tenant_id', T)
      .eq('data_type', 'backttest_optometrista_mar2025_proveedores__base_clientes_nuevos')
      .eq('source_date', '2024-01-31')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.entity_id) entityCounts2.set(r.entity_id, (entityCounts2.get(r.entity_id) || 0) + 1);
    }
    offset += data.length;
    if (data.length < 1000) break;
  }

  const dist2 = new Map<number, number>();
  for (const [, count] of Array.from(entityCounts2.entries())) {
    dist2.set(count, (dist2.get(count) || 0) + 1);
  }
  console.log('\nbase_clientes_nuevos row count per entity (Jan 2024):');
  for (const [rows, count] of Array.from(dist2.entries()).sort(([a], [b]) => a - b)) {
    console.log(`  ${rows} rows: ${count} entities`);
  }
}

run();
