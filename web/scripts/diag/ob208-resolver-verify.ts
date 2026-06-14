import { createClient } from '@supabase/supabase-js';
import { classifyRuleSetRegimes } from '../../src/lib/results/performance-regime';
import { buildFieldBindingMap, resolveAttainmentPct } from '../../src/lib/results/field-identity';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL='b1c2d3e4-aaaa-bbbb-cccc-111111111111';
async function main(){
  const {data:rs}=await c.from('rule_sets').select('components,input_bindings').eq('tenant_id',BCL).neq('status','draft').limit(1);
  const regimes=classifyRuleSetRegimes(rs?.[0]?.components);
  const map=buildFieldBindingMap(rs?.[0]?.input_bindings);
  const {data:cr}=await c.from('calculation_results').select('metrics').eq('tenant_id',BCL).limit(1);
  const metrics=(cr?.[0]?.metrics as any)??{};
  console.log('=== resolveAttainmentPct (with safe-render guard) on BCL entity ===');
  for(const [name,cls] of regimes){
    if(cls.regime===3&&cls.attainmentFields){
      const pct=resolveAttainmentPct(cls.attainmentFields,map,metrics);
      console.log(`  ${name}: ${pct!=null?pct.toFixed(1)+'% (renders)':'null (safe-suppressed)'}`);
    }
  }
}
main();
