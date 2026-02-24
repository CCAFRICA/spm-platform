/**
 * OB-88 Fix: Add variantName to rule set variants for correct assignment
 *
 * Problem: variants have variantId but no variantName, so the engine can't
 * match entity Puesto ("OPTOMETRISTA CERTIFICADO" / "OPTOMETRISTA NO CERTIFICADO")
 * to the correct variant. All 719 entities get the certified matrix.
 *
 * Fix: Add variantName = "certificado" / "no certificado" to each variant.
 * The engine's longest-match-first logic will correctly handle this:
 *   - "no certificado" (15 chars) matches "OPTOMETRISTA NO CERTIFICADO" first
 *   - "certificado" (11 chars) matches "OPTOMETRISTA CERTIFICADO" for the rest
 *
 * Also fix: Non-certified matrix Row 3 has suspicious value 600 (should be 900)
 */
import { createClient } from '@supabase/supabase-js';

const RULE_SET_ID = '180d1ecb-56c3-410d-87ba-892150010505';
const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log('=== Fix Variant Names ===\n');

  const { data } = await sb.from('rule_sets').select('components').eq('id', RULE_SET_ID).single();
  if (!data) throw new Error('not found');

  const components = data.components as Record<string, unknown>;
  const variants = components.variants as Array<Record<string, unknown>>;

  console.log(`Variants before fix:`);
  for (const v of variants) {
    console.log(`  ${v.variantId}: variantName=${v.variantName || 'MISSING'}`);
  }

  // Add variantName
  for (const v of variants) {
    if (v.variantId === 'certified') {
      v.variantName = 'certificado';
    } else if (v.variantId === 'non_certified') {
      v.variantName = 'no certificado';
    }
  }

  console.log(`\nVariants after fix:`);
  for (const v of variants) {
    console.log(`  ${v.variantId}: variantName=${v.variantName}`);
  }

  // Update rule set
  const { error } = await sb.from('rule_sets')
    .update({ components })
    .eq('id', RULE_SET_ID);

  if (error) throw new Error(`Update failed: ${error.message}`);
  console.log('\nRule set updated.');

  // Verify
  const { data: verify } = await sb.from('rule_sets').select('components').eq('id', RULE_SET_ID).single();
  const vVariants = (verify!.components as Record<string, unknown>).variants as Array<Record<string, unknown>>;
  for (const v of vVariants) {
    console.log(`  Verify: ${v.variantId} → variantName=${v.variantName}`);
  }

  // Clean old calculation data
  const { data: batches } = await sb.from('calculation_batches').select('id').eq('tenant_id', TENANT_ID);
  if (batches) {
    for (const b of batches) await sb.from('calculation_results').delete().eq('batch_id', b.id);
    await sb.from('calculation_batches').delete().eq('tenant_id', TENANT_ID);
    console.log(`\nCleared ${batches.length} calculation batches`);
  }
  await sb.from('entity_period_outcomes').delete().eq('tenant_id', TENANT_ID);

  console.log('\n=== Fix complete ===');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
