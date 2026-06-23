import { createClient } from '@supabase/supabase-js';
const SABOR='f7093bcc-e90b-4918-9680-69da7952dd65';
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
const n=(v:any)=>typeof v==='number'&&isFinite(v)?v:0;
const r2=(v:number)=>Math.round(v*100)/100;
(async()=>{
  // location entity set
  const {data:ents}=await sb.from('entities').select('id,entity_type').eq('tenant_id',SABOR);
  const locIds=new Set((ents??[]).filter((e:any)=>e.entity_type==='location').map((e:any)=>e.id));
  console.log('location entities:',locIds.size);

  // SUMMARY path
  const t1=Date.now(); const arts:any[]=[]; let off=0;
  for(;;){const {data}=await sb.from('summary_artifacts').select('entity_id,metrics,row_count').eq('tenant_id',SABOR).eq('data_type','pos_cheque').range(off,off+999); if(!data?.length)break; arts.push(...data); if(data.length<1000)break; off+=1000;}
  let sRev=0,sChq=0,sTips=0; for(const a of arts){ if(!locIds.has(a.entity_id))continue; sRev+=n(a.metrics?.total); sChq+=a.row_count; sTips+=n(a.metrics?.propina);} const sMs=Date.now()-t1;

  // RAW path
  const t2=Date.now(); let rRev=0,rChq=0,rTips=0,o2=0;
  for(;;){const {data}=await sb.from('committed_data').select('entity_id,row_data').eq('tenant_id',SABOR).eq('data_type','pos_cheque').order('id').range(o2,o2+999); if(!data?.length)break; for(const c of data as any[]){ if(!locIds.has(c.entity_id))continue; const rd=c.row_data||{}; rRev+=n(rd.total); rChq++; rTips+=n(rd.propina);} if(data.length<1000)break; o2+=1000;} const rMs=Date.now()-t2;

  const sAvg=sChq?sRev/sChq:0, rAvg=rChq?rRev/rChq:0;
  console.log('\n              SUMMARY            RAW              MATCH');
  console.log('netRevenue  ',r2(sRev).toLocaleString(),'  ',r2(rRev).toLocaleString(),'  ',r2(sRev)===r2(rRev));
  console.log('checksServed',sChq,'           ',rChq,'           ',sChq===rChq);
  console.log('avgCheck    ',r2(sAvg),'            ',r2(rAvg),'            ',r2(sAvg)===r2(rAvg));
  console.log('tips        ',r2(sTips).toLocaleString(),'   ',r2(rTips).toLocaleString(),'   ',r2(sTips)===r2(rTips));
  console.log('\nPG-2 TIMING: summary read='+sMs+'ms   raw read+agg='+rMs+'ms   speedup='+(rMs/sMs).toFixed(1)+'x');
})().then(()=>process.exit(0));
