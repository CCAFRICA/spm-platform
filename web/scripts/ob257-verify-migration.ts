// OB-257 post-application verification (FP-49): summary_rollups live shape probe (read-only)
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data, error, count } = await sb.from('summary_rollups').select('*', { count: 'exact' }).limit(1);
  if (error) { console.log('TABLE ABSENT/ERROR:', error.message); process.exit(2); }
  console.log('summary_rollups EXISTS. total rows:', count);
  console.log('columns (from probe row or empty-select):', data && data.length ? Object.keys(data[0]).join(', ') : '(no rows yet - selecting shape via insert-free introspection not possible; empty table)');
}
main().catch(e => { console.error(e); process.exit(1); });
