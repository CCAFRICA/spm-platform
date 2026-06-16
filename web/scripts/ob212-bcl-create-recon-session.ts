// OB-212 Prereq-2 — create the BCL cross-period reconciliation session with REAL component-level deltas.
//
// Period A (expected file) = batch 6dde6d49 (period 924cbece) ; Period B (platform/VL) = batch 8f9bf397 (period a8febd82).
// All numbers are real engine outputs — nothing invented. The expected file is built from Period A's
// real calculation_results; we reconcile it against Period B's batch. Deltas are real because each
// period's underlying performance differed.
//
// Faithful to production: replicates compare/route.ts (DB→CalculationResult transform, lines 104-121) and
// calls the SAME engine (runEnhancedComparison) the route calls (line 139); inserts the session with the
// SAME shape as save/route.ts (lines 64-78). Restricts the file to the 72 regular-variant (c*-ejecutivo)
// entities so every component mapping resolves by componentId (the 13 -senior entities become vl_only).
//
// Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob212-bcl-create-recon-session.ts
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import { runEnhancedComparison } from '../src/lib/reconciliation/comparison-engine';
import type { ColumnMapping } from '../src/lib/reconciliation/ai-column-mapper';
import type { CalculationResult } from '@/types/compensation-plan';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const A = { id: '6dde6d49-0d5f-4ff7-bd0a-4c20869c56eb', period: '924cbece-d827-48bb-ae7f-62523edfbe98', label: '924cbece' }; // expected (file)
const B = { id: '8f9bf397-d024-484f-ac75-a7db5410f5b1', period: 'a8febd82-85fb-4f63-9e6e-4ba1c36f67aa', label: 'a8febd82' }; // platform (VL)
const REGULAR = ['c1-ejecutivo', 'c2-ejecutivo', 'c3-ejecutivo', 'c4-ejecutivo'];
const FILE_PATH = 'scripts/ob212-bcl-period-a-expected.csv';
const j = (v: unknown, n = 360) => { const s = JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…' : s; };

const cId = (c: any) => String(c?.id ?? c?.componentId ?? '');
const cName = (c: any) => String(c?.name ?? c?.componentName ?? '');
const cVal = (c: any) => Number(c?.outputValue ?? c?.payout ?? 0);

type Loaded = { ext: string; entityName: string; total: number; comps: any[] };
async function load(batchId: string): Promise<Map<string, Loaded>> {
  const { data: cr } = await sb.from('calculation_results').select('entity_id, total_payout, components').eq('tenant_id', BCL).eq('batch_id', batchId);
  const ids = (cr ?? []).map((r: any) => r.entity_id);
  const ext = new Map<string, { external_id: string; name: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: ents } = await sb.from('entities').select('id, external_id, display_name').in('id', ids.slice(i, i + 200));
    (ents ?? []).forEach((e: any) => ext.set(e.id, { external_id: e.external_id ?? e.id, name: e.display_name ?? '' }));
  }
  const m = new Map<string, Loaded>();
  (cr ?? []).forEach((r: any) => { const e = ext.get(r.entity_id); m.set(e?.external_id ?? r.entity_id, { ext: e?.external_id ?? r.entity_id, entityName: e?.name ?? '', total: Number(r.total_payout), comps: Array.isArray(r.components) ? r.components : [] }); });
  return m;
}

// minimal CSV (no field contains comma/quote/newline in this dataset, but quote defensively)
const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const split = (line: string) => { const out: string[] = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else { if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } } out.push(cur); return out; };
  const headers = split(lines[0]);
  return lines.slice(1).map((l) => { const cells = split(l); const o: Record<string, string> = {}; headers.forEach((h, i) => { o[h] = cells[i] ?? ''; }); return o; });
}

async function main() {
  console.log('================ OB-212 BCL CROSS-PERIOD RECON SESSION ================');
  const mapA = await load(A.id), mapB = await load(B.id);
  console.log(`Period A (expected) batch=${A.id} entities=${mapA.size} · Period B (platform) batch=${B.id} entities=${mapB.size}`);

  // regular-variant entities + componentId→name (from a regular entity)
  const isRegular = (l: Loaded) => { const s = l.comps.map(cId).sort().join('|'); return s === [...REGULAR].sort().join('|'); };
  const regularExts = Array.from(mapA.values()).filter(isRegular).map((l) => l.ext);
  const nameById = new Map<string, string>();
  for (const c of (mapA.get(regularExts[0])!.comps)) nameById.set(cId(c), cName(c));
  const compHeaders = REGULAR.map((id) => nameById.get(id) || id);
  console.log(`regular-variant entities: ${regularExts.length} · component headers: ${j(compHeaders)}`);

  // ---- STEP 2: build + write the expected file (real Period-A numbers) ----
  const headerRow = ['entity_id', ...compHeaders, 'Total'];
  const dataRows = regularExts.map((extId) => {
    const l = mapA.get(extId)!;
    const byId = new Map(l.comps.map((c) => [cId(c), cVal(c)]));
    return [extId, ...REGULAR.map((id) => byId.get(id) ?? 0), l.total];
  });
  const csv = [headerRow.map(csvCell).join(','), ...dataRows.map((r) => r.map(csvCell).join(','))].join('\n') + '\n';
  fs.writeFileSync(FILE_PATH, csv, 'utf8');
  console.log(`\n=== STEP 2: wrote ${FILE_PATH} (${dataRows.length} rows) ===`);
  console.log(`  header: ${headerRow.join(',')}`);
  parseCsv(csv).slice(0, 5).forEach((r, i) => console.log(`  row ${i + 1}: ${j(r)}`));

  // ---- read the file back; build fileRows + mappings (the file IS the expected results) ----
  const fileRows = parseCsv(fs.readFileSync(FILE_PATH, 'utf8'));
  const mappings: ColumnMapping[] = [
    { sourceColumn: 'entity_id', mappedTo: 'entity_id', mappedToLabel: 'Entity ID', confidence: 1, reasoning: 'manual (cross-period proof)', isUserOverride: false },
    { sourceColumn: 'Total', mappedTo: 'total_amount', mappedToLabel: 'Total', confidence: 1, reasoning: 'manual (cross-period proof)', isUserOverride: false },
    ...REGULAR.map((id) => ({ sourceColumn: nameById.get(id) || id, mappedTo: `component:${id}`, mappedToLabel: nameById.get(id) || id, confidence: 1, reasoning: 'manual map: file column → VL componentId (real Period-A payout)', isUserOverride: false } as ColumnMapping)),
  ];

  // ---- replicate compare/route.ts transform (lines 104-121) for Period B ----
  const vlResults = Array.from(mapB.values()).map((l) => ({
    entityId: l.ext,
    entityName: l.entityName,
    totalIncentive: l.total,
    components: l.comps.map((c) => ({ componentId: cId(c), componentName: cName(c), outputValue: cVal(c) })),
  } as unknown as CalculationResult));

  // ---- STEP: run the SAME engine the compare route calls (line 139) ----
  const result = runEnhancedComparison(fileRows, vlResults, mappings, 'entity_id', 'Total', [`expected:period ${A.label} (batch 6dde6d49) vs platform:period ${B.label} (batch 8f9bf397)`], 2);

  // ---- STEP 4: VERIFY component-level deltas before inserting (non-negotiable) ----
  console.log(`\n=== STEP 4: VERIFY ===`);
  const matched = result.employees.filter((e) => e.population === 'matched');
  const withCompDelta = matched.filter((e) => e.components.some((c) => Math.abs(c.delta) > 0));
  const redComps = matched.flatMap((e) => e.components).filter((c) => c.flag === 'red').length;
  const amberComps = matched.flatMap((e) => e.components).filter((c) => c.flag === 'amber').length;
  console.log(`  summary: ${j(result.summary)}`);
  console.log(`  matched=${matched.length} · entities with ≥1 component delta=${withCompDelta.length} · red comps=${redComps} amber comps=${amberComps} · falseGreens=${result.falseGreenCount}`);
  console.log(`  example matched entities with per-component deltas (file=expected/Period A, vl=platform/Period B):`);
  withCompDelta.slice(0, 5).forEach((e) => {
    console.log(`    [${e.entityId}] total file=${e.fileTotal} vl=${e.vlTotal} delta=${e.totalDelta.toFixed(0)} flag=${e.totalFlag}`);
    e.components.forEach((c) => console.log(`        ${c.componentName}: file=${c.fileValue} vl=${c.vlValue} delta=${c.delta.toFixed(0)} (${(c.deltaPercent * 100).toFixed(1)}%) flag=${c.flag}`));
  });
  if (matched.length < 3 || withCompDelta.length < 3) {
    console.log(`\n  !!! ABORT: need ≥3 matched entities with component deltas (matched=${matched.length}, withCompDelta=${withCompDelta.length}). NOT inserting. Mapping likely failed.`);
    process.exit(2);
  }

  // ---- created_by: reuse a known-good value (existing BCL session's creator) ----
  const { data: prior } = await sb.from('reconciliation_sessions').select('created_by').eq('tenant_id', BCL).not('created_by', 'is', null).limit(1).maybeSingle();
  let createdBy = (prior as any)?.created_by ?? null;
  if (!createdBy) { const { data: prof } = await sb.from('profiles').select('id').eq('tenant_id', BCL).limit(1).maybeSingle(); createdBy = (prof as any)?.id ?? null; }
  console.log(`  created_by: ${createdBy ?? 'NULL'}`);

  // ---- STEP 3/5: insert session (replicates save/route.ts insert, lines 64-78) ----
  const componentMappings: Record<string, string> = {}; REGULAR.forEach((id) => { componentMappings[nameById.get(id) || id] = id; });
  const config = {
    benchmarkFileName: 'ob212-bcl-period-a-expected.csv',
    mappings: Object.fromEntries(mappings.map((m) => [m.sourceColumn, m.mappedTo])) as Record<string, string>,
    entityIdField: 'entity_id', totalAmountField: 'Total', periodColumns: [] as string[],
    componentMappings, periodsCompared: result.periodsCompared, depthAchieved: 2,
    note: 'OB-212 Prereq-2 cross-period proof: expected = real Period-A (924cbece/6dde6d49) calc; platform = Period-B (a8febd82/8f9bf397). No invented numbers.',
  };
  const summary = { ...result.summary, falseGreenCount: result.falseGreenCount };
  const insert = {
    tenant_id: BCL, period_id: B.period, batch_id: B.id, status: 'completed',
    config: config as any, results: { employees: result.employees.slice(0, 100), findings: result.findings } as any,
    summary: summary as any, created_by: createdBy, completed_at: new Date().toISOString(),
  };
  const { data: saved, error } = await sb.from('reconciliation_sessions').insert(insert).select('id').single();
  if (error) { console.log(`\n  INSERT ERROR: ${error.message}`); process.exit(1); }
  console.log(`\n=== STEP 3/5: SESSION CREATED ===\n  reconciliation_sessions.id = ${(saved as any).id}`);

  // ---- read back the stored row (prove it persisted with component deltas) ----
  const { data: back } = await sb.from('reconciliation_sessions').select('id, tenant_id, batch_id, period_id, status, summary, created_at, results').eq('id', (saved as any).id).single();
  const emp = (back as any).results.employees as any[];
  const empCompDelta = emp.filter((e) => Array.isArray(e.components) && e.components.some((c: any) => Math.abs(c.delta) > 0));
  console.log(`  stored: status=${(back as any).status} batch=${(back as any).batch_id} summary.matched=${(back as any).summary.matched} summary.redFlags=${(back as any).summary.redFlags} summary.falseGreenCount=${(back as any).summary.falseGreenCount}`);
  console.log(`  stored employees=${emp.length} · with component deltas=${empCompDelta.length}`);
  console.log(`  3 stored entities with component-level deltas:`);
  empCompDelta.slice(0, 3).forEach((e) => { console.log(`    [${e.entityId}] components: ${j(e.components.map((c: any) => `${c.componentName} file=${c.fileValue} vl=${c.vlValue} Δ=${c.delta} ${c.flag}`), 500)}`); });
  console.log('\n================ DONE ================');
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
