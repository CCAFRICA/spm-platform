/**
 * OB-146 Phase 2B: Fix store_volume_tier — use suma nivel tienda
 *
 * The LLave suffix was the month number, not the tier.
 * Real tier comes from `suma nivel tienda`:
 *   Tier 1 (small): < 60,000
 *   Tier 2 (medium): 60,000 - 99,999
 *   Tier 3 (large): >= 100,000
 *
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob146-phase2b-fix-tier.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const PAGE_SIZE = 1000;

// Volume tier boundaries
function volumeToTier(sumaNivelTienda: number): number {
  if (sumaNivelTienda < 60000) return 1;
  if (sumaNivelTienda < 100000) return 2;
  return 3;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-146 PHASE 2B: FIX STORE_VOLUME_TIER FROM SUMA NIVEL TIENDA');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get all periods
  const { data: periods } = await supabase
    .from('periods')
    .select('id, canonical_key')
    .eq('tenant_id', tenantId);

  let totalUpdated = 0;
  const tierDistribution = new Map<string, Map<number, number>>(); // period → tier → count

  for (const period of periods ?? []) {
    // Fetch BVI rows
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

    if (bviRows.length === 0) continue;

    if (!tierDistribution.has(period.canonical_key)) {
      tierDistribution.set(period.canonical_key, new Map());
    }
    const dist = tierDistribution.get(period.canonical_key)!;

    let periodUpdated = 0;
    for (const row of bviRows) {
      const rd = row.row_data || {};
      const sumaNivel = rd['suma nivel tienda'] as number | undefined;

      if (sumaNivel === undefined || sumaNivel === null || typeof sumaNivel !== 'number') continue;

      const tier = volumeToTier(sumaNivel);
      dist.set(tier, (dist.get(tier) || 0) + 1);

      // Skip if already correct
      if (rd['store_volume_tier'] === tier) continue;

      const newRowData = { ...rd, store_volume_tier: tier };
      const { error } = await supabase
        .from('committed_data')
        .update({ row_data: newRowData })
        .eq('id', row.id);

      if (error) {
        console.error(`Error updating ${row.id}:`, error.message);
      } else {
        totalUpdated++;
        periodUpdated++;
      }
    }

    console.log(`${period.canonical_key}: ${bviRows.length} BVI rows, ${periodUpdated} updated`);
  }

  console.log(`\nTotal updated: ${totalUpdated}`);
  console.log('\nTier distribution by period:');
  for (const [period, dist] of Array.from(tierDistribution.entries()).sort()) {
    const parts = Array.from(dist.entries()).sort().map(([t, c]) => `Tier${t}=${c}`).join(', ');
    console.log(`  ${period}: ${parts}`);
  }

  // Verify sample
  console.log('\n--- Verification ---');
  const enero = (periods ?? []).find(p => p.canonical_key === '2024-01');
  if (enero) {
    const { data: sample } = await supabase
      .from('committed_data')
      .select('row_data')
      .eq('tenant_id', tenantId)
      .eq('period_id', enero.id)
      .ilike('data_type', '%venta_individual%')
      .not('entity_id', 'is', null)
      .limit(10);

    for (const r of sample ?? []) {
      const rd = r.row_data as Record<string, unknown>;
      console.log(`  suma_nivel=${rd['suma nivel tienda']}, tier=${rd['store_volume_tier']}, cumpl=${rd['Cumplimiento']}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PHASE 2B COMPLETE — store_volume_tier corrected from suma nivel tienda');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
