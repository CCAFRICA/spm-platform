// scripts/diag-ejecutivo-captacion-inspection.ts
// DIAG-051 — BCL Ejecutivo Captación intent + header comprehension inspection.
// READ-ONLY. No INSERT/UPDATE/DELETE, no exec_sql, no migration. Service-role JS client.
// Rule 23: kept for regression.
//
// NOTE (Rule 21 — actual path): rule_sets.components is NOT a flat array. The live
// HF-252 per-variant structure is:
//   components = { variants: [ { variantId, variantName, components: [ {name, metadata:{construction_method, compositional_intent, intent}} ] } ] }
// The DIAG drafted against the HF-251 flat path (components[i].metadata...). This
// script traverses the actual persisted per-variant structure. The two Captación
// intents live in variant `ejecutivo-senior` (Senior baseline) and variant `ejecutivo`.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const RULE_SET_ID = 'ebfdc935-b86b-4b67-931d-69a873f3c04e';
const TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const SINCE = '2026-05-28T16:50:00Z';
const COMPONENT_NAME = 'Captación de Depósitos';

const j = (o: unknown) => JSON.stringify(o, null, 2);

// Flatten the per-variant structure into (variantId, component) pairs.
function flatten(componentsField: any): Array<{ variantId: string; variantName: string; component: any }> {
  const out: Array<{ variantId: string; variantName: string; component: any }> = [];
  const variants: any[] = componentsField?.variants ?? [];
  for (const v of variants) {
    for (const c of (v?.components ?? [])) {
      out.push({ variantId: v?.variantId, variantName: v?.variantName, component: c });
    }
  }
  return out;
}

async function main() {
  // ===================== R1 + R2 =====================
  const { data: rs, error: rsErr } = await supabase
    .from('rule_sets')
    .select('id, components')
    .eq('id', RULE_SET_ID)
    .single();
  if (rsErr) throw rsErr;

  const variants: any[] = rs!.components?.variants ?? [];
  const flat = flatten(rs!.components);

  console.log('=== R1: component metadata ===');
  console.log('structure: components.variants[] (per-variant, HF-252)');
  console.log('variant_count:', variants.length);
  console.log('total_component_count (across variants):', flat.length, '(expect 8)');
  for (const v of variants) {
    console.log(j({ variantId: v?.variantId, variantName: v?.variantName, component_count: (v?.components ?? []).length }));
  }
  console.log('');
  let allCompositional = true;
  for (const { variantId, component } of flat) {
    const method = component?.metadata?.construction_method;
    if (method !== 'compositional_intent') allCompositional = false;
    console.log(j({
      variantId,
      name: component?.name,
      construction_method: method,
      applies_to: component?.metadata?.compositional_intent?.applies_to ?? null,
    }));
  }
  if (!allCompositional) {
    console.log('\n*** R1 STOP-CHECK FAILED: a construction_method != "compositional_intent" (Risk R5). ***');
  } else {
    console.log('\nR1 STOP-CHECK: all construction_method == "compositional_intent" — OK.');
  }

  console.log('\n=== R2: Captación intents VERBATIM ===');
  let captacionCount = 0;
  for (const { variantId, variantName, component } of flat) {
    if (component?.name === COMPONENT_NAME) {
      captacionCount++;
      console.log(`\n--- variantId: ${variantId} | variantName: ${j(variantName)} | applies_to: ${j(component?.metadata?.compositional_intent?.applies_to ?? null)} ---`);
      console.log(j(component?.metadata?.compositional_intent));
    }
  }
  console.log(`\nR2 captacion_intent_count: ${captacionCount} (expect 2)`);

  // ===================== R3: Datos-sheet header comprehension =====================
  // ACTUAL persisted location (Rule 21, verified round-2): for the entity Datos sheet
  // the per-column comprehension lives in classification_signals.classification_trace
  // .headerComprehension.interpretations — NOT in the dedicated header_comprehension
  // column (null) and NOT in signal_value ({} empty) for the classification:outcome rows.
  // All three candidate surfaces are printed below so the architect can confirm.
  console.log('\n=== R3: Datos-sheet classification:outcome rows (all comprehension surfaces) ===');
  const { data: datosRows, error: datosErr } = await supabase
    .from('classification_signals')
    .select('id, signal_type, source, sheet_name, source_file_name, created_at, header_comprehension, signal_value, classification, classification_trace, vocabulary_bindings, structural_fingerprint')
    .eq('tenant_id', TENANT_ID)
    .gte('created_at', SINCE)
    .eq('sheet_name', 'Datos')
    .eq('signal_type', 'classification:outcome')
    .order('created_at', { ascending: false });
  if (datosErr) throw datosErr;

  if (!datosRows || datosRows.length === 0) {
    console.log('*** R3 STOP: no Datos-sheet classification:outcome rows found in expected surface. ***');
  } else {
    console.log(`R3 Datos rows: ${datosRows.length}`);
    for (const s of datosRows) {
      console.log('\n--- row ' + s.id + ' ---');
      console.log(j({ signal_type: s.signal_type, source: s.source, sheet_name: s.sheet_name, source_file_name: s.source_file_name, classification: s.classification, created_at: s.created_at }));
      console.log('[surface 1] header_comprehension column:', j(s.header_comprehension));
      console.log('[surface 2] signal_value:', j(s.signal_value));
      console.log('[surface 3] classification_trace.headerComprehension:');
      console.log(j((s.classification_trace as any)?.headerComprehension));
      console.log('[aux] vocabulary_bindings:');
      console.log(j(s.vocabulary_bindings));
    }
  }

  console.log('\n=== DIAG-051 reads complete ===');
}

main().catch((e) => { console.error(e); process.exit(1); });
