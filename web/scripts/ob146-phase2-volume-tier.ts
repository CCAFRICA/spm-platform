/**
 * OB-146 Phase 2: store_volume_tier derivation
 *
 * 1. Parse LLave Tamaño de Tienda ("storeNum-tier" → tier number)
 *    and add store_volume_tier as numeric field to BVI row_data
 * 2. Add store_volume_tier derivation rule to the rule set
 *
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob146-phase2-volume-tier.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const PAGE_SIZE = 1000;

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-146 PHASE 2: STORE_VOLUME_TIER DERIVATION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get all periods
  const { data: periods } = await supabase
    .from('periods')
    .select('id, canonical_key')
    .eq('tenant_id', tenantId);

  // ═══════════════════════════════════════════════════════════════
  // Step 1: Add store_volume_tier to BVI row_data across ALL periods
  // ═══════════════════════════════════════════════════════════════
  console.log('Step 1: Adding store_volume_tier to BVI committed_data rows...\n');

  let totalUpdated = 0;
  const tierDistribution = new Map<number, number>();

  for (const period of periods ?? []) {
    // Fetch BVI rows for this period
    let page = 0;
    const bviRows: Array<{ id: string; row_data: Record<string, unknown> }> = [];
    while (true) {
      const from = page * PAGE_SIZE;
      const { data } = await supabase
        .from('committed_data')
        .select('id, row_data')
        .eq('tenant_id', tenantId)
        .eq('period_id', period.id)
        .ilike('data_type', '%venta_individual%')
        .not('entity_id', 'is', null)
        .range(from, from + PAGE_SIZE - 1);

      if (!data || data.length === 0) break;
      bviRows.push(...(data as typeof bviRows));
      if (data.length < PAGE_SIZE) break;
      page++;
    }

    console.log(`  ${period.canonical_key}: ${bviRows.length} BVI rows`);

    for (const row of bviRows) {
      const rd = (row.row_data ?? {}) as Record<string, unknown>;
      const llave = rd['LLave Tamaño de Tienda'] as string | undefined;

      if (!llave) continue;

      // Parse "storeNum-tier" → tier number
      const parts = String(llave).split('-');
      const tier = parts.length >= 2 ? Number(parts[parts.length - 1]) : 1;

      if (isNaN(tier) || tier < 1) continue;

      // Skip if already has the field with correct value
      if (rd['store_volume_tier'] === tier) continue;

      tierDistribution.set(tier, (tierDistribution.get(tier) || 0) + 1);

      const newRowData = { ...rd, store_volume_tier: tier };
      const { error } = await supabase
        .from('committed_data')
        .update({ row_data: newRowData })
        .eq('id', row.id);

      if (error) {
        console.error(`    Error updating row ${row.id}:`, error.message);
      } else {
        totalUpdated++;
      }
    }
  }

  console.log(`\nTotal BVI rows updated with store_volume_tier: ${totalUpdated}`);
  console.log('Tier distribution:');
  for (const [tier, count] of Array.from(tierDistribution.entries()).sort()) {
    console.log(`  Tier ${tier}: ${count} rows`);
  }

  // ═══════════════════════════════════════════════════════════════
  // Step 2: Add store_volume_tier derivation rule to rule set
  // ═══════════════════════════════════════════════════════════════
  console.log('\n--- Step 2: Adding derivation rule ---\n');

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

  // Check if rule already exists
  const hasRule = derivations.some(d => d.metric === 'store_volume_tier');
  if (hasRule) {
    console.log('store_volume_tier derivation rule already exists');
  } else {
    // Add the rule
    derivations.push({
      metric: 'store_volume_tier',
      operation: 'sum',
      source_pattern: '.*venta_individual.*',
      source_field: 'store_volume_tier',
      filters: [],
    });

    const newBindings = { ...bindings, metric_derivations: derivations };
    const { error: updateErr } = await supabase
      .from('rule_sets')
      .update({ input_bindings: newBindings })
      .eq('id', rs.id);

    if (updateErr) {
      console.error('Error updating rule set:', updateErr.message);
      process.exit(1);
    }
    console.log('Added store_volume_tier derivation rule');
    console.log(`Rule: sum of store_volume_tier from .*venta_individual.*`);
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
  console.log(`\nTotal derivation rules: ${vDerivations.length}`);
  for (const d of vDerivations) {
    console.log(`  ${d.metric}: ${d.operation} from ${d.source_field || `${d.numerator_metric}/${d.denominator_metric}`}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PHASE 2 COMPLETE');
  console.log(`PG-02: ${totalUpdated > 0 ? 'PASS' : 'FAIL'} — store_volume_tier derivation rule + data enrichment`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
