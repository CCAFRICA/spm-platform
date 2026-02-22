#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

async function verify() {
  console.log('=== OB-74: Deep Import Verification ===\n');

  // Get distinct sheet names (data_type)
  const { data: sheets } = await s
    .from('committed_data')
    .select('data_type')
    .eq('tenant_id', TENANT_ID)
    .limit(10000);

  const sheetCounts = new Map<string, number>();
  sheets?.forEach(r => {
    const name = r.data_type || 'unknown';
    sheetCounts.set(name, (sheetCounts.get(name) || 0) + 1);
  });

  console.log('--- Sheets (data_type) ---');
  for (const [name, count] of sheetCounts) {
    console.log(`  ${name}: ${count} rows`);
  }

  // Check entity_id distribution
  const { count: withEntity } = await s
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID)
    .not('entity_id', 'is', null);

  const { count: withoutEntity } = await s
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID)
    .is('entity_id', null);

  console.log(`\n--- Entity ID distribution ---`);
  console.log(`  With entity_id: ${withEntity ?? 0}`);
  console.log(`  Without entity_id (NULL): ${withoutEntity ?? 0}`);

  // Sample one row per sheet to see key structure
  console.log('\n--- Row keys per sheet ---');
  for (const sheetName of sheetCounts.keys()) {
    const { data: sampleRows } = await s
      .from('committed_data')
      .select('entity_id, row_data')
      .eq('tenant_id', TENANT_ID)
      .eq('data_type', sheetName)
      .not('entity_id', 'is', null)
      .limit(1);

    // If no rows with entity, try without filter
    let row = sampleRows?.[0];
    if (!row) {
      const { data: fallback } = await s
        .from('committed_data')
        .select('entity_id, row_data')
        .eq('tenant_id', TENANT_ID)
        .eq('data_type', sheetName)
        .limit(1);
      row = fallback?.[0];
    }

    if (row) {
      const rd = row.row_data as Record<string, unknown>;
      const keys = Object.keys(rd).filter(k => !k.startsWith('_'));
      const numericKeys = keys.filter(k => typeof rd[k] === 'number');
      const semanticFound = ['attainment', 'amount', 'goal', 'quantity', 'entityId', 'year', 'month', 'date', 'storeId', 'name', 'role', 'period']
        .filter(t => t in rd);

      console.log(`\n  ${sheetName} (entity_id: ${row.entity_id ? 'YES' : 'NULL'}):`);
      console.log(`    All keys: ${keys.join(', ')}`);
      console.log(`    Semantic types present: ${semanticFound.join(', ') || 'NONE'}`);
      console.log(`    Numeric keys: ${numericKeys.join(', ')}`);
      // Show numeric values
      numericKeys.slice(0, 6).forEach(k => console.log(`      ${k}: ${rd[k]}`));
    }
  }

  // Check entity sample
  const { data: entities } = await s
    .from('entities')
    .select('id, external_id, display_name, entity_type')
    .eq('tenant_id', TENANT_ID)
    .limit(5);

  console.log('\n--- Sample entities ---');
  entities?.forEach(e => console.log(`  ${e.external_id} | ${e.display_name} | ${e.entity_type}`));
}

verify().catch(console.error);
