/**
 * HF-071 Phase 0: Diagnostic — current state of Caribe periods
 */

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CARIBE = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';
const OPTICA = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
const PIPELINE = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';

async function run() {
  // 0A: Count all periods for Caribe
  const { count: totalPeriods } = await sb
    .from('periods')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', CARIBE);
  console.log('=== 0A: Total Caribe periods ===');
  console.log('Count:', totalPeriods);

  // 0B: List all periods with dates
  const { data: allPeriods } = await sb
    .from('periods')
    .select('id, label, start_date, end_date, canonical_key, created_at')
    .eq('tenant_id', CARIBE)
    .order('start_date', { ascending: true });
  console.log('\n=== 0B: All Caribe periods ===');
  if (allPeriods) {
    for (const p of allPeriods) {
      console.log(`  ${p.canonical_key} | ${p.label} | ${p.start_date} → ${p.end_date} | created: ${p.created_at}`);
    }
  }

  // 0C: Pre-2024 periods (erroneous)
  const pre2024 = allPeriods?.filter(p => p.start_date < '2024-01-01') || [];
  console.log('\n=== 0C: Pre-2024 periods (erroneous) ===');
  console.log('Count:', pre2024.length);
  for (const p of pre2024) {
    console.log(`  ${p.canonical_key} | ${p.label} | ${p.start_date} → ${p.end_date}`);
  }

  // 0D: 2024+ periods (legitimate)
  const post2024 = allPeriods?.filter(p => p.start_date >= '2024-01-01') || [];
  console.log('\n=== 0D: 2024+ periods (legitimate) ===');
  console.log('Count:', post2024.length);
  for (const p of post2024) {
    console.log(`  ${p.canonical_key} | ${p.label} | ${p.start_date} → ${p.end_date}`);
  }

  // 0E: Check references for pre-2024 periods
  console.log('\n=== 0E: References for pre-2024 periods ===');
  if (pre2024.length === 0) {
    console.log('No pre-2024 periods exist — nothing to check.');
  } else {
    for (const p of pre2024) {
      const { count: calcRefs } = await sb
        .from('calculation_batches')
        .select('id', { count: 'exact', head: true })
        .eq('period_id', p.id);
      const { count: dataRefs } = await sb
        .from('committed_data')
        .select('id', { count: 'exact', head: true })
        .eq('period_key', p.canonical_key)
        .eq('tenant_id', CARIBE);
      console.log(`  ${p.canonical_key}: calc_refs=${calcRefs}, data_refs=${dataRefs}`);
    }
  }

  // Cross-tenant verification
  console.log('\n=== Cross-tenant period counts ===');
  const { data: tenantCounts } = await sb
    .from('periods')
    .select('tenant_id')
    .order('tenant_id');
  const countMap = new Map<string, number>();
  if (tenantCounts) {
    for (const t of tenantCounts) {
      countMap.set(t.tenant_id, (countMap.get(t.tenant_id) || 0) + 1);
    }
  }
  for (const [tid, count] of countMap) {
    const label = tid === CARIBE ? 'Caribe' : tid === OPTICA ? 'Optica' : tid === PIPELINE ? 'Pipeline' : tid.substring(0, 8);
    console.log(`  ${label}: ${count} periods`);
  }

  // Optica periods
  const { data: opticaPeriods } = await sb
    .from('periods')
    .select('id, label, start_date')
    .eq('tenant_id', OPTICA)
    .order('start_date');
  console.log('\n=== Optica periods ===');
  if (opticaPeriods) {
    for (const p of opticaPeriods) {
      console.log(`  ${p.label} | ${p.start_date}`);
    }
  }

  // Pipeline periods
  const { data: pipelinePeriods } = await sb
    .from('periods')
    .select('id, label, start_date')
    .eq('tenant_id', PIPELINE)
    .order('start_date');
  console.log('\n=== Pipeline Proof Co periods ===');
  if (pipelinePeriods) {
    for (const p of pipelinePeriods) {
      console.log(`  ${p.label} | ${p.start_date}`);
    }
  }
}

run().catch(console.error);
