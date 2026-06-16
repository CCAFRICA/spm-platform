// OB-213 Phase 2 B/C/D data check (READ-ONLY). 2B: is there any approval-lifecycle data?
// 2C/2D: does BCL have calc data so Statements/Pay show real values?
// Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob213-2bcd-check.ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

async function main() {
  console.log('================ OB-213 2B/2C/2D data check ================');
  // 2B: approval-lifecycle batches (the live Option-B source)
  const { data: appr } = await sb.from('calculation_batches').select('lifecycle_state').in('lifecycle_state', ['PENDING_APPROVAL', 'APPROVED', 'REJECTED']);
  const mix: Record<string, number> = {};
  (appr ?? []).forEach((b: { lifecycle_state: string }) => { mix[b.lifecycle_state] = (mix[b.lifecycle_state] ?? 0) + 1; });
  console.log(`  2B approval-lifecycle batches (all tenants): ${appr?.length ?? 0} ${JSON.stringify(mix)}`);

  // 2C/2D: BCL calc data for Statements + Pay
  const cr = await sb.from('calculation_results').select('*', { count: 'exact', head: true }).eq('tenant_id', BCL);
  const epo = await sb.from('entity_period_outcomes').select('*', { count: 'exact', head: true }).eq('tenant_id', BCL);
  console.log(`  2C/2D BCL calculation_results=${cr.count ?? '?'} entity_period_outcomes=${epo.count ?? '?'} (data exists for Statements/Pay)`);
  console.log('================ END ================');
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
