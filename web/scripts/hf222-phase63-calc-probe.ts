// Probe calc-tracking tables.
import { createClient } from '@supabase/supabase-js';
async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const t of ['calculation_results', 'calculation_traces', 'calculations', 'engine_runs', 'entity_period_outcomes', 'committed_data']) {
    const { data, error, count } = await sb.from(t).select('*', { count: 'exact', head: false }).limit(1);
    console.log(`=== ${t} ===`);
    if (error) console.log('error:', error.message);
    else {
      console.log('row count:', count);
      console.log('columns:', data && data[0] ? Object.keys(data[0]) : 'EMPTY');
      if (data && data[0]) console.log('sample (truncated):', JSON.stringify(data[0]).slice(0, 500));
    }
    console.log('');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
