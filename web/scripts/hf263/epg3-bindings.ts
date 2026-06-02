// HF-263 EPG-3 — convergence binding key-space verification. Run after a fresh calc.
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const RS = '2fb555d4-53fe-42e8-9662-cae3d07da4f4';
async function main() {
  const { data } = await supabase.from('rule_sets').select('input_bindings').eq('id', RS).single();
  const cb = (data?.input_bindings as Record<string, unknown>)?.convergence_bindings as Record<string, unknown>;
  if (!cb) { console.log('No convergence_bindings — run calc first'); return; }
  for (const key of ['component_4', 'component_9']) {
    const comp = cb[key] as Record<string, unknown>; if (!comp) { console.log(`${key}: not found`); continue; }
    console.log(`\n${key}:`);
    for (const [role, b] of Object.entries(comp)) {
      const bb = b as Record<string, unknown>;
      const fi = bb.field_identity as Record<string, unknown>; const prov = bb.learning_provenance as Record<string, unknown>;
      console.log(`  ${role}: column="${bb.column}" contextual="${fi?.contextualIdentity}" batch="${prov?.batch_id}" conf=${bb.confidence}`);
    }
  }
  const c4 = cb.component_4 as Record<string, unknown>;
  if (c4) {
    const eid = c4.entity_identifier as Record<string, unknown>; const fleet1 = c4.cargas_totales_hub as Record<string, unknown>;
    const eidBatch = (eid?.learning_provenance as Record<string, unknown>)?.batch_id;
    const fleetBatch = (fleet1?.learning_provenance as Record<string, unknown>)?.batch_id;
    const fi = (fleet1?.field_identity as Record<string, unknown>)?.contextualIdentity;
    console.log(`\nKey-space: eid_batch=${eidBatch} fleet_batch=${fleetBatch} match=${eidBatch === fleetBatch}`);
    console.log(`EPG-3 PASS (fleet same-batch as eid, not cross_source): ${fi !== 'cross_source_numeric' && eidBatch === fleetBatch ? 'YES' : 'NO'}`);
  }
}
main().catch(console.error);
