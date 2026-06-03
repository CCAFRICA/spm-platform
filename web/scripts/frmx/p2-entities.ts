import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BRAND = { CD:{name:'Cocina Dorada',fmt:'Full-Service Dining',bench:380,covers:180,staff:4}, TV:{name:'Taco Veloz',fmt:'Express/Fast-Casual',bench:185,covers:260,staff:2}, MB:{name:'Mar y Brasa',fmt:'Premium Seafood & Grill',bench:580,covers:90,staff:3} } as const;
// [external_id, brand_code, city, state, region, pattern, tags, serverCount]
const LOCS: Array<[string,keyof typeof BRAND,string,string,string,string,string[],number]> = [
  ['FRMX-CD-CDMX-001','CD','CDMX','CDMX','Centro','Strong',['Oro'],3],
  ['FRMX-CD-CDMX-002','CD','CDMX','CDMX','Centro','Star',['Oro'],3],
  ['FRMX-CD-GDL-001','CD','Guadalajara','Jalisco','Occidente','Declining',[],2],
  ['FRMX-CD-MTY-001','CD','Monterrey','Nuevo León','Norte','Strong',['Oro'],3],
  ['FRMX-CD-PUE-001','CD','Puebla','Puebla','Centro','Normal',[],2],
  ['FRMX-CD-CAN-001','CD','Cancún','Quintana Roo','Sureste','Seasonal/Weekend',['Expansión'],3],
  ['FRMX-CD-QRO-001','CD','Querétaro','Querétaro','Centro','Normal',['Expansión'],2],
  ['FRMX-CD-OAX-001','CD','Oaxaca','Oaxaca','Sureste','Slow/Underperformer',[],2],
  ['FRMX-TV-CDMX-001','TV','CDMX','CDMX','Centro','Strong',['Oro'],2],
  ['FRMX-TV-CDMX-002','TV','CDMX','CDMX','Centro','Normal',[],1],
  ['FRMX-TV-GDL-001','TV','Guadalajara','Jalisco','Occidente','Normal',[],2],
  ['FRMX-TV-MTY-001','TV','Monterrey','Nuevo León','Norte','High Cancellation',[],1],
  ['FRMX-TV-TIJ-001','TV','Tijuana','Baja California','Norte','Strong',['Expansión'],2],
  ['FRMX-TV-LEO-001','TV','León','Guanajuato','Occidente','Normal',[],1],
  ['FRMX-TV-MER-001','TV','Mérida','Yucatán','Sureste','Slow/Underperformer',[],2],
  ['FRMX-MB-CDMX-001','MB','CDMX','CDMX','Centro','Star',['Oro'],3],
  ['FRMX-MB-CAN-001','MB','Cancún','Quintana Roo','Sureste','Seasonal/Tourist',['Oro','Expansión'],2],
  ['FRMX-MB-MTY-001','MB','Monterrey','Nuevo León','Norte','Strong',['Oro'],2],
  ['FRMX-MB-GDL-001','MB','Guadalajara','Jalisco','Occidente','Normal',[],1],
  ['FRMX-MB-PUE-001','MB','Puebla','Puebla','Centro','Declining',['Expansión'],1],
];
const REGIONS = [['FRMX-REG-CENTRO','Centro',['CDMX','Puebla','Querétaro']],['FRMX-REG-NORTE','Norte',['Nuevo León','Chihuahua']],['FRMX-REG-OCCIDENTE','Occidente',['Jalisco','Guanajuato','Sinaloa']],['FRMX-REG-SURESTE','Sureste',['Quintana Roo','Yucatán','Oaxaca']]] as const;
const GIVEN=['María','José','Juan','Ana','Luis','Carlos','Sofía','Diego','Elena','Miguel','Laura','Jorge','Patricia','Roberto','Gabriela','Fernando','Adriana','Ricardo','Mónica','Alejandro','Verónica','Sergio','Daniela','Raúl','Claudia','Héctor','Lucía','Pedro','Rosa','Andrés','Carmen','Pablo','Beatriz','Manuel','Silvia','Antonio','Teresa','Eduardo','Marta','Francisco'];
const GIVEN2=['Elena','Antonio','Guadalupe','Isabel','Fernando','del Carmen','Alberto','José','Luisa','Ángel'];
const SUR=['Gutiérrez','Flores','Hernández','García','Martínez','López','Rodríguez','Pérez','Sánchez','Ramírez','Cruz','Torres','Reyes','Morales','Jiménez','Ortiz','Vázquez','Castillo','Mendoza','Romero','Contreras','Guerrero','Medina','Aguilar','Vargas','Ramos','Domínguez','Estrada','Cortés','Salazar'];
function rng(seed:number){ let s=seed; return ()=>{ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; }; }
const r = rng(42);
const pick=<T,>(a:readonly T[])=>a[Math.floor(r()*a.length)];

async function main(){
  const { data: t } = await sb.from('tenants').select('id').eq('slug','sabor-grupo').single(); const tid=t!.id;
  // clean slate for entities + relationships (fresh tenant)
  await sb.from('entity_relationships').delete().eq('tenant_id',tid);
  await sb.from('entities').delete().eq('tenant_id',tid);

  type E={external_id:string;display_name:string;entity_type:string;metadata:any};
  const ents:E[]=[];
  ents.push({external_id:'FRMX-HQ',display_name:'Sabor Grupo Gastronomico',entity_type:'organization',metadata:{entity_role:'organization',hierarchy_level:0,hq_city:'Mazatlán',hq_state:'Sinaloa',founded:2015}});
  ents.push({external_id:'FRMX-CD',display_name:'Cocina Dorada',entity_type:'team',metadata:{entity_role:'brand',hierarchy_level:1,format:'Full-Service Dining',concept:'casual_dining',avg_check_target:380}});
  ents.push({external_id:'FRMX-TV',display_name:'Taco Veloz',entity_type:'team',metadata:{entity_role:'brand',hierarchy_level:1,format:'Express/Fast-Casual',concept:'fast_casual',avg_check_target:185}});
  ents.push({external_id:'FRMX-MB',display_name:'Mar y Brasa',entity_type:'team',metadata:{entity_role:'brand',hierarchy_level:1,format:'Premium Seafood & Grill',concept:'premium_dining',avg_check_target:580}});
  for (const [eid,name,states] of REGIONS) ents.push({external_id:eid,display_name:name,entity_type:'team',metadata:{entity_role:'region',hierarchy_level:2,states}});
  const locNames:Record<string,string>={'FRMX-CD-CDMX-001':'Cocina Dorada Polanco','FRMX-CD-CDMX-002':'Cocina Dorada Roma','FRMX-CD-GDL-001':'Cocina Dorada Guadalajara','FRMX-CD-MTY-001':'Cocina Dorada Monterrey','FRMX-CD-PUE-001':'Cocina Dorada Puebla','FRMX-CD-CAN-001':'Cocina Dorada Cancún','FRMX-CD-QRO-001':'Cocina Dorada Querétaro','FRMX-CD-OAX-001':'Cocina Dorada Oaxaca','FRMX-TV-CDMX-001':'Taco Veloz Condesa','FRMX-TV-CDMX-002':'Taco Veloz Coyoacán','FRMX-TV-GDL-001':'Taco Veloz Guadalajara','FRMX-TV-MTY-001':'Taco Veloz Monterrey','FRMX-TV-TIJ-001':'Taco Veloz Tijuana','FRMX-TV-LEO-001':'Taco Veloz León','FRMX-TV-MER-001':'Taco Veloz Mérida','FRMX-MB-CDMX-001':'Mar y Brasa Polanco','FRMX-MB-CAN-001':'Mar y Brasa Cancún','FRMX-MB-MTY-001':'Mar y Brasa Monterrey','FRMX-MB-GDL-001':'Mar y Brasa Guadalajara','FRMX-MB-PUE-001':'Mar y Brasa Puebla'};
  for (const [eid,bc,city,state,region,pattern,tags] of LOCS) {
    const b=BRAND[bc];
    ents.push({external_id:eid,display_name:locNames[eid],entity_type:'location',metadata:{brand:b.name,brand_code:bc,city,state,region,entity_role:'location',hierarchy_level:3,format:b.fmt,pattern,tags,avg_check_benchmark:b.bench,daily_covers_target:b.covers,staff_count:b.staff}});
  }
  // servers
  let mes=0; const servers:E[]=[];
  for (const [eid,bc,,, ,pattern] of LOCS) {
    const cnt = LOCS.find(l=>l[0]===eid)![7];
    const b=BRAND[bc];
    for (let i=0;i<cnt;i++){
      mes++; const id=`MES-${String(mes).padStart(3,'0')}`;
      const g=pick(GIVEN); const g2=r()<0.4?` ${pick(GIVEN2)}`:''; const nm=`${g}${g2} ${pick(SUR)} ${pick(SUR)}`;
      const isStar = (eid==='FRMX-CD-CDMX-002'||eid==='FRMX-MB-CDMX-001') && i===0;
      const yr=2023; const mo=String(1+Math.floor(r()*12)).padStart(2,'0'); const dy=String(1+Math.floor(r()*28)).padStart(2,'0');
      servers.push({external_id:id,display_name:nm,entity_type:'individual',metadata:{role:'mesero',location_id:eid,brand:b.name,hire_date:`${yr}-${mo}-${dy}`,mesero_id:id,...(isStar?{star:true}:{})}});
    }
  }
  ents.push(...servers);
  // insert
  const rows = ents.map(e=>({tenant_id:tid,entity_type:e.entity_type,status:'active',external_id:e.external_id,display_name:e.display_name,temporal_attributes:[],metadata:e.metadata}));
  for (let i=0;i<rows.length;i+=500){ const { error } = await sb.from('entities').insert(rows.slice(i,i+500)); if(error) throw error; }
  // id map
  const { data: created } = await sb.from('entities').select('id, external_id, entity_type, metadata').eq('tenant_id',tid);
  const idOf=new Map((created||[]).map((e:any)=>[e.external_id,e.id]));
  // relationships
  const rels:any[]=[];
  const rel=(src:string,tgt:string,type:string)=>{ const s=idOf.get(src),tg=idOf.get(tgt); if(s&&tg) rels.push({tenant_id:tid,source_entity_id:s,target_entity_id:tg,relationship_type:type,source:'human_created',confidence:1.0,evidence:{},context:{}}); };
  for (const bc of ['FRMX-CD','FRMX-TV','FRMX-MB']) rel('FRMX-HQ',bc,'contains');
  for (const [eid,bc] of LOCS) rel(`FRMX-${bc}`,eid,'contains');
  for (const [eid,,,,region] of LOCS) rel(eid,`FRMX-REG-${region.toUpperCase()}`,'member_of');
  for (const s of servers) rel(s.metadata.location_id, s.external_id, 'contains');
  for (let i=0;i<rels.length;i+=500){ const { error } = await sb.from('entity_relationships').insert(rels.slice(i,i+500)); if(error) throw error; }
  // proof
  const counts:Record<string,number>={};
  (created||[]).forEach((e:any)=>counts[e.entity_type]=(counts[e.entity_type]||0)+1);
  const roleCounts:Record<string,number>={}; (created||[]).forEach((e:any)=>{const rr=e.metadata?.entity_role||e.entity_type; roleCounts[rr]=(roleCounts[rr]||0)+1;}); console.log('PROOF entity_type counts:', JSON.stringify(counts)); console.log('PROOF entity_role counts:', JSON.stringify(roleCounts), 'total:', (created||[]).length, 'relationships:', rels.length);
}
main().catch(e=>{console.error(e);process.exit(1);});
