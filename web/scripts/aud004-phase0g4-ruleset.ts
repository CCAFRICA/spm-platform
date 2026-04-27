import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
  const { data, error } = await sb
    .from('rule_sets')
    .select('tenant_id, id, name, status, version, created_at, updated_at')
    .eq('status', 'active')
    .in('tenant_id', ['b1c2d3e4-aaaa-bbbb-cccc-111111111111', 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'])
    .order('tenant_id, created_at', { ascending: false });
  if (error) { console.log('ERROR:', error.message); return; }
  console.log('Active rule_sets per tenant (ordered tenant_id, created_at DESC):\n');
  for (const r of data || []) {
    console.log(`  tenant=${r.tenant_id}`);
    console.log(`  id=${r.id}`);
    console.log(`  name="${r.name}"`);
    console.log(`  status=${r.status} v${r.version}`);
    console.log(`  created_at=${r.created_at}`);
    console.log(`  updated_at=${r.updated_at}`);
    console.log('');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
