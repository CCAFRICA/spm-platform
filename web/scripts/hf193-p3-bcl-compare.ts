// HF-193 Phase 3.2.5 — Read-only BCL rule_set comparison.
// For each BCL rule_set: list metric_derivations + convergence_bindings component metrics.
// Attempt to correlate a $312,033 baseline calculation with a historical rule_set.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const BCL_TENANT = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const NEW_RULE_SET = 'b9e8b7ff-112f-4028-b5a8-35c58970937a';

type MetricDerivation = {
  metric: string;
  operation?: string;
  source_field?: string;
  numerator_metric?: string;
  denominator_metric?: string;
};

async function main() {
  // ── Part 1: metric inventory per BCL rule_set ──
  console.log('========== PART 1 — Per-rule_set metric inventory ==========\n');

  const { data: ruleSets } = await sb
    .from('rule_sets')
    .select('id, name, status, created_at, input_bindings, components')
    .eq('tenant_id', BCL_TENANT)
    .order('created_at', { ascending: false });

  if (!ruleSets) {
    console.error('No rule_sets fetched');
    return;
  }

  for (const rs of ruleSets) {
    const ib = (rs.input_bindings ?? {}) as Record<string, unknown>;
    const md = (ib.metric_derivations ?? []) as MetricDerivation[];
    const cb = (ib.convergence_bindings ?? {}) as Record<string, Record<string, unknown>>;

    // Extract component metric names from components JSONB
    const components = rs.components as Record<string, unknown> | null;
    const variants = (components?.variants ?? []) as Array<Record<string, unknown>>;
    const componentMetrics = new Set<string>();
    for (const v of variants) {
      const comps = (v.components ?? []) as Array<Record<string, unknown>>;
      for (const c of comps) {
        if (typeof c.metric === 'string') componentMetrics.add(c.metric);
        // bounded_lookup_2d uses row/column axis metrics
        const row = c.rowAxis as Record<string, unknown> | undefined;
        if (row && typeof row.metric === 'string') componentMetrics.add(row.metric);
        const col = c.columnAxis as Record<string, unknown> | undefined;
        if (col && typeof col.metric === 'string') componentMetrics.add(col.metric);
        // conditional_gate + ratio use referenced metrics
        if (typeof c.condition === 'object' && c.condition) {
          const cond = c.condition as Record<string, unknown>;
          if (typeof cond.metric === 'string') componentMetrics.add(cond.metric);
        }
      }
    }

    const derivedMetrics = new Set(md.map(d => d.metric));
    const convergenceBindingKeys = Object.keys(cb);

    console.log(`── rule_set ${rs.id}${rs.id === NEW_RULE_SET ? '  ← NEW (HF-193 post-cutover)' : ''}`);
    console.log(`   status:     ${rs.status}`);
    console.log(`   created_at: ${rs.created_at}`);
    console.log(`   input_bindings keys: ${Object.keys(ib).join(', ') || '(empty)'}`);
    console.log(`   components reference metrics (${componentMetrics.size}):`);
    for (const m of componentMetrics) {
      const derived = derivedMetrics.has(m) ? '✓ derived' : '✗ NOT DERIVED';
      console.log(`     - ${m.padEnd(40)} ${derived}`);
    }
    if (md.length > 0) {
      console.log(`   metric_derivations (${md.length}):`);
      for (const d of md) {
        const sig = d.operation === 'ratio'
          ? `ratio(${d.numerator_metric}/${d.denominator_metric})`
          : `${d.operation}(${d.source_field ?? '?'})`;
        console.log(`     - ${d.metric.padEnd(40)} ${sig}`);
      }
    }
    if (convergenceBindingKeys.length > 0) {
      console.log(`   convergence_bindings components: ${convergenceBindingKeys.join(', ')}`);
    }
    console.log('');
  }

  // ── Part 2: correlate historical $312,033 calculation ──
  console.log('========== PART 2 — Historical $312,033 calculation correlation ==========\n');

  // Check which tables exist
  const tablesToProbe = ['calculation_results', 'entity_period_outcomes', 'calculation_runs', 'reconciliation_runs'];
  for (const t of tablesToProbe) {
    const { error } = await sb.from(t).select('*').limit(0);
    console.log(`Table ${t.padEnd(30)} ${error ? `NOT ACCESSIBLE (${error.message})` : 'EXISTS'}`);
  }
  console.log('');

  // Try entity_period_outcomes (known-existing per OB-74 memory)
  const { data: outcomes, error: outcomesErr } = await sb
    .from('entity_period_outcomes')
    .select('rule_set_id, period_id, payout_amount, created_at')
    .eq('tenant_id', BCL_TENANT)
    .not('payout_amount', 'is', null);
  if (outcomesErr) {
    console.log(`entity_period_outcomes lookup failed: ${outcomesErr.message}`);
  } else {
    console.log(`entity_period_outcomes rows for BCL: ${outcomes?.length ?? 0}`);
    // Sum by rule_set_id
    const totalsByRuleSet: Record<string, { total: number; count: number; first: string; last: string }> = {};
    for (const o of outcomes ?? []) {
      const rsId = (o as { rule_set_id: string }).rule_set_id;
      const amt = Number((o as { payout_amount: number | string }).payout_amount);
      const ts = (o as { created_at: string }).created_at;
      if (!Number.isFinite(amt)) continue;
      if (!totalsByRuleSet[rsId]) totalsByRuleSet[rsId] = { total: 0, count: 0, first: ts, last: ts };
      totalsByRuleSet[rsId].total += amt;
      totalsByRuleSet[rsId].count += 1;
      if (ts < totalsByRuleSet[rsId].first) totalsByRuleSet[rsId].first = ts;
      if (ts > totalsByRuleSet[rsId].last) totalsByRuleSet[rsId].last = ts;
    }
    console.log('\nentity_period_outcomes totals by rule_set_id (all periods summed):');
    for (const [rsId, agg] of Object.entries(totalsByRuleSet)) {
      console.log(`  ${rsId}  count=${agg.count}  total=${agg.total.toFixed(2)}  ${agg.first} → ${agg.last}`);
    }
  }
  console.log('');

  // Also try calculation_results
  const { data: calcResults, error: calcErr } = await sb
    .from('calculation_results')
    .select('rule_set_id, period_id, total_payout, created_at')
    .eq('tenant_id', BCL_TENANT);
  if (calcErr) {
    console.log(`calculation_results lookup failed: ${calcErr.message}`);
  } else {
    console.log(`calculation_results rows for BCL: ${calcResults?.length ?? 0}`);
    const totalsByRuleSet: Record<string, { total: number; count: number }> = {};
    for (const r of calcResults ?? []) {
      const rsId = (r as { rule_set_id: string }).rule_set_id;
      const amt = Number((r as { total_payout: number | string }).total_payout);
      if (!Number.isFinite(amt)) continue;
      if (!totalsByRuleSet[rsId]) totalsByRuleSet[rsId] = { total: 0, count: 0 };
      totalsByRuleSet[rsId].total += amt;
      totalsByRuleSet[rsId].count += 1;
    }
    console.log('\ncalculation_results totals by rule_set_id:');
    for (const [rsId, agg] of Object.entries(totalsByRuleSet)) {
      console.log(`  ${rsId}  count=${agg.count}  total=${agg.total.toFixed(2)}`);
    }
  }

  // ── Part 3: compare today's 5 metrics vs prior ──
  console.log('\n========== PART 3 — Today vs prior metric comparison ==========\n');
  const todayMetrics = new Set([
    'credit_placement_attainment',
    'portfolio_quality_ratio',
    'deposit_capture_attainment',
    'cross_products_sold',
    'regulatory_infractions',
  ]);
  console.log('Today (new rule_set b9e8b7ff) metric_derivations:');
  for (const m of todayMetrics) console.log(`  - ${m}`);

  for (const rs of ruleSets) {
    if (rs.id === NEW_RULE_SET) continue;
    const ib = (rs.input_bindings ?? {}) as Record<string, unknown>;
    const md = (ib.metric_derivations ?? []) as MetricDerivation[];
    if (md.length === 0) continue;
    const priorMetrics = new Set(md.map(d => d.metric));
    const overlap = [...todayMetrics].filter(m => priorMetrics.has(m));
    const todayOnly = [...todayMetrics].filter(m => !priorMetrics.has(m));
    const priorOnly = [...priorMetrics].filter(m => !todayMetrics.has(m));
    console.log(`\nvs. prior rule_set ${rs.id} (${rs.status}, ${rs.created_at}):`);
    console.log(`  overlap (${overlap.length}): ${overlap.join(', ') || '(none)'}`);
    console.log(`  today only (${todayOnly.length}): ${todayOnly.join(', ') || '(none)'}`);
    console.log(`  prior only (${priorOnly.length}): ${priorOnly.join(', ') || '(none)'}`);
  }
}

main().catch(err => {
  console.error('Top-level error:', err);
  process.exit(1);
});
