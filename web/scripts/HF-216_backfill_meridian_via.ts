// HF-216 backfill: add via-clause to Meridian convergence_bindings.entity_identifier.
// One-time migration for tenant 5035b1e8-…/rule_set 939cf576-…. Not a generalized
// framework — the convergence agent emitting via for future tenants is deferred
// (HF-217+ candidate).
//
// Run: cd web && npx tsx scripts/HF-216_backfill_meridian_via.ts

import { createClient } from '@supabase/supabase-js';

const TENANT_ID = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
const RULE_SET_ID = '939cf576-4096-4ceb-a142-539a486868b3';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  console.log(`HF-216 backfill: tenant=${TENANT_ID} rule_set=${RULE_SET_ID}`);

  const { data: rs, error } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', RULE_SET_ID)
    .single();
  if (error || !rs) throw new Error(`fetch failed: ${error?.message}`);

  const bindings = rs.input_bindings as Record<string, unknown>;
  const cb = bindings.convergence_bindings as Record<string, Record<string, unknown>>;

  const viaShape = {
    roster_data_type: 'entity',
    roster_field: 'Hub_Asignado',
    entity_field: 'No_Empleado',
  };

  let updatedCount = 0;
  for (const compKey of Object.keys(cb)) {
    const eid = cb[compKey].entity_identifier as Record<string, unknown> | undefined;
    if (eid && eid.column === 'Hub') {
      eid.via = viaShape;
      console.log(`Updated ${compKey}.entity_identifier with via clause`);
      updatedCount++;
    } else {
      console.log(`Skipped ${compKey} (entity_identifier.column != "Hub" or absent)`);
    }
  }
  console.log(`HF-216 backfill: ${updatedCount} components updated`);

  const { error: updErr } = await supabase
    .from('rule_sets')
    .update({ input_bindings: bindings })
    .eq('id', RULE_SET_ID);
  if (updErr) throw new Error(`update failed: ${updErr.message}`);

  // VERIFY: re-read and print via clause for every component.
  console.log('\n=== VERIFY ===');
  const { data: verify } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', RULE_SET_ID)
    .single();
  const verifyCb = (verify?.input_bindings as Record<string, unknown>)?.convergence_bindings as Record<string, Record<string, unknown>>;
  for (const compKey of Object.keys(verifyCb)) {
    const eid = verifyCb[compKey].entity_identifier as Record<string, unknown> | undefined;
    console.log(`VERIFY ${compKey}.entity_identifier.via: ${JSON.stringify(eid?.via)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
