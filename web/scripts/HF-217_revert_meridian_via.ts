// HF-217 data revert: remove via-clause from Meridian convergence_bindings.entity_identifier.
// Mirror-image of HF-216 Phase 4 backfill.

import { createClient } from '@supabase/supabase-js';

const TENANT_ID = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
const RULE_SET_ID = '939cf576-4096-4ceb-a142-539a486868b3';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log(`HF-217 revert: tenant=${TENANT_ID} rule_set=${RULE_SET_ID}`);

  const { data: rs, error } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', RULE_SET_ID)
    .single();
  if (error || !rs) throw new Error(`fetch failed: ${error?.message}`);

  const bindings = rs.input_bindings as Record<string, unknown>;
  const cb = bindings.convergence_bindings as Record<string, Record<string, unknown>>;

  let removedCount = 0;
  for (const compKey of Object.keys(cb)) {
    const eid = cb[compKey].entity_identifier as Record<string, unknown> | undefined;
    if (eid && 'via' in eid) {
      delete eid.via;
      removedCount++;
      console.log(`Removed via clause from ${compKey}.entity_identifier`);
    }
  }
  console.log(`HF-217 revert: ${removedCount} via clauses removed`);

  const { error: updErr } = await supabase
    .from('rule_sets')
    .update({ input_bindings: bindings })
    .eq('id', RULE_SET_ID);
  if (updErr) throw new Error(`update failed: ${updErr.message}`);

  // Verify
  console.log('\n=== VERIFY ===');
  const { data: verify } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', RULE_SET_ID)
    .single();
  const verifyCb = (verify?.input_bindings as Record<string, unknown>)?.convergence_bindings as Record<string, Record<string, unknown>>;
  for (const compKey of Object.keys(verifyCb)) {
    const eid = verifyCb[compKey].entity_identifier as Record<string, unknown>;
    const hasVia = eid && 'via' in eid;
    console.log(`VERIFY ${compKey}.entity_identifier.via: ${hasVia ? 'STILL PRESENT (FAIL)' : 'absent (ok)'}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
