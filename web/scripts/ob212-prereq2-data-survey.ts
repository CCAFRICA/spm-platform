// OB-212 §B Prereq-2 — data-state survey for a reconciliation session with COMPONENT-LEVEL deltas.
// READ-ONLY (no writes anywhere). Answers: which tenant already has (calc batch with populated
// calculation_results.components[]) AND (an uploadable expected-results file with per-component
// columns whose values DIFFER) — i.e. the ingredients for component-level deltas. No fabrication.
//
// The gate (comparison-engine.ts:308-309): components[] is populated IFF the benchmark file has
// >=1 column mapped to component:* (file-side) AND calculation_results.components[] is non-empty
// with matching componentId (VL-side).
//
// Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob212-prereq2-data-survey.ts
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const j = (v: unknown, n = 240) => { const s = JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…' : s; };
const short = (id: unknown) => (typeof id === 'string' ? id.slice(0, 8) : String(id));

// ------- extract component names from a rule_set.components JSONB (handles array or {components:[]}) -------
function ruleSetComponents(components: unknown): Array<{ id?: string; name?: string }> {
  const arr = Array.isArray(components)
    ? components
    : (components && typeof components === 'object' && Array.isArray((components as any).components))
      ? (components as any).components
      : [];
  return arr.map((c: any) => ({ id: c?.id ?? c?.componentId ?? c?.component_id, name: c?.name ?? c?.componentName ?? c?.label }));
}

// ------- VL-side component shape from a calculation_results.components element -------
function calcComponents(components: unknown): Array<{ id?: string; name?: string; value?: number }> {
  const arr = Array.isArray(components) ? components : [];
  return arr.map((c: any) => ({
    id: c?.componentId ?? c?.id ?? c?.component_id,
    name: c?.name ?? c?.componentName ?? c?.label,
    value: c?.outputValue ?? c?.payout ?? c?.value,
  }));
}

async function fileSurvey() {
  console.log('\n################# PART 1 — EXPECTED-RESULTS FILE SURVEY (file-side gate) #################');

  // 1a. CLT14B xlsx — the BCL "Reconciliation Detail" candidate (per-component columns?)
  console.log('\n=== 1a. scripts/CLT14B_Reconciliation_Detail.xlsx ===');
  try {
    const XLSX: any = await import('xlsx');
    const wb = XLSX.readFile('scripts/CLT14B_Reconciliation_Detail.xlsx');
    console.log(`  sheets: ${j(wb.SheetNames)}`);
    for (const sheetName of wb.SheetNames.slice(0, 3)) {
      const ws = wb.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
      console.log(`  -- sheet "${sheetName}" (${rows.length} rows) --`);
      // print first 4 rows so the header row (wherever it is) is visible
      rows.slice(0, 4).forEach((r, i) => console.log(`     [row ${i}] ${j(r, 320)}`));
      // find a plausible header row (most string cells) and report column count
      let hdrIdx = 0, best = -1;
      rows.slice(0, 15).forEach((r, i) => { const s = r.filter((c) => typeof c === 'string' && c.trim()).length; if (s > best) { best = s; hdrIdx = i; } });
      console.log(`     → plausible header @ row ${hdrIdx}: ${j(rows[hdrIdx], 400)}`);
      console.log(`     → column count: ${rows[hdrIdx]?.length}; data rows after header: ${rows.length - hdrIdx - 1}`);
    }
  } catch (e) {
    console.log(`  ERROR reading xlsx: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 1b. meridian detail csv — VL-side dump with C1..C5 (proves component cols exist; zero-delta if self-reconciled)
  console.log('\n=== 1b. scripts/output/hf222-phase64-meridian-detail.csv (per-component cols; source = VL output?) ===');
  try {
    const lines = fs.readFileSync('scripts/output/hf222-phase64-meridian-detail.csv', 'utf8').split('\n').filter(Boolean);
    console.log(`  header: ${lines[0]}`);
    console.log(`  rows: ${lines.length - 1}; sample: ${lines[1]}`);
  } catch (e) { console.log(`  ERROR: ${e}`); }

  // 1c. benchmarks/*.csv — confirm total-only (3 cols) → NO component deltas
  console.log('\n=== 1c. benchmarks/*.csv (confirm total-only) ===');
  try {
    for (const f of fs.readdirSync('benchmarks').filter((x) => x.endsWith('.csv')).slice(0, 3)) {
      const h = fs.readFileSync(`benchmarks/${f}`, 'utf8').split('\n')[0];
      console.log(`  ${f}: header=[${h}]`);
    }
  } catch (e) { console.log(`  ERROR: ${e}`); }
}

async function dbSurvey() {
  console.log('\n\n################# PART 2 — LIVE DB SURVEY (VL-side gate) #################');

  // 2a. tenants
  console.log('\n=== 2a. TENANTS ===');
  const { data: tenants } = await sb.from('tenants').select('id, name').limit(50);
  (tenants ?? []).forEach((t: any) => console.log(`  ${short(t.id)}  ${t.name}`));
  const tenantName = (id: string) => (tenants ?? []).find((t: any) => t.id === id)?.name ?? '?';

  // 2b. rule_sets + component names (maps benchmark plan-names → tenant + component structure)
  console.log('\n=== 2b. RULE_SETS (id · tenant · name · components) ===');
  const { data: ruleSets } = await sb.from('rule_sets').select('id, tenant_id, name, components, status').limit(80);
  (ruleSets ?? []).forEach((rs: any) => {
    const comps = ruleSetComponents(rs.components);
    console.log(`  ${short(rs.id)} · ${tenantName(rs.tenant_id)} (${short(rs.tenant_id)}) · "${rs.name}" · status=${rs.status} · ${comps.length} comps: ${j(comps.map((c) => c.name))}`);
  });

  // 2c. calculation_batches (recent), grouped by tenant
  console.log('\n=== 2c. CALCULATION_BATCHES (recent 40) ===');
  const { data: batches } = await sb
    .from('calculation_batches')
    .select('id, tenant_id, rule_set_id, period_id, status, entity_count, created_at')
    .order('created_at', { ascending: false })
    .limit(40);
  (batches ?? []).forEach((b: any) =>
    console.log(`  ${short(b.id)} · ${tenantName(b.tenant_id)} · rs=${short(b.rule_set_id)} · status=${b.status} · entities=${b.entity_count} · ${String(b.created_at).slice(0, 10)}`),
  );

  // 2d. VL component population — for the most recent batch per tenant, sample calc_results
  console.log('\n=== 2d. calculation_results COMPONENT POPULATION (per tenant, latest batch) ===');
  const seenTenant = new Set<string>();
  const candidateBatches: Array<{ batchId: string; tenantId: string }> = [];
  for (const b of (batches ?? [])) {
    if (seenTenant.has(b.tenant_id)) continue;
    seenTenant.add(b.tenant_id);
    candidateBatches.push({ batchId: b.id, tenantId: b.tenant_id });
  }
  for (const { batchId, tenantId } of candidateBatches) {
    const { data: rows, error } = await sb
      .from('calculation_results')
      .select('entity_id, total_payout, components')
      .eq('batch_id', batchId)
      .limit(200);
    if (error) { console.log(`  batch ${short(batchId)} (${tenantName(tenantId)}): ERROR ${error.message}`); continue; }
    const n = rows?.length ?? 0;
    let withComps = 0;
    const compNameUnion = new Set<string>();
    let sample: any = null;
    for (const r of (rows ?? [])) {
      const cs = calcComponents(r.components);
      if (cs.length > 0) { withComps++; cs.forEach((c) => c.name && compNameUnion.add(String(c.name))); if (!sample) sample = { entity_id: r.entity_id, total_payout: r.total_payout, components: cs }; }
    }
    console.log(`  batch ${short(batchId)} · ${tenantName(tenantId)} · sampled ${n} rows · withComponents=${withComps}/${n}`);
    console.log(`     component names: ${j(Array.from(compNameUnion))}`);
    if (sample) console.log(`     sample row: entity=${short(sample.entity_id)} total=${sample.total_payout} comps=${j(sample.components, 400)}`);
  }

  // 2e. existing reconciliation_sessions (the "lone live session" claim)
  console.log('\n=== 2e. RECONCILIATION_SESSIONS (existing) ===');
  const { data: sessions, error: sErr } = await sb
    .from('reconciliation_sessions')
    .select('id, tenant_id, batch_id, status, summary, config, created_at, results')
    .order('created_at', { ascending: false })
    .limit(20);
  if (sErr) { console.log(`  ERROR ${sErr.message}`); }
  console.log(`  total sessions: ${sessions?.length ?? 0}`);
  for (const s of (sessions ?? [])) {
    const emp = (s.results as any)?.employees ?? [];
    const empWithComps = emp.filter((e: any) => Array.isArray(e?.components) && e.components.length > 0).length;
    const cfg = s.config as any;
    console.log(`  ${short(s.id)} · ${tenantName(s.tenant_id)} · batch=${short(s.batch_id)} · status=${s.status} · ${String(s.created_at).slice(0, 10)}`);
    console.log(`     summary: ${j(s.summary, 360)}`);
    console.log(`     config.benchmarkFileName=${cfg?.benchmarkFileName} · componentMappings=${j(cfg?.componentMappings)} · depthAchieved=${cfg?.depthAchieved}`);
    console.log(`     employees=${emp.length} · withPopulatedComponents=${empWithComps}`);
  }
}

async function main() {
  console.log('================ OB-212 PREREQ-2 DATA SURVEY (read-only) ================');
  await fileSurvey();
  await dbSurvey();
  console.log('\n================ END SURVEY ================');
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
