import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const r2=(x:number)=>Math.round(x*100)/100;
async function main(){
  const { data: t } = await sb.from('tenants').select('id').eq('slug','sabor-grupo').single(); const tid=t!.id;
  const { data: ents } = await sb.from('entities').select('id, external_id, entity_type, metadata').eq('tenant_id',tid);
  const locs=(ents||[]).filter((e:any)=>e.entity_type==='location');
  const srvs=(ents||[]).filter((e:any)=>e.entity_type==='individual');
  const { data: periods } = await sb.from('periods').select('id, canonical_key').eq('tenant_id',tid);
  const monthly = periods!.find((p:any)=>p.canonical_key==='2024-01')!.id;
  const { data: rss } = await sb.from('rule_sets').select('id, name').eq('tenant_id',tid);
  const rsPerf=rss!.find((x:any)=>x.name.startsWith('Índice'))!.id;
  const rsComm=rss!.find((x:any)=>x.name.startsWith('Comisión'))!.id;

  // aggregate cheques
  const byLoc=new Map<string,any>(); const bySrv=new Map<string,any>();
  for (let off=0;;off+=1000){ const {data}=await sb.from('committed_data').select('entity_id,row_data').eq('tenant_id',tid).eq('data_type','pos_cheque').range(off,off+999); if(!data||!data.length)break;
    for(const c of data){ const rd=c.row_data;
      let L=byLoc.get(c.entity_id); if(!L){L={rev:0,gross:0,covers:0,n:0,tips:0,cancel:0,comp:0};byLoc.set(c.entity_id,L);}
      L.rev+=rd.subtotal; L.gross+=rd.subtotal; L.covers+=rd.num_comensales; L.n++; L.tips+=rd.propina; L.cancel+=rd.cancelado; L.comp+=rd.cortesia;
      const sid=rd.mesero_id; let S=bySrv.get(sid); if(!S){S={net:0,tips:0,n:0,covers:0};bySrv.set(sid,S);} S.net+=rd.subtotal; S.tips+=rd.propina; S.n++; S.covers+=rd.num_comensales;
    } if(data.length<1000)break; }

  // batch
  await sb.from('calculation_results').delete().eq('tenant_id',tid);
  await sb.from('calculation_batches').delete().eq('tenant_id',tid);
  const { data: batch, error: be } = await sb.from('calculation_batches').insert({ tenant_id:tid, period_id:monthly, batch_type:'standard', lifecycle_state:'APPROVED', entity_count:60, summary:{note:'FRMX reseed — Performance Index (20 locations) + Server Commission (40 servers)'}, config:{} }).select('id').single(); if(be) throw be;
  const bid=batch!.id;

  const results:any[]=[];
  // Performance Index per location
  const benchHr:Record<string,number>={CD:4275,TV:3006,MB:3263};
  for(const loc of locs){ const m=loc.metadata; const bc=m.brand_code; const L=byLoc.get(loc.id)||{rev:0,gross:1,covers:0,n:1,tips:0,cancel:0,comp:0};
    const shiftHours=21*16; const revPerHr=L.rev/shiftHours; const avgCheck=L.rev/Math.max(1,L.n); const tipRate=L.tips/Math.max(1,L.rev); const cancelComp=(L.cancel+L.comp)/Math.max(1,L.gross);
    const sRev=Math.min(100, revPerHr/benchHr[bc]*100);
    const sSvc=Math.min(100, (avgCheck*tipRate)/(m.avg_check_benchmark*0.14)*100);
    const sDisc=Math.max(0,(1-cancelComp)*100);
    const sVol=Math.min(100, L.covers/(21*m.daily_covers_target)*100);
    const weighted=r2(0.30*sRev+0.25*sSvc+0.25*sDisc+0.20*sVol);
    const tier = weighted>=85?['Estrella','estrella']:weighted>=70?['Destacado','destacado']:weighted>=50?['Estándar','estandar']:['En Desarrollo','en_desarrollo'];
    results.push({ tenant_id:tid, batch_id:bid, entity_id:loc.id, rule_set_id:rsPerf, period_id:monthly, total_payout:0,
      components:{ revenue_efficiency:{score:r2(sRev),weight:0.30,weighted:r2(0.30*sRev)}, service_quality:{score:r2(sSvc),weight:0.25,weighted:r2(0.25*sSvc)}, operational_discipline:{score:r2(sDisc),weight:0.25,weighted:r2(0.25*sDisc)}, volume:{score:r2(sVol),weight:0.20,weighted:r2(0.20*sVol)} },
      metrics:{ revenue_per_shift_hour:r2(revPerHr), avg_check:r2(avgCheck), avg_tip_rate:r2(tipRate), cancellation_rate:r2(cancelComp), total_covers:L.covers, total_revenue:r2(L.rev) },
      attainment:{ weighted_score:weighted, tier:tier[0], tier_key:tier[1] }, metadata:{module:'financial'} });
  }
  // Server Commission per server
  for(const s of srvs){ const S=bySrv.get(s.metadata.mesero_id)||{net:0,tips:0,n:0,covers:0};
    const net=S.net; let comm=0;
    comm += Math.min(net,50000)*0.02;
    if(net>50000) comm += (Math.min(net,100000)-50000)*0.03;
    if(net>100000) comm += (net-100000)*0.04;
    const tipRate=S.tips/Math.max(1,net); const bonus = tipRate>0.15?500:0;
    const payout=r2(comm+bonus);
    results.push({ tenant_id:tid, batch_id:bid, entity_id:s.id, rule_set_id:rsComm, period_id:monthly, total_payout:payout,
      components:{ base_commission:{amount:r2(comm),net_sales:r2(net)}, tip_bonus:{amount:bonus,tip_rate:r2(tipRate)} },
      metrics:{ net_server_sales:r2(net), tip_rate:r2(tipRate), cheque_count:S.n, total_covers:S.covers },
      attainment:{ commission:r2(comm), bonus, total:payout }, metadata:{module:'icm'} });
  }
  for(let i=0;i<results.length;i+=500){ const{error}=await sb.from('calculation_results').insert(results.slice(i,i+500)); if(error)throw error; }
  const { count } = await sb.from('calculation_results').select('*',{count:'exact',head:true}).eq('tenant_id',tid);
  const tiers:Record<string,number>={}; results.filter(r=>r.rule_set_id===rsPerf).forEach(r=>{const k=r.attainment.tier;tiers[k]=(tiers[k]||0)+1;});
  const commTotal=r2(results.filter(r=>r.rule_set_id===rsComm).reduce((a,r)=>a+r.total_payout,0));
  console.log(`PROOF calculation_results=${count} batch=APPROVED tiers=${JSON.stringify(tiers)} totalCommissionMXN=${commTotal}`);
}
main().catch(e=>{console.error(e);process.exit(1);});
