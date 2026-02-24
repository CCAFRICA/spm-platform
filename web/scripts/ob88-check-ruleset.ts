/**
 * OB-88: Check the actual rule set structure
 */
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const RULE_SET_ID = '180d1ecb-56c3-410d-87ba-892150010505';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data: ruleSet } = await sb.from('rule_sets')
    .select('components').eq('id', RULE_SET_ID).single();
  if (!ruleSet) throw new Error('Rule set not found');

  console.log(JSON.stringify(ruleSet.components, null, 2));
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
