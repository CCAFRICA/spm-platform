#!/usr/bin/env npx tsx
/** OB-248 probe 3: full convergence_bindings + components shape. read-only. */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
(async () => {
  const { data: rs } = await supabase.from('rule_sets')
    .select('id, name, components, input_bindings, outcome_config').eq('tenant_id', BCL).limit(1);
  const r = rs![0];
  console.log('=== BCL rule_set:', r.name, '===');
  console.log('\n--- components (full) ---');
  console.log(JSON.stringify(r.components, null, 2)?.slice(0, 2500));
  const ib = r.input_bindings as any;
  console.log('\n--- input_bindings.convergence_version ---', ib.convergence_version);
  const cb = ib.convergence_bindings;
  console.log('\n--- convergence_bindings type:', Array.isArray(cb) ? `array[${cb.length}]` : typeof cb);
  if (Array.isArray(cb)) {
    console.log('first binding keys:', Object.keys(cb[0] ?? {}));
    console.log('first binding:', JSON.stringify(cb[0], null, 2)?.slice(0, 2000));
  } else if (cb && typeof cb === 'object') {
    console.log('convergence_bindings keys:', Object.keys(cb));
    console.log(JSON.stringify(cb, null, 2)?.slice(0, 2500));
  }
})().catch(e => console.log('probe3 threw:', e instanceof Error ? e.message : String(e)));
