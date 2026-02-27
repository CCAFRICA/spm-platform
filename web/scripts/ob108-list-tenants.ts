import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function run() {
  const { data } = await sb.from('tenants').select('id, name, features').order('name');
  for (const t of data ?? []) {
    const { count: planCount } = await sb.from('rule_sets').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id).eq('status', 'active');
    const { count: entityCount } = await sb.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id);
    console.log(`${t.name}: plans=${planCount}, entities=${entityCount}, features=${JSON.stringify(t.features)}`);
  }
}

run().catch(console.error);
