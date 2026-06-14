import { createClient } from '@supabase/supabase-js';
import { classifyRuleSetRegimes } from '../../src/lib/results/performance-regime';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL='b1c2d3e4-aaaa-bbbb-cccc-111111111111';
async function main(){
  const {data:rs}=await c.from('rule_sets').select('name,components').eq('tenant_id',BCL).neq('status','draft').limit(1);
  const map = classifyRuleSetRegimes(rs?.[0]?.components);
  console.log(`=== SR-38 regime classification trace — ${rs?.[0]?.name} ===`);
  for (const [name, cls] of map) {
    console.log(`  ${name.padEnd(28)} → Regime ${cls.regime}` + (cls.attainmentFields?`  (attainment = ${cls.attainmentFields.actual} ÷ ${cls.attainmentFields.target})`:'  (no target)'));
  }
}
main();
