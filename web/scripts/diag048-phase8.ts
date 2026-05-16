import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

  console.log('=== Recent classification_signals (50) ===');
  const { data: signals } = await sb
    .from('classification_signals')
    .select('signal_type, signal_value, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50);
  console.log(`Total: ${(signals ?? []).length}`);
  for (const s of signals ?? []) {
    const sv = (s.signal_value ?? {}) as Record<string, unknown>;
    const classification = sv.classification ?? sv.confirmed_classification ?? sv.data_type ?? 'N/A';
    const fileName = sv.file_name ?? sv.fileName ?? sv.source_file_name ?? 'N/A';
    console.log(`  ${s.signal_type} | classification=${classification} | file=${fileName} | ${s.created_at}`);
  }

  console.log('\n=== import_batches (20) ===');
  const { data: batches } = await sb
    .from('import_batches')
    .select('id, source_file_name, status, metadata, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(20);
  console.log(`Total: ${(batches ?? []).length}`);
  for (const b of batches ?? []) {
    const meta = (b.metadata ?? {}) as Record<string, unknown>;
    const cls = meta.classification ?? meta.confirmed_classification ?? meta.data_type ?? 'N/A';
    console.log(`  ${b.source_file_name ?? 'N/A'} | classification(meta)=${cls} | status=${b.status} | id=${b.id}`);
  }
}

main();
