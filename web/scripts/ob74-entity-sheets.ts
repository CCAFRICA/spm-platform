#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const T = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
const P = 'c81cebe6-2828-4125-895a-47f4ea449b86';

async function run() {
  // Get distinct sheets
  const sheets = new Set<string>();
  let lastSheet = '';
  for (let i = 0; i < 20; i++) {
    const { data } = await s.from('committed_data')
      .select('data_type')
      .eq('tenant_id', T).eq('period_id', P)
      .gt('data_type', lastSheet)
      .order('data_type').limit(1);
    if (!data || data.length === 0) break;
    sheets.add(data[0].data_type);
    lastSheet = data[0].data_type;
  }
  console.log('Sheets in period:', Array.from(sheets));

  // Find entity with data across multiple sheets
  const { data: sampleEntities } = await s.from('committed_data')
    .select('entity_id')
    .eq('tenant_id', T).eq('period_id', P)
    .not('entity_id', 'is', null)
    .neq('data_type', 'Datos Colaborador')
    .limit(1);

  if (!sampleEntities || sampleEntities.length === 0) {
    console.log('No entities with metric data');
    return;
  }

  const eid = sampleEntities[0].entity_id;
  console.log('\nSample entity:', eid);

  // Get all rows for this entity in this period
  const { data: allRows } = await s.from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', T).eq('period_id', P).eq('entity_id', eid);

  const bySheet = new Map<string, Array<Record<string, unknown>>>();
  for (const r of (allRows || [])) {
    const existing = bySheet.get(r.data_type) || [];
    existing.push(r.row_data as Record<string, unknown>);
    bySheet.set(r.data_type, existing);
  }

  for (const [sheet, rows] of bySheet) {
    console.log(`\n  ${sheet} (${rows.length} rows):`);
    const rd = rows[0];
    const numKeys = Object.keys(rd).filter(k => typeof rd[k] === 'number' && !k.startsWith('_'));
    numKeys.forEach(k => console.log(`    ${k} = ${rd[k]}`));
  }
}

run().catch(console.error);
