import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data } = await sb.from('classification_signals')
    .select('created_at, signal_type')
    .eq('tenant_id', '3d354bfa-b298-48dd-88a0-9f8c5a00be4e')
    .eq('context->>importSessionId', 'e0f86141-1729-4d9e-a53d-6ddf3ee46580')
    .order('created_at', { ascending: true });
  const rows = data ?? [];
  console.log(`witness session signals: ${rows.length}`);
  if (rows.length) console.log(`first: ${rows[0].created_at} (${rows[0].signal_type})\nlast:  ${rows[rows.length-1].created_at} (${rows[rows.length-1].signal_type})`);
}
main();
