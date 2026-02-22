#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

async function verify() {
  console.log('=== OB-74: Sheet-by-Sheet Verification ===\n');

  // Get one sample row per distinct data_type using RPC-like approach
  // First get all distinct data_types
  const allDataTypes = new Set<string>();
  let offset = 0;
  const PAGE = 10000;

  while (true) {
    const { data } = await s
      .from('committed_data')
      .select('data_type')
      .eq('tenant_id', TENANT_ID)
      .range(offset, offset + PAGE - 1);

    if (!data || data.length === 0) break;
    data.forEach(r => allDataTypes.add(r.data_type));
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  console.log(`Total distinct sheets: ${allDataTypes.size}`);
  console.log(`Sheets: ${Array.from(allDataTypes).join(', ')}\n`);

  // For each sheet, get count and a sample row
  for (const sheetName of allDataTypes) {
    const { count } = await s
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID)
      .eq('data_type', sheetName);

    const { count: withEntityCount } = await s
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID)
      .eq('data_type', sheetName)
      .not('entity_id', 'is', null);

    // Get sample with entity_id if possible
    const { data: sample } = await s
      .from('committed_data')
      .select('entity_id, period_id, row_data')
      .eq('tenant_id', TENANT_ID)
      .eq('data_type', sheetName)
      .not('entity_id', 'is', null)
      .limit(1);

    const row = sample?.[0];
    const rd = (row?.row_data || {}) as Record<string, unknown>;
    const keys = Object.keys(rd).filter(k => !k.startsWith('_'));

    const semanticTypes = ['attainment', 'amount', 'goal', 'quantity', 'entityId', 'year', 'month', 'date', 'storeId', 'name', 'role', 'period'];
    const planMetrics = ['optical_attainment', 'store_optical_sales', 'store_sales_attainment',
      'new_customers_attainment', 'collections_attainment',
      'reactivacion_club_proteccion_sales', 'garantia_extendida_sales'];

    const foundSemantic = semanticTypes.filter(t => t in rd);
    const foundPlan = planMetrics.filter(t => t in rd);

    console.log(`--- ${sheetName} ---`);
    console.log(`  Rows: ${count}, With entity_id: ${withEntityCount}`);
    console.log(`  Keys: ${keys.join(', ')}`);
    console.log(`  Semantic types: ${foundSemantic.join(', ') || 'NONE'}`);
    console.log(`  Plan metrics: ${foundPlan.join(', ') || 'NONE'}`);

    // Show numeric values
    const numericEntries = keys
      .filter(k => typeof rd[k] === 'number')
      .map(k => `${k}=${rd[k]}`)
      .slice(0, 8);
    if (numericEntries.length > 0) {
      console.log(`  Sample values: ${numericEntries.join(', ')}`);
    }
    console.log('');
  }
}

verify().catch(console.error);
