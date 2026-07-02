// HF-373 EPG-0.8 probe 1 (READ-ONLY): FP-49 introspection of processing_jobs + structural_fingerprints
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';

async function main() {
  // 1) processing_jobs shape
  const { data: pj1, error: e1 } = await sb.from('processing_jobs').select('*').limit(1);
  console.log('processing_jobs keys:', pj1 && pj1[0] ? Object.keys(pj1[0]) : `(none) err=${e1?.message}`);

  // 2) structural_fingerprints shape
  const { data: sf1, error: e2 } = await sb.from('structural_fingerprints').select('*').limit(1);
  console.log('structural_fingerprints keys:', sf1 && sf1[0] ? Object.keys(sf1[0]) : `(none) err=${e2?.message}`);

  // 3) recent VLTEST2 processing_jobs (last 72h)
  const since = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
  const { data: jobs, error: e3 } = await sb.from('processing_jobs')
    .select('id, created_at, status, file_name, recognition_tier, error_detail')
    .eq('tenant_id', VLTEST2)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(40);
  if (e3) console.log('jobs err:', e3.message);
  for (const j of jobs ?? []) {
    console.log(`job ${j.id} | ${j.created_at} | status=${j.status} | tier=${j.recognition_tier} | file=${j.file_name} | err=${j.error_detail ? String(j.error_detail).slice(0, 80) : null}`);
  }

  // 4) VLTEST2 sheet-granularity fingerprints
  const { data: sheets, error: e4 } = await sb.from('structural_fingerprints')
    .select('id, fingerprint_hash, granularity, algorithm_version, match_count, confidence, source_file_sample, created_at, updated_at')
    .eq('tenant_id', VLTEST2)
    .eq('granularity', 'sheet')
    .order('updated_at', { ascending: false })
    .limit(30);
  if (e4) console.log('sheet fp err:', e4.message);
  console.log(`\nVLTEST2 sheet fingerprints: ${sheets?.length ?? 0}`);
  for (const s of sheets ?? []) {
    console.log(`sheet-fp ${s.fingerprint_hash?.slice(0, 12)} | v=${s.algorithm_version} | mc=${s.match_count} | conf=${s.confidence} | src=${s.source_file_sample} | upd=${s.updated_at}`);
  }

  // 5) VLTEST2 atom-granularity fingerprint count by version
  const { data: atoms, error: e5 } = await sb.from('structural_fingerprints')
    .select('algorithm_version, granularity')
    .eq('tenant_id', VLTEST2)
    .eq('granularity', 'atom');
  if (e5) console.log('atom fp err:', e5.message);
  const byVer: Record<string, number> = {};
  for (const a of atoms ?? []) byVer[String(a.algorithm_version)] = (byVer[String(a.algorithm_version)] ?? 0) + 1;
  console.log('\nVLTEST2 atom fingerprints by algorithm_version:', JSON.stringify(byVer));
}
main().catch(e => { console.error(e); process.exit(1); });
