import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  // Check how many rows have entity_id set
  const { count: withEntity } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .not('entity_id', 'is', null);

  const { count: withoutEntity } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .is('entity_id', null);

  const { count: withPeriod } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .not('period_id', 'is', null);

  const { count: withSourceDate } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .not('source_date', 'is', null);

  console.log('committed_data binding status:');
  console.log(`  with entity_id: ${withEntity}`);
  console.log(`  without entity_id: ${withoutEntity}`);
  console.log(`  with period_id: ${withPeriod}`);
  console.log(`  with source_date: ${withSourceDate}`);

  // Sample a row with entity_id
  const { data: sample } = await sb.from('committed_data')
    .select('entity_id, data_type, row_data, metadata')
    .eq('tenant_id', T)
    .not('entity_id', 'is', null)
    .limit(1);

  if (sample && sample.length > 0) {
    const rd = sample[0].row_data as Record<string, unknown>;
    console.log('\nSample bound row:');
    console.log('  entity_id:', sample[0].entity_id);
    console.log('  data_type:', sample[0].data_type);
    console.log('  keys:', Object.keys(rd).filter(k => !k.startsWith('_')).join(', '));
  }

  // Sample a row without entity_id
  const { data: sample2 } = await sb.from('committed_data')
    .select('entity_id, data_type, row_data')
    .eq('tenant_id', T)
    .is('entity_id', null)
    .limit(1);

  if (sample2 && sample2.length > 0) {
    const rd = sample2[0].row_data as Record<string, unknown>;
    console.log('\nSample unbound row:');
    console.log('  data_type:', sample2[0].data_type);
    console.log('  keys:', Object.keys(rd).filter(k => !k.startsWith('_')).join(', '));
  }
}

run();
