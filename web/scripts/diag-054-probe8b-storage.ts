import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  // List files in ingestion-raw bucket
  const { data: files, error } = await sb.storage.from('ingestion-raw').list('', { limit: 30, sortBy: { column: 'created_at', order: 'desc' } });
  console.log('Storage bucket "ingestion-raw" — recent files:');
  if (error) console.log('error:', error.message);
  for (const f of (files ?? [])) {
    if (f.name?.toLowerCase().includes('bcl') || f.name?.toLowerCase().includes('plan')) {
      console.log(`  ${f.name} (${f.metadata?.size ?? '?'} bytes, ${f.created_at})`);
    }
  }
})();
