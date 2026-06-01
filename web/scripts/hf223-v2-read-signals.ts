import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const ruleSetId = '6c98f209-6643-4242-96f5-174bdd034fa4';

  const { data, error } = await supabase
    .from('classification_signals')
    .select('id, signal_type, signal_value, created_at')
    .eq('rule_set_id', ruleSetId)
    .order('created_at', { ascending: true });

  if (error) { console.error('Error:', error); return; }

  console.log(`Total signals: ${data.length}`);
  for (const s of data) {
    const sv = s.signal_value as any;
    const compName = sv?.component_name || sv?.componentName || 'unknown';
    console.log('---');
    console.log(`signal_type: ${s.signal_type}`);
    console.log(`component: ${compName}`);
    if (compName.toLowerCase().includes('fleet') || compName.toLowerCase().includes('utilization')) {
      console.log('>>> FLEET SIGNAL. Full signal_value:');
      console.log(JSON.stringify(sv, null, 2));
    }
  }
}

main();
