import { createClient } from '@supabase/supabase-js';
const SABOR='f7093bcc-e90b-4918-9680-69da7952dd65';
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  const {data:ents}=await sb.from('entities').select('id,entity_type').eq('tenant_id',SABOR);
  const loc=new Set((ents??[]).filter((e:any)=>e.entity_type==='location').map((e:any)=>e.id));
  const arts:any[]=[];let o=0;for(;;){const {data}=await sb.from('summary_artifacts').select('entity_id,metrics,row_count').eq('tenant_id',SABOR).range(o,o+999);if(!data?.length)break;arts.push(...data);if(data.length<1000)break;o+=1000;}
  let rev=0,tips=0,chq=0;for(const a of arts){if(!loc.has(a.entity_id))continue;rev+=a.metrics?.revenue??0;tips+=a.metrics?.tips??0;chq+=a.row_count;}
  console.log('  revenue(role)=MX$'+rev.toLocaleString('en-US',{maximumFractionDigits:2}),'| tips(role)=MX$'+tips.toLocaleString('en-US',{maximumFractionDigits:2}),'| cheques='+chq);
  const {data:s}=await sb.from('summary_artifacts').select('metrics').eq('tenant_id',SABOR).limit(1);
  console.log('  sample metrics:', JSON.stringify(s?.[0]?.metrics).slice(0,200));
})().then(()=>process.exit(0));
