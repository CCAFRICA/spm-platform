import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const MIR = '972c8eb0'; // prefix only — resolve below

async function headCount(table: string): Promise<string> {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
  if (error) return `MISSING/ERROR: ${error.message}`;
  return `EXISTS (count=${count})`;
}

(async () => {
  console.log('============================================================');
  console.log('OB-226 SUBSTRATE RECON');
  console.log('============================================================\n');

  // ---- 1. Real table names ----
  console.log('### 1. TABLE NAME CONFIRMATION ###');
  for (const t of ['plans', 'rule_sets', 'calculation_runs', 'calculation_batches', 'calculation_results', 'calculation_traces', 'entities', 'periods', 'committed_data', 'entity_relationships', 'profile_scope']) {
    console.log(`  ${t.padEnd(24)} -> ${await headCount(t)}`);
  }

  // ---- 2. periods columns + lifecycle ----
  console.log('\n### 2. PERIODS TABLE SHAPE ###');
  const { data: pSample } = await sb.from('periods').select('*').limit(1);
  if (pSample && pSample[0]) {
    console.log('  columns:', Object.keys(pSample[0]).join(', '));
    console.log('  has lifecycle_status?', 'lifecycle_status' in pSample[0]);
    console.log('  has lifecycle_state? ', 'lifecycle_state' in pSample[0]);
    console.log('  sample row:', JSON.stringify(pSample[0], null, 2));
  } else {
    console.log('  no periods rows');
  }

  // BCL periods + any lifecycle-ish column values
  const { data: bclPeriods } = await sb.from('periods').select('*').eq('tenant_id', BCL).order('start_date', { ascending: true });
  console.log(`\n  BCL periods (n=${bclPeriods?.length ?? 0}):`);
  const lifecycleCols = bclPeriods && bclPeriods[0]
    ? Object.keys(bclPeriods[0]).filter(k => /lifecycle|status|state/i.test(k))
    : [];
  console.log('  lifecycle-ish columns on periods:', lifecycleCols.join(', ') || '(none)');
  for (const p of bclPeriods ?? []) {
    const vals = lifecycleCols.map(c => `${c}=${(p as any)[c]}`).join(' ');
    console.log(`    ${p.id}  name=${(p as any).name ?? (p as any).label ?? '?'}  ${vals}`);
  }

  // calculation_batches lifecycle (where lifecycle actually lives per memory)
  const { data: cbSample } = await sb.from('calculation_batches').select('*').limit(1);
  if (cbSample && cbSample[0]) {
    console.log('\n  calculation_batches columns:', Object.keys(cbSample[0]).join(', '));
    console.log('  batches has lifecycle_state?', 'lifecycle_state' in cbSample[0]);
  }
  const { data: bclBatches } = await sb.from('calculation_batches')
    .select('id, period_id, lifecycle_state, status, created_at')
    .eq('tenant_id', BCL).order('created_at', { ascending: false }).limit(20);
  console.log(`  BCL batches lifecycle_state values (n=${bclBatches?.length ?? 0}):`);
  for (const b of bclBatches ?? []) {
    console.log(`    period=${b.period_id} lifecycle_state=${(b as any).lifecycle_state} status=${(b as any).status}`);
  }

  // ---- 3. /insights/compensation joinability ----
  console.log('\n### 3. COMPENSATION DATA (BCL) ###');
  const { data: crSample } = await sb.from('calculation_results').select('*').eq('tenant_id', BCL).limit(1);
  if (crSample && crSample[0]) {
    console.log('  calculation_results columns:', Object.keys(crSample[0]).join(', '));
  }
  // Determine FK columns present
  const crCols = crSample && crSample[0] ? Object.keys(crSample[0]) : [];
  const hasRuleSetId = crCols.includes('rule_set_id');
  const hasTotalPayout = crCols.includes('total_payout');
  console.log('  rule_set_id present?', hasRuleSetId, '| total_payout present?', hasTotalPayout);

  // rule_sets / entities join check — sample for one period
  const { data: onePeriodCR } = await sb.from('calculation_results')
    .select('entity_id, rule_set_id, period_id, total_payout')
    .eq('tenant_id', BCL).limit(5);
  console.log(`  sample raw calculation_results rows (n=${onePeriodCR?.length ?? 0}):`);
  for (const r of onePeriodCR ?? []) {
    const { data: ent } = await sb.from('entities').select('display_name, name').eq('id', (r as any).entity_id).maybeSingle();
    const { data: rs } = await sb.from('rule_sets').select('name').eq('id', (r as any).rule_set_id).maybeSingle();
    console.log(`    entity="${ent?.display_name ?? ent?.name ?? '?'}" plan="${rs?.name ?? '?'}" total_payout=${(r as any).total_payout} period=${(r as any).period_id}`);
  }

  // entities columns
  const { data: entSample } = await sb.from('entities').select('*').eq('tenant_id', BCL).limit(1);
  if (entSample && entSample[0]) {
    console.log('  entities has display_name?', 'display_name' in entSample[0], '| name?', 'name' in entSample[0]);
  }
  // rule_sets names for BCL
  const { data: bclRuleSets } = await sb.from('rule_sets').select('id, name').eq('tenant_id', BCL);
  console.log(`  BCL rule_sets (n=${bclRuleSets?.length ?? 0}):`, (bclRuleSets ?? []).map(r => r.name).join(' | '));

  // ---- 4. Manager scope ----
  console.log('\n### 4. MANAGER SCOPE (entity_relationships + profile_scope) ###');
  for (const t of ['entity_relationships', 'profile_scope']) {
    const exists = await headCount(t);
    console.log(`  ${t}: ${exists}`);
    if (exists.startsWith('EXISTS')) {
      for (const [label, tid] of [['BCL', BCL], ['MIR', MIR]] as const) {
        let q = sb.from(t).select('*', { count: 'exact', head: true });
        // try tenant_id filter; some scope tables key off tenant
        const { count, error } = await q.eq('tenant_id', tid);
        if (error) {
          // no tenant_id col — get global count
          const { count: gc } = await sb.from(t).select('*', { count: 'exact', head: true });
          console.log(`    ${label}: (no tenant_id col) global count=${gc}`);
          break;
        } else {
          console.log(`    ${label} (${tid}): count=${count}`);
        }
      }
    }
  }

  // ---- 5. BCL anchor: sum(total_payout) per period ----
  console.log('\n### 5. BCL ANCHOR — sum(total_payout) per period ###');
  const { data: allCR } = await sb.from('calculation_results')
    .select('period_id, total_payout')
    .eq('tenant_id', BCL);
  const byPeriod: Record<string, number> = {};
  for (const r of allCR ?? []) {
    const pid = (r as any).period_id;
    byPeriod[pid] = (byPeriod[pid] ?? 0) + Number((r as any).total_payout ?? 0);
  }
  const periodName: Record<string, string> = {};
  for (const p of bclPeriods ?? []) periodName[p.id] = (p as any).name ?? (p as any).label ?? p.id;
  for (const [pid, sum] of Object.entries(byPeriod).sort((a, b) => b[1] - a[1])) {
    const near58k = Math.abs(sum - 58406) < 500 ? '  <== ~$58,406 ANCHOR' : '';
    console.log(`  period ${periodName[pid] ?? pid}: sum(total_payout)=${sum.toFixed(2)}${near58k}`);
  }
  console.log(`  total BCL calculation_results rows: ${allCR?.length ?? 0}`);

  console.log('\n============================================================');
  console.log('DONE');
})();
