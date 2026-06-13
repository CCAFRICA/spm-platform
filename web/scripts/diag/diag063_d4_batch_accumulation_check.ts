/**
 * DIAG-063 / D4 — Post-calc display integrity probe (READ-ONLY)
 *
 * Question: do multiple non-superseded calculation_batches accumulate per
 * (tenant, period, rule_set)? If yes, the OperateContext loadBatches list
 * (which does NOT filter superseded_by) contains older batches, and the
 * sessionStorage-pinned selectedBatchId on /operate/results can remain on a
 * stale batch after a recalculation.
 *
 * Output: tenant UUIDs, period/rule_set UUIDs, batch counts, lifecycle
 * states, timestamps ONLY. No names, no payout values.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Total batch count (head:true)
  const { count: totalBatches } = await supabase
    .from('calculation_batches')
    .select('id', { count: 'exact', head: true });
  const { count: supersededCount } = await supabase
    .from('calculation_batches')
    .select('id', { count: 'exact', head: true })
    .not('superseded_by', 'is', null);
  console.log(`calculation_batches total=${totalBatches} superseded_by_set=${supersededCount} non_superseded=${(totalBatches ?? 0) - (supersededCount ?? 0)}`);

  // Pull recent batches and group by (tenant, period, rule_set)
  const { data: batches, error } = await supabase
    .from('calculation_batches')
    .select('id, tenant_id, period_id, rule_set_id, lifecycle_state, superseded_by, created_at')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) { console.error('ERROR:', error.message); process.exit(1); }

  const groups = new Map<string, { total: number; nonSuperseded: number; states: Map<string, number>; latest: string; tenant: string }>();
  for (const b of batches ?? []) {
    const key = `${b.tenant_id}|${b.period_id}|${b.rule_set_id}`;
    if (!groups.has(key)) {
      groups.set(key, { total: 0, nonSuperseded: 0, states: new Map(), latest: b.created_at, tenant: b.tenant_id });
    }
    const g = groups.get(key)!;
    g.total += 1;
    if (!b.superseded_by) g.nonSuperseded += 1;
    g.states.set(b.lifecycle_state, (g.states.get(b.lifecycle_state) ?? 0) + 1);
    if (b.created_at > g.latest) g.latest = b.created_at;
  }

  const multi = Array.from(groups.entries())
    .filter(([, g]) => g.nonSuperseded > 1)
    .sort((a, b) => b[1].nonSuperseded - a[1].nonSuperseded);

  console.log(`\ngroups(tenant|period|rule_set) seen=${groups.size}; groups with >1 NON-superseded batch=${multi.length}`);
  console.log('\nTop 10 groups by non-superseded batch count:');
  for (const [key, g] of multi.slice(0, 10)) {
    const [tenant, period, ruleSet] = key.split('|');
    const states = Array.from(g.states.entries()).map(([s, n]) => `${s}:${n}`).join(',');
    console.log(`  tenant=${tenant} period=${period} rule_set=${ruleSet} total=${g.total} non_superseded=${g.nonSuperseded} states=[${states}] latest=${g.latest}`);
  }
}

main();
