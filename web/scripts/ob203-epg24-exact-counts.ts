import { createClient } from '@supabase/supabase-js';
const TENANT = '24103940-ab33-4a21-b6fd-bd1042f4762c';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const types = ['entity','transaction','reference','target'];
  console.log('=== committed_data EXACT counts (head:true) ===');
  let total = 0;
  for (const t of types) {
    const { count } = await sb.from('committed_data').select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT).eq('data_type', t);
    console.log(`  ${t}: ${count ?? 0}`); total += count ?? 0;
  }
  const { count: all } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT);
  console.log(`  TOTAL: ${all ?? 0} (typed sum ${total})`);
  const { count: atomCount } = await sb.from('structural_fingerprints').select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT).eq('granularity', 'atom');
  const { count: sheetCount } = await sb.from('structural_fingerprints').select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT).eq('granularity', 'sheet');
  console.log(`\n=== structural_fingerprints EXACT ===`);
  console.log(`  atom: ${atomCount ?? 0}   sheet: ${sheetCount ?? 0}`);
})();
