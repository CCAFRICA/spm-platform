import { createClient } from '@supabase/supabase-js';
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
(async () => {
  const { data: rss } = await svc.from('rule_sets').select('id, name, status, components, input_bindings, updated_at').eq('tenant_id', BCL).order('updated_at',{ascending:false});
  console.log('ALL BCL rule_sets:');
  for (const r of rss||[]) {
    const comps = Array.isArray(r.components) ? (r.components as any[]).length : (r.components==null?'null':'non-array');
    const ib = r.input_bindings as any;
    console.log(`  ${r.status.padEnd(9)} | ${r.name} | components=${comps} | input_bindings.keys=${ib?Object.keys(ib).join(','):'null'}`);
  }
  const { data: batches } = await svc.from('calculation_batches').select('status').eq('tenant_id', BCL);
  const bh: Record<string,number> = {};
  for (const b of batches||[]) bh[String(b.status)] = (bh[String(b.status)]||0)+1;
  console.log('\nBCL calculation_batches status histogram:', JSON.stringify(bh));
  // one result row's components shape
  const { data: res } = await svc.from('calculation_results').select('attainment, components, total_payout').eq('tenant_id', BCL).limit(1);
  const r = res?.[0];
  const rc = Array.isArray(r?.components) ? (r!.components as any[]) : [];
  console.log('\nsample result: entity_attainment=', JSON.stringify(r?.attainment), 'total_payout=', r?.total_payout, 'components=', rc.length);
  for (const c of rc.slice(0,5)) console.log('   ', c?.name, '| attainment=', c?.attainment, '| payout=', c?.payout, '| metadata.intent=', c?.metadata?.intent ? 'PRESENT' : 'absent');
})().catch(e => { console.error(e); process.exit(1); });
