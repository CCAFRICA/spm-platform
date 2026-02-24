/**
 * OB-88: Comprehensive component analysis from calculation_results
 * Correct schema: components[] array, metrics, total_payout, metadata
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

function normalizeName(name: string): string {
  if (name.includes('Optical')) return 'Optical Sales';
  if (name.includes('Store')) return 'Store Sales';
  if (name.includes('New') || name.includes('Customer')) return 'New Customers';
  if (name.includes('Collect') || name.includes('Cobranza')) return 'Collections';
  if (name.includes('Insurance') || name.includes('Club')) return 'Insurance';
  if (name.includes('Service') || name.includes('Garantia')) return 'Warranty';
  return name;
}

interface ComponentResult {
  payout: number;
  componentName?: string;
  details?: Record<string, unknown>;
}

async function main() {
  console.log('=== Component Analysis ===\n');

  // Fetch all results
  const allResults: Array<{
    total_payout: number;
    components: ComponentResult[];
    metrics: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }> = [];

  let page = 0;
  while (true) {
    const { data } = await sb.from('calculation_results')
      .select('total_payout, components, metrics, metadata')
      .eq('batch_id', BATCH_ID)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allResults.push(...(data as typeof allResults));
    if (data.length < 1000) break;
    page++;
  }
  console.log(`Total results: ${allResults.length}`);

  // Check structure of first result
  const first = allResults[0];
  console.log(`\nFirst result components (${first.components?.length} items):`);
  for (const c of first.components || []) {
    console.log(`  ${c.componentName}: payout=${c.payout}`);
    if (c.details) {
      console.log(`    details: ${JSON.stringify(c.details).substring(0, 150)}`);
    }
  }

  // Aggregate by component name
  const compStats = new Map<string, {
    total: number; nonZero: number; count: number;
    payouts: number[];
    sampleDetails: Array<{ payout: number; details: Record<string, unknown> }>;
  }>();

  for (const r of allResults) {
    for (const c of r.components || []) {
      const name = normalizeName(c.componentName || `Component ${(r.components || []).indexOf(c)}`);
      const entry = compStats.get(name) || { total: 0, nonZero: 0, count: 0, payouts: [], sampleDetails: [] };
      const payout = c.payout || 0;
      entry.total += payout;
      entry.payouts.push(payout);
      if (payout > 0) entry.nonZero++;
      entry.count++;
      if (payout > 0 && entry.sampleDetails.length < 3) {
        entry.sampleDetails.push({ payout, details: c.details || {} });
      }
      compStats.set(name, entry);
    }
  }

  // Print summary
  let grandTotal = 0;
  for (const [comp, data] of Array.from(compStats.entries()).sort()) {
    const expected = GROUND_TRUTH[comp] || 0;
    const delta = expected > 0 ? ((data.total - expected) / expected * 100) : 0;
    grandTotal += data.total;

    const nonZeroPayouts = data.payouts.filter(p => p > 0).sort((a, b) => a - b);
    const avgPayout = nonZeroPayouts.length > 0 ? nonZeroPayouts.reduce((a, b) => a + b, 0) / nonZeroPayouts.length : 0;

    console.log(`\n--- ${comp} ---`);
    console.log(`  Total: MX$${Math.round(data.total).toLocaleString()} | Expected: MX$${expected.toLocaleString()} | Delta: ${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`);
    console.log(`  Non-zero: ${data.nonZero} / ${data.count} | Avg non-zero: MX$${Math.round(avgPayout)}`);

    // Payout distribution
    const buckets = new Map<string, number>();
    for (const p of data.payouts) {
      let bucket: string;
      if (p === 0) bucket = '$0';
      else if (p <= 200) bucket = '$1-200';
      else if (p <= 500) bucket = '$201-500';
      else if (p <= 1000) bucket = '$501-1000';
      else if (p <= 2000) bucket = '$1001-2000';
      else bucket = '$2001+';
      buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
    }
    console.log(`  Distribution: ${Array.from(buckets.entries()).map(([k, v]) => `${k}:${v}`).join(', ')}`);

    // Sample details
    for (const s of data.sampleDetails) {
      console.log(`    Sample: $${s.payout} | ${JSON.stringify(s.details).substring(0, 200)}`);
    }
  }

  console.log(`\n\n=== GRAND TOTAL: MX$${Math.round(grandTotal).toLocaleString()} | Expected: MX$1,253,832 ===`);
  console.log(`Delta: ${((grandTotal - 1253832) / 1253832 * 100).toFixed(1)}%`);

  // Deep dive: Optical Sales achievement distribution
  console.log('\n\n=== OPTICAL SALES DEEP DIVE ===');
  const opticalRows: Array<{ rowValue: number; colValue: number; payout: number; rowBand: string; colBand: string }> = [];
  for (const r of allResults) {
    for (const c of r.components || []) {
      if (!c.componentName?.includes('Optical')) continue;
      const d = c.details as Record<string, unknown>;
      opticalRows.push({
        rowValue: d?.rowValue as number ?? 0,
        colValue: d?.colValue as number ?? 0,
        payout: c.payout,
        rowBand: (d?.rowBand as string) || '',
        colBand: (d?.colBand as string) || '',
      });
    }
  }

  // Row (achievement) distribution
  const achBuckets = [
    { label: '<80%', min: 0, max: 79.99, count: 0, totalPayout: 0 },
    { label: '80-90%', min: 80, max: 89.99, count: 0, totalPayout: 0 },
    { label: '90-100%', min: 90, max: 99.99, count: 0, totalPayout: 0 },
    { label: '100-150%', min: 100, max: 149.99, count: 0, totalPayout: 0 },
    { label: '150%+', min: 150, max: 99999, count: 0, totalPayout: 0 },
  ];
  for (const o of opticalRows) {
    for (const b of achBuckets) {
      if (o.rowValue >= b.min && o.rowValue <= b.max) {
        b.count++;
        b.totalPayout += o.payout;
        break;
      }
    }
  }
  console.log('  Achievement distribution:');
  for (const b of achBuckets) {
    console.log(`    ${b.label}: ${b.count} entities, MX$${Math.round(b.totalPayout).toLocaleString()}`);
  }

  // Column (store sales) distribution
  const colBuckets = [
    { label: '<$60k', min: 0, max: 59999, count: 0, totalPayout: 0 },
    { label: '$60k-$100k', min: 60000, max: 99999, count: 0, totalPayout: 0 },
    { label: '$100k-$120k', min: 100000, max: 119999, count: 0, totalPayout: 0 },
    { label: '$120k-$180k', min: 120000, max: 179999, count: 0, totalPayout: 0 },
    { label: '$180k+', min: 180000, max: 999999999, count: 0, totalPayout: 0 },
  ];
  for (const o of opticalRows) {
    for (const b of colBuckets) {
      if (o.colValue >= b.min && o.colValue <= b.max) {
        b.count++;
        b.totalPayout += o.payout;
        break;
      }
    }
  }
  console.log('  Store sales column distribution:');
  for (const b of colBuckets) {
    console.log(`    ${b.label}: ${b.count} entities, MX$${Math.round(b.totalPayout).toLocaleString()}`);
  }

  // === NEW CUSTOMERS DEEP DIVE ===
  console.log('\n\n=== NEW CUSTOMERS DEEP DIVE ===');
  const ncRows: Array<{ metricValue: number; payout: number; details: Record<string, unknown> }> = [];
  for (const r of allResults) {
    for (const c of r.components || []) {
      const name = c.componentName || '';
      if (!name.includes('Customer') && !name.includes('New')) continue;
      const d = c.details as Record<string, unknown>;
      ncRows.push({
        metricValue: (d?.metricValue as number) ?? (d?.tierValue as number) ?? 0,
        payout: c.payout,
        details: d || {},
      });
    }
  }
  if (ncRows.length === 0) {
    console.log('  No New Customers component data found!');
    // Try alternate approach: check component names
    console.log('  Checking all component names...');
    const allNames = new Set<string>();
    for (const r of allResults) {
      for (const c of r.components || []) allNames.add(c.componentName || 'unnamed');
    }
    console.log('  All component names:', Array.from(allNames));
  } else {
    const ncAchievements = ncRows.map(r => r.metricValue).sort((a, b) => a - b);
    console.log(`  Achievement range: ${ncAchievements[0]?.toFixed(1)} - ${ncAchievements[ncAchievements.length - 1]?.toFixed(1)}`);
    console.log(`  Non-zero payouts: ${ncRows.filter(r => r.payout > 0).length} / ${ncRows.length}`);

    // Show details of first few non-zero
    const nonZero = ncRows.filter(r => r.payout > 0).slice(0, 5);
    for (const nz of nonZero) {
      console.log(`    payout=$${nz.payout}, value=${nz.metricValue}, details: ${JSON.stringify(nz.details).substring(0, 200)}`);
    }
  }

  // === COLLECTIONS DEEP DIVE ===
  console.log('\n\n=== COLLECTIONS DEEP DIVE ===');
  const collRows: Array<{ metricValue: number; payout: number }> = [];
  for (const r of allResults) {
    for (const c of r.components || []) {
      const name = c.componentName || '';
      if (!name.includes('Collect') && !name.includes('Cobranza')) continue;
      const d = c.details as Record<string, unknown>;
      collRows.push({
        metricValue: (d?.metricValue as number) ?? (d?.tierValue as number) ?? 0,
        payout: c.payout,
      });
    }
  }
  if (collRows.length > 0) {
    const achBins = [
      { label: '<100%', count: 0, totalPayout: 0 },
      { label: '100-105%', count: 0, totalPayout: 0 },
      { label: '105-110%', count: 0, totalPayout: 0 },
      { label: '110-115%', count: 0, totalPayout: 0 },
      { label: '115-120%', count: 0, totalPayout: 0 },
      { label: '120-125%', count: 0, totalPayout: 0 },
      { label: '125%+', count: 0, totalPayout: 0 },
    ];
    for (const row of collRows) {
      const v = row.metricValue;
      if (v < 100) achBins[0].count++, achBins[0].totalPayout += row.payout;
      else if (v < 105) achBins[1].count++, achBins[1].totalPayout += row.payout;
      else if (v < 110) achBins[2].count++, achBins[2].totalPayout += row.payout;
      else if (v < 115) achBins[3].count++, achBins[3].totalPayout += row.payout;
      else if (v < 120) achBins[4].count++, achBins[4].totalPayout += row.payout;
      else if (v < 125) achBins[5].count++, achBins[5].totalPayout += row.payout;
      else achBins[6].count++, achBins[6].totalPayout += row.payout;
    }
    console.log('  Achievement distribution:');
    for (const b of achBins) {
      console.log(`    ${b.label}: ${b.count} entities, MX$${Math.round(b.totalPayout).toLocaleString()}`);
    }
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
