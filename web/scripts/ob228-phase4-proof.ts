/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * OB-228 Phase 4 proof — edit model + consequence seam + REVERSIBLE live commit round-trip.
 * Proves: editable-value extraction; deterministic structural diff; recompute SEAM (HALT-4,
 * no fabricated numbers); and that the commit logic writes rule_sets.components + emits a
 * classification_signals row against LIVE MIR — then RESTORES the original (non-destructive).
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob228-phase4-proof.ts
 */
import { createClient } from '@supabase/supabase-js';
import { getVisiblePlans, personaFromIdentity, extractEditableValues, applyEdits, summarizeEdits, recomputeConsequence } from '../src/lib/plan-surface';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
const TID = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';

async function main() {
  const scope = personaFromIdentity({ id: 'proof', tenantId: TID, role: 'admin', capabilities: ['icm.configure_plans'] }, null);
  const plans = await getVisiblePlans(TID, scope, sb);
  const plan = plans.find((p) => /MAYORISTA/.test(p.name))!;
  const variant = plan.variants[0];
  const comp = variant.components[0]; // Comision por Categoria

  console.log(`=== EDIT MODEL — "${comp.name}" (${plan.name}) ===`);
  const editable = extractEditableValues(comp);
  for (const e of editable) console.log(`  ${e.role.padEnd(10)} ${e.label.padEnd(22)} value=${e.value}  path=${e.path.join('.')}`);

  // pick the first 'rate' to double
  const target = editable.find((e) => e.role === 'rate') ?? editable[0];
  const newVal = +(target.value * 2).toFixed(4);
  const { calculationIntent, compositionalIntent, applied } = applyEdits(comp, [{ path: target.path, value: newVal }]);
  const summary = summarizeEdits(applied);
  console.log(`\n=== STRUCTURAL DIFF (deterministic) ===`);
  for (const l of summary.lines) console.log(`  ${l.label}: ${l.from} -> ${l.to} (${l.pct?.toFixed(0)}%)`);

  console.log(`\n=== RECOMPUTE SEAM (HALT-4) ===`);
  const rc = await recomputeConsequence(plan.id, calculationIntent, null);
  console.log(`  available=${rc.available}`);
  console.log(`  reason="${rc.reason}"`);

  console.log(`\n=== REVERSIBLE LIVE COMMIT ROUND-TRIP ===`);
  const { data: rs } = await sb.from('rule_sets').select('components').eq('id', plan.id).single();
  const original = JSON.parse(JSON.stringify(rs.components));
  try {
    // apply (same logic as /api/plan-surface/commit)
    const components = JSON.parse(JSON.stringify(rs.components));
    const v = (components.variants ?? components.configuration?.variants).find((x: any) => (x.variantId ?? x.id) === variant.variantId);
    const c = v.components.find((x: any) => (x.id ?? x.componentId) === comp.id);
    c.calculationIntent = calculationIntent;
    c.metadata = c.metadata ?? {}; c.metadata.intent = calculationIntent;
    if (compositionalIntent) c.metadata.compositional_intent = compositionalIntent;
    await sb.from('rule_sets').update({ components, updated_at: new Date().toISOString() }).eq('id', plan.id);
    const { data: sigIns } = await sb.from('classification_signals').insert({
      tenant_id: TID, signal_type: 'plan.component.edited',
      signal_value: { ruleSetId: plan.id, variantId: variant.variantId, componentId: comp.id, edits: applied.map((a) => ({ label: a.label, from: a.from, to: a.to })) },
      source: 'plan-surface', scope: 'tenant', context: { ob: 'OB-228', proof: true },
    }).select('id').single();

    // verify
    const { data: after } = await sb.from('rule_sets').select('components').eq('id', plan.id).single();
    const av = (after.components.variants).find((x: any) => x.variantId === variant.variantId);
    const ac = av.components.find((x: any) => x.id === comp.id);
    const persistedVal = JSON.stringify(ac.calculationIntent);
    console.log(`  rule_sets.components updated: edited value ${newVal} present in calculationIntent = ${persistedVal.includes(String(newVal))}`);
    console.log(`  metadata.intent synced = ${JSON.stringify(ac.metadata.intent).includes(String(newVal))}`);
    const { data: sig } = await sb.from('classification_signals').select('id,signal_type,signal_value,scope,source').eq('id', sigIns.id).single();
    console.log(`  classification_signals row: id=${sig.id.slice(0, 8)} type=${sig.signal_type} scope=${sig.scope} source=${sig.source}`);
    console.log(`    signal_value=${JSON.stringify(sig.signal_value)}`);
  } finally {
    // RESTORE original components (non-destructive proof)
    await sb.from('rule_sets').update({ components: original, updated_at: new Date().toISOString() }).eq('id', plan.id);
    const { data: restored } = await sb.from('rule_sets').select('components').eq('id', plan.id).single();
    const rv = restored.components.variants.find((x: any) => x.variantId === variant.variantId);
    const rcc = rv.components.find((x: any) => x.id === comp.id);
    console.log(`  RESTORED: original value ${target.value} back in calculationIntent = ${JSON.stringify(rcc.calculationIntent).includes(String(target.value))}`);
    console.log(`  (proof classification_signals row intentionally retained as flywheel evidence)`);
  }
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
