// DIAG-052 Probe 4: BCL calculation_results history — period grouping + pre/post HF-238 timestamps.

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const BCL_TENANT = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

(async () => {
  console.log('=== PROBE 4 — BCL calculation_results history ===\n');

  // Discover available columns on calculation_results
  const { data: sample } = await sb
    .from('calculation_results')
    .select('*')
    .eq('tenant_id', BCL_TENANT)
    .limit(1);
  console.log('Sample columns:', sample && sample[0] ? Object.keys(sample[0]).join(', ') : '(no rows)');
  console.log();

  // Total count
  const { count: total } = await sb
    .from('calculation_results')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', BCL_TENANT);
  console.log(`Total calculation_results for BCL: ${total}\n`);

  // Group by period_id
  const { data: rows } = await sb
    .from('calculation_results')
    .select('period_id, total_payout, created_at, batch_id, rule_set_id')
    .eq('tenant_id', BCL_TENANT);

  const byPeriod = new Map<string, { count: number; total: number; earliest: string; latest: string; batches: Set<string> }>();
  for (const r of (rows ?? [])) {
    const pid = (r as { period_id: string }).period_id;
    const payout = Number((r as { total_payout: number | null }).total_payout) || 0;
    const ts = (r as { created_at: string }).created_at;
    const batch = (r as { batch_id: string | null }).batch_id || '';
    if (!byPeriod.has(pid)) {
      byPeriod.set(pid, { count: 0, total: 0, earliest: ts, latest: ts, batches: new Set() });
    }
    const b = byPeriod.get(pid)!;
    b.count += 1;
    b.total += payout;
    if (ts < b.earliest) b.earliest = ts;
    if (ts > b.latest) b.latest = ts;
    b.batches.add(batch);
  }

  // Lookup period labels
  const { data: periods } = await sb
    .from('periods')
    .select('id, label, start_date, end_date, canonical_key')
    .eq('tenant_id', BCL_TENANT);
  const periodLabel = new Map((periods ?? []).map(p => [p.id, `${p.label} (${p.canonical_key})`]));

  console.log('--- Per-period totals ---');
  for (const [pid, b] of Array.from(byPeriod.entries())) {
    console.log(`${periodLabel.get(pid) ?? pid}:`);
    console.log(`  rows=${b.count}  total_payout=${b.total.toFixed(2)}  batches=${b.batches.size}`);
    console.log(`  earliest=${b.earliest}  latest=${b.latest}`);
  }

  // Specific October period drill-down (monthly_2025-10-01_2025-10-31)
  console.log('\n--- October 2025 drill-down (canonical_key=monthly_2025-10-01_2025-10-31) ---');
  const octPeriod = (periods ?? []).find(p => p.canonical_key === 'monthly_2025-10-01_2025-10-31');
  if (!octPeriod) {
    console.log('October period NOT FOUND with that canonical_key. All BCL periods:');
    for (const p of (periods ?? [])) console.log(`  ${p.label} | ${p.canonical_key} | id=${p.id}`);
  } else {
    console.log(`October period_id: ${octPeriod.id}`);
    const { data: octRows } = await sb
      .from('calculation_results')
      .select('id, batch_id, total_payout, created_at, entity_id')
      .eq('tenant_id', BCL_TENANT)
      .eq('period_id', octPeriod.id)
      .order('created_at', { ascending: true });
    const octList = octRows ?? [];
    console.log(`October rows: ${octList.length}`);
    if (octList.length > 0) {
      const earliest = octList[0];
      const latest = octList[octList.length - 1];
      console.log(`  earliest row: batch_id=${earliest.batch_id} created_at=${earliest.created_at}`);
      console.log(`  latest row:   batch_id=${latest.batch_id} created_at=${latest.created_at}`);
      // Distinct batches
      const batches = new Map<string, { ts: string; count: number; sum: number }>();
      for (const r of octList) {
        const bid = (r as { batch_id: string | null }).batch_id || '<no-batch>';
        const payout = Number((r as { total_payout: number | null }).total_payout) || 0;
        const ts = (r as { created_at: string }).created_at;
        if (!batches.has(bid)) batches.set(bid, { ts, count: 0, sum: 0 });
        const b = batches.get(bid)!;
        b.count += 1;
        b.sum += payout;
        if (ts > b.ts) b.ts = ts;
      }
      console.log('\n  Per-batch summary:');
      for (const [bid, b] of Array.from(batches.entries())) {
        console.log(`    batch=${bid} ts=${b.ts} rows=${b.count} total=${b.sum.toFixed(2)}`);
      }
    }
  }

  // Pre-HF-238 timestamps: HF-238 merged 2026-05-19 ~21:53 UTC. Any rows before 2026-05-19 are pre-HF-238.
  console.log('\n--- Pre vs post HF-238 split (boundary: 2026-05-19T21:53:00Z) ---');
  const boundary = '2026-05-19T21:53:00Z';
  const preCount = (rows ?? []).filter(r => (r as { created_at: string }).created_at < boundary).length;
  const postCount = (rows ?? []).filter(r => (r as { created_at: string }).created_at >= boundary).length;
  console.log(`Pre-HF-238 rows: ${preCount}`);
  console.log(`Post-HF-238 rows: ${postCount}`);

  // Earliest/latest across all rows
  if ((rows ?? []).length > 0) {
    const sorted = [...(rows ?? [])].sort((a, b) =>
      ((a as { created_at: string }).created_at).localeCompare((b as { created_at: string }).created_at)
    );
    console.log(`Overall earliest: ${(sorted[0] as { created_at: string }).created_at}`);
    console.log(`Overall latest:   ${(sorted[sorted.length - 1] as { created_at: string }).created_at}`);
  }
})();
