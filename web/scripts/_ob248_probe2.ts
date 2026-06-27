#!/usr/bin/env npx tsx
/** OB-248 probe 2: live metric_derivations + component DAG shapes to extend. read-only. */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const MERIDIAN = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

(async () => {
  for (const [name, tid] of [['MERIDIAN', MERIDIAN], ['BCL', BCL]] as const) {
    const { data: rs } = await supabase.from('rule_sets')
      .select('id, name, status, input_bindings, components').eq('tenant_id', tid).limit(3);
    console.log(`\n===== ${name} rule_sets (${rs?.length ?? 0}) =====`);
    for (const r of rs ?? []) {
      console.log(`\n--- ${r.name} [${r.status}] ${r.id} ---`);
      const ib = r.input_bindings as any;
      console.log('input_bindings keys:', ib ? Object.keys(ib) : '(null)');
      if (ib?.metric_derivations) {
        const md = ib.metric_derivations;
        console.log('metric_derivations type:', Array.isArray(md) ? `array[${md.length}]` : typeof md);
        console.log('metric_derivations SAMPLE:', JSON.stringify(md, null, 2).slice(0, 1800));
      }
      const comps = r.components as any;
      if (Array.isArray(comps) && comps[0]) {
        console.log(`components: array[${comps.length}], first component keys:`, Object.keys(comps[0]));
        console.log('first component SAMPLE:', JSON.stringify(comps[0], null, 2).slice(0, 1600));
      }
    }
  }
  // reference_data DDL via empty-select trick won't give cols; check whether any rows exist cross-tenant
  console.log('\n===== reference_data / reference_items presence =====');
  const { count: rdc } = await supabase.from('reference_data').select('*', { count: 'exact', head: true });
  const { count: ric } = await supabase.from('reference_items').select('*', { count: 'exact', head: true });
  console.log(`reference_data rows=${rdc} reference_items rows=${ric}`);
})().catch(e => console.log('probe2 threw:', e instanceof Error ? e.message : String(e)));
