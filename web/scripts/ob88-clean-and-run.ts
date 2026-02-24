import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';

async function main() {
  const { data: batches } = await sb.from('calculation_batches').select('id').eq('tenant_id', TENANT_ID);
  if (batches) {
    for (const b of batches) await sb.from('calculation_results').delete().eq('batch_id', b.id);
    await sb.from('calculation_batches').delete().eq('tenant_id', TENANT_ID);
  }
  await sb.from('entity_period_outcomes').delete().eq('tenant_id', TENANT_ID);
  console.log('Cleaned');
}
main().catch(console.error);
