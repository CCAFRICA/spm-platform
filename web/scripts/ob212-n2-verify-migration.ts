// OB-212 N2 — verify the applied migration 20260616000000_ob212_agent_invocations.sql
// (architect applied via Supabase SQL Editor, SR-44 / HALT-MIG). Evidence, not trust (AP-8).
//
// PostgREST does not expose pg_catalog/information_schema, and the project's exec_sql
// RPC `returns void` (callers only read .error). So we prove what is provable through the
// service-role + anon surface, and report honestly what is not:
//   1. Table EXISTS + full structural column inventory + column DEFAULTS  (insert→read→delete
//      roundtrip with the service-role client; transient self-cleaning probe row).
//   2. RLS POLICY LIVE — anon (NEXT_PUBLIC_SUPABASE_ANON_KEY, no session, auth.uid()=null) must
//      NOT see the probe row while the service-role client does: the tenant_isolation policy
//      filtering the anon read is direct evidence RLS is enabled and the backstop policy is active.
//   3. INDEXES — functional proxy: queries on BOTH indexed key-shapes
//      (tenant_id,agent_name,created_at desc) and (request_fingerprint) execute and return the row.
//      (Best-effort exec_sql probe of pg_indexes/pg_policies is attempted; reported if it returns rows.)
//
// Writes ONLY agent_invocations (a sentinel probe row, deleted in finally). Never a calc table.
// Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob212-n2-verify-migration.ts
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const sb = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

const TABLE = 'agent_invocations';
const SENTINEL = '__ob212_n2_verify_probe__';                 // recognizable; also used to sweep stragglers
const PROBE_TENANT = '00000000-0000-4000-8000-0000000000a1'; // throwaway uuid, never a real tenant

// columns the migration declares (Korean-Test structural set)
const EXPECTED_COLS = [
  'id', 'tenant_id', 'agent_name', 'invocation_type', 'subject_ref', 'request_fingerprint',
  'status', 'turn_count', 'tool_calls', 'result', 'confidence', 'latency_ms', 'provider',
  'model', 'token_usage', 'cost_usd', 'cache_hit', 'created_by', 'created_at', 'completed_at',
];

const ok = (b: boolean) => (b ? 'PASS' : 'FAIL');
let allPass = true;
const note = (pass: boolean, msg: string) => { if (!pass) allPass = false; console.log(`  [${ok(pass)}] ${msg}`); };

async function main() {
  console.log('================ OB-212 N2 MIGRATION VERIFICATION ================');
  console.log(`table: public.${TABLE} · url host: ${(() => { try { return new URL(URL).host; } catch { return '??'; } })()}`);

  // sweep any straggler probe rows from a prior crashed run
  await sb.from(TABLE).delete().eq('request_fingerprint', SENTINEL);

  // ---- 1. EXISTS (PGRST205 means missing) ----
  console.log('\n=== 1. TABLE EXISTS ===');
  const existsProbe = await sb.from(TABLE).select('id').limit(1);
  if (existsProbe.error) {
    note(false, `select failed — ${existsProbe.error.code ?? ''} ${existsProbe.error.message}`);
    if (existsProbe.error.code === 'PGRST205') {
      console.log('\nRESULT: table ABSENT — migration NOT applied. Halt; architect to apply (SR-44).');
      process.exit(1);
    }
  } else {
    note(true, `public.${TABLE} exists (service-role select succeeded)`);
  }

  let probeId: string | null = null;
  try {
    // ---- 2. INSERT probe → DEFAULTS + COLUMN INVENTORY ----
    console.log('\n=== 2. COLUMNS + DEFAULTS (insert minimal NOT-NULL set; let defaults fill the rest) ===');
    const ins = await sb
      .from(TABLE)
      .insert({
        tenant_id: PROBE_TENANT,
        agent_name: SENTINEL,
        invocation_type: 'reconciliation_diagnosis', // structural sample value
        request_fingerprint: SENTINEL,
      })
      .select('*')
      .single();
    if (ins.error || !ins.data) {
      note(false, `insert failed — ${ins.error?.code ?? ''} ${ins.error?.message ?? 'no row'}`);
      console.log('\nRESULT: table present but probe insert failed — see error above.');
      process.exit(1);
    }
    const row = ins.data as Record<string, unknown>;
    probeId = row.id as string;

    const cols = Object.keys(row).sort();
    console.log(`  column inventory (${cols.length}): [${cols.join(', ')}]`);
    const missing = EXPECTED_COLS.filter((c) => !cols.includes(c));
    const extra = cols.filter((c) => !EXPECTED_COLS.includes(c));
    note(missing.length === 0, `all ${EXPECTED_COLS.length} declared columns present${missing.length ? ` — MISSING: ${missing.join(', ')}` : ''}`);
    if (extra.length) console.log(`  (note: extra columns not in expected set: ${extra.join(', ')})`);

    console.log('  -- declared defaults --');
    const eq = (k: string, v: unknown) => JSON.stringify(row[k]) === JSON.stringify(v);
    note(row.id != null && typeof row.id === 'string', `id default-generated (gen_random_uuid) = ${row.id}`);
    note(row.status === 'running', `status default 'running' (got ${JSON.stringify(row.status)})`);
    note(row.turn_count === 0, `turn_count default 0 (got ${JSON.stringify(row.turn_count)})`);
    note(eq('subject_ref', {}), `subject_ref default {} (got ${JSON.stringify(row.subject_ref)})`);
    note(eq('tool_calls', []), `tool_calls default [] (got ${JSON.stringify(row.tool_calls)})`);
    note(eq('result', {}), `result default {} (got ${JSON.stringify(row.result)})`);
    note(eq('token_usage', {}), `token_usage default {} (got ${JSON.stringify(row.token_usage)})`);
    note(row.cache_hit === false, `cache_hit default false (got ${JSON.stringify(row.cache_hit)})`);
    note(row.created_at != null, `created_at default now() (got ${String(row.created_at)})`);
    note(row.completed_at == null, `completed_at null until completion (got ${JSON.stringify(row.completed_at)})`);

    // ---- 3. INDEX functional proxy: both indexed key-shapes return the row ----
    console.log('\n=== 3. INDEXES (functional proxy — both key-shapes resolve) ===');
    const byTenantAgent = await sb
      .from(TABLE)
      .select('id')
      .eq('tenant_id', PROBE_TENANT)
      .eq('agent_name', SENTINEL)
      .order('created_at', { ascending: false })
      .limit(1);
    note(!byTenantAgent.error && byTenantAgent.data?.[0]?.id === probeId,
      `idx_agent_invocations_tenant_agent_created shape (tenant_id, agent_name, created_at desc) query OK${byTenantAgent.error ? ` — ${byTenantAgent.error.message}` : ''}`);
    const byFp = await sb.from(TABLE).select('id').eq('request_fingerprint', SENTINEL).limit(1);
    note(!byFp.error && byFp.data?.some((r) => (r as { id: string }).id === probeId),
      `idx_agent_invocations_fingerprint shape (request_fingerprint) query OK${byFp.error ? ` — ${byFp.error.message}` : ''}`);
    console.log('  (note: PostgREST cannot read pg_indexes; this proves the indexed columns are queryable, not the index objects.)');

    // ---- 4. RLS policy live: anon must NOT see the row the service-role client just inserted ----
    console.log('\n=== 4. RLS POLICY (anon vs service-role visibility differential on the SAME row) ===');
    const svcSees = await sb.from(TABLE).select('id').eq('id', probeId).maybeSingle();
    note(!svcSees.error && (svcSees.data as { id?: string } | null)?.id === probeId,
      `service-role client SEES the probe row (RLS bypassed for service role, as expected)`);
    const anonSees = await anon.from(TABLE).select('id').eq('id', probeId);
    const anonRows = anonSees.data?.length ?? 0;
    if (anonSees.error) {
      // permission denied also means the data is protected from the anon/user surface
      note(true, `anon client BLOCKED (error: ${anonSees.error.code ?? ''} ${anonSees.error.message}) — data not exposed to anon`);
    } else {
      note(anonRows === 0, `anon client sees ${anonRows} row(s) for the probe id — RLS+policy must yield 0 (got ${anonRows})`);
    }
    console.log('  → anon=0/blocked while service-role=1 is direct evidence RLS is ENABLED and tenant_isolation_agent_invocations is filtering user-token reads.');

    // ---- 5. BEST-EFFORT pg_catalog probe via exec_sql (likely returns void; reported if it yields rows) ----
    console.log('\n=== 5. pg_catalog via exec_sql (best-effort; informational) ===');
    for (const [param, label] of [['sql', 'exec_sql({sql})'], ['sql_text', 'exec_sql({sql_text})']] as const) {
      try {
        const r = await sb.rpc('exec_sql', {
          [param]: `select indexname from pg_indexes where schemaname='public' and tablename='${TABLE}'`,
        } as Record<string, string>);
        console.log(`  ${label}: error=${r.error ? `${r.error.code ?? ''} ${r.error.message}` : 'none'} ; data=${JSON.stringify(r.data)}`);
      } catch (e) {
        console.log(`  ${label}: threw ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally {
    // ---- self-cleaning: remove the probe row(s) ----
    if (probeId) await sb.from(TABLE).delete().eq('id', probeId);
    await sb.from(TABLE).delete().eq('request_fingerprint', SENTINEL);
    const leftover = await sb.from(TABLE).select('id', { count: 'exact', head: true }).eq('request_fingerprint', SENTINEL);
    console.log(`\n=== CLEANUP === probe rows remaining with sentinel fingerprint: ${leftover.count ?? 'unknown'}`);
  }

  console.log(`\n================ RESULT: ${allPass ? 'ALL CHECKS PASS — migration applied & live.' : 'ONE OR MORE CHECKS FAILED (see above).'} ================`);
  process.exit(allPass ? 0 : 2);
}

main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
