// OB-141 Phase 4: Clean stale periods with no committed_data or calculation_results
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob141-phase4-clean-periods.ts

import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function cleanPeriods() {
  const { data: periods } = await supabase
    .from('periods')
    .select('id, canonical_key, label, start_date, end_date, status, created_at')
    .eq('tenant_id', TENANT_ID)
    .order('start_date', { ascending: true });

  console.log('=== ALL PERIODS ===');
  console.table(periods);

  const periodsToDelete: typeof periods = [];
  const periodsToKeep: typeof periods = [];

  for (const period of periods || []) {
    const { count: cdCount } = await supabase
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', period.id);

    const { count: calcCount } = await supabase
      .from('calculation_results')
      .select('*', { count: 'exact', head: true })
      .eq('period_id', period.id);

    const hasData = (cdCount || 0) > 0;
    const hasCalc = (calcCount || 0) > 0;
    const action = hasData || hasCalc ? 'KEEP' : 'DELETE';
    console.log(`  ${period.label} (${period.canonical_key}): ${cdCount} cd rows, ${calcCount} calc results -> ${action}`);

    if (!hasData && !hasCalc) {
      periodsToDelete!.push(period);
    } else {
      periodsToKeep!.push(period);
    }
  }

  console.log(`\nPeriods to KEEP: ${periodsToKeep!.length}`);
  console.log(`Periods to DELETE: ${periodsToDelete!.length}`);

  for (const period of periodsToDelete || []) {
    // Delete calculation_batches referencing this period first
    await supabase
      .from('calculation_batches')
      .delete()
      .eq('period_id', period.id)
      .eq('tenant_id', TENANT_ID);

    const { error } = await supabase
      .from('periods')
      .delete()
      .eq('id', period.id);

    if (error) {
      console.log(`  Could not delete ${period.label}: ${error.message} — SKIP`);
    } else {
      console.log(`  Deleted: ${period.label} (${period.canonical_key})`);
    }
  }

  // Final state
  const { data: remaining } = await supabase
    .from('periods')
    .select('id, canonical_key, label, start_date, end_date')
    .eq('tenant_id', TENANT_ID)
    .order('start_date', { ascending: true });
  console.log('\n=== REMAINING PERIODS ===');
  console.table(remaining);
}

cleanPeriods().catch(console.error);
