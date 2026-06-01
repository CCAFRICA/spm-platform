import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const ruleSetId = '6c98f209-6643-4242-96f5-174bdd034fa4';

  const { data, error } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings')
    .eq('id', ruleSetId)
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  const components = data.components as any[];
  console.log('=== RULE SET ===');
  console.log('ID:', data.id);
  console.log('Name:', data.name);
  console.log('Component count:', components.length);
  console.log('');

  for (let i = 0; i < components.length; i++) {
    const c = components[i];
    const name = c.name || c.label || `component_${i}`;
    console.log(`=== Component ${i}: ${name} ===`);
    console.log('calculationIntent:', JSON.stringify(c.calculationIntent, null, 2));
    console.log('modifiers:', JSON.stringify(c.calculationIntent?.modifiers || c.modifiers || [], null, 2));
    console.log('');
  }

  console.log('=== INPUT BINDINGS (convergence_bindings) ===');
  const bindings = (data.input_bindings as any)?.convergence_bindings;
  if (bindings) {
    console.log(JSON.stringify(bindings, null, 2));
  } else {
    console.log('No convergence_bindings found');
  }
}

main();
