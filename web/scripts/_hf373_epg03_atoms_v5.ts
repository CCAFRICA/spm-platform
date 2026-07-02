import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';

async function main() {
  const { data: atoms } = await sb.from('structural_fingerprints')
    .select('id, fingerprint, column_roles, atom_features, confidence, updated_at, scope')
    .eq('tenant_id', VLTEST2)
    .eq('granularity', 'atom')
    .eq('algorithm_version', 5)
    .limit(50);
  console.log('atom/v5 count:', atoms?.length);
  if (atoms && atoms[0]) {
    console.log('sample atom keys of column_roles:', JSON.stringify(atoms[0].column_roles).slice(0, 600));
    console.log('sample atom_features:', JSON.stringify(atoms[0].atom_features).slice(0, 600));
    console.log('sample fingerprint:', JSON.stringify(atoms[0].fingerprint).slice(0, 300));
  }
  // find atoms whose column_roles or atom_features mention the ID columns
  for (const a of atoms ?? []) {
    const s = JSON.stringify({ cr: a.column_roles, af: a.atom_features, fp: a.fingerprint });
    if (/ID_Empleado|ID_Gerente/i.test(s)) {
      console.log(`\nATOM ${a.id} scope=${JSON.stringify(a.scope)} updated=${a.updated_at}`);
      console.log('  column_roles:', JSON.stringify(a.column_roles).slice(0, 1200));
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
