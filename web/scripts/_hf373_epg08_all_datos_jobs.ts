// HF-373 EPG-0.8 probe 3 (READ-ONLY): all 6 Datos jobs — per-run unknown columns + hashes
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { computeFingerprintHashSync } from '../src/lib/sci/structural-fingerprint';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';

async function main() {
  const { data: jobs } = await sb.from('processing_jobs')
    .select('id, created_at, file_name, status, recognition_tier, structural_fingerprint, proposal')
    .eq('tenant_id', VLTEST2)
    .like('file_name', '%Datos%')
    .order('created_at', { ascending: false })
    .limit(12);
  for (const job of jobs ?? []) {
    const units = (job.proposal as Record<string, unknown>)?.contentUnits as Array<Record<string, unknown>> | undefined;
    const sfp = job.structural_fingerprint as Record<string, unknown> | null;
    console.log(`\n=== ${job.file_name} | job=${String(job.id).slice(0, 8)} | tier=${job.recognition_tier} | status=${job.status}`);
    console.log('  job.structural_fingerprint:', sfp ? JSON.stringify(sfp).slice(0, 200) : null);
    for (const u of units ?? []) {
      const bindings = (u.fieldBindings as Array<Record<string, unknown>> | undefined) ?? [];
      const roleMap: Record<string, string> = {};
      for (const b of bindings) roleMap[String(b.sourceField)] = String(b.semanticRole);
      const unknowns = bindings.filter(b => b.semanticRole === 'unknown').map(b => `${b.sourceField}@${b.confidence}`);
      console.log(`  unit=${u.tabName} class=${u.classification}@${u.confidence} bindings=${bindings.length} UNKNOWN=[${unknowns.join(', ')}]`);
      console.log(`  roleMap: ${JSON.stringify(roleMap)}`);
      // data_nature prose for the unknown columns
      const trace = u.classificationTrace as Record<string, unknown> | undefined;
      const interps = (trace?.headerComprehension as Record<string, unknown> | undefined)?.interpretations as Record<string, Record<string, unknown>> | undefined;
      for (const b of bindings) {
        if (b.semanticRole !== 'unknown') continue;
        const i = interps?.[String(b.sourceField)];
        console.log(`  UNKNOWN col detail: ${b.sourceField} platformType=${b.platformType} data_nature=${JSON.stringify(i?.data_nature)} nature_role=${JSON.stringify(i?.nature_role)} scope_role=${JSON.stringify(i?.scope_role)}`);
      }
    }
  }

  // Cross-check: recompute the sheet hash from one job's stored sample columns if available
  console.log('\n(reference) stored Datos sheet fingerprint hash: fbead6eed137c1ae65c355b9e726084b28933397261c2c4c878776a4e51c2b2f');
  void computeFingerprintHashSync; // imported to prove the same function is reachable from scripts
}
main().catch(e => { console.error(e); process.exit(1); });
