import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const R = '74d71a1d-7d2f-45ef-93d4-e3e3e80a68d2';
(async () => {
  const { data: rows } = await sb.from('committed_data').select('row_data, metadata').eq('tenant_id', R).eq('data_type','entity').limit(200);
  const jer = (rows ?? []).filter(r => (r.row_data as any)?._sheetName === 'Jerarquia');
  // how many distinct field_identities shapes?
  for (let i=0;i<3;i++){
    const md = jer[i]?.metadata as any;
    console.log(`jer[${i}] _rowIndex=${(jer[i]?.row_data as any)?._rowIndex} fi keys=${md?.field_identities ? Object.keys(md.field_identities).join(',') : 'NONE'}`);
  }
  // find a row WITH field_identities
  const withFi = jer.find(r => (r.metadata as any)?.field_identities && Object.keys((r.metadata as any).field_identities).length>0);
  const fi = (withFi?.metadata as any)?.field_identities;
  console.log('\nstructuralTypes:', fi ? Object.entries(fi).map(([k,v]:any)=>`${k}=${v.structuralType}`).join(' | ') : 'none');
})().catch(e=>console.log('threw:',e instanceof Error?e.message:String(e)));
