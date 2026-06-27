import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
type Any = Record<string, unknown>;
(async () => {
  for (const [n, t] of Object.entries({ BCL: 'b1c2d3e4-aaaa-bbbb-cccc-111111111111', Meridian: '5035b1e8-0754-4527-b7ec-9f93f85e4c79' })) {
    const { data } = await sb.from('rule_sets').select('name, input_bindings').eq('tenant_id', t);
    for (const r of data ?? []) {
      const ib = r.input_bindings as Any;
      const hasCB = ib?.convergence_bindings && Object.keys(ib.convergence_bindings as Any).length > 0;
      const ver = ib?.convergence_version;
      console.log(`${n} [${r.name}]: convergence_bindings=${hasCB ? 'POPULATED' : 'empty'} version=${JSON.stringify(ver)} → calc ${hasCB && ver === 'HF-234' ? 'SKIPS convergence (my run/route change never runs → byte-identical)' : 'would re-converge'}`);
    }
  }
})();
