// HF-222 Phase 6.4 M.2 — Meridian rule_set convergence_bindings inspection.
import { createClient } from '@supabase/supabase-js';

const MERIDIAN = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
const MERIDIAN_RS = '9ac467ba-bab4-4680-9453-5cb3deae02c6';

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await sb.from('rule_sets')
    .select('id, name, input_bindings')
    .eq('tenant_id', MERIDIAN)
    .eq('id', MERIDIAN_RS)
    .single();
  console.log(`=== Meridian rule_set: ${data?.name} (id=${data?.id}) ===`);
  const ib = data?.input_bindings as { convergence_bindings?: unknown } | null;
  console.log('\n=== convergence_bindings (verbatim, formatted) ===');
  console.log(JSON.stringify(ib?.convergence_bindings ?? null, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
