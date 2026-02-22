#!/usr/bin/env npx tsx
/**
 * Debug store-level data resolution
 */
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const T = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
const P = 'c81cebe6-2828-4125-895a-47f4ea449b86';

async function run() {
  // 1. Check store-level sheets (NULL entity_id)
  console.log('=== Store-level data (NULL entity_id) ===\n');

  const storeSheets = ['Base_Venta_Tienda', 'Base_Clientes_Nuevos', 'Base_Cobranza'];

  for (const sheet of storeSheets) {
    const { count } = await s.from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', T).eq('period_id', P)
      .eq('data_type', sheet);

    const { count: nullEntity } = await s.from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', T).eq('period_id', P)
      .eq('data_type', sheet)
      .is('entity_id', null);

    const { count: hasEntity } = await s.from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', T).eq('period_id', P)
      .eq('data_type', sheet)
      .not('entity_id', 'is', null);

    console.log(`${sheet}: ${count} total, ${nullEntity} NULL entity, ${hasEntity} with entity`);

    // Sample row
    const { data: sample } = await s.from('committed_data')
      .select('entity_id, row_data')
      .eq('tenant_id', T).eq('period_id', P)
      .eq('data_type', sheet)
      .limit(1);

    if (sample?.[0]) {
      const rd = sample[0].row_data as Record<string, unknown>;
      const keys = Object.keys(rd).filter(k => !k.startsWith('_'));
      console.log(`  entity_id: ${sample[0].entity_id}`);
      console.log(`  Keys: ${keys.join(', ')}`);
      const numKeys = keys.filter(k => typeof rd[k] === 'number');
      numKeys.forEach(k => console.log(`    ${k} = ${rd[k]}`));
    }
    console.log('');
  }

  // 2. Check entity storeId resolution
  console.log('=== Entity storeId resolution ===\n');

  const { data: entitySample } = await s.from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', T).eq('period_id', P)
    .eq('data_type', 'Datos Colaborador')
    .not('entity_id', 'is', null)
    .limit(5);

  for (const row of (entitySample || [])) {
    const rd = row.row_data as Record<string, unknown>;
    console.log(`  Entity ${row.entity_id}: storeId=${rd['storeId']}, num_tienda=${rd['num_tienda']}, No_Tienda=${rd['No_Tienda']}`);
  }

  // 3. Check if storeId from entity matches store-level data identifiers
  if (entitySample?.[0]) {
    const rd = entitySample[0].row_data as Record<string, unknown>;
    const storeId = rd['storeId'] || rd['num_tienda'] || rd['No_Tienda'];
    console.log(`\nLooking for store-level data with store identifier: ${storeId} (type: ${typeof storeId})`);

    for (const sheet of storeSheets) {
      const { data: storeRows } = await s.from('committed_data')
        .select('row_data')
        .eq('tenant_id', T).eq('period_id', P)
        .eq('data_type', sheet)
        .limit(3);

      if (storeRows) {
        for (const sr of storeRows) {
          const srd = sr.row_data as Record<string, unknown>;
          const keys = ['storeId', 'num_tienda', 'No_Tienda', 'Tienda', 'num_tienda '];
          const storeValues = keys.map(k => `${k}=${srd[k]} (${typeof srd[k]})`).join(', ');
          console.log(`  ${sheet}: ${storeValues}`);
        }
      }
    }
  }
}

run().catch(console.error);
