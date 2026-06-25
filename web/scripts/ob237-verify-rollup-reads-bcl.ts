/**
 * OB-237 T-AGG — OBJECTIVE 3 value-match: prove the WIRED reads (getPeriodTotal / getComponentTotals /
 * getPopulationTrend) return the SAME numbers as the old per-entity .reduce path, and == ground truth.
 *
 * Strategy: a service-role client is passed into each function. getPeriodTotal/getComponentTotals/
 * getPopulationTrend now read the period-rollup sentinel; we (a) value-match getPeriodTotal per period
 * against ground truth, (b) value-match getComponentTotals (sentinel) against an independent per-entity
 * recompute (the OLD path) for the same period, (c) value-match getPopulationTrend totals, (d) capture
 * before/after timing of getPeriodTotal (sentinel vs a forced per-entity reduce over the same data).
 *
 * Run: cd web && set -a && . ./.env.local && set +a && NODE_OPTIONS=--max-old-space-size=4096 npx tsx scripts/ob237-verify-rollup-reads-bcl.ts
 */
import { createClient } from '@supabase/supabase-js';
import { getPeriodTotal, getComponentTotals } from '@/lib/insights/intelligence-data';
import { getPopulationTrend } from '@/lib/insights/trajectory';
import { getEntityResults } from '@/lib/drill-through';
import { ALL_INSIGHTS_SCOPE } from '@/lib/insights/periods';

/* eslint-disable @typescript-eslint/no-explicit-any */

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) as any;
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

const GROUND_TRUTH: Record<string, number> = {
  'October 2025': 44590, 'November 2025': 46291, 'December 2025': 61986,
  'January 2026': 47545, 'February 2026': 53215, 'March 2026': 58406,
};

(async () => {
  const { data: periods } = await sb.from('periods')
    .select('id, label, start_date')
    .in('id', [
      '0f1fabbc-d073-4ccf-bed2-c16d78df3041', 'ee85490b-8ca5-4a64-a343-14399b8d9dc9',
      '194e4712-8d85-4dbe-b1f3-1b5039d25a19', 'ffa685ba-8409-4477-a2f1-6e4c6f94f9d7',
      'cf8e6408-4171-4a93-9600-384286cdbce9', 'b4fa1a65-227a-49b3-be7c-cefc2abf2cc8',
    ]);
  const ordered = (periods ?? []).sort((a: any, b: any) => (a.start_date ?? '').localeCompare(b.start_date ?? ''));

  console.log('=== OBJECTIVE 3a: getPeriodTotal (sentinel) == ground truth ===');
  let grand = 0, allOk = true;
  let sumSentinelMs = 0, sumReduceMs = 0;
  for (const p of ordered as any[]) {
    // sentinel read (wired path)
    const t0 = performance.now();
    const total = await getPeriodTotal(BCL, p.id, sb);
    const sentMs = performance.now() - t0;
    sumSentinelMs += sentMs;
    // forced per-entity reduce (the OLD path) for timing comparison
    const t1 = performance.now();
    const rows = await getEntityResults(BCL, ALL_INSIGHTS_SCOPE, { periodId: p.id }, sb);
    const reduced = rows.reduce((s, r) => s + (r.totalPayout ?? 0), 0);
    const redMs = performance.now() - t1;
    sumReduceMs += redMs;

    const truth = GROUND_TRUTH[p.label];
    const ok = Math.abs(total - truth) < 0.01 && Math.abs(reduced - truth) < 0.01;
    if (!ok) allOk = false;
    grand += total;
    console.log(`  ${p.label}: sentinel=$${total} reduce=$${reduced} truth=$${truth} ${ok ? 'MATCH ✓' : 'MISMATCH ✗'}  [sentinel ${sentMs.toFixed(0)}ms vs reduce ${redMs.toFixed(0)}ms]`);
  }
  const grandOk = Math.abs(grand - 312033) < 0.01;
  console.log(`  GRAND sentinel=$${grand} truth=$312033 ${grandOk ? 'MATCH ✓' : 'MISMATCH ✗'}`);
  console.log(`  TIMING getPeriodTotal x6: sentinel ${sumSentinelMs.toFixed(0)}ms TOTAL vs per-entity reduce ${sumReduceMs.toFixed(0)}ms TOTAL`);

  console.log('\n=== OBJECTIVE 3b: getComponentTotals (sentinel) == per-entity recompute ===');
  let compOk = true;
  for (const p of ordered as any[]) {
    const wired = await getComponentTotals(BCL, p.id, sb); // sentinel path
    // independent per-entity recompute (OLD semantics)
    const rows = await getEntityResults(BCL, ALL_INSIGHTS_SCOPE, { periodId: p.id }, sb);
    const totals = new Map<string, { amount: number; entities: number }>();
    for (const r of rows) {
      for (const [name, amount] of Object.entries(r.componentBreakdown ?? {})) {
        const cur = totals.get(name) ?? { amount: 0, entities: 0 };
        cur.amount += amount as number; cur.entities += 1; totals.set(name, cur);
      }
    }
    let matched = true;
    if (wired.length !== totals.size) matched = false;
    for (const w of wired) {
      const ref = totals.get(w.component_name);
      if (!ref || Math.abs(ref.amount - w.total_amount) > 0.01 || ref.entities !== w.entity_count) matched = false;
    }
    if (!matched) compOk = false;
    const compSum = wired.reduce((s, c) => s + c.total_amount, 0);
    console.log(`  ${p.label}: ${wired.length} components, SUM=$${compSum} ${matched ? 'EXACT-MATCH ✓ (amounts + entity_counts)' : 'MISMATCH ✗'}`);
  }

  console.log('\n=== OBJECTIVE 3c: getPopulationTrend totals == ground truth ===');
  const trend = await getPopulationTrend(BCL, sb);
  let trendOk = true;
  for (const pt of trend) {
    const truth = GROUND_TRUTH[pt.label];
    const ok = truth != null && Math.abs(pt.total - truth) < 0.01;
    if (!ok) trendOk = false;
    console.log(`  ${pt.label}: total=$${pt.total} entity_count=${pt.entity_count} avg=$${pt.avg.toFixed(2)} truth=$${truth} ${ok ? 'MATCH ✓' : 'MISMATCH ✗'}`);
  }

  console.log('\n=== RESULT ===');
  const pass = allOk && grandOk && compOk && trendOk;
  console.log(`3a getPeriodTotal: ${allOk && grandOk ? 'PASS' : 'FAIL'}`);
  console.log(`3b getComponentTotals: ${compOk ? 'PASS' : 'FAIL'}`);
  console.log(`3c getPopulationTrend: ${trendOk ? 'PASS' : 'FAIL'}`);
  console.log(`OBJECTIVE 3: ${pass ? 'PASS ✓ (no HALT-BYTEMATCH)' : 'FAIL ✗ HALT-BYTEMATCH'}`);
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error('ERR', e?.message || e); process.exit(1); });
