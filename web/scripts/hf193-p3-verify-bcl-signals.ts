// Read-only. No mutations.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error('BLOCKED: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const sb = createClient(url, key);
const RULE_SET_ID = process.argv[2];
if (!RULE_SET_ID) {
  console.error('USAGE: npx tsx web/scripts/hf193-p3-verify-bcl-signals.ts <rule_set_id>');
  process.exit(1);
}

async function main() {
  const { data: ruleSet } = await sb
    .from('rule_sets')
    .select('id, name, input_bindings, created_at')
    .eq('id', RULE_SET_ID)
    .single();
  console.log('rule_set:', JSON.stringify(ruleSet, null, 2));
  console.log('has plan_agent_seeds key:', ruleSet?.input_bindings && 'plan_agent_seeds' in ruleSet.input_bindings);

  const { data: signals } = await sb
    .from('classification_signals')
    .select('id, metric_name, component_index, rule_set_id, confidence')
    .eq('signal_type', 'metric_comprehension')
    .eq('rule_set_id', RULE_SET_ID)
    .order('component_index', { ascending: true });
  console.log('metric_comprehension signal count:', signals?.length ?? 0);
  console.log('signals:', JSON.stringify(signals, null, 2));
}

main().catch(err => {
  console.error('Top-level error:', err);
  process.exit(1);
});
