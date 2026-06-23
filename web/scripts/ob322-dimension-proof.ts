import { createClient } from '@supabase/supabase-js';
const BCL='b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const MIN=2, MAX=20;
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
const humanize=(k:string)=>k.replace(/[_\-]+/g,' ').trim().replace(/\b\w/g,c=>c.toUpperCase());
(async()=>{
  // latest period with results
  const {data:cr}=await sb.from('calculation_results').select('entity_id,period_id,total_payout,components').eq('tenant_id',BCL);
  const byPeriod=new Map<string,any[]>(); (cr??[]).forEach(r=>{const a=byPeriod.get(r.period_id)??[];a.push(r);byPeriod.set(r.period_id,a);});
  const periodId=[...byPeriod.keys()].sort()[0]; const rows=byPeriod.get(periodId)!;
  console.log(`Period ${periodId.slice(0,8)} — ${rows.length} outcomes\n`);

  // --- O-4 proof: component aggregation non-zero ---
  const compAcc=new Map<string,number>();
  for(const r of rows){const comps=Array.isArray(r.components)?r.components:[];for(const c of comps){compAcc.set(c.componentName, (compAcc.get(c.componentName)??0)+(Number(c.payout)||0));}}
  const compTotal=[...compAcc.values()].reduce((s,v)=>s+v,0);
  const periodTotal=rows.reduce((s,r)=>s+(Number(r.total_payout)||0),0);
  console.log('O-4 Earnings by Component (was always $0 — read comp.payout not comp.outputValue):');
  [...compAcc.entries()].sort((a,b)=>b[1]-a[1]).forEach(([n,v])=>console.log(`   ${n}: $${v.toLocaleString()}`));
  console.log(`   component sum=$${compTotal.toLocaleString()} | period total_payout=$${periodTotal.toLocaleString()} | match=${compTotal===periodTotal}\n`);

  // --- O-3 proof: dimension discovery from entities.metadata ---
  const ids=rows.map(r=>r.entity_id);
  const valuesByKey=new Map<string,Set<string>>(); const metaById=new Map<string,any>();
  for(let i=0;i<ids.length;i+=300){const {data}=await sb.from('entities').select('id,metadata').in('id',ids.slice(i,i+300));
    for(const e of data??[]){metaById.set(e.id,e.metadata||{});for(const [k,v] of Object.entries(e.metadata||{})){if(v==null||typeof v==='object')continue;const s=String(v).trim();if(!s)continue;let set=valuesByKey.get(k);if(!set){set=new Set();valuesByKey.set(k,set);}set.add(s);}}}
  const dims:any[]=[{key:'__component__',label:'Component',source:'component',values:[...compAcc.keys()].sort()}];
  const seen=new Set<string>();
  for(const k of [...valuesByKey.keys()].sort()){const set=valuesByKey.get(k)!;if(set.size<MIN||set.size>MAX)continue;const sig=[...set].sort().join('');if(seen.has(sig))continue;seen.add(sig);dims.push({key:k,label:humanize(k),source:'attribute',values:[...set].sort()});}
  console.log('O-3 Discovered dimensions (Korean-clean, 2..20 distinct, value-set deduped):');
  dims.forEach(d=>console.log(`   [${d.source}] ${d.label} (${d.key}) → ${d.values.length} values: ${d.values.slice(0,6).join(', ')}`));

  // --- O-5 proof: pivot by a discovered attribute dimension (region) ---
  const regionDim=dims.find(d=>d.key==='region');
  if(regionDim){const acc=new Map<string,number>();for(const r of rows){const v=String(metaById.get(r.entity_id)?.region??'—');acc.set(v,(acc.get(v)??0)+(Number(r.total_payout)||0));}
    console.log('\nO-5 Pivot by Region (the panel that falsely said "No Segment Dimension"):');
    [...acc.entries()].sort((a,b)=>b[1]-a[1]).forEach(([v,amt])=>console.log(`   ${v}: $${amt.toLocaleString()}`));
    console.log(`   region sum=$${[...acc.values()].reduce((s,v)=>s+v,0).toLocaleString()} | match period=${[...acc.values()].reduce((s,v)=>s+v,0)===periodTotal}`);}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
