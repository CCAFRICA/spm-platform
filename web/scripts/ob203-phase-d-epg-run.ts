/**
 * OB-203 Phase 6B / Phase D — D.5 EPG live run.
 *
 * Drives a REAL import end-to-end through the same HTTP routes the UI uses
 * (analyze -> execute-bulk), on a scratch tenant, while polling the panel read
 * (GET /api/import/sci/session-state[?telemetry=1]) every 2s — exactly what
 * ImportTelemetryPanel / SCIExecution do. Records:
 *   EPG-2: continuous panel movement through analyze AND execute
 *          (progressTick / sheets / pulses / rows per tick);
 *   EPG-3: the settle-time audit verdict (accumulated vs scanned, equal);
 *   EPG-4: per-poll latency stats (no display query >2s).
 *
 * Run from web/ with dev server on :3000:
 *   set -a && source .env.local && set +a && npx tsx scripts/ob203-phase-d-epg-run.ts
 */
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE_URL = 'http://localhost:3000';
const EMAIL = `ob203-phase-d-epg-${Date.now()}@vialuce.test`;   // dedicated EPG caller (execute-bulk requires a user)
const PASSWORD = `Epg-${crypto.randomUUID()}-9X`;
const ANALYSIS_SAMPLE_SIZE = 50;                 // mirrors page.tsx

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

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

// ── Synthetic workbook: roster (entity) + lookup (reference) + fact (transaction) ──
function buildWorkbook(): { buffer: Buffer; sheets: Array<{ sheetName: string; columns: string[]; rows: Record<string, unknown>[]; totalRowCount: number }> } {
  const regions = ['NORTE', 'SUR', 'ESTE', 'OESTE'];
  // OB203_EPG_MUTATE=1 rotates every rep's region — all 40 roster entities then
  // carry CHANGED enrichment, so the Phase C enrich-upsert write path fires
  // live (temporal close+append + metadata merge + pulse per 200-chunk).
  const shift = process.env.OB203_EPG_MUTATE === '1' ? 1 : 0;
  const roster = Array.from({ length: 40 }, (_, i) => ({
    rep_id: `R${String(i + 1).padStart(3, '0')}`,
    rep_name: `Representative ${i + 1}`,
    region: regions[(i + shift) % regions.length],
  }));
  const lookup = regions.map((r, i) => ({ region_code: r, region_label: `Region ${r}`, display_order: i + 1 }));
  const fact = Array.from({ length: 3200 }, (_, i) => ({
    event_id: `E${String(i + 1).padStart(5, '0')}`,
    rep_id: `R${String((i % 40) + 1).padStart(3, '0')}`,
    event_date: `2026-05-${String((i % 28) + 1).padStart(2, '0')}`,
    amount: Math.round((((i * 37) % 900) + 100) * 100) / 100,
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

interface PollSample { t: number; cheapMs: number; tick: number; telMs: number; sheets: string; pulses: string; rows: string; units: string }
const samples: PollSample[] = [];
let polling = true;

async function pollLoop(tenantId: string, sessionId: string, t0: number, cookie: string): Promise<void> {
  // The middleware 401s unauthenticated API calls — the UI's polls ride the
  // browser session cookie, so the harness polls must too.
  while (polling) {
    const t = Math.round((Date.now() - t0) / 1000);
    try {
      const c0 = Date.now();
      const cheap = await fetch(`${BASE_URL}/api/import/sci/session-state?tenantId=${tenantId}&importSessionId=${sessionId}`, { headers: { cookie } });
      const cheapJson = await cheap.json() as { progressTick?: number };
      const cheapMs = Date.now() - c0;
      const t1 = Date.now();
      const tel = await fetch(`${BASE_URL}/api/import/sci/session-state?tenantId=${tenantId}&importSessionId=${sessionId}&telemetry=1`, { headers: { cookie } });
      const telJson = await tel.json() as { telemetry?: { sheets: { comprehended: number; total: number }; pulses: { committed: number; total: number }; rows: { committed: number; total: number }; units: { committed: number; total: number } } };
      const telMs = Date.now() - t1;
      const m = telJson.telemetry;
      const sample: PollSample = {
        t, cheapMs, telMs,
        tick: cheapJson.progressTick ?? 0,
        sheets: m ? `${m.sheets.comprehended}/${m.sheets.total}` : '-',
        pulses: m ? `${m.pulses.committed}/${m.pulses.total}` : '-',
        rows: m ? `${m.rows.committed}/${m.rows.total}` : '-',
        units: m ? `${m.units.committed}/${m.units.total}` : '-',
      };
      samples.push(sample);
      console.log(`[POLL t=${String(t).padStart(3)}s] cheap=${String(cheapMs).padStart(4)}ms tick=${String(sample.tick).padStart(3)} | tel=${String(telMs).padStart(4)}ms sheets=${sample.sheets} units=${sample.units} pulses=${sample.pulses} rows=${sample.rows}`);
    } catch (e) {
      console.log(`[POLL t=${t}s] poll error: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}

async function main() {
  // 1. Scratch tenant — keeps the witness tenant clean; left in place for inspection.
  //    OB203_EPG_TENANT reuses an existing scratch tenant (re-import: supersession +
  //    entity-enrich path engage — the Phase C before/after timing run).
  const tenantId = process.env.OB203_EPG_TENANT ?? crypto.randomUUID();
  if (!process.env.OB203_EPG_TENANT) {
    const { error: tErr } = await sb.from('tenants').insert({
      id: tenantId, name: 'OB-203 Phase D EPG', slug: `ob203-phase-d-epg-${tenantId.slice(0, 8)}`,
      settings: {}, hierarchy_labels: {}, entity_type_labels: {}, features: {},
    });
    if (tErr) throw new Error(`tenant create failed: ${tErr.message}`);
  }
  console.log(`scratch tenant: ${tenantId}${process.env.OB203_EPG_TENANT ? ' (REUSED — re-import run)' : ''}`);

  // 2. Workbook -> Storage (same bucket/path shape as the UI, page.tsx HF-141).
  const { buffer, sheets } = buildWorkbook();
  const storagePath = `${tenantId}/${Date.now()}_0_ob203_phase_d_epg.xlsx`;
  const { error: upErr } = await sb.storage.from('ingestion-raw').upload(storagePath, buffer, {
    cacheControl: '3600', upsert: false,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  if (upErr) throw new Error(`storage upload failed: ${upErr.message}`);
  console.log(`uploaded: ${storagePath} (${(buffer.length / 1024).toFixed(0)}KB)`);

  const cookie = await getAuthCookie();
  const importSessionId = crypto.randomUUID();
  const t0 = Date.now();
  console.log(`importSessionId: ${importSessionId}\n--- ANALYZE (polling the panel read every 2s) ---`);
  const poller = pollLoop(tenantId, importSessionId, t0, cookie);

  // 3. Analyze — same body the UI sends (page.tsx:319-327).
  const analyzeRes = await fetch(`${BASE_URL}/api/import/sci/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      tenantId, importSessionId,
      files: [{
        fileName: 'ob203_phase_d_epg.xlsx',
        sheets: sheets.map(s => ({ sheetName: s.sheetName, columns: s.columns, rows: s.rows.slice(0, ANALYSIS_SAMPLE_SIZE), totalRowCount: s.totalRowCount })),
      }],
    }),
  });
  if (!analyzeRes.ok) { polling = false; throw new Error(`analyze failed (${analyzeRes.status}): ${(await analyzeRes.text()).slice(0, 300)}`); }
  const proposal = await analyzeRes.json() as { proposalId: string; contentUnits: Array<{ contentUnitId: string; classification: string; confidence: number; fieldBindings?: unknown[]; tabName: string; sourceFile: string; classificationTrace?: Record<string, unknown> }> };
  console.log(`--- proposal: ${proposal.contentUnits.length} units (proposalId ${proposal.proposalId === importSessionId ? '== importSessionId' : 'MISMATCH: ' + proposal.proposalId}) ---`);
  for (const u of proposal.contentUnits) console.log(`    ${u.tabName}: ${u.classification} @ ${u.confidence}`);

  // 4. Execute-bulk — same body SCIExecution sends (SCIExecution.tsx:233-263).
  console.log('--- EXECUTE-BULK (polling continues) ---');
  const execT0 = Date.now();
  const execRes = await fetch(`${BASE_URL}/api/import/sci/execute-bulk`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      proposalId: proposal.proposalId, tenantId, storagePath,
      contentUnits: proposal.contentUnits.filter(u => u.classification !== 'plan').map(u => ({
        contentUnitId: u.contentUnitId,
        confirmedClassification: u.classification,
        // OB203_EPG_FIX_BINDINGS: fixture-level stand-in for the proposal-review
        // confirmation step — the warm path's flywheel-injected bindings scramble
        // roles across sheets sharing column names (rep_id -> transaction_identifier
        // on the roster; residual finding, out of Phase C/D scope), which a user
        // would correct in review. The override keys on THIS fixture's sheets only.
        confirmedBindings: process.env.OB203_EPG_FIX_BINDINGS === '1'
          ? (u.fieldBindings ?? []).map(b => {
              const bb = b as { sourceField: string; semanticRole: string };
              if (u.tabName === 'Team_Roster' && bb.sourceField === 'rep_id') return { ...bb, semanticRole: 'entity_identifier' };
              if (u.tabName === 'Region_Lookup' && bb.sourceField === 'region_code') return { ...bb, semanticRole: 'entity_identifier' };
              if (u.tabName === 'Sales_Events' && bb.sourceField === 'event_id') return { ...bb, semanticRole: 'transaction_identifier' };
              if (u.tabName === 'Sales_Events' && bb.sourceField === 'rep_id') return { ...bb, semanticRole: 'reference_key' };
              return b;
            })
          : (u.fieldBindings ?? []),
        originalClassification: u.classification,
        originalConfidence: u.confidence,
        ...(u.classificationTrace ? { classificationTrace: u.classificationTrace } : {}),
        sourceFile: u.sourceFile,
        tabName: u.tabName,
      })),
    }),
  });
  const execBody = await execRes.json().catch(() => ({}));
  console.log(`execute-bulk: ${execRes.status} overallSuccess=${(execBody as { overallSuccess?: boolean }).overallSuccess} wall=${((Date.now() - execT0) / 1000).toFixed(1)}s`);

  // Let two more polls land the terminal state, then stop.
  await new Promise(r => setTimeout(r, 5000));
  polling = false;
  await poller;

  // 5. Settle audit (EPG-3): the demoted derive runs ONCE, here.
  console.log('--- SETTLE AUDIT ---');
  const auditRes = await fetch(`${BASE_URL}/api/import/sci/settle-audit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ tenantId, importSessionId }),
  });
  const auditOut = await auditRes.json() as { audited?: boolean; divergent?: boolean; fields?: string[] };
  console.log(`settle-audit: ${auditRes.status} audited=${auditOut.audited} divergent=${auditOut.divergent} fields=${JSON.stringify(auditOut.fields)}`);

  const { data: record } = await sb.from('import_session_telemetry').select('audit, conclusion, total_signals_written')
    .eq('tenant_id', tenantId).eq('import_session_id', importSessionId).maybeSingle();
  const audit = record?.audit as { divergent: boolean; fields: string[]; scanned: unknown; accumulated: unknown } | null;
  if (audit) {
    console.log(`audit.divergent=${audit.divergent} fields=${JSON.stringify(audit.fields)}`);
    console.log(`SCANNED:     ${JSON.stringify(audit.scanned)}`);
    console.log(`ACCUMULATED: ${JSON.stringify(audit.accumulated)}`);
  }

  // 6. EPG-4: display-path latency stats.
  const cheapLat = samples.map(s => s.cheapMs), telLat = samples.map(s => s.telMs);
  const stats = (a: number[]) => `n=${a.length} avg=${Math.round(a.reduce((x, y) => x + y, 0) / a.length)}ms max=${Math.max(...a)}ms`;
  console.log('--- DISPLAY-PATH LATENCY (EPG-4) ---');
  console.log(`cheap poll (view):       ${stats(cheapLat)}`);
  console.log(`telemetry poll (panel):  ${stats(telLat)}`);
  console.log(`over-2s display queries: ${[...cheapLat, ...telLat].filter(x => x > 2000).length}`);
  console.log(`\nscratch tenant ${tenantId} retained for inspection (clear via src/scripts/clear-tenant.ts).`);
}

main().catch(e => { polling = false; console.error('FATAL:', e instanceof Error ? e.message : e); process.exit(1); });
