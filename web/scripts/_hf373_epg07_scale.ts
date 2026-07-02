// HF-373 EPG-0.7 read-only probe: summary-engine statement-timeout evidence.
// READ-ONLY: selects + head counts only. No insert/update/delete/rpc-with-writes.
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';
const CASA_DIAZ = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';

async function main() {
  // ---- tenants inventory ----
  const { data: tenants, error: tErr } = await sb.from('tenants').select('id, name').order('name');
  if (tErr) throw tErr;
  console.log('=== tenants ===');
  for (const t of tenants ?? []) console.log(`${t.id}  ${t.name}`);

  // ---- committed_data FP-49 introspection ----
  const { data: cdRow, error: cdErr } = await sb.from('committed_data').select('*').limit(1);
  if (cdErr) throw cdErr;
  console.log('\n=== committed_data columns ===');
  if (cdRow && cdRow[0]) {
    console.log(Object.keys(cdRow[0]).join(', '));
    const rd = (cdRow[0] as any).row_data;
    console.log('row_data type:', typeof rd, 'keys:', rd && typeof rd === 'object' ? Object.keys(rd).length : 'n/a');
  } else console.log('(empty table)');

  // ---- committed_data counts: total + per tenant ----
  const { count: total, error: totErr } = await sb.from('committed_data').select('*', { count: 'exact', head: true });
  if (totErr) throw totErr;
  console.log('\n=== committed_data counts ===');
  console.log('TOTAL:', total);
  for (const t of tenants ?? []) {
    const { count, error } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id);
    if (error) { console.log(`${t.name} (${t.id}): ERROR ${error.message}`); continue; }
    if ((count ?? 0) > 0) console.log(`${t.name} (${t.id}): ${count}`);
  }

  // ---- summary_artifacts: introspect + per-tenant counts ----
  console.log('\n=== summary_artifacts ===');
  const { data: saRow, error: saErr } = await sb.from('summary_artifacts').select('*').limit(1);
  if (saErr) console.log('introspect ERROR:', saErr.message);
  else if (saRow && saRow[0]) {
    console.log('columns:', Object.keys(saRow[0]).join(', '));
    console.log('metrics sample:', JSON.stringify((saRow[0] as any).metrics).slice(0, 300));
  } else console.log('(empty table)');
  for (const t of tenants ?? []) {
    const { count, error } = await sb.from('summary_artifacts').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id);
    if (!error && (count ?? 0) > 0) console.log(`${t.name}: ${count}`);
  }

  // ---- summary_rollups: does the OB-257 table exist live? ----
  console.log('\n=== summary_rollups (OB-257) ===');
  const { data: srRow, error: srErr, count: srCount } = await sb.from('summary_rollups').select('*', { count: 'exact' }).limit(1);
  if (srErr) console.log('ERROR (table absent?):', srErr.message);
  else {
    console.log('exists; total rows:', srCount);
    if (srRow && srRow[0]) {
      console.log('columns:', Object.keys(srRow[0]).join(', '));
      console.log('sample row:', JSON.stringify(srRow[0]).slice(0, 500));
    }
    // per data_type counts
    const { data: types } = await sb.from('summary_rollups').select('data_type, tenant_id').limit(2000);
    const byType = new Map<string, number>();
    for (const r of (types ?? []) as any[]) byType.set(`${r.tenant_id}|${r.data_type}`, (byType.get(`${r.tenant_id}|${r.data_type}`) ?? 0) + 1);
    for (const [k, c] of byType) console.log(`  ${k}: ${c}`);
  }

  // ---- comprehension_artifacts: which summary path does each tenant take? ----
  console.log('\n=== comprehension_artifacts (path selector: >0 labeled rows => JS path) ===');
  for (const t of tenants ?? []) {
    const { count } = await sb.from('comprehension_artifacts').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id);
    if ((count ?? 0) > 0) {
      const { count: labeled } = await sb.from('comprehension_artifacts').select('*', { count: 'exact', head: true })
        .eq('tenant_id', t.id).not('display_label', 'is', null);
      console.log(`${t.name}: total=${count} withDisplayLabel=${labeled}`);
    }
  }

  // ---- timed replication of the EXACT summary-engine page read on the biggest tenants ----
  console.log('\n=== timed page reads (exact backfillSummariesJs query shape) ===');
  for (const tid of [VLTEST2, CASA_DIAZ]) {
    const { count } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', tid);
    const n = count ?? 0;
    console.log(`tenant ${tid} rows=${n}`);
    if (n === 0) continue;
    const offsets = [0, 10000, 50000, 100000, 200000, 400000].filter((o) => o < n);
    // include a deep offset near the tail
    if (n > 1000) offsets.push(Math.max(0, n - 1000));
    for (const off of offsets) {
      const t0 = Date.now();
      const { data, error } = await sb
        .from('committed_data')
        .select('entity_id, source_date, data_type, row_data')
        .eq('tenant_id', tid)
        .order('id', { ascending: true })
        .range(off, off + 999);
      const ms = Date.now() - t0;
      if (error) console.log(`  offset=${off}: ERROR after ${ms}ms -> ${error.message}`);
      else console.log(`  offset=${off}: ${data?.length} rows in ${ms}ms`);
    }
  }

  // ---- processing_jobs last-48h evidence run (metadata shape, FP-49) ----
  console.log('\n=== processing_jobs (last 48h) ===');
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: jobs, error: jErr } = await sb.from('processing_jobs')
    .select('id, tenant_id, status, created_at, updated_at, error_detail')
    .gte('created_at', since).order('created_at', { ascending: false }).limit(15);
  if (jErr) console.log('ERROR:', jErr.message);
  else for (const j of (jobs ?? []) as any[]) {
    console.log(`${j.created_at} ${j.tenant_id?.slice(0, 8)} status=${j.status} err=${j.error_detail ? String(j.error_detail).slice(0, 120) : 'null'}`);
  }
}

main().catch((e) => { console.error('PROBE FAILED:', e); process.exit(1); });
