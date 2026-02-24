/**
 * OB-85 R5: List all calculation batches to find Andrew's MX$525K result
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TENANT = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

async function run() {
  const { data: batches } = await supabase
    .from('calculation_batches')
    .select('id, created_at, lifecycle_state, entity_count, summary')
    .eq('tenant_id', TENANT)
    .order('created_at', { ascending: false })
    .limit(20);

  console.log('=== ALL BATCHES (last 20) ===');
  for (const b of batches ?? []) {
    const summary = b.summary as Record<string, unknown> | null;
    const compBreakdown = summary?.component_breakdown;
    console.log(`${b.id.slice(0,8)} | ${b.created_at} | ${b.lifecycle_state} | ${b.entity_count} entities | total=${summary?.total_payout}`);
    if (compBreakdown && typeof compBreakdown === 'object') {
      const comps = compBreakdown as Record<string, unknown>;
      for (const [name, val] of Object.entries(comps)) {
        console.log(`    ${name}: ${JSON.stringify(val)}`);
      }
    }
  }

  // Also check: is entity_period_outcomes the source for reconciliation?
  // Or does it read from calculation_results directly?
  console.log('\n=== BATCH PERIOD MAPPING ===');
  for (const b of batches ?? []) {
    const { data: results } = await supabase
      .from('calculation_results')
      .select('period_id')
      .eq('batch_id', b.id)
      .limit(1);
    const periodId = results?.[0]?.period_id ?? 'unknown';
    console.log(`Batch ${b.id.slice(0,8)}: period=${String(periodId).slice(0,8)}`);
  }
}

run().catch(console.error);
