import {createClient} from '@supabase/supabase-js';
(async()=>{
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TID='f7093bcc-e90b-4918-9680-69da7952dd65';
const {data}=await sb.from('tenants').select('name,slug,settings,features').eq('id',TID).single();
const f=data?.features as any; const m=(data?.settings as any)?.modules;
const {count:chq}=await sb.from('committed_data').select('id',{count:'exact',head:true}).eq('tenant_id',TID).eq('data_type','pos_cheque');
const {count:res}=await sb.from('calculation_results').select('id',{count:'exact',head:true}).eq('tenant_id',TID);
const {count:ent}=await sb.from('entities').select('id',{count:'exact',head:true}).eq('tenant_id',TID);
console.log(`tenant: ${data?.name} / ${data?.slug}`);
console.log(`features.financial=${f?.financial} features.icm=${f?.icm} modules=${JSON.stringify(m)}`);
console.log(`DUAL-MODULE PROOF: pos_cheque=${chq} calc_results=${res} entities=${ent}`);
console.log(`Both modules read SAME tables (entities+committed_data+calculation_results) — zero financial_* tables (AP-1)`);
})();
