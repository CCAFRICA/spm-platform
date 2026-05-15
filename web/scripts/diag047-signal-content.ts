import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

  const { data: ruleSets } = await supabase
    .from('rule_sets')
    .select('id, name, created_at')
    .eq('tenant_id', tenantId)
    .ilike('name', '%Capital Equipment%')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!ruleSets?.length) { console.log('No Capital Equipment rule_set found'); return; }

  const rsId = ruleSets[0].id;
  console.log(`Rule set: ${ruleSets[0].name} (${rsId}, created: ${ruleSets[0].created_at})`);

  const { data: signals, error } = await supabase
    .from('classification_signals')
    .select('id, signal_type, signal_value, confidence, created_at')
    .eq('rule_set_id', rsId)
    .order('created_at', { ascending: true });

  if (error) { console.error('Error:', error); return; }

  console.log(`\nTotal signals for this rule_set: ${signals?.length ?? 0}`);
  for (const s of signals ?? []) {
    console.log('\n---');
    console.log(`signal_type: ${s.signal_type}`);
    console.log(`confidence: ${s.confidence}`);
    console.log(`signal_value: ${JSON.stringify(s.signal_value, null, 2)}`);
  }

  for (const s of signals ?? []) {
    const sv = JSON.stringify(s.signal_value || {});
    if (sv.includes('filter') || sv.includes('product_category') || sv.includes('Capital Equipment')) {
      console.log(`\n>>> Signal ${s.id} CONTAINS filter/product_category/Capital Equipment reference`);
    }
  }
}

main();
