#!/usr/bin/env npx tsx
/**
 * OB-248 read-only probe: tenant landscape + key-table existence/shape.
 * Usage: cd web && npx tsx scripts/_ob248_probe.ts
 */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function sampleCols(table: string, tenantCol = 'tenant_id') {
  const { data, error } = await supabase.from(table).select('*').limit(1);
  if (error) return `  ${table}: ERROR ${error.message}`;
  const cols = data && data[0] ? Object.keys(data[0]).join(', ') : '(no rows)';
  // count
  const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
  return `  ${table}: count=${count ?? '?'}  cols=[${cols}]`;
}

(async () => {
  console.log('=== TENANTS ===');
  const { data: tenants, error: tErr } = await supabase.from('tenants').select('id, name, slug').order('name');
  if (tErr) console.log('tenants ERROR:', tErr.message);
  else for (const t of tenants ?? []) console.log(`  ${t.id}  ${t.name ?? ''} / ${t.slug ?? ''}`);

  console.log('\n=== KEY TABLES (existence + columns + count) ===');
  for (const tbl of ['entity_relationships', 'reference_data', 'reference_items', 'entity_period_outcomes',
                     'input_bindings', 'calculation_results', 'calculation_traces', 'committed_data',
                     'classification_signals', 'rule_sets', 'entities', 'comprehension_artifacts']) {
    console.log(await sampleCols(tbl));
  }

  console.log('\n=== entity_relationships sample (any tenant) ===');
  const { data: er } = await supabase.from('entity_relationships').select('*').limit(3);
  console.log(JSON.stringify(er, null, 2)?.slice(0, 1500));

  console.log('\n=== reference_data sample ===');
  const { data: rd } = await supabase.from('reference_data').select('*').limit(2);
  console.log(JSON.stringify(rd, null, 2)?.slice(0, 1200));
})().catch(e => console.log('probe threw:', e instanceof Error ? e.message : String(e)));
