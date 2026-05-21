// DIAG-052 Probe 3: BCL stored calculationIntent format detection + input_bindings.

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const BCL_TENANT = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

(async () => {
  const { data: rs, error } = await sb
    .from('rule_sets')
    .select('id, name, components, input_bindings, status')
    .eq('tenant_id', BCL_TENANT)
    .single();
  if (error) { console.error('BCL rule_set query error', error); process.exit(1); }

  console.log('=== PROBE 3 — BCL calculation trace ===\n');
  console.log(`Rule set: "${rs.name}" [${rs.id}] status=${rs.status}\n`);

  const components = rs.components as Record<string, unknown> | null;
  console.log('--- components top-level shape ---');
  console.log('keys:', components ? Object.keys(components) : null);

  // Flatten to find component definitions (variants → components, or components, or direct array)
  const flat: Array<Record<string, unknown>> = [];
  if (components && Array.isArray(components.variants)) {
    for (const v of components.variants as Array<Record<string, unknown>>) {
      if (Array.isArray(v.components)) {
        for (const c of v.components as Array<Record<string, unknown>>) flat.push(c);
      }
    }
  } else if (components && Array.isArray(components.components)) {
    for (const c of components.components as Array<Record<string, unknown>>) flat.push(c);
  }

  console.log(`\nflattened component count: ${flat.length}\n`);

  for (let i = 0; i < flat.length; i++) {
    const c = flat[i];
    console.log(`──── Component ${i}: "${c.name ?? '(unnamed)'}" ────`);
    const ci = c.calculationIntent as Record<string, unknown> | undefined;
    if (!ci) {
      console.log('  calculationIntent: <absent>');
      continue;
    }
    const isPrimeFormat = typeof ci.prime === 'string';
    const isLegacyFormat = typeof ci.operation === 'string';
    console.log(`  format: ${isPrimeFormat ? 'PRIME-DAG (has `prime` field)' : isLegacyFormat ? 'LEGACY (has `operation` field)' : 'UNKNOWN'}`);
    if (isPrimeFormat) console.log(`  root prime: ${ci.prime}`);
    if (isLegacyFormat) console.log(`  root operation: ${ci.operation}`);
    const pretty = JSON.stringify(ci, null, 2);
    console.log(`  full stored intent (truncated to 500):`);
    console.log(pretty.length > 500 ? pretty.slice(0, 500) + '\n    ... [TRUNCATED]' : pretty);
    console.log();
  }

  console.log('\n--- input_bindings (full, truncated to 4000) ---');
  const ib = rs.input_bindings;
  if (ib === null) console.log('NULL');
  else if (typeof ib === 'object' && Object.keys(ib).length === 0) console.log('{} (empty)');
  else {
    const pretty = JSON.stringify(ib, null, 2);
    console.log(pretty.length > 4000 ? pretty.slice(0, 4000) + '\n... [TRUNCATED]' : pretty);
  }
})();
