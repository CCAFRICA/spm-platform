import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const ruleSetId = '6c98f209-6643-4242-96f5-174bdd034fa4';

  // Read classification signals for this rule_set
  const { data: signals, error } = await supabase
    .from('classification_signals')
    .select('*')
    .eq('rule_set_id', ruleSetId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`=== Classification signals for ${ruleSetId} ===`);
  console.log(`Total signals: ${signals.length}`);
  console.log('');

  // Filter for Fleet Utilization related signals
  const fleetSignals = signals.filter((s: any) => {
    const meta = s.metadata || {};
    const comp = meta.component_name || meta.componentName || '';
    return comp.toLowerCase().includes('fleet') || comp.toLowerCase().includes('utilization');
  });

  console.log(`Fleet Utilization signals: ${fleetSignals.length}`);
  for (const s of fleetSignals) {
    console.log('---');
    console.log('signal_type:', s.signal_type);
    console.log('metadata:', JSON.stringify(s.metadata, null, 2));
  }

  if (fleetSignals.length === 0) {
    console.log('No Fleet-specific signals found. Dumping all signal_types:');
    const types = [...new Set(signals.map((s: any) => s.signal_type))];
    console.log(types);
    console.log('');
    console.log('Dumping all signals with metadata (first 20):');
    for (const s of signals.slice(0, 20)) {
      console.log('---');
      console.log('signal_type:', s.signal_type);
      console.log('metadata:', JSON.stringify(s.metadata, null, 2));
    }
  }
}

main();
