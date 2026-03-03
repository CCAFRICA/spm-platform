/**
 * OB-146 Phase 3: Fix ratio derivation scale_factor
 *
 * Ratio derivations produce decimals (0.67) but tier bands expect
 * percentages (67). Add scale_factor: 100 to ratio operations.
 *
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob146-phase3-fix-ratios.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-146 PHASE 3: FIX RATIO DERIVATION SCALE FACTORS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const { data: rs } = await supabase
    .from('rule_sets')
    .select('id, input_bindings')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single();

  if (!rs) {
    console.error('No active rule set');
    process.exit(1);
  }

  const bindings = (rs.input_bindings ?? {}) as Record<string, unknown>;
  const derivations = (bindings.metric_derivations ?? []) as Array<Record<string, unknown>>;

  let modified = 0;
  for (const d of derivations) {
    if (d.operation === 'ratio' && !d.scale_factor) {
      console.log(`  Adding scale_factor: 100 to "${d.metric}"`);
      d.scale_factor = 100;
      modified++;
    }
  }

  if (modified === 0) {
    console.log('All ratio derivations already have scale_factor');
  } else {
    const newBindings = { ...bindings, metric_derivations: derivations };
    const { error } = await supabase
      .from('rule_sets')
      .update({ input_bindings: newBindings })
      .eq('id', rs.id);

    if (error) {
      console.error('Error updating rule set:', error.message);
      process.exit(1);
    }
    console.log(`\nUpdated ${modified} ratio derivations with scale_factor: 100`);
  }

  // Verify
  console.log('\n--- Verification ---');
  const { data: verified } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', rs.id)
    .single();

  const vBindings = (verified?.input_bindings ?? {}) as Record<string, unknown>;
  const vDerivations = (vBindings.metric_derivations ?? []) as Array<Record<string, unknown>>;
  for (const d of vDerivations) {
    if (d.operation === 'ratio') {
      console.log(`  ${d.metric}: scale_factor=${d.scale_factor}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PHASE 3 RATIO FIX COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
