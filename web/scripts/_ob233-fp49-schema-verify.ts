// OB-233 FP-49 Schema Verification Gate (read-only, service-role).
// Confirms the live schema of every FK target the comprehension_artifacts migration references
// (tenants.id, import_batches.id) and the OB-233 dependency tables, and CONFIRMS that
// comprehension_artifacts does NOT yet exist (it must be created by the architect-applied migration).
// No writes. Run: npx tsx scripts/_ob233-fp49-schema-verify.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function describe(table: string): Promise<{ exists: boolean; cols: string[] | null }> {
  const { data, error } = await supabase.from(table).select('*').limit(1);
  if (error) { console.log(`  ${table}: MISSING/ERROR -> ${error.message}`); return { exists: false, cols: null }; }
  const cols = data && data.length ? Object.keys(data[0]) : null;
  console.log(`  ${table}: EXISTS${cols ? ` (${cols.length} cols)` : ' (empty - no sample row)'}`);
  if (cols) console.log(`    cols: ${cols.join(', ')}`);
  if (data && data.length && 'id' in data[0]) {
    const idv = (data[0] as Record<string, unknown>).id;
    console.log(`    id sample: ${idv} (uuid? ${UUID.test(String(idv))})`);
  }
  return { exists: true, cols };
}

async function main() {
  console.log('=== OB-233 FP-49 Schema Verification ===\n');

  console.log('FK TARGETS for comprehension_artifacts:');
  await describe('tenants');
  await describe('import_batches');

  console.log('\nOB-233 dependency tables (read/written by the pipeline):');
  for (const t of ['committed_data', 'summary_artifacts', 'intelligence_artifacts', 'classification_signals', 'rule_sets', 'entities']) {
    await describe(t);
  }

  console.log('\nMUST-NOT-EXIST (created by the architect-applied OB-233 migration):');
  const ca = await supabase.from('comprehension_artifacts').select('*').limit(1);
  if (ca.error) {
    console.log(`  comprehension_artifacts: ABSENT (expected) -> ${ca.error.message}`);
  } else {
    console.log(`  comprehension_artifacts: ALREADY EXISTS (unexpected) -> ${ca.data?.length ?? 0} sample rows`);
    if (ca.data && ca.data.length) console.log(`    cols: ${Object.keys(ca.data[0]).join(', ')}`);
  }
  console.log('\n=== done ===');
}
main().catch(e => { console.error(e); process.exit(1); });
