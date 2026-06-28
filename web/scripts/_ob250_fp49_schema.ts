// OB-250 FP-49 Schema Verification Gate (read-only, service-role row-introspection).
// Confirms the LIVE schema of every FK target the processing_jobs migration references
// (tenants.id, profiles.auth_user_id) and the ingestion dependency tables, and CONFIRMS
// processing_jobs does NOT yet exist (architect applies the migration, SR-44).
// No writes. Run from web/:  npx tsx scripts/_ob250_fp49_schema.ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function describe(table: string, probeCols: string[] = []) {
  const probe = await sb.from(table).select('*').limit(1);
  if (probe.error) {
    console.log(`  ${table.padEnd(28)} MISSING/ERROR — ${probe.error.code ?? ''} ${probe.error.message}`);
    return;
  }
  const { count } = await sb.from(table).select('*', { count: 'exact', head: true });
  const cols = probe.data?.[0] ? Object.keys(probe.data[0]).sort() : null;
  console.log(`  ${table.padEnd(28)} EXISTS rows=${count ?? '?'}`);
  if (cols) {
    console.log(`      cols(${cols.length}): ${cols.join(', ')}`);
    const row = probe.data![0] as Record<string, unknown>;
    if ('id' in row) console.log(`      id sample: ${row.id} (uuid? ${UUID.test(String(row.id))})`);
    for (const c of probeCols) {
      if (c in row) console.log(`      ${c} sample: ${JSON.stringify(row[c])} (uuid? ${UUID.test(String(row[c]))})`);
      else console.log(`      ${c}: ABSENT`);
    }
  } else {
    console.log('      (0 rows — columns not introspectable via row sample; read migration)');
  }
}

async function main() {
  console.log('================ OB-250 FP-49 SCHEMA VERIFICATION ================\n');

  console.log('FK TARGETS for processing_jobs:');
  await describe('tenants', ['id', 'name']);
  await describe('profiles', ['id', 'auth_user_id', 'tenant_id', 'role']);

  console.log('\nINGESTION DEPENDENCY TABLES (read/written by the worker path):');
  await describe('committed_data', ['tenant_id', 'batch_id', 'chunk_id', 'source_date', 'data_type', 'content_unit_hash']);
  await describe('import_batches', ['id', 'tenant_id', 'status', 'content_hash', 'source_file_name']);
  await describe('plan_interpretation_runs', ['id', 'tenant_id', 'status']);
  await describe('classification_signals', ['tenant_id', 'signal_type']);
  await describe('file_objects', ['tenant_id', 'storage_path', 'scan_verdict', 'status']);
  await describe('atoms', ['tenant_id', 'fingerprint']);

  console.log('\nMUST-NOT-EXIST (created by the architect-applied OB-250 migration):');
  const pj = await sb.from('processing_jobs').select('*').limit(1);
  if (pj.error) {
    console.log(`  processing_jobs: ABSENT (expected) -> ${pj.error.code ?? ''} ${pj.error.message}`);
  } else {
    console.log(`  processing_jobs: ALREADY EXISTS (unexpected) -> ${pj.data?.length ?? 0} sample rows`);
    if (pj.data?.[0]) console.log(`    cols: ${Object.keys(pj.data[0]).join(', ')}`);
  }

  console.log('\n================ END ================');
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
