// HF-373 EPG-0.8 probe 4 (READ-ONLY): VLTEST2 v5 atom rows — roles, primitives, match counts
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';

async function main() {
  const { data: atoms } = await sb.from('structural_fingerprints')
    .select('fingerprint_hash, column_roles, confidence, match_count, atom_features, created_at, updated_at')
    .eq('tenant_id', VLTEST2)
    .eq('granularity', 'atom')
    .eq('algorithm_version', 5)
    .order('updated_at', { ascending: false });
  console.log(`VLTEST2 v5 atoms: ${atoms?.length}`);
  for (const a of atoms ?? []) {
    const cr = (a.column_roles as Record<string, unknown>) ?? {};
    const feats = (a.atom_features as Record<string, unknown>) ?? {};
    console.log(`atom ${String(a.fingerprint_hash).slice(0, 12)} mc=${a.match_count} conf=${a.confidence} dt=${feats.dataType} | role=${JSON.stringify(cr.role)} roleConf=${cr.roleConfidence} nature_role=${JSON.stringify(cr.nature_role)} scope_role=${JSON.stringify(cr.scope_role)} plan_role=${JSON.stringify(cr.plan_role)} identifies=${String(cr.identifies ?? '').slice(0, 60)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
