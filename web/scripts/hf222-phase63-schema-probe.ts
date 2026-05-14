// Probe periods + calculation_runs + rule_sets schemas.
import { createClient } from '@supabase/supabase-js';
async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const t of ['periods', 'calculation_runs', 'import_batches']) {
    const { data, error } = await sb.from(t).select('*').limit(1);
    console.log(`=== ${t} ===`);
    if (error) console.log('error:', error.message);
    else console.log('columns:', data && data[0] ? Object.keys(data[0]) : 'EMPTY (no row)');
    if (data && data[0]) console.log('sample:', JSON.stringify(data[0], null, 2));
    console.log('');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
