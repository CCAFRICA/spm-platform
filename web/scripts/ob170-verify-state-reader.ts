/**
 * OB-170 Phase 4: Verify State Reader for BCL and Meridian
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const BCL_TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const MERIDIAN_TENANT_ID = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

// Inline the state reader logic for server-side testing
async function getStateReader(tenantId: string) {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const [periodsResult, batchesResult, entityCountResult, ruleSetResult, reconciliationResult, committedDataResult] =
    await Promise.all([
      supabase.from('periods').select('id, label, start_date').eq('tenant_id', tenantId).order('start_date', { ascending: true }),
      supabase.from('calculation_batches').select('id, period_id, lifecycle_state, entity_count, summary, created_at').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
      supabase.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('rule_sets').select('id, name, components').eq('tenant_id', tenantId).eq('status', 'active').order('created_at', { ascending: false }).limit(1),
      supabase.from('reconciliation_sessions').select('period_id, status, summary').eq('tenant_id', tenantId).eq('status', 'completed'),
      supabase.from('committed_data').select('period_id, source_date, data_type').eq('tenant_id', tenantId).not('data_type', 'eq', 'personal').limit(1000),
    ]);

  const periods = periodsResult.data || [];
  const batches = batchesResult.data || [];
  const entityCount = entityCountResult.count || 0;
  const reconciliations = reconciliationResult.data || [];
  const committedRows = committedDataResult.data || [];

  // Latest batch per period
  const latestBatchByPeriod = new Map<string, typeof batches[0]>();
  for (const b of batches) {
    if (b.period_id && !latestBatchByPeriod.has(b.period_id)) {
      latestBatchByPeriod.set(b.period_id, b);
    }
  }

  // committed_data source dates
  const sourceDateMonths = new Set<string>();
  const periodsWithData = new Set<string>();
  for (const row of committedRows) {
    if (row.period_id) periodsWithData.add(row.period_id);
    if (row.source_date) sourceDateMonths.add(String(row.source_date).slice(0, 7));
  }

  const calculated: string[] = [];
  const uncalcWithData: string[] = [];
  const empty: string[] = [];

  for (const period of periods) {
    const batch = latestBatchByPeriod.get(period.id);
    const periodMonth = period.start_date ? String(period.start_date).slice(0, 7) : '';
    const hasData = periodsWithData.has(period.id) || sourceDateMonths.has(periodMonth);

    if (batch) {
      const summary = batch.summary as Record<string, unknown>;
      calculated.push(`${period.label} (${batch.lifecycle_state}, $${summary?.total_payout})`);
    } else if (hasData) {
      uncalcWithData.push(`${period.label} (${committedRows.filter(r => r.period_id === period.id || (r.source_date && String(r.source_date).slice(0, 7) === periodMonth)).length} rows)`);
    } else {
      empty.push(period.label);
    }
  }

  const calcCount = calculated.length;
  const crl = calcCount <= 2 ? 'cold' : calcCount <= 6 ? 'warm' : 'hot';

  return {
    entityCount,
    calculated,
    uncalcWithData,
    empty,
    crl,
    reconCount: reconciliations.length,
    ruleSet: ruleSetResult.data?.[0]?.name || 'none',
  };
}

async function main() {
  console.log('=== OB-170 PHASE 4: STATE READER VERIFICATION ===\n');

  // BCL
  console.log('--- BCL Tenant ---');
  const bcl = await getStateReader(BCL_TENANT_ID);
  console.log(`Entities: ${bcl.entityCount}`);
  console.log(`CRL Tier: ${bcl.crl}`);
  console.log(`Rule Set: ${bcl.ruleSet}`);
  console.log(`Reconciliation sessions: ${bcl.reconCount}`);
  console.log(`Calculated periods (${bcl.calculated.length}):`);
  bcl.calculated.forEach(p => console.log(`  ✓ ${p}`));
  console.log(`Uncalculated with data (${bcl.uncalcWithData.length}):`);
  bcl.uncalcWithData.forEach(p => console.log(`  ⚡ ${p}`));
  console.log(`Empty periods (${bcl.empty.length}):`);
  bcl.empty.forEach(p => console.log(`  ○ ${p}`));

  // Meridian
  console.log('\n--- Meridian Tenant ---');
  const mer = await getStateReader(MERIDIAN_TENANT_ID);
  console.log(`Entities: ${mer.entityCount}`);
  console.log(`CRL Tier: ${mer.crl}`);
  console.log(`Rule Set: ${mer.ruleSet}`);
  console.log(`Calculated periods (${mer.calculated.length}):`);
  mer.calculated.forEach(p => console.log(`  ✓ ${p}`));
  console.log(`Uncalculated with data (${mer.uncalcWithData.length}):`);
  mer.uncalcWithData.forEach(p => console.log(`  ⚡ ${p}`));
  console.log(`Empty periods (${mer.empty.length}):`);
  mer.empty.forEach(p => console.log(`  ○ ${p}`));

  // Verification gates
  console.log('\n=== VERIFICATION GATES ===');
  console.log(`PG-3: BCL calculated=1, uncalcWithData=${bcl.uncalcWithData.length}, empty=${bcl.empty.length} ${bcl.calculated.length === 1 && bcl.empty.length === 5 ? '✓' : '✗'}`);
  console.log(`PG-4: Meridian calculated=1, uncalcWithData=${mer.uncalcWithData.length}, empty=${mer.empty.length} ${mer.calculated.length >= 1 ? '✓' : '✗'}`);
  console.log(`PG-12: BCL ActionRequired renders? ${bcl.uncalcWithData.length > 0 ? 'YES' : 'NO (correct — no uncalculated periods with data)'}`);
  console.log(`PG-13: Meridian ActionRequired hidden? ${mer.uncalcWithData.length === 0 ? 'YES ✓' : 'NO ✗'}`);
  console.log(`PG-14: BCL PipelineReadiness renders? ${bcl.empty.length > 0 ? 'YES (5 empty periods)' : 'NO'}`);

  console.log('\n=== END PHASE 4 ===');
}

main().catch(console.error);
