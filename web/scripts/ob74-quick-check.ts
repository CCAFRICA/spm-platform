#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

async function check() {
  // Total count
  const { count } = await s.from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log('Total committed_data:', count);

  // Get 20 rows with varied data_type
  const { data: rows } = await s.from('committed_data')
    .select('data_type, entity_id, row_data')
    .eq('tenant_id', TENANT_ID)
    .order('data_type')
    .limit(5);

  console.log('\nFirst 5 rows:');
  rows?.forEach((r, i) => {
    const rd = r.row_data as Record<string, unknown>;
    console.log(`${i}: sheet=${r.data_type}, entity=${r.entity_id || 'NULL'}, keys=${Object.keys(rd).filter(k => !k.startsWith('_')).join(',')}`);
  });

  // Get rows from end
  const { data: rows2 } = await s.from('committed_data')
    .select('data_type, entity_id, row_data')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\nLast 5 rows:');
  rows2?.forEach((r, i) => {
    const rd = r.row_data as Record<string, unknown>;
    console.log(`${i}: sheet=${r.data_type}, entity=${r.entity_id || 'NULL'}, keys=${Object.keys(rd).filter(k => !k.startsWith('_')).join(',')}`);
  });

  // Try to get distinct data_type using a different approach
  const dataTypes = new Set<string>();
  let lastType = '';
  for (let attempt = 0; attempt < 20; attempt++) {
    const { data } = await s.from('committed_data')
      .select('data_type')
      .eq('tenant_id', TENANT_ID)
      .gt('data_type', lastType)
      .order('data_type')
      .limit(1);
    if (!data || data.length === 0) break;
    dataTypes.add(data[0].data_type);
    lastType = data[0].data_type;
  }

  console.log('\nDistinct data_type values:', Array.from(dataTypes).join(', '));

  // Counts per sheet
  for (const dt of dataTypes) {
    const { count: c } = await s.from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID)
      .eq('data_type', dt);

    // Sample with entity
    const { data: samp } = await s.from('committed_data')
      .select('entity_id, row_data')
      .eq('tenant_id', TENANT_ID)
      .eq('data_type', dt)
      .not('entity_id', 'is', null)
      .limit(1);

    const row = samp?.[0];
    const rd = (row?.row_data || {}) as Record<string, unknown>;
    const keys = Object.keys(rd).filter(k => !k.startsWith('_'));

    console.log(`\n${dt}: ${c} rows, entity sample: ${row?.entity_id || 'ALL NULL'}`);
    console.log(`  Keys: ${keys.join(', ')}`);

    const numVals = keys.filter(k => typeof rd[k] === 'number').map(k => `${k}=${rd[k]}`).slice(0, 6);
    if (numVals.length > 0) console.log(`  Values: ${numVals.join(', ')}`);
  }
}

check().catch(console.error);
