// DIAG-063 access check: read-only connectivity probe (counts only, no row content)
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { count, error } = await sb.from('import_batches').select('id', { count: 'exact', head: true });
  if (error) { console.error('ACCESS ERROR:', error.message); process.exit(1); }
  console.log('import_batches reachable; row count:', count);
})();
