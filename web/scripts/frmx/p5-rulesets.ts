import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main(){
  const { data: t } = await sb.from('tenants').select('id').eq('slug','sabor-grupo').single(); const tid=t!.id;
  await sb.from('rule_set_assignments').delete().eq('tenant_id',tid);
  await sb.from('rule_sets').delete().eq('tenant_id',tid);

  const rs1 = {
    tenant_id:tid, name:'Índice de Desempeño - Sucursales',
    description:'Performance Index for franchise locations based on 4 weighted components',
    status:'active', effective_from:'2024-01-01', effective_to:null, input_bindings:{},
    components:{ revenue_efficiency:{weight:0.30,metric:'revenue_per_shift_hour',description:'Revenue per shift hour vs brand benchmark',output_type:'score_0_100'},
      service_quality:{weight:0.25,metric:'avg_check_x_tip_rate',description:'Average check amount x tip rate percentage',output_type:'score_0_100'},
      operational_discipline:{weight:0.25,metric:'inverse_cancellation_rate',description:'Inverse of cancellation + comp rate',output_type:'score_0_100'},
      volume:{weight:0.20,metric:'covers_per_shift',description:'Covers (comensales) per shift vs target',output_type:'score_0_100'} },
    outcome_config:{ output_type:'tier_classification', tiers:{ estrella:{min:85,label:'Estrella',color:'#FFD700'}, destacado:{min:70,max:84,label:'Destacado',color:'#4CAF50'}, estandar:{min:50,max:69,label:'Estándar',color:'#2196F3'}, en_desarrollo:{max:49,label:'En Desarrollo',color:'#FF9800'} } },
    population_config:{ entity_type:'location', scope:'all_locations' },
    metadata:{ module:'financial', domain:'restaurant_franchise', cadence:'weekly' },
  };
  const rs2 = {
    tenant_id:tid, name:'Comisión por Ventas - Meseros',
    description:'Tiered commission on net server sales. Bridges Financial data to ICM payouts.',
    status:'active', effective_from:'2024-01-01', effective_to:null, input_bindings:{},
    components:{ base_commission:{type:'tiered_rate',tiers:[{min:0,max:50000,rate:0.02},{min:50001,max:100000,rate:0.03},{min:100001,rate:0.04}],basis:'net_server_sales',description:'2% on first 50K, 3% on 50K-100K, 4% above 100K'},
      tip_bonus:{type:'threshold_bonus',threshold:0.15,metric:'tip_rate',bonus:500,description:'MX$500 bonus if tip rate exceeds 15%'} },
    population_config:{ entity_type:'individual', scope:'all_servers' },
    outcome_config:{ output_type:'monetary', currency:'MXN' },
    metadata:{ module:'icm', domain:'restaurant_franchise', cadence:'monthly' },
  };
  const { data: ins, error } = await sb.from('rule_sets').insert([rs1,rs2]).select('id, name, population_config'); if(error) throw error;
  const rsPerf = ins!.find((x:any)=>x.name.startsWith('Índice'))!.id;
  const rsComm = ins!.find((x:any)=>x.name.startsWith('Comisión'))!.id;

  const { data: ents } = await sb.from('entities').select('id, entity_type').eq('tenant_id',tid);
  const locIds = (ents||[]).filter((e:any)=>e.entity_type==='location').map((e:any)=>e.id);
  const srvIds = (ents||[]).filter((e:any)=>e.entity_type==='individual').map((e:any)=>e.id);
  const asg = [
    ...locIds.map(eid=>({tenant_id:tid,rule_set_id:rsPerf,entity_id:eid,assignment_type:'direct',effective_from:'2024-01-01',metadata:{}})),
    ...srvIds.map(eid=>({tenant_id:tid,rule_set_id:rsComm,entity_id:eid,assignment_type:'direct',effective_from:'2024-01-01',metadata:{}})),
  ];
  for(let i=0;i<asg.length;i+=500){ const{error:e}=await sb.from('rule_set_assignments').insert(asg.slice(i,i+500)); if(e)throw e; }
  const { count: rsc } = await sb.from('rule_sets').select('*',{count:'exact',head:true}).eq('tenant_id',tid);
  const { count: ac } = await sb.from('rule_set_assignments').select('*',{count:'exact',head:true}).eq('tenant_id',tid);
  console.log(`PROOF rule_sets=${rsc} assignments=${ac} (perf=${rsPerf.slice(0,8)} comm=${rsComm.slice(0,8)})`);
}
main().catch(e=>{console.error(e);process.exit(1);});
