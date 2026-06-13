/**
 * DIAG-063 A1A2 — part 2 (READ-ONLY).
 * (a) Multi-file single-batch: group import_batches by metadata.proposalId; list groups with >=3 files
 *     with per-file (per-batch-row) row accounting.
 * (b) Duplicate check on the two 160,443-row batches (same tenant): compare contentUnitId equality.
 * (c) Ingest wall-clock for the largest batch via min/max committed_data.created_at
 *     (import_batches.completed_at observed null).
 * (d) Calculation-at-volume: calculation_batches + calculation_results counts/durations for the
 *     largest batch's tenant. Counts/ids/timestamps only — no payout values selected.
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function redactFileName(n: string | null | undefined): string {
  if (!n) return '(null)';
  const ext = n.includes('.') ? n.slice(n.lastIndexOf('.')) : '';
  return `[fname-redacted len=${n.length}]${ext}`;
}

const TOP_BATCH = 'e95be66e-6546-4fbe-896f-56f3a725f7d5';
const TOP_BATCH_DUP = '11665e5a-b8be-48e5-a5be-8f4235936e90';
const TOP_TENANT = '3d354bfa-b298-48dd-88a0-9f8c5a00be4e';

async function main() {
  // ---- (a) group import_batches by metadata.proposalId ----
  const { data: batches, error } = await sb
    .from('import_batches')
    .select('id, tenant_id, file_name, row_count, status, created_at, metadata')
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) throw error;

  const byProposal: Record<string, any[]> = {};
  for (const b of batches!) {
    const pid = b.metadata?.proposalId ?? '(none)';
    (byProposal[pid] ??= []).push(b);
  }
  const groups = Object.entries(byProposal).sort((a, b) => b[1].length - a[1].length);
  const multi3 = groups.filter(([, v]) => v.length >= 3);
  const multi2 = groups.filter(([, v]) => v.length === 2);
  console.log(
    `proposalId groups: ${groups.length}; groups with >=3 import_batches: ${multi3.length}; with exactly 2: ${multi2.length}`
  );
  for (const [pid, bs] of multi3) {
    const tenants = Array.from(new Set(bs.map((b) => b.tenant_id)));
    console.log(`\nproposalId ${pid} — ${bs.length} files, tenant(s) ${tenants.join(',')}`);
    let total = 0;
    for (const b of bs) {
      const { count } = await sb
        .from('committed_data')
        .select('id', { count: 'exact', head: true })
        .eq('import_batch_id', b.id);
      total += count ?? 0;
      console.log(
        `  batch ${b.id} file=${redactFileName(b.file_name)} declared=${b.row_count} committed=${count} status=${b.status} created=${b.created_at} classification=${b.metadata?.classification}`
      );
    }
    console.log(`  GROUP TOTAL committed rows: ${total}`);
  }

  // ---- (b) duplicate pair comparison (160,443 x2, same tenant) ----
  const pair = batches!.filter((b) => b.id === TOP_BATCH || b.id === TOP_BATCH_DUP);
  if (pair.length === 2) {
    const [x, y] = pair;
    console.log('\n--- duplicate-pair structural comparison (values not printed) ---');
    console.log(`same tenant: ${x.tenant_id === y.tenant_id}`);
    console.log(`same file_name: ${x.file_name === y.file_name}`);
    console.log(`same declared row_count: ${x.row_count === y.row_count} (${x.row_count})`);
    console.log(`same metadata.contentUnitId: ${x.metadata?.contentUnitId === y.metadata?.contentUnitId}`);
    console.log(`same metadata.proposalId: ${x.metadata?.proposalId === y.metadata?.proposalId}`);
    console.log(`created_at gap: ${((new Date(y.created_at).getTime() - new Date(x.created_at).getTime()) / 60000).toFixed(1)} minutes`);
  }

  // ---- (c) ingest wall-clock for largest batch from committed_data.created_at ----
  for (const bid of [TOP_BATCH, TOP_BATCH_DUP]) {
    const { data: first } = await sb
      .from('committed_data')
      .select('created_at')
      .eq('import_batch_id', bid)
      .order('created_at', { ascending: true })
      .limit(1);
    const { data: last } = await sb
      .from('committed_data')
      .select('created_at')
      .eq('import_batch_id', bid)
      .order('created_at', { ascending: false })
      .limit(1);
    const t0 = first?.[0]?.created_at, t1 = last?.[0]?.created_at;
    const dur = t0 && t1 ? ((new Date(t1).getTime() - new Date(t0).getTime()) / 1000).toFixed(1) + 's' : 'n/a';
    console.log(`\nbatch ${bid}: first committed row ${t0}, last ${t1}, write window ${dur}`);
  }

  // ---- (d) period accounting for largest batch ----
  const { data: periods } = await sb
    .from('periods')
    .select('id, canonical_key, period_type, status')
    .eq('tenant_id', TOP_TENANT)
    .order('start_date', { ascending: true });
  console.log(`\nperiods for tenant ${TOP_TENANT}: ${periods?.length ?? 0}`);
  for (const p of periods ?? []) {
    const { count } = await sb
      .from('committed_data')
      .select('id', { count: 'exact', head: true })
      .eq('import_batch_id', TOP_BATCH)
      .eq('period_id', p.id);
    console.log(`  period ${p.id} key=${p.canonical_key} type=${p.period_type} status=${p.status} -> committed rows in top batch: ${count}`);
  }
  const { count: nullPeriod } = await sb
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('import_batch_id', TOP_BATCH)
    .is('period_id', null);
  console.log(`  period_id IS NULL rows in top batch: ${nullPeriod}`);

  // ---- (e) calculation at volume: calculation_batches for the tenant ----
  const { data: calcBatches, error: e5 } = await sb
    .from('calculation_batches')
    .select('id, period_id, rule_set_id, batch_type, lifecycle_state, entity_count, started_at, completed_at, created_at')
    .eq('tenant_id', TOP_TENANT)
    .order('created_at', { ascending: true });
  if (e5) throw e5;
  console.log(`\ncalculation_batches for tenant ${TOP_TENANT}: ${calcBatches!.length}`);
  for (const cb of calcBatches!) {
    const { count: resCount } = await sb
      .from('calculation_results')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', cb.id);
    const dur =
      cb.started_at && cb.completed_at
        ? ((new Date(cb.completed_at).getTime() - new Date(cb.started_at).getTime()) / 1000).toFixed(1) + 's'
        : 'n/a';
    console.log(
      JSON.stringify({
        calc_batch_id: cb.id,
        period_id: cb.period_id,
        rule_set_id: cb.rule_set_id,
        batch_type: cb.batch_type,
        lifecycle_state: cb.lifecycle_state,
        entity_count: cb.entity_count,
        result_rows: resCount,
        started_at: cb.started_at,
        completed_at: cb.completed_at,
        run_duration: dur,
      })
    );
  }
  const { count: totalResults } = await sb
    .from('calculation_results')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TOP_TENANT);
  console.log(`calculation_results total for tenant: ${totalResults}`);
}

main().catch((e) => {
  console.error('PROBE ERROR:', e.message ?? e);
  process.exit(1);
});
