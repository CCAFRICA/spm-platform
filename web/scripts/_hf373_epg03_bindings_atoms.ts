import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';
const JOB = '66551591-9376-4b77-8850-db1be4af85f5';

async function main() {
  // 1. fieldBindings on the roster unit
  const { data: job } = await sb.from('processing_jobs').select('proposal').eq('id', JOB).single();
  const unit = (job!.proposal as any).contentUnits[0];
  const fb = unit.fieldBindings;
  console.log('fieldBindings type:', Array.isArray(fb) ? 'array' : typeof fb);
  for (const b of (Array.isArray(fb) ? fb : [])) {
    console.log(`  BINDING ${b.sourceField} -> ${b.semanticRole} (conf=${b.confidence}, claimedBy=${b.claimedBy})`);
  }

  // 2. atoms (structural_fingerprints granularity=atom / scope) for VLTEST2, current algorithm version
  const { data: atoms, error: aerr } = await sb.from('structural_fingerprints')
    .select('id, granularity, scope, algorithm_version, column_roles, atom_features, confidence, updated_at')
    .eq('tenant_id', VLTEST2)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (aerr) { console.log('atoms err', aerr.message); return; }
  console.log('\nstructural_fingerprints rows for VLTEST2:', atoms?.length);
  const granularities = new Map<string, number>();
  for (const a of atoms ?? []) granularities.set(`${a.granularity}/v${a.algorithm_version}`, (granularities.get(`${a.granularity}/v${a.algorithm_version}`) ?? 0) + 1);
  console.log('granularity/version counts:', JSON.stringify(Object.fromEntries(granularities)));
  for (const a of atoms ?? []) {
    const cr = a.column_roles as Record<string, any> | null;
    if (!cr) continue;
    const cols = Object.keys(cr);
    const idCols = cols.filter(c => /ID_Empleado|ID_Gerente/i.test(c));
    if (idCols.length > 0) {
      for (const c of idCols) {
        console.log(`\nATOM row ${a.id} (gran=${a.granularity}, v=${a.algorithm_version}, updated=${a.updated_at}) col=${c}:`);
        console.log('  ', JSON.stringify(cr[c]).slice(0, 800));
      }
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
