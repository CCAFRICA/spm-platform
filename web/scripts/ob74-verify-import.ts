#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

async function verify() {
  console.log('=== OB-74 Mission 3: Import Verification ===\n');

  // committed_data count
  const { count: committedCount } = await s
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`committed_data: ${committedCount ?? 0} rows`);

  // entities count
  const { count: entityCount } = await s
    .from('entities')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`entities: ${entityCount ?? 0} rows`);

  // periods
  const { data: periods } = await s
    .from('periods')
    .select('id, canonical_key, label, status')
    .eq('tenant_id', TENANT_ID);
  console.log(`periods: ${periods?.length ?? 0} rows`);
  periods?.forEach(p => console.log(`  ${p.canonical_key} - ${p.label} (${p.status})`));

  // rule_set_assignments
  const { count: assignCount } = await s
    .from('rule_set_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`rule_set_assignments: ${assignCount ?? 0} rows`);

  // import_batches
  const { data: batches } = await s
    .from('import_batches')
    .select('id, file_name, status, row_count, created_at')
    .eq('tenant_id', TENANT_ID);
  console.log(`import_batches: ${batches?.length ?? 0} rows`);
  batches?.forEach(b => console.log(`  ${b.file_name} - ${b.status} (${b.row_count} rows)`));

  // Sample committed_data row_data keys
  const { data: sample } = await s
    .from('committed_data')
    .select('entity_id, period_id, data_type, row_data')
    .eq('tenant_id', TENANT_ID)
    .limit(3);

  if (sample && sample.length > 0) {
    console.log('\n--- Sample committed_data rows ---');
    sample.forEach((row, i) => {
      const keys = row.row_data ? Object.keys(row.row_data as Record<string, unknown>) : [];
      console.log(`Row ${i + 1}: entity=${row.entity_id ? 'YES' : 'NULL'}, period=${row.period_id ? 'YES' : 'NULL'}, sheet=${row.data_type}`);
      console.log(`  Keys: ${keys.join(', ')}`);
      // Show a few values
      const rd = row.row_data as Record<string, unknown>;
      const numericKeys = keys.filter(k => typeof rd[k] === 'number').slice(0, 5);
      numericKeys.forEach(k => console.log(`  ${k}: ${rd[k]}`));
    });
  }

  // Check which semantic types are in row_data
  if (sample && sample.length > 0) {
    const rd = sample[0].row_data as Record<string, unknown>;
    const semanticTypes = ['attainment', 'amount', 'goal', 'quantity', 'entityId', 'year', 'month', 'date', 'period'];
    const found = semanticTypes.filter(t => t in rd);
    const missing = semanticTypes.filter(t => !(t in rd));
    console.log('\n--- Semantic Types in row_data ---');
    console.log(`Found: ${found.join(', ') || 'NONE'}`);
    console.log(`Missing: ${missing.join(', ') || 'NONE'}`);

    // Check plan-specific metric names
    const planMetrics = ['optical_attainment', 'store_optical_sales', 'store_sales_attainment',
      'new_customers_attainment', 'collections_attainment',
      'reactivacion_club_proteccion_sales', 'garantia_extendida_sales'];
    const foundPlan = planMetrics.filter(t => t in rd);
    console.log(`Plan metrics found: ${foundPlan.join(', ') || 'NONE'}`);
  }
}

verify().catch(console.error);
