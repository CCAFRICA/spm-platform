/**
 * OB-203 Phase 6B / Phase B — controlled kill-test EPG (directive §5 B).
 *
 * Proves: response/process death mid-execute cannot orphan units. Sequence:
 *   1. fresh scratch tenant; real analyze -> execute-bulk via the HTTP routes;
 *   2. KILL the dev server mid-fact-commit (process death — the strongest form
 *      of response death; the warm-witness shape);
 *   3. restart; FIRST poll shows pre-kill truth SURVIVED process death (the
 *      durable record, not memory);
 *   4. after the (shortened) liveness lease expires, re-POST the same body —
 *      the route sweeps the dead partial (D16.1), skips terminal units, and
 *      reprocesses exactly the orphan;
 *   5. all units terminal; committed_data exact = one generation; audit EQUAL.
 *
 * Run from web/ (manages its own dev server on :3000):
 *   set -a && source .env.local && set +a && npx tsx scripts/ob203-phase-b-epg-run.ts
 */
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { execSync, spawn } from 'node:child_process';
import { openSync } from 'node:fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE_URL = 'http://localhost:3000';
const EMAIL = `ob203-phase-b-epg-${Date.now()}@vialuce.test`;
const PASSWORD = `Epg-${crypto.randomUUID()}-9X`;
const LEASE_MS = 15_000;                       // OB203_BATCH_LIVENESS_MS for the test servers
const DEV_LOG = '/tmp/ob203-phase-b-dev.log';

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function killDev() {
  try { execSync('pkill -f "next dev"'); } catch { /* none running */ }
}

async function startDev(): Promise<void> {
  const out = openSync(DEV_LOG, 'a');
  const child = spawn('npm', ['run', 'dev'], {
    cwd: process.cwd(),
    env: { ...process.env, OB203_BATCH_LIVENESS_MS: String(LEASE_MS), OB203_VERBOSE: '1' },
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try {
      const r = await fetch(`${BASE_URL}/`, { redirect: 'manual' });
      if (r.status > 0) return;
    } catch { /* not up yet */ }
  }
  throw new Error('dev server did not come up');
}

async function getAuthCookie(): Promise<string> {
  const { error: cErr } = await sb.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (cErr) throw new Error(`EPG user create failed: ${cErr.message}`);
  const anon = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw new Error(`Auth failed: ${error.message}`);
  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1] || '';
  const sessionJson = JSON.stringify({
    access_token: data.session!.access_token,
    refresh_token: data.session!.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  return `sb-${projectRef}-auth-token=${encodeURIComponent(sessionJson)}`;
}

function buildWorkbook() {
  const regions = ['NORTE', 'SUR', 'ESTE', 'OESTE'];
  const roster = Array.from({ length: 40 }, (_, i) => ({
    rep_id: `R${String(i + 1).padStart(3, '0')}`, rep_name: `Representative ${i + 1}`, region: regions[i % 4],
  }));
  const lookup = regions.map((r, i) => ({ region_code: r, region_label: `Region ${r}`, display_order: i + 1 }));
  const fact = Array.from({ length: 3200 }, (_, i) => ({
    event_id: `E${String(i + 1).padStart(5, '0')}`, rep_id: `R${String((i % 40) + 1).padStart(3, '0')}`,
    event_date: `2026-05-${String((i % 28) + 1).padStart(2, '0')}`, amount: Math.round((((i * 37) % 900) + 100) * 100) / 100,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(roster), 'Team_Roster');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lookup), 'Region_Lookup');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fact), 'Sales_Events');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const sheets = [
    { sheetName: 'Team_Roster', columns: Object.keys(roster[0]), rows: roster as Record<string, unknown>[], totalRowCount: roster.length },
    { sheetName: 'Region_Lookup', columns: Object.keys(lookup[0]), rows: lookup as Record<string, unknown>[], totalRowCount: lookup.length },
    { sheetName: 'Sales_Events', columns: Object.keys(fact[0]), rows: fact as Record<string, unknown>[], totalRowCount: fact.length },
  ];
  return { buffer, sheets };
}

async function pollOnce(tenantId: string, sessionId: string, cookie: string) {
  const r = await fetch(`${BASE_URL}/api/import/sci/session-state?tenantId=${tenantId}&importSessionId=${sessionId}&telemetry=1`, { headers: { cookie } });
  if (!r.ok) throw new Error(`poll ${r.status}`);
  return await r.json() as {
    units: Array<{ unitId: string; state: string; sheetName: string | null }>;
    progressTick?: number;
    telemetry?: { units: { committed: number; total: number }; pulses: { committed: number; total: number }; rows: { committed: number; total: number } };
  };
}
const fmt = (v: Awaited<ReturnType<typeof pollOnce>>) =>
  `tick=${v.progressTick ?? 0} units=${v.telemetry?.units.committed}/${v.telemetry?.units.total} pulses=${v.telemetry?.pulses.committed}/${v.telemetry?.pulses.total} rows=${v.telemetry?.rows.committed}/${v.telemetry?.rows.total} states=[${v.units.map(u => `${u.sheetName}:${u.state}`).join(', ')}]`;

const FIX = (tabName: string, b: { sourceField: string; semanticRole: string }) => {
  if (tabName === 'Team_Roster' && b.sourceField === 'rep_id') return { ...b, semanticRole: 'entity_identifier' };
  if (tabName === 'Region_Lookup' && b.sourceField === 'region_code') return { ...b, semanticRole: 'entity_identifier' };
  if (tabName === 'Sales_Events' && b.sourceField === 'event_id') return { ...b, semanticRole: 'transaction_identifier' };
  if (tabName === 'Sales_Events' && b.sourceField === 'rep_id') return { ...b, semanticRole: 'reference_key' };
  return b;
};

async function main() {
  console.log('--- restarting dev server with short lease for the controlled test ---');
  killDev();
  await startDev();
  console.log(`dev up (OB203_BATCH_LIVENESS_MS=${LEASE_MS}, OB203_VERBOSE=1)`);

  const tenantId = crypto.randomUUID();
  const { error: tErr } = await sb.from('tenants').insert({
    id: tenantId, name: 'OB-203 Phase B EPG', slug: `ob203-phase-b-epg-${tenantId.slice(0, 8)}`,
    settings: {}, hierarchy_labels: {}, entity_type_labels: {}, features: {},
  });
  if (tErr) throw new Error(`tenant create failed: ${tErr.message}`);
  const { buffer, sheets } = buildWorkbook();
  const storagePath = `${tenantId}/${Date.now()}_0_ob203_phase_b_epg.xlsx`;
  const { error: upErr } = await sb.storage.from('ingestion-raw').upload(storagePath, buffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  if (upErr) throw new Error(`upload failed: ${upErr.message}`);
  const cookie = await getAuthCookie();
  const importSessionId = crypto.randomUUID();
  console.log(`tenant=${tenantId} session=${importSessionId}`);

  // Analyze
  const analyzeRes = await fetch(`${BASE_URL}/api/import/sci/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      tenantId, importSessionId,
      files: [{ fileName: 'ob203_phase_b_epg.xlsx', sheets: sheets.map(s => ({ sheetName: s.sheetName, columns: s.columns, rows: s.rows.slice(0, 50), totalRowCount: s.totalRowCount })) }],
    }),
  });
  if (!analyzeRes.ok) throw new Error(`analyze failed: ${analyzeRes.status}`);
  const proposal = await analyzeRes.json() as { proposalId: string; contentUnits: Array<{ contentUnitId: string; classification: string; confidence: number; fieldBindings?: Array<{ sourceField: string; semanticRole: string }>; tabName: string; sourceFile: string; classificationTrace?: Record<string, unknown> }> };
  console.log(`proposal: ${proposal.contentUnits.map(u => `${u.tabName}:${u.classification}`).join(', ')}`);

  const execBody = JSON.stringify({
    proposalId: proposal.proposalId, tenantId, storagePath,
    contentUnits: proposal.contentUnits.filter(u => u.classification !== 'plan').map(u => ({
      contentUnitId: u.contentUnitId,
      confirmedClassification: u.classification,
      confirmedBindings: (u.fieldBindings ?? []).map(b => FIX(u.tabName, b)),
      originalClassification: u.classification,
      originalConfidence: u.confidence,
      ...(u.classificationTrace ? { classificationTrace: u.classificationTrace } : {}),
      sourceFile: u.sourceFile,
      tabName: u.tabName,
    })),
  });

  // Execute (fire, don't await) + poll for the kill trigger: mid-fact-commit.
  console.log('--- EXECUTE attempt 1 (will be KILLED mid-fact-commit) ---');
  const exec1 = fetch(`${BASE_URL}/api/import/sci/execute-bulk`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: execBody,
  }).then(r => console.log(`exec1 response: ${r.status} (unexpected — should have died)`))
    .catch(e => console.log(`exec1 fetch died as expected: ${e instanceof Error ? e.message : e}`));

  let preKill = '';
  for (let i = 0; i < 120; i++) {
    await sleep(1000);
    try {
      const v = await pollOnce(tenantId, importSessionId, cookie);
      console.log(`[pre-kill t=${i}s] ${fmt(v)}`);
      preKill = fmt(v);
      if ((v.telemetry?.rows.committed ?? 0) >= 1000) break;   // >= 2 fact pulses landed
    } catch (e) { console.log(`[pre-kill t=${i}s] poll: ${e instanceof Error ? e.message : e}`); }
  }

  console.log('>>> KILLING dev server mid-fact-commit (process death) <<<');
  killDev();
  await exec1;
  await sleep(2000);

  console.log('--- RESTART ---');
  await startDev();
  const survived = await pollOnce(tenantId, importSessionId, cookie);
  console.log(`FIRST poll after restart (pre-resume — truth SURVIVED process death): ${fmt(survived)}`);
  console.log(`last pre-kill poll was:                                               ${preKill}`);

  console.log(`--- waiting out the lease (${LEASE_MS}ms) then RESUME (re-POST same body) ---`);
  await sleep(LEASE_MS + 3000);
  const exec2 = await fetch(`${BASE_URL}/api/import/sci/execute-bulk`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: execBody,
  });
  const exec2Body = await exec2.json().catch(() => ({}));
  console.log(`resume execute-bulk: ${exec2.status} overallSuccess=${(exec2Body as { overallSuccess?: boolean }).overallSuccess}`);

  // Settle: poll until all units terminal (or 120s)
  let final: Awaited<ReturnType<typeof pollOnce>> | null = null;
  for (let i = 0; i < 60; i++) {
    await sleep(2000);
    try {
      const v = await pollOnce(tenantId, importSessionId, cookie);
      console.log(`[post-resume t=${i * 2}s] ${fmt(v)}`);
      final = v;
      if (v.units.length > 0 && v.units.every(u => ['bound', 'resolved', 'failed_interpretation'].includes(u.state))) break;
    } catch { /* transient */ }
  }

  // Settle audit + physical truth
  const auditRes = await fetch(`${BASE_URL}/api/import/sci/settle-audit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ tenantId, importSessionId }),
  });
  const auditOut = await auditRes.json() as { divergent?: boolean; fields?: string[] };
  const { count: physicalRows } = await sb.from('committed_data')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('metadata->>proposalId', importSessionId);
  const { data: allBatches } = await sb.from('import_batches')
    .select('status, row_count, superseded_by, metadata').eq('tenant_id', tenantId).eq('metadata->>proposalId', importSessionId);

  console.log('\n=== VERDICT ===');
  const allBound = final?.units.length === 3 && final.units.every(u => u.state === 'bound');
  console.log(`all 3 units bound:               ${allBound ? 'PASS' : 'FAIL'} (${final?.units.map(u => `${u.sheetName}:${u.state}`).join(', ')})`);
  console.log(`physical rows exact (3244):      ${physicalRows === 3244 ? 'PASS' : 'FAIL'} (${physicalRows})`);
  console.log(`audit EQUAL:                     ${auditOut.divergent === false ? 'PASS' : 'FAIL'} (divergent=${auditOut.divergent} fields=${JSON.stringify(auditOut.fields)})`);
  console.log(`session batches: ${(allBatches ?? []).map(b => `${(b.metadata as Record<string, unknown>)?.contentUnitId?.toString().split('::')[1]}:${b.status}${b.superseded_by ? '(superseded)' : ''}=${b.row_count}`).join(', ')}`);
  console.log(`\nscratch tenant ${tenantId} retained for inspection.`);
  process.exit(allBound && physicalRows === 3244 && auditOut.divergent === false ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e instanceof Error ? e.message : e); process.exit(1); });
