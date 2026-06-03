import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  // Tenant (idempotent: upsert by slug)
  const settings = {
    industry: 'Restaurant Franchise', hq_city: 'Mazatlán', hq_state: 'Sinaloa',
    modules: ['icm','financial'],
    financial_config: {
      pos_format: 'softrestaurant_23col',
      shift_definitions: { morning:{start:'07:00',end:'15:00'}, afternoon:{start:'15:00',end:'23:00'}, night:{start:'23:00',end:'07:00'} },
      tax_rate: 0.16, brands: ['Cocina Dorada','Taco Veloz','Mar y Brasa'],
    },
  };
  const hierarchy_labels = { level_0:'Red', level_1:'Marca', level_2:'Región', level_3:'Sucursal', level_4:'Mesero' };
  const entity_type_labels = { organization:'Franquicia', brand:'Marca', region:'Región', location:'Sucursal', individual:'Mesero' };
  const features = { icm:true, financial:true, import:true, reconciliation:true, disputes:true };

  let { data: existing } = await sb.from('tenants').select('id').eq('slug','sabor-grupo').maybeSingle();
  let tid: string;
  if (existing) { tid = existing.id; await sb.from('tenants').update({ name:'Sabor Grupo Gastronomico', settings, hierarchy_labels, entity_type_labels, features, locale:'es-MX', currency:'MXN' }).eq('id', tid); }
  else {
    const { data, error } = await sb.from('tenants').insert({ name:'Sabor Grupo Gastronomico', slug:'sabor-grupo', settings, hierarchy_labels, entity_type_labels, features, locale:'es-MX', currency:'MXN' }).select('id').single();
    if (error) throw error; tid = data.id;
  }
  console.log('tenant_id:', tid);

  // Periods (idempotent by canonical_key)
  const periods = [
    { label:'Semana 1 - Enero 2024', period_type:'weekly', status:'closed', start_date:'2024-01-01', end_date:'2024-01-07', canonical_key:'2024-W01' },
    { label:'Semana 2 - Enero 2024', period_type:'weekly', status:'closed', start_date:'2024-01-08', end_date:'2024-01-14', canonical_key:'2024-W02' },
    { label:'Semana 3 - Enero 2024', period_type:'weekly', status:'closed', start_date:'2024-01-15', end_date:'2024-01-21', canonical_key:'2024-W03' },
    { label:'Enero 2024', period_type:'monthly', status:'closed', start_date:'2024-01-01', end_date:'2024-01-31', canonical_key:'2024-01' },
  ];
  for (const p of periods) {
    const { data: ep } = await sb.from('periods').select('id').eq('tenant_id',tid).eq('canonical_key',p.canonical_key).maybeSingle();
    if (ep) await sb.from('periods').update({ ...p }).eq('id', ep.id);
    else { const { error } = await sb.from('periods').insert({ tenant_id:tid, metadata:{}, ...p }); if (error) throw error; }
  }
  // Proof gates
  const { count: tc } = await sb.from('tenants').select('*',{count:'exact',head:true}).eq('slug','sabor-grupo');
  const { count: pc } = await sb.from('periods').select('*',{count:'exact',head:true}).eq('tenant_id',tid);
  console.log(`PROOF: tenants(sabor-grupo)=${tc} periods=${pc}`);
}
main().catch(e => { console.error(e); process.exit(1); });
