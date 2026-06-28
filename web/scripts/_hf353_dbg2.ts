import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { detectHierarchyRoles } from '../src/lib/sci/post-commit-construction';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const R = '74d71a1d-7d2f-45ef-93d4-e3e3e80a68d2';
(async () => {
  const { data: rows } = await sb.from('committed_data').select('row_data, metadata').eq('tenant_id', R).eq('data_type','entity').limit(200);
  const jer = (rows ?? []).filter(r => (r.row_data as any)?._sheetName === 'Jerarquia');
  const withFi = jer.find(r => (r.metadata as any)?.field_identities && Object.keys((r.metadata as any).field_identities).length > 0)!;
  const fi = (withFi.metadata as any).field_identities;
  const eidf = (withFi.metadata as any).entity_id_field ?? null;
  console.log('structuralTypes:');
  for (const [k,v] of Object.entries(fi)) console.log(`  [${k}] = "${(v as any).structuralType}"`);
  console.log('entity_id_field =', JSON.stringify(eidf));
  // direct regex test
  const RE = /reference|relational|pointer|reports?[\s_-]?to|superior|parent[\s_-]?entity|points?\s+to|reporta/i;
  console.log('regex on __EMPTY_2:', RE.test(`${fi.__EMPTY_2?.structuralType} ${fi.__EMPTY_2?.contextualIdentity}`));
  const roles = detectHierarchyRoles(fi, eidf);
  console.log('detectHierarchyRoles =>', JSON.stringify(roles));
})().catch(e=>console.log('threw:',e instanceof Error?e.message:String(e)));
