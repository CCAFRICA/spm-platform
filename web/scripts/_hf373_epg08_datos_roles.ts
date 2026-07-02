// HF-373 EPG-0.8 probe 2 (READ-ONLY): Datos fingerprint row + latest Datos job bindings/trace
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';

async function main() {
  // 1) The stored Datos sheet fingerprint row, in full
  const { data: fp } = await sb.from('structural_fingerprints')
    .select('*')
    .eq('tenant_id', VLTEST2)
    .eq('granularity', 'sheet')
    .like('source_file_sample', '%Datos%');
  for (const row of fp ?? []) {
    console.log('=== Datos sheet fingerprint row ===');
    console.log('hash:', row.fingerprint_hash);
    console.log('match_count:', row.match_count, 'confidence:', row.confidence, 'algorithm_version:', row.algorithm_version);
    console.log('created_at:', row.created_at, 'updated_at:', row.updated_at);
    console.log('source_file_sample:', row.source_file_sample);
    console.log('column_roles:', JSON.stringify(row.column_roles, null, 2));
    const cr = row.classification_result as Record<string, unknown>;
    console.log('classification_result.classification:', cr?.classification, 'confidence:', cr?.confidence, 'tabName:', cr?.tabName);
    const fb = cr?.fieldBindings as Array<Record<string, unknown>> | undefined;
    if (fb) {
      console.log('classification_result.fieldBindings:');
      for (const b of fb) console.log('  ', JSON.stringify(b));
    }
  }

  // 2) Latest Datos processing job — proposal.contentUnits fieldBindings + HC interpretations
  const { data: jobs } = await sb.from('processing_jobs')
    .select('id, created_at, file_name, status, recognition_tier, proposal, classification_result')
    .eq('tenant_id', VLTEST2)
    .like('file_name', '%Datos%')
    .order('created_at', { ascending: false })
    .limit(6);
  const job = (jobs ?? [])[0];
  if (!job) { console.log('no Datos job found'); return; }
  console.log('\n=== Latest Datos job ===');
  console.log('id:', job.id, 'file:', job.file_name, 'status:', job.status, 'tier:', job.recognition_tier);
  const units = (job.proposal as Record<string, unknown>)?.contentUnits as Array<Record<string, unknown>> | undefined;
  for (const u of units ?? []) {
    console.log(`\n-- unit tab=${u.tabName} classification=${u.classification} conf=${u.confidence} comprehensionState=${(u as Record<string, unknown>).comprehensionState ?? '(none)'}`);
    const bindings = u.fieldBindings as Array<Record<string, unknown>> | undefined;
    console.log('fieldBindings (sourceField -> semanticRole @conf, claimedBy):');
    for (const b of bindings ?? []) {
      console.log(`  ${b.sourceField} -> ${b.semanticRole} @${b.confidence} claimedBy=${b.claimedBy} ctx=${String(b.displayContext ?? '').slice(0, 90)}`);
    }
    const trace = u.classificationTrace as Record<string, unknown> | undefined;
    const hc = trace?.headerComprehension as Record<string, unknown> | undefined;
    const interps = hc?.interpretations as Record<string, Record<string, unknown>> | undefined;
    console.log('HC interpretations (col -> {data_nature, identifies, scope_role, nature_role, plan_role, confidence}):');
    for (const [col, i] of Object.entries(interps ?? {})) {
      console.log(`  ${col} -> data_nature=${JSON.stringify(i.data_nature)} identifies=${JSON.stringify(i.identifies)} scope_role=${JSON.stringify(i.scope_role)} nature_role=${JSON.stringify(i.nature_role)} plan_role=${JSON.stringify(i.plan_role)} conf=${i.confidence}`);
    }
    if (!interps) console.log('  (no interpretations on trace) trace keys:', trace ? Object.keys(trace) : '(no trace)');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
