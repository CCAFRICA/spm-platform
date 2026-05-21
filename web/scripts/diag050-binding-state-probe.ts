import { createClient } from '@supabase/supabase-js';

const TENANT = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'; // CRP

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Probe A: import_batches metadata for current CRP transactions
  const { data: batches } = await sb
    .from('import_batches')
    .select('id, file_name, file_type, row_count, metadata, created_at')
    .eq('tenant_id', TENANT)
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('=== PROBE A: import_batches (last 10, CRP) ===');
  for (const b of batches || []) {
    console.log(JSON.stringify({
      id: b.id,
      file_name: b.file_name,
      row_count: b.row_count,
      created_at: b.created_at,
      metadata_keys: b.metadata ? Object.keys(b.metadata) : [],
      metadata: b.metadata,
    }, null, 2));
    console.log('---');
  }

  // Probe B: committed_data metadata for one transaction row, full detail
  const { data: cdRows } = await sb
    .from('committed_data')
    .select('id, data_type, source_date, metadata, row_data, created_at')
    .eq('tenant_id', TENANT)
    .eq('data_type', 'transaction')
    .order('created_at', { ascending: false })
    .limit(1);

  console.log('=== PROBE B: committed_data sample (CRP transaction) ===');
  for (const r of cdRows || []) {
    console.log(JSON.stringify({
      id: r.id,
      data_type: r.data_type,
      source_date: r.source_date,
      created_at: r.created_at,
      metadata: r.metadata,
      row_data_keys: r.row_data ? Object.keys(r.row_data) : [],
      row_data: r.row_data,
    }, null, 2));
  }

  // Probe C: rule_sets.input_bindings for CRP
  const { data: ruleSets } = await sb
    .from('rule_sets')
    .select('id, name, input_bindings, updated_at')
    .eq('tenant_id', TENANT)
    .order('updated_at', { ascending: false });

  console.log('=== PROBE C: rule_sets.input_bindings (CRP) ===');
  for (const rs of ruleSets || []) {
    console.log(JSON.stringify({
      id: rs.id,
      name: rs.name,
      updated_at: rs.updated_at,
      input_bindings_keys: rs.input_bindings ? Object.keys(rs.input_bindings) : [],
      input_bindings: rs.input_bindings,
    }, null, 2));
    console.log('---');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
