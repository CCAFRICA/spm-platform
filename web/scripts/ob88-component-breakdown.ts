/**
 * OB-88: Detailed component breakdown from calculation results
 * Show per-component totals, achievement distributions, and sample entities
 */
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const BATCH_ID = '98b96d6b-9b3a-4508-abda-f92c7ba5d708';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const GROUND_TRUTH: Record<string, number> = {
  'Optical Sales': 505750,
  'Store Sales': 129200,
  'New Customers': 207200,
  'Collections': 214400,
  'Insurance': 46032,
  'Warranty': 151250,
};

// Normalize component names for matching
function normalizeName(name: string): string {
  if (name.includes('Optical')) return 'Optical Sales';
  if (name.includes('Store')) return 'Store Sales';
  if (name.includes('New') || name.includes('Customer')) return 'New Customers';
  if (name.includes('Collect') || name.includes('Cobranza')) return 'Collections';
  if (name.includes('Insurance') || name.includes('Club')) return 'Insurance';
  if (name.includes('Warranty') || name.includes('Service') || name.includes('Garantia')) return 'Warranty';
  return name;
}

async function main() {
  console.log('=== Component Breakdown ===\n');

  // Fetch all calculation results
  const allResults: Array<{ result_data: Record<string, unknown> }> = [];
  let page = 0;
  while (true) {
    const { data } = await sb.from('calculation_results')
      .select('result_data')
      .eq('batch_id', BATCH_ID)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allResults.push(...(data as typeof allResults));
    if (data.length < 1000) break;
    page++;
  }
  console.log(`Total results: ${allResults.length}`);

  // Aggregate by component
  const componentStats = new Map<string, {
    total: number; nonZero: number; count: number;
    payouts: number[]; // all payout values for distribution
    sampleEntities: Array<{ entityId: string; payout: number; metrics: Record<string, unknown> }>;
  }>();

  for (const r of allResults) {
    const rd = r.result_data;
    const entityId = String(rd.entity_external_id || rd.entityId || '');
    const breakdown = rd.component_breakdown as Record<string, { payout: number; metrics?: Record<string, unknown>; debug?: Record<string, unknown> }> | undefined;
    if (!breakdown) continue;

    for (const [compName, compData] of Object.entries(breakdown)) {
      const normalized = normalizeName(compName);
      const entry = componentStats.get(normalized) || {
        total: 0, nonZero: 0, count: 0, payouts: [],
        sampleEntities: [],
      };
      const payout = compData?.payout || 0;
      entry.total += payout;
      entry.payouts.push(payout);
      if (payout > 0) entry.nonZero++;
      entry.count++;
      // Keep up to 5 sample entities with non-zero payouts
      if (payout > 0 && entry.sampleEntities.length < 5) {
        entry.sampleEntities.push({ entityId, payout, metrics: compData.metrics || compData.debug || {} });
      }
      componentStats.set(normalized, entry);
    }
  }

  // Print summary
  let grandTotal = 0;
  for (const [comp, data] of Array.from(componentStats.entries()).sort()) {
    const expected = GROUND_TRUTH[comp] || 0;
    const delta = expected > 0 ? ((data.total - expected) / expected * 100) : 0;
    grandTotal += data.total;

    // Payout distribution
    const payouts = data.payouts.sort((a, b) => a - b);
    const nonZeroPayouts = payouts.filter(p => p > 0);
    const avgPayout = nonZeroPayouts.length > 0 ? nonZeroPayouts.reduce((a, b) => a + b, 0) / nonZeroPayouts.length : 0;
    const medianPayout = nonZeroPayouts.length > 0 ? nonZeroPayouts[Math.floor(nonZeroPayouts.length / 2)] : 0;

    console.log(`\n--- ${comp} ---`);
    console.log(`  Total: MX$${Math.round(data.total).toLocaleString()} | Expected: MX$${expected.toLocaleString()} | Delta: ${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`);
    console.log(`  Non-zero: ${data.nonZero} / ${data.count}`);
    console.log(`  Avg payout (non-zero): MX$${Math.round(avgPayout).toLocaleString()} | Median: MX$${Math.round(medianPayout).toLocaleString()}`);

    // Payout bucket distribution
    const buckets: Record<string, number> = {};
    for (const p of payouts) {
      let bucket: string;
      if (p === 0) bucket = '$0';
      else if (p <= 200) bucket = '$1-200';
      else if (p <= 500) bucket = '$201-500';
      else if (p <= 1000) bucket = '$501-1000';
      else if (p <= 2000) bucket = '$1001-2000';
      else bucket = '$2001+';
      buckets[bucket] = (buckets[bucket] || 0) + 1;
    }
    console.log(`  Distribution: ${Object.entries(buckets).map(([k, v]) => `${k}: ${v}`).join(', ')}`);

    // Sample entities
    if (data.sampleEntities.length > 0) {
      console.log(`  Samples:`);
      for (const s of data.sampleEntities.slice(0, 3)) {
        console.log(`    ${s.entityId}: MX$${s.payout} | metrics: ${JSON.stringify(s.metrics)}`);
      }
    }
  }

  console.log(`\n=== GRAND TOTAL: MX$${Math.round(grandTotal).toLocaleString()} | Expected: MX$1,253,832 ===`);

  // Specifically analyze Optical Sales matrix lookups
  console.log('\n\n=== Optical Sales Deep Dive ===');
  const opticalAchievements: number[] = [];
  const opticalColumns: number[] = [];
  const opticalPayouts: Array<{ entityId: string; row: number; col: number; payout: number }> = [];

  for (const r of allResults) {
    const rd = r.result_data;
    const entityId = String(rd.entity_external_id || rd.entityId || '');
    const breakdown = rd.component_breakdown as Record<string, Record<string, unknown>>;
    if (!breakdown) continue;

    for (const [compName, compData] of Object.entries(breakdown)) {
      if (!compName.includes('Optical')) continue;
      const metrics = compData.metrics as Record<string, number> | undefined;
      const debug = compData.debug as Record<string, unknown> | undefined;
      const payout = (compData.payout as number) || 0;

      // Try to extract row/col values
      const rowVal = metrics?.optical_achievement_percentage ?? metrics?.attainment ?? (debug?.rowValue as number);
      const colVal = metrics?.optical_sales_amount ?? (debug?.columnValue as number);
      if (typeof rowVal === 'number') opticalAchievements.push(rowVal);
      if (typeof colVal === 'number') opticalColumns.push(colVal);
      opticalPayouts.push({ entityId, row: rowVal ?? -1, col: colVal ?? -1, payout });
    }
  }

  if (opticalAchievements.length > 0) {
    const sorted = opticalAchievements.sort((a, b) => a - b);
    console.log(`  Achievement range: ${sorted[0].toFixed(1)} - ${sorted[sorted.length - 1].toFixed(1)}`);
    console.log(`  Median: ${sorted[Math.floor(sorted.length / 2)].toFixed(1)}`);

    const achBuckets = [
      { label: '<80%', min: 0, max: 79.99, count: 0 },
      { label: '80-90%', min: 80, max: 89.99, count: 0 },
      { label: '90-100%', min: 90, max: 99.99, count: 0 },
      { label: '100-150%', min: 100, max: 149.99, count: 0 },
      { label: '150%+', min: 150, max: 99999, count: 0 },
    ];
    for (const v of sorted) {
      for (const b of achBuckets) {
        if (v >= b.min && v <= b.max) { b.count++; break; }
      }
    }
    for (const b of achBuckets) console.log(`    ${b.label}: ${b.count}`);
  }

  if (opticalColumns.length > 0) {
    const sorted = opticalColumns.sort((a, b) => a - b);
    console.log(`  Column range: ${sorted[0]} - ${sorted[sorted.length - 1]}`);
    console.log(`  Median: ${sorted[Math.floor(sorted.length / 2)]}`);
  }

  // Show top 10 highest optical payouts
  opticalPayouts.sort((a, b) => b.payout - a.payout);
  console.log('\n  Top 10 optical payouts:');
  for (const p of opticalPayouts.slice(0, 10)) {
    console.log(`    ${p.entityId}: MX$${p.payout} (ach=${p.row}, storeSales=${p.col})`);
  }

  // Analyze New Customers
  console.log('\n\n=== New Customers Deep Dive ===');
  const ncAchievements: number[] = [];
  for (const r of allResults) {
    const rd = r.result_data;
    const breakdown = rd.component_breakdown as Record<string, Record<string, unknown>>;
    if (!breakdown) continue;
    for (const [compName, compData] of Object.entries(breakdown)) {
      if (!compName.includes('Customer') && !compName.includes('New')) continue;
      const metrics = compData.metrics as Record<string, number> | undefined;
      const payout = (compData.payout as number) || 0;
      const ach = metrics?.new_customers_achievement_percentage ?? metrics?.attainment;
      if (typeof ach === 'number') ncAchievements.push(ach);
    }
  }

  if (ncAchievements.length > 0) {
    const sorted = ncAchievements.sort((a, b) => a - b);
    console.log(`  Achievement range: ${sorted[0].toFixed(1)} - ${sorted[sorted.length - 1].toFixed(1)}`);
    console.log(`  Median: ${sorted[Math.floor(sorted.length / 2)].toFixed(1)}`);
    const achBuckets = [
      { label: '<100%', min: 0, max: 99.99, count: 0 },
      { label: '100-105%', min: 100, max: 104.99, count: 0 },
      { label: '105-110%', min: 100, max: 109.99, count: 0 },
      { label: '110-115%', min: 110, max: 114.99, count: 0 },
      { label: '115-120%', min: 115, max: 119.99, count: 0 },
      { label: '120-125%', min: 120, max: 124.99, count: 0 },
      { label: '125%+', min: 125, max: 99999, count: 0 },
    ];
    for (const v of sorted) {
      for (const b of achBuckets) {
        if (v >= b.min && v <= b.max) { b.count++; break; }
      }
    }
    for (const b of achBuckets) console.log(`    ${b.label}: ${b.count}`);
  } else {
    console.log('  No achievement values found in metrics!');
  }

  // Check raw data for new customers
  console.log('\n  Raw New Customers data sample:');
  const { data: ncSample } = await sb.from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', TENANT_ID).eq('period_id', '30dbb4e9-d2d0-4f81-9b50-a6b9e44ba20c')
    .eq('data_type', 'Base_Clientes_Nuevos')
    .limit(5);
  for (const s of ncSample || []) {
    const rd = s.row_data as Record<string, unknown>;
    const relevantKeys = Object.keys(rd).filter(k =>
      k.includes('achievement') || k.includes('attain') || k.includes('Meta') ||
      k.includes('Actual') || k.includes('quantity') || k.includes('goal') ||
      k.includes('Cumplimiento') || k.includes('clients') || k.includes('customer')
    );
    console.log(`    entity=${s.entity_id?.substring(0, 8)}: ${JSON.stringify(Object.fromEntries(relevantKeys.map(k => [k, rd[k]])))}`);
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
