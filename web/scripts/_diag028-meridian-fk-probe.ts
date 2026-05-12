// DIAG-028 D1 — entity_id FK population probe for Meridian committed_data rows
// Read-only. Matches directive SQL semantics via Supabase JS client.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const MERIDIAN_TENANT_ID = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

async function main() {
  // Confirm tenant
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, name, currency')
    .eq('id', MERIDIAN_TENANT_ID)
    .single();
  if (tenantErr) {
    console.log('TENANT_ERROR:', JSON.stringify(tenantErr));
    return;
  }
  console.log(`TENANT: ${tenant.name} (${tenant.id}, ${tenant.currency})`);

  // Sample 50 rows ordered by created_at desc — directive's first SELECT
  console.log('\n=== SAMPLE (LIMIT 50, latest committed_data rows) ===');
  const { data: sample, error: sampleErr } = await supabase
    .from('committed_data')
    .select('id, entity_id, tenant_id, data_type, import_batch_id, created_at')
    .eq('tenant_id', MERIDIAN_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(50);
  if (sampleErr) {
    console.log('SAMPLE_ERROR:', JSON.stringify(sampleErr));
  } else {
    for (const row of sample || []) {
      console.log(`  ${row.id.substring(0, 8)} | entity_id=${row.entity_id ? row.entity_id.substring(0, 8) : 'NULL'} | data_type=${row.data_type} | import_batch_id=${row.import_batch_id?.substring(0, 8) ?? 'NULL'} | ${row.created_at}`);
    }
    console.log(`  (${sample?.length ?? 0} rows shown)`);
  }

  // Joined entities + import_batches for the sample
  if (sample && sample.length > 0) {
    const entityIds = Array.from(new Set(sample.filter(r => r.entity_id).map(r => r.entity_id as string)));
    const batchIds = Array.from(new Set(sample.filter(r => r.import_batch_id).map(r => r.import_batch_id as string)));
    if (entityIds.length > 0) {
      const { data: ents } = await supabase.from('entities').select('id, display_name, external_id').in('id', entityIds).limit(200);
      console.log(`\n=== ENTITIES (joined ${ents?.length ?? 0} of ${entityIds.length}) ===`);
      for (const e of ents || []) console.log(`  ${e.id.substring(0,8)} | ${e.display_name} | external_id=${e.external_id}`);
    } else {
      console.log('\n=== ENTITIES: zero entity_ids in sample (all NULL) ===');
    }
    if (batchIds.length > 0) {
      const { data: batches } = await supabase.from('import_batches').select('id, file_name, metadata').in('id', batchIds).limit(200);
      console.log(`\n=== IMPORT BATCHES (joined ${batches?.length ?? 0} of ${batchIds.length}) ===`);
      for (const b of batches || []) {
        const meta = b.metadata as Record<string, unknown> | null;
        console.log(`  ${b.id.substring(0,8)} | ${b.file_name} | classification=${meta?.classification ?? '∅'} | proposalId=${(meta?.proposalId as string)?.substring(0,8) ?? '∅'}`);
      }
    }
  }

  // Aggregate counts — directive's second SELECT
  console.log('\n=== AGGREGATE COUNTS ===');
  const { count: totalRows, error: cErr } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', MERIDIAN_TENANT_ID);
  if (cErr) { console.log('COUNT_ERROR:', JSON.stringify(cErr)); return; }
  console.log(`  total_rows: ${totalRows}`);

  const { count: rowsWithEntityId } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', MERIDIAN_TENANT_ID)
    .not('entity_id', 'is', null);
  console.log(`  rows_with_entity_id: ${rowsWithEntityId}`);

  const { count: rowsWithoutEntityId } = await supabase
    .from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', MERIDIAN_TENANT_ID)
    .is('entity_id', null);
  console.log(`  rows_without_entity_id: ${rowsWithoutEntityId}`);

  // Per data_type breakdown
  console.log('\n=== PER data_type BREAKDOWN ===');
  const { data: dataTypes } = await supabase
    .from('committed_data')
    .select('data_type')
    .eq('tenant_id', MERIDIAN_TENANT_ID);
  const dtCount = new Map<string, number>();
  for (const r of dataTypes || []) {
    dtCount.set(r.data_type, (dtCount.get(r.data_type) ?? 0) + 1);
  }
  for (const [dt, n] of Array.from(dtCount.entries()).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${dt}: ${n} rows`);
  }

  // Per data_type: entity_id null vs populated
  console.log('\n=== PER data_type: entity_id null vs populated ===');
  for (const dt of Array.from(dtCount.keys())) {
    const { count: withId } = await supabase
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', MERIDIAN_TENANT_ID)
      .eq('data_type', dt)
      .not('entity_id', 'is', null);
    const { count: withoutId } = await supabase
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', MERIDIAN_TENANT_ID)
      .eq('data_type', dt)
      .is('entity_id', null);
    console.log(`  ${dt}: with_entity_id=${withId}, null_entity_id=${withoutId}`);
  }
}

main().catch(e => { console.error('ERROR:', e?.message ?? e); process.exit(1); });
