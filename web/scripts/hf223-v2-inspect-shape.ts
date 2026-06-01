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

  if (error) { console.error('Error:', error); return; }

  const comp = data.components;
  console.log('=== components typeof:', typeof comp);
  console.log('=== components isArray:', Array.isArray(comp));

  if (typeof comp === 'object' && comp !== null) {
    const keys = Object.keys(comp);
    console.log('=== components top-level keys:', keys);
    for (const key of keys) {
      const val = (comp as any)[key];
      console.log(`--- key "${key}": typeof=${typeof val}, isArray=${Array.isArray(val)}`);
      if (Array.isArray(val)) {
        console.log(`    length: ${val.length}`);
        for (let i = 0; i < val.length; i++) {
          const item = val[i];
          const name = item.name || item.label || `item_${i}`;
          const topKeys = Object.keys(item);
          console.log(`    [${i}] ${name}: keys=[${topKeys.join(', ')}]`);
          if (name.toLowerCase().includes('fleet') || name.toLowerCase().includes('utilization') || i === 4) {
            console.log('    >>> FLEET/C5 CANDIDATE. Full JSON:');
            console.log(JSON.stringify(item, null, 2));
          }
        }
      } else if (typeof val === 'object' && val !== null) {
        console.log('    object keys:', Object.keys(val));
        const valStr = JSON.stringify(val);
        if (valStr.toLowerCase().includes('fleet') || valStr.toLowerCase().includes('utilization')) {
          console.log('    >>> Contains fleet/utilization reference:');
          console.log(JSON.stringify(val, null, 2));
        }
      }
    }
  }
}

main();
