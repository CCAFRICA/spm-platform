import { createClient } from '@supabase/supabase-js';
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
(async () => {
  const { data: rs } = await svc.from('rule_sets').select('id, name, status, components').eq('tenant_id', BCL).eq('status','active').order('updated_at',{ascending:false}).limit(1);
  const set = rs?.[0];
  console.log('ACTIVE rule_set:', set?.id, '|', set?.name);
  const comps = Array.isArray(set?.components) ? set!.components as any[] : [];
  console.log('components:', comps.length);
  for (const c of comps) {
    const meta = c?.metadata ?? {};
    const intent = meta?.intent;
    console.log(`  - ${c?.name} | type=${c?.type} | metadata.intent: ${intent ? 'PRESENT ('+(intent?.op||intent?.type||typeof intent)+')' : 'ABSENT'}`);
  }
  // sample calculation_result attainment + per-component payout for the latest batch
  const { data: batches } = await svc.from('calculation_batches').select('id, period_id, status, created_at').eq('tenant_id', BCL).neq('status','superseded').order('created_at',{ascending:false}).limit(1);
  const batch = batches?.[0];
  console.log('\nlatest non-superseded batch:', batch?.id, '| period=', batch?.period_id, '| status=', batch?.status);
  const { data: results } = await svc.from('calculation_results').select('entity_id, attainment, components, total_payout').eq('tenant_id', BCL).eq('batch_id', batch?.id).limit(3);
  for (const r of results || []) {
    console.log(`  entity=${r.entity_id} | entity_attainment=${JSON.stringify(r.attainment)} | total_payout=${r.total_payout}`);
    const rc = Array.isArray(r.components) ? r.components as any[] : [];
    for (const c of rc.slice(0,4)) console.log(`      comp ${c?.name}: attainment=${c?.attainment} payout=${c?.payout}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
