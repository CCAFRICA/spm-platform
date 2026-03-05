import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  // Check import_batch_ids on committed_data
  const { data: batches } = await sb.from('committed_data')
    .select('import_batch_id')
    .eq('tenant_id', T)
    .not('import_batch_id', 'is', null)
    .limit(10);

  const batchIds = Array.from(new Set((batches || []).map(r => r.import_batch_id).filter(Boolean)));
  console.log('Import batch IDs:', batchIds);

  if (batchIds.length > 0) {
    const { data: importBatches } = await sb.from('import_batches')
      .select('id, metadata')
      .in('id', batchIds);

    for (const b of importBatches || []) {
      const meta = b.metadata as Record<string, unknown> | null;
      const aiCtx = meta?.ai_context as { sheets?: unknown[] } | undefined;
      console.log(`\nBatch ${b.id}:`);
      console.log('  has ai_context:', !!aiCtx);
      if (aiCtx?.sheets) {
        console.log('  sheets:', JSON.stringify(aiCtx.sheets, null, 2));
      }
      // Show what keys metadata has
      console.log('  metadata keys:', Object.keys(meta || {}));
    }
  }

  // Also check: how many rows have import_batch_id?
  const { count: withBatch } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .not('import_batch_id', 'is', null);

  const { count: withoutBatch } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .is('import_batch_id', null);

  console.log(`\ncommitted_data with import_batch_id: ${withBatch}`);
  console.log(`committed_data without import_batch_id: ${withoutBatch}`);
}

run();
