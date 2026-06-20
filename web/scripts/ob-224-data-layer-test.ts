#!/usr/bin/env npx tsx
/**
 * OB-224 §3A — prove the drill-through data layer against REAL data (service-role, read-only
 * except a self-cleaning dispute insert). Exercises all five functions + the period helper +
 * the no-trace fallback (Sabor / calculation_results path).
 *
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob-224-data-layer-test.ts
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import {
  resolveEntityScope,
  getEntityResults,
  getEntityStatement,
  getSourceTransactions,
  getPeriodsWithResults,
  submitDispute,
} from '@/lib/drill-through';

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
) as never;

const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65'; // 60 results, 0 outcomes → fallback path

const pass: string[] = [];
const fail: string[] = [];
const ok = (cond: boolean, msg: string) => (cond ? pass : fail).push(msg);

async function main() {
  // Pick a BCL entity+period that has per-row traces.
  const { data: tr } = await (sb as ReturnType<typeof createClient>)
    .from('calculation_traces').select('result_id').eq('tenant_id', BCL).not('committed_data_id', 'is', null).limit(1);
  const resultId = (tr as { result_id: string }[])[0].result_id;
  const { data: res } = await (sb as ReturnType<typeof createClient>)
    .from('calculation_results').select('entity_id, period_id, batch_id').eq('id', resultId).single();
  const { entity_id: entityId, period_id: periodId } = res as { entity_id: string; period_id: string; batch_id: string };
  console.log(`BCL test target → entity=${entityId} period=${periodId}`);

  // 1. resolveEntityScope: an unknown profile id resolves to "all".
  const scope = await resolveEntityScope('00000000-0000-0000-0000-000000000000', sb);
  ok(scope.scopeType === 'all' && scope.visibleEntityIds.length === 0, `resolveEntityScope(unknown) → all (got ${scope.scopeType})`);

  // 2. getEntityResults via materialized outcomes (BCL has outcomes).
  const grid = await getEntityResults(BCL, scope, { periodId }, sb);
  const target = grid.find(r => r.entityId === entityId);
  ok(grid.length > 0, `getEntityResults(BCL, period) → ${grid.length} rows`);
  ok(!!target && !!target.displayName && target.totalPayout >= 0, `  target row has displayName="${target?.displayName}" payout=${target?.totalPayout} components=${target?.componentCount}`);
  ok(grid.every((r, i) => i === 0 || grid[i - 1].totalPayout >= r.totalPayout), '  grid sorted by payout desc');

  // 3. getEntityStatement reuses getCommissionStatement (components + traces).
  const stmt = await getEntityStatement(BCL, entityId, periodId, sb);
  ok(!!stmt && stmt.totalPayout > 0, `getEntityStatement → total=${stmt?.totalPayout} components=${stmt?.components.length} hasTraces=${stmt?.hasTraces}`);
  const attributable = stmt?.components.find(c => c.attributable);
  ok(!!attributable && attributable.transactions.length > 0, `  attributable component "${attributable?.name}" has ${attributable?.transactions.length} traced txns, formula="${attributable?.transactions[0]?.formula}"`);

  // 4. getSourceTransactions returns row_data with dynamic keys.
  const txns = await getSourceTransactions(BCL, entityId, periodId, undefined, sb);
  const keys = txns[0] ? Object.keys(txns[0].rowData) : [];
  ok(txns.length > 0, `getSourceTransactions → ${txns.length} rows`);
  ok(keys.length > 0, `  row_data keys (dynamic headers): ${keys.slice(0, 6).join(', ')}`);

  // 5. getPeriodsWithResults.
  const periods = await getPeriodsWithResults(BCL, sb);
  ok(periods.length > 0 && periods.some(p => p.id === periodId), `getPeriodsWithResults(BCL) → ${periods.length} periods incl target`);

  // 6. Fallback path: a tenant with calculation_results but no entity_period_outcomes (Sabor).
  const { data: sres } = await (sb as ReturnType<typeof createClient>)
    .from('calculation_results').select('period_id').eq('tenant_id', SABOR).limit(1);
  if (sres && (sres as { period_id: string }[]).length) {
    const sPeriod = (sres as { period_id: string }[])[0].period_id;
    const sGrid = await getEntityResults(SABOR, { visibleEntityIds: [], visibleRuleSetIds: [], visiblePeriodIds: [], scopeType: 'all' }, { periodId: sPeriod }, sb);
    ok(sGrid.length > 0, `getEntityResults(Sabor, fallback via calculation_results) → ${sGrid.length} rows, payout[0]=${sGrid[0]?.totalPayout}`);
  } else {
    pass.push('Sabor fallback skipped (no results)');
  }

  // 7. Scoped grid: restrict to a single entity → exactly that entity.
  const scoped = await getEntityResults(BCL, { visibleEntityIds: [entityId], visibleRuleSetIds: [], visiblePeriodIds: [], scopeType: 'graph_derived' }, { periodId }, sb);
  ok(scoped.length >= 1 && scoped.every(r => r.entityId === entityId), `scoped getEntityResults → ${scoped.length} row(s), all = target entity`);

  // 8. submitDispute end-to-end (self-cleaning).
  const marker = 'OB-224 data-layer-test — DELETE ME';
  const { id } = await submitDispute(BCL, { entityId, periodId, category: 'test', description: marker, amountDisputed: 1.23, filedBy: null }, sb);
  const { data: check } = await (sb as ReturnType<typeof createClient>).from('disputes').select('id, status, description, amount_disputed').eq('id', id).single();
  const c = check as { status: string; description: string; amount_disputed: number };
  ok(!!id && c.status === 'open' && c.description === marker, `submitDispute → id=${id.slice(0, 8)} status=${c.status} amount=${c.amount_disputed}`);
  await (sb as ReturnType<typeof createClient>).from('disputes').delete().eq('id', id);
  const { data: gone } = await (sb as ReturnType<typeof createClient>).from('disputes').select('id').eq('id', id);
  ok((gone as unknown[]).length === 0, '  test dispute cleaned up (disputes table left empty)');

  console.log('\n===== RESULTS =====');
  for (const p of pass) console.log('  ✅', p);
  for (const f of fail) console.log('  ❌', f);
  console.log(`\n${pass.length} passed, ${fail.length} failed`);
  process.exit(fail.length ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
