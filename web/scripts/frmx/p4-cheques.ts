import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
function rng(seed:number){ let s=seed>>>0; return ()=>{ s=(Math.imul(s,1664525)+1013904223)>>>0; return s/0xffffffff; }; }
const r = rng(7);
const ri=(a:number,b:number)=>a+Math.floor(r()*(b-a+1));
const rf=(a:number,b:number)=>a+r()*(b-a);
const round2=(x:number)=>Math.round(x*100)/100;
const pad=(n:number,w=2)=>String(n).padStart(w,'0');

async function main(){
  const { data: t } = await sb.from('tenants').select('id').eq('slug','sabor-grupo').single(); const tid=t!.id;
  const { data: ents } = await sb.from('entities').select('id, external_id, entity_type, metadata').eq('tenant_id', tid);
  const locs = (ents||[]).filter((e:any)=>e.entity_type==='location');
  const servers = (ents||[]).filter((e:any)=>e.entity_type==='individual');
  const serversByLoc = new Map<string, any[]>();
  for (const s of servers) { const lid=s.metadata?.location_id; if(!serversByLoc.has(lid)) serversByLoc.set(lid,[]); serversByLoc.get(lid)!.push(s); }
  const { data: periods } = await sb.from('periods').select('id, canonical_key').eq('tenant_id', tid);
  const wk = (d:Date)=>{ const day=d.getUTCDate(); const key = day<=7?'2024-W01':day<=14?'2024-W02':'2024-W03'; return periods!.find((p:any)=>p.canonical_key===key)!.id; };

  // clear existing cheques for this tenant (idempotent)
  await sb.from('committed_data').delete().eq('tenant_id', tid).eq('data_type','pos_cheque');

  const BASE: Record<string,number> = { CD:100, TV:130, MB:65 };
  const rows:any[] = [];
  let total=0;
  for (let day=1; day<=21; day++){
    const d = new Date(Date.UTC(2024,0,day));
    const dow = d.getUTCDay(); // 0=Sun,6=Sat
    const isWeekend = dow===0||dow===6;
    const dateStr=`2024-01-${pad(day)}`;
    const pid = wk(d);
    for (const loc of locs){
      const m=loc.metadata; const bc=m.brand_code as string; const pattern=m.pattern as string; const bench=m.avg_check_benchmark as number;
      const locServers = serversByLoc.get(loc.external_id) || [];
      if (locServers.length===0) continue;
      let dailyMult = 1;
      // weekend
      if (isWeekend) dailyMult *= (pattern.startsWith('Seasonal')? (m.brand_code==='MB'?2.0:1.5) : 1.3);
      // seasonal weekday dip
      if (pattern.startsWith('Seasonal') && !isWeekend) dailyMult *= 0.6;
      // decline by week
      if (pattern.startsWith('Declining')){ const w = day<=7?1:day<=14?0.95:0.90; dailyMult *= w; }
      // underperformer
      if (pattern.startsWith('Slow')) dailyMult *= 0.70;
      // variance
      dailyMult *= rf(0.85,1.15);
      let count = Math.max(8, Math.round(BASE[bc]*dailyMult));
      for (let c=0;c<count;c++){
        const sv = locServers[ri(0,locServers.length-1)];
        const star = sv.metadata?.star===true;
        // turno distribution
        const u=r(); const turno = u<0.30?'morning':u<0.80?'afternoon':'night';
        const openH = turno==='morning'?ri(7,14):turno==='afternoon'?ri(15,22):ri(23,23+ (r()<0.5?0:6))%24;
        const openM = ri(0,59); const durMin = ri(35,110);
        const oh=pad(openH), om=pad(openM);
        const closeTotal = openH*60+openM+durMin; const ch=pad(Math.floor(closeTotal/60)%24), cm=pad(closeTotal%60);
        const comensales = bc==='TV'?ri(1,3):bc==='MB'?ri(2,5):ri(2,4);
        // check value
        let checkMult = rf(0.7,1.3);
        if (pattern==='Star'||star) checkMult *= 1.15;
        if (pattern.startsWith('Slow')) checkMult *= 0.85;
        const subtotal = round2(bench * comensales/ (bc==='TV'?2.2:bc==='MB'?3:2.6) * checkMult * comensales/comensales * (bc==='TV'?1.0:1.0));
        const sub = round2(Math.max(60, bench*checkMult));
        const alimentos = round2(sub*rf(0.68,0.82));
        const bebidas = round2(sub-alimentos);
        // leakage
        let cancelRate = pattern.startsWith('High Cancellation')?rf(0.07,0.09): pattern==='Star'?rf(0,0.01): rf(0.015,0.025);
        const cancelado = round2(sub*cancelRate*(r()<0.5?1:0)); // sporadic per cheque, averages to rate
        const descuento = round2(sub*rf(0.03,0.05)*(r()<0.4?1:0));
        const cortesia = round2(sub*rf(0.01,0.02)*(r()<0.3?1:0));
        const netSub = round2(sub - descuento - cortesia - cancelado);
        const iva = round2(netSub*0.16);
        const tot = round2(netSub + iva);
        // tip
        let tipRate = pattern==='Star'||star?rf(0.18,0.22): bc==='MB'?rf(0.15,0.18): pattern.startsWith('Slow')?rf(0.08,0.10): rf(0.12,0.15);
        const propina = round2(netSub*tipRate);
        // payment
        const pu=r(); let efectivo=0,tarjeta=0,forma='';
        if (pu<0.40){ forma='efectivo'; efectivo=tot; }
        else if (pu<0.92){ forma='tarjeta'; tarjeta=tot; }
        else { forma='mixto'; efectivo=round2(tot*rf(0.3,0.6)); tarjeta=round2(tot-efectivo); }
        const seq = pad(c+1,4);
        rows.push({ tenant_id:tid, entity_id:loc.id, period_id:pid, data_type:'pos_cheque', source_date:dateStr, metadata:{}, row_data:{
          folio:`CHQ-${loc.external_id}-${dateStr.replace(/-/g,'')}-${seq}`, fecha:dateStr, hora_apertura:`${oh}:${om}`, hora_cierre:`${ch}:${cm}`,
          mesa:ri(1,30), mesero_id:sv.metadata.mesero_id, mesero_nombre:sv.display_name, num_comensales:comensales, turno,
          subtotal_alimentos:alimentos, subtotal_bebidas:bebidas, descuento, cortesia, cancelado, subtotal:sub, iva, total:tot, propina,
          efectivo, tarjeta, forma_pago:forma, sucursal_id:loc.external_id, tipo_servicio: bc==='TV'?'express':'dine_in',
        }});
        total++;
      }
    }
    // flush per-day to bound memory
    if (rows.length >= 5000){ for(let i=0;i<rows.length;i+=5000){ const sl=rows.slice(i,i+5000); const{error}=await sb.from('committed_data').insert(sl); if(error)throw error; } rows.length=0; }
  }
  for(let i=0;i<rows.length;i+=5000){ const sl=rows.slice(i,i+5000); const{error}=await sb.from('committed_data').insert(sl); if(error)throw error; }
  const { count } = await sb.from('committed_data').select('*',{count:'exact',head:true}).eq('tenant_id',tid).eq('data_type','pos_cheque');
  console.log(`PROOF total pos_cheque rows: ${count} (generated ${total})`);
}
main().catch(e=>{console.error(e);process.exit(1);});
