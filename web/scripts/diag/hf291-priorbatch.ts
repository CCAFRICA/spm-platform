import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = { Meridian:'5035b1e8-0754-4527-b7ec-9f93f85e4c79', BCL:'b1c2d3e4-aaaa-bbbb-cccc-111111111111' };
async function main(){
  for (const [n,id] of Object.entries(T)){
    const { count } = await c.from('import_batches').select('id',{count:'exact',head:true}).eq('tenant_id',id);
    const { data } = await c.from('import_batches').select('row_count,created_at').eq('tenant_id',id).order('created_at',{ascending:false}).limit(2);
    const latest = data?.[0]?.row_count ?? null, prior = data?.[1]?.row_count ?? null;
    const delta = (latest!=null && prior!=null) ? latest - prior : null;
    console.log(`${n}: totalBatches=${count} latest=${latest} prior=${prior} vsPrior=${delta!=null?(delta>=0?'+':'')+delta+' rows':'— (first import)'}`);
  }
}
main();
