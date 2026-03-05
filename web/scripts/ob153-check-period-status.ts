import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data } = await sb.from('periods').select('id, label, status, tenant_id').limit(10);
  console.log('Existing periods:', JSON.stringify(data, null, 2));
}
run();
