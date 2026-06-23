// HF-337 P2c proof: recognition · memoization · graceful degradation · dual-write (binding + signal).
// Exercises the REAL recognize() against Sabor (populated POS tenant — MIR is empty, substrate-substitution
// per architect grant). Run: npx tsx --env-file=.env.local scripts/_hf337-p2c-proof.ts
import { createClient } from '@supabase/supabase-js';
import { recognize } from '../src/lib/comprehension/surface-binding-recognition';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
/* eslint-disable @typescript-eslint/no-explicit-any */
const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';

async function main() {
  console.log('=== HF-337 P2c proof (Sabor) ===\n');

  // clean prior proof bindings/signals for a deterministic run
  await sb.from('surface_bindings').delete().eq('tenant_id', SABOR).like('surface_id', 'financial.network_pulse.%');
  await sb.from('classification_signals').delete().eq('tenant_id', SABOR).eq('signal_type', 'surface_binding_recognition');

  const REV = 'financial.network_pulse.revenue';
  const revPurpose = 'the primary monetary amount of money earned or charged as the gross outcome of each transaction or sale';

  // (i) RESOLUTION by recognition (miss -> LLM)
  const r1 = await recognize(sb, SABOR, REV, revPurpose);
  console.log(`(i) recognize(revenue purpose): status=${r1.status} fromCache=${(r1 as any).fromCache}`);
  if (r1.status === 'resolved') console.log(`    resolved -> field=${r1.fields[0].field_name} label="${r1.fields[0].display_label}" conf=${r1.fields[0].confidence}`);

  // (ii) MEMOIZATION: re-encounter reads the persisted binding, NO second LLM call (fromCache=true)
  const r2 = await recognize(sb, SABOR, REV, revPurpose);
  console.log(`(ii) recognize again: status=${r2.status} fromCache=${(r2 as any).fromCache}  (true = read-path hit, no LLM)`);

  // (iii) GRACEFUL DEGRADATION: a purpose no field satisfies -> structured-unresolved (typed, not blank)
  const r3 = await recognize(sb, SABOR, 'financial.network_pulse.__nonexistent__', 'the blood type of the customer who paid the check');
  console.log(`(iii) recognize(no-satisfying-field purpose): status=${r3.status} reason="${(r3 as any).reason ?? ''}"  (consumer renders comprehension-driven salience)`);

  // (iv) DUAL-WRITE gate: the surface_bindings row AND the binding-recognition signal row
  const { data: bindings } = await sb.from('surface_bindings').select('surface_id, structural_fingerprint_hash, resolved_fields, confidence, purpose_text, recognized_by').eq('tenant_id', SABOR).eq('surface_id', REV);
  console.log('\n(iv-a) surface_bindings row:', JSON.stringify(bindings?.[0], null, 1));
  const { data: sigs } = await sb.from('classification_signals').select('signal_type, signal_value, source, context').eq('tenant_id', SABOR).eq('signal_type', 'surface_binding_recognition').limit(1);
  console.log('(iv-b) binding-recognition signal row:', JSON.stringify(sigs?.[0], null, 1));

  // (v) the resolution keys into summary_artifacts.metrics correctly (the repoint reads m[display_label])
  if (r1.status === 'resolved') {
    const key = r1.fields[0].display_label ?? r1.fields[0].field_name;
    const { data: sa } = await sb.from('summary_artifacts').select('metrics').eq('tenant_id', SABOR);
    let tot = 0; for (const row of (sa ?? []) as any[]) tot += Number(row.metrics?.[key] ?? 0);
    console.log(`\n(v) repoint read: summary_artifacts.metrics["${key}"] summed across all rows = ${tot.toLocaleString()} (the network_pulse revenue the route now reads)`);
  }
  console.log('\n=== done ===');
}
main().catch((e) => { console.error(e); process.exit(1); });
