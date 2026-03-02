import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const MBC_ID = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';
  const { data, count } = await sb
    .from('calculation_results')
    .select('total_payout', { count: 'exact' })
    .eq('tenant_id', MBC_ID);
  
  const total = (data || []).reduce((s: number, r: { total_payout: number | null }) => s + (r.total_payout || 0), 0);
  console.log(`Mexican Bank Co: ${count} results, $${total.toFixed(2)}`);
  
  // Also check Pipeline Test Co
  const PTC_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
  const { data: ptc, count: ptcCount } = await sb
    .from('calculation_results')
    .select('total_payout', { count: 'exact' })
    .eq('tenant_id', PTC_ID);
  const ptcTotal = (ptc || []).reduce((s: number, r: { total_payout: number | null }) => s + (r.total_payout || 0), 0);
  console.log(`Pipeline Test Co: ${ptcCount} results, $${ptcTotal.toFixed(2)}`);
}
main().catch(console.error);
