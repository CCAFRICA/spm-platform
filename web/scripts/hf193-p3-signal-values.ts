// HF-193 Phase 3.4-diagnostic Layer 2 — full signal_value JSONB for b9e8b7ff's 5 rows.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const RULE_SET_ID = 'b9e8b7ff-112f-4028-b5a8-35c58970937a';

async function main() {
  const { data, error } = await sb
    .from('classification_signals')
    .select('id, metric_name, component_index, rule_set_id, confidence, signal_type, signal_value')
    .eq('signal_type', 'metric_comprehension')
    .eq('rule_set_id', RULE_SET_ID)
    .order('component_index', { ascending: true });

  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) {
    console.error('No signals found for rule_set_id', RULE_SET_ID);
    process.exit(1);
  }

  for (const row of data) {
    console.log(`── ${row.metric_name} (component_index=${row.component_index})`);
    console.log(`   id:         ${row.id}`);
    console.log(`   confidence: ${row.confidence}`);
    console.log(`   signal_value JSONB:`);
    console.log(JSON.stringify(row.signal_value, null, 2).split('\n').map(l => '     ' + l).join('\n'));
    console.log(`   signal_value top-level keys: ${Object.keys(row.signal_value ?? {}).join(', ')}`);
    console.log('');
  }
}

main().catch(err => {
  console.error('Top-level error:', err);
  process.exit(1);
});
