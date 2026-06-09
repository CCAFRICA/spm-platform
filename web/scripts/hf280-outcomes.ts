import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
async function dump(tenant: string, label: string) {
  const { data: b } = await supabase.from('import_batches')
    .select('id, error_summary, created_at')
    .eq('tenant_id', tenant)
    .order('created_at', { ascending: false }).limit(40);
  const withOutcomes = (b ?? []).filter(x => (x.error_summary as any)?.componentOutcomes);
  console.log(`\n==== ${label} :: ${withOutcomes.length} batch(es) carry componentOutcomes ====`);
  const x = withOutcomes[0];
  if (!x) { console.log('(none)'); return; }
  const es: any = x.error_summary;
  console.log(`batch ${x.id} ${x.created_at} partialSuccess=${es.partialSuccess} ruleSetId=${es.ruleSetId}`);
  for (const o of es.componentOutcomes as any[]) {
    const mark = o.status === 'success' ? 'ok  ' : 'FAIL';
    console.log(`  [${mark}] id=${o.id} name="${o.name}" attempts=${o.attempts} errClass=${o.errClass ?? ''} ${o.errMessage ? 'msg='+String(o.errMessage).slice(0,200) : ''} ${o.violations ? 'viol='+String(o.violations).slice(0,120):''}`);
  }
}
async function main() {
  await dump('b1c2d3e4-aaaa-bbbb-cccc-111111111111', 'BCL');
  await dump('5035b1e8-0754-4527-b7ec-9f93f85e4c79', 'Meridian');
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
