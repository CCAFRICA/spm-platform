import { createClient } from '@supabase/supabase-js';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { count: disputeCount, error: dErr } = await sb
    .from('disputes')
    .select('*', { count: 'exact', head: true });
  console.log('disputes_row_count:', disputeCount, 'error:', dErr?.message);

  const { count: auditCount, error: aErr } = await sb
    .from('audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('resource_type', 'dispute');
  console.log('audit_log_dispute_rows:', auditCount, 'error:', aErr?.message);

  const { data: sample } = await sb.from('disputes').select('*').limit(5);
  console.log('sample_count:', sample?.length, 'first_keys:', sample?.[0] ? Object.keys(sample[0]) : 'none');
}
main().catch(e => { console.error(e); process.exit(1); });
