/**
 * OB-146 Phase 4C: Check calculation results
 *
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob146-phase4-check.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const PAGE_SIZE = 1000;

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-146 PHASE 4C: CALCULATION RESULTS CHECK');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Paginated fetch of all results
  const allResults: Array<{ total_payout: number; components: unknown }> = [];
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from('calculation_results')
      .select('total_payout, components')
      .eq('tenant_id', tenantId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) { console.error('Query error:', error.message); break; }
    if (!data || data.length === 0) break;
    allResults.push(...(data as typeof allResults));
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  const resultCount = allResults.length;
  const totalPayout = allResults.reduce((s, r) => s + (r.total_payout || 0), 0);
  const nonZero = allResults.filter(r => r.total_payout > 0).length;

  console.log(`Results: ${resultCount}`);
  console.log(`Total payout: MX$${totalPayout.toLocaleString()}`);
  console.log(`Non-zero: ${nonZero}`);
  console.log(`Average: MX$${(totalPayout / resultCount).toFixed(2)}`);

  // Per-component totals
  const componentTotals = new Map<string, { count: number; total: number; nonZero: number }>();
  for (const row of allResults) {
    const cr = (row.components ?? []) as Array<Record<string, unknown>>;
    for (const comp of cr) {
      const name = String(comp.componentName ?? comp.componentId ?? 'unknown');
      const payout = Number(comp.payout ?? 0);
      if (!componentTotals.has(name)) componentTotals.set(name, { count: 0, total: 0, nonZero: 0 });
      const entry = componentTotals.get(name)!;
      entry.count++;
      entry.total += payout;
      if (payout > 0) entry.nonZero++;
    }
  }

  console.log('\n--- Per-component totals ---');
  for (const [name, { count, total, nonZero: nz }] of Array.from(componentTotals.entries()).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${name}: MX$${total.toLocaleString()} (${nz}/${count} entities non-zero)`);
  }

  // Check specific entities
  console.log('\n--- Entity traces ---');
  const testEntities = ['93515855', '96568046', '90319253'];
  for (const extId of testEntities) {
    const { data: ent } = await supabase
      .from('entities')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('external_id', extId)
      .single();

    if (!ent) { console.log(`  ${extId}: NOT FOUND`); continue; }

    const { data: cr } = await supabase
      .from('calculation_results')
      .select('total_payout, components')
      .eq('tenant_id', tenantId)
      .eq('entity_id', ent.id)
      .single();

    if (!cr) { console.log(`  ${extId}: NO RESULTS`); continue; }

    console.log(`  ${extId}: MX$${cr.total_payout}`);
    const comps = (cr.components ?? []) as Array<Record<string, unknown>>;
    for (const c of comps) {
      console.log(`    ${c.componentName}: MX$${c.payout}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`PG-04: Total payout = MX$${totalPayout.toLocaleString()}`);
  console.log(`       ${nonZero} / ${resultCount} entities with non-zero payout`);
  console.log(`       ${componentTotals.size} components`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
