// OB-212 §B Prereq-2 — DECISIVE cross-check. READ-ONLY.
// Does an expected-results file with per-component columns align (entity IDs + component names +
// DIFFERING values = real deltas) with a live calc batch's calculation_results.components[]?
// Focus: BCL (CLT14B_Reconciliation_Detail.xlsx ↔ Banco Cumbre del Litoral calc) + Meridian context.
// Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob212-prereq2-crosscheck.ts
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const j = (v: unknown, n = 300) => { const s = JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…' : s; };
const short = (id: unknown) => (typeof id === 'string' ? id.slice(0, 8) : String(id));
const num = (v: unknown) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; };

async function tenantId(nameLike: string): Promise<string | null> {
  const { data } = await sb.from('tenants').select('id, name').ilike('name', `%${nameLike}%`).limit(1);
  return data?.[0]?.id ?? null;
}

// -------- A. calculation_batches schema/enumeration (capture error this time) --------
async function batchesProbe() {
  console.log('\n=== A. calculation_batches enumeration (error-captured) ===');
  const r1 = await sb.from('calculation_batches').select('*').limit(3);
  if (r1.error) { console.log(`  select * error: ${r1.error.code} ${r1.error.message}`); }
  else {
    console.log(`  rows: ${r1.data?.length}; columns: ${r1.data?.[0] ? Object.keys(r1.data[0]).join(', ') : '(none)'}`);
    (r1.data ?? []).forEach((b: any) => console.log(`    ${short(b.id)} tenant=${short(b.tenant_id)} status=${b.status} created=${String(b.created_at ?? b.createdAt ?? '').slice(0,10)} keys=${Object.keys(b).length}`));
  }
  const r2 = await sb.from('calculation_batches').select('id, tenant_id, status', { count: 'exact', head: true });
  console.log(`  total batch count: ${r2.count ?? 'unknown'}${r2.error ? ` (err ${r2.error.message})` : ''}`);
}

// -------- B. CLT14B xlsx full structure (fixed CJS import) --------
type FileShape = { headers: string[]; rows: Record<string, unknown>[]; idCol?: string; totalCol?: string; compCols: string[] };
async function readClt14b(): Promise<FileShape | null> {
  console.log('\n=== B. scripts/CLT14B_Reconciliation_Detail.xlsx (full structure) ===');
  try {
    const mod: any = await import('xlsx');
    const XLSX = mod.default ?? mod;
    if (typeof XLSX.readFile !== 'function') { console.log(`  xlsx import shape: ${Object.keys(mod).join(',')}`); return null; }
    const wb = XLSX.readFile('scripts/CLT14B_Reconciliation_Detail.xlsx');
    console.log(`  sheets: ${j(wb.SheetNames)}`);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
    let hdrIdx = 0, best = -1;
    matrix.slice(0, 15).forEach((r, i) => { const s = r.filter((c) => typeof c === 'string' && c.trim()).length; if (s > best) { best = s; hdrIdx = i; } });
    const headers = (matrix[hdrIdx] ?? []).map((h) => String(h ?? '').trim());
    console.log(`  header @ row ${hdrIdx} (${headers.length} cols): ${j(headers, 500)}`);
    const rows: Record<string, unknown>[] = matrix.slice(hdrIdx + 1).filter((r) => r.some((c) => c !== '' && c != null)).map((r) => {
      const o: Record<string, unknown> = {}; headers.forEach((h, i) => { o[h] = r[i]; }); return o;
    });
    console.log(`  data rows: ${rows.length}`);
    console.log(`  sample rows:`); rows.slice(0, 3).forEach((r) => console.log(`    ${j(r, 420)}`));
    // identify columns: id (contains id/entity/emp), total (total/expected/payout), components = numeric non-id non-total
    const lc = (s: string) => s.toLowerCase();
    const idCol = headers.find((h) => /(^|[^a-z])(id|entity|employee|emp|empleado|clave)([^a-z]|$)/i.test(h));
    const totalCol = headers.find((h) => /(total|expected|payout|pago|esperad)/i.test(h));
    const numericCols = headers.filter((h) => { const vals = rows.slice(0, 20).map((r) => num(r[h])); return vals.filter((v) => v != null).length >= rows.slice(0, 20).length * 0.6; });
    const compCols = numericCols.filter((h) => h !== idCol && h !== totalCol);
    console.log(`  → idCol=${j(idCol)} totalCol=${j(totalCol)} numericCols=${j(numericCols)} → componentCols=${j(compCols)}`);
    return { headers, rows, idCol, totalCol, compCols };
  } catch (e) { console.log(`  ERROR: ${e instanceof Error ? e.message : String(e)}`); return null; }
}

// -------- C. BCL deep-dive + cross-check --------
async function bclDeepDive(file: FileShape | null) {
  console.log('\n=== C. BCL (Banco Cumbre del Litoral) VL-side + cross-check ===');
  const bcl = await tenantId('Cumbre');
  console.log(`  BCL tenant_id: ${bcl}`);
  if (!bcl) return;

  // C1. rule_set raw components shape (why did the survey see 0?)
  const { data: rs } = await sb.from('rule_sets').select('id, name, components').eq('tenant_id', bcl).eq('status', 'active').limit(3);
  for (const r of (rs ?? [])) {
    const c = (r as any).components;
    console.log(`  rule_set ${short((r as any).id)} "${(r as any).name}" components typeof=${Array.isArray(c) ? 'array' : typeof c} len=${Array.isArray(c) ? c.length : (c && typeof c === 'object' ? Object.keys(c).length : 'n/a')}`);
    console.log(`     raw(360): ${j(c, 360)}`);
  }

  // C2. calc_results for BCL — components population, names, batch ids
  const { data: cr, error: crErr } = await sb.from('calculation_results').select('entity_id, batch_id, total_payout, components').eq('tenant_id', bcl).limit(300);
  if (crErr) { console.log(`  calc_results error: ${crErr.message}`); return; }
  const byBatch = new Map<string, number>();
  let withComps = 0; const compNames = new Set<string>(); let sampleCalc: any = null;
  const calcByEntity = new Map<string, { total: number; comps: Array<{ id?: string; name?: string; value?: number }> }>();
  for (const r of (cr ?? [])) {
    byBatch.set((r as any).batch_id, (byBatch.get((r as any).batch_id) ?? 0) + 1);
    const comps = (Array.isArray((r as any).components) ? (r as any).components : []).map((c: any) => ({ id: c?.componentId ?? c?.id, name: c?.name ?? c?.componentName ?? c?.label, value: c?.outputValue ?? c?.payout ?? c?.value }));
    if (comps.length) { withComps++; comps.forEach((c: any) => c.name && compNames.add(String(c.name))); if (!sampleCalc) sampleCalc = { entity_id: (r as any).entity_id, total: (r as any).total_payout, comps }; }
    calcByEntity.set((r as any).entity_id, { total: Number((r as any).total_payout), comps });
  }
  console.log(`  calc_results sampled: ${cr?.length} · withComponents=${withComps} · batches=${j(Array.from(byBatch.entries()).map(([b, n]) => `${short(b)}:${n}`))}`);
  console.log(`  VL component names: ${j(Array.from(compNames))}`);
  if (sampleCalc) console.log(`  sample calc row: entity=${short(sampleCalc.entity_id)} total=${sampleCalc.total} comps=${j(sampleCalc.comps, 400)}`);

  // C3. entities external_id map (file uses external ids; calc uses uuid entity_id)
  const { data: ents } = await sb.from('entities').select('id, external_id, display_name').eq('tenant_id', bcl).limit(1000);
  const extByUuid = new Map<string, string>(); const uuidByExt = new Map<string, string>();
  (ents ?? []).forEach((e: any) => { if (e.external_id != null) { extByUuid.set(e.id, String(e.external_id)); uuidByExt.set(String(e.external_id), e.id); } });
  console.log(`  entities: ${ents?.length} · sample external_ids: ${j((ents ?? []).slice(0, 6).map((e: any) => e.external_id))}`);

  // C4. CROSS-CHECK file ↔ calc
  if (!file || !file.idCol) { console.log('  cross-check: SKIPPED (no file/idCol)'); return; }
  const fileIds = file.rows.map((r) => String(r[file.idCol!]).trim()).filter(Boolean);
  console.log(`  file entity-id sample: ${j(fileIds.slice(0, 6))}`);
  const overlapExt = fileIds.filter((id) => uuidByExt.has(id));
  console.log(`  → entity-id OVERLAP (file ↔ BCL external_id): ${overlapExt.length}/${fileIds.length}`);
  console.log(`  → file componentCols=${j(file.compCols)} vs VL component names=${j(Array.from(compNames))}`);
  // value-delta spot check for up to 5 overlapping entities (REAL existing values, no fabrication)
  let shown = 0;
  for (const ext of overlapExt) {
    if (shown >= 5) break;
    const calc = calcByEntity.get(uuidByExt.get(ext)!); if (!calc) continue;
    const frow = file.rows.find((r) => String(r[file.idCol!]).trim() === ext)!;
    const fileTotal = file.totalCol ? num(frow[file.totalCol]) : null;
    console.log(`    [${ext}] fileTotal=${fileTotal} vlTotal=${calc.total} totalDelta=${fileTotal != null ? (fileTotal - calc.total).toFixed(2) : 'n/a'}`);
    for (const cc of file.compCols) console.log(`        comp "${cc}": fileVal=${num(frow[cc])}  vlComps=${j(calc.comps.map((c) => `${c.name}=${c.value}`))}`);
    shown++;
  }
  if (overlapExt.length === 0) console.log('    (no overlapping entities → component spot-check not possible)');
}

// -------- D. Meridian context (5 components; meridian-detail.csv is VL output) --------
async function meridianContext() {
  console.log('\n=== D. Meridian context ===');
  const mer = await tenantId('Meridian');
  console.log(`  Meridian tenant_id: ${mer}`);
  if (!mer) return;
  const { data: cr } = await sb.from('calculation_results').select('entity_id, batch_id, total_payout, components').eq('tenant_id', mer).limit(50);
  let withComps = 0; const names = new Set<string>(); let sample: any = null;
  for (const r of (cr ?? [])) { const comps = Array.isArray((r as any).components) ? (r as any).components : []; if (comps.length) { withComps++; comps.forEach((c: any) => names.add(String(c?.name ?? c?.componentName ?? c?.label))); if (!sample) sample = { e: short((r as any).entity_id), t: (r as any).total_payout, c: comps.length }; } }
  console.log(`  calc_results sampled=${cr?.length} withComponents=${withComps} compNames=${j(Array.from(names))} sample=${j(sample)}`);
  console.log(`  NOTE: scripts/output/hf222-phase64-meridian-detail.csv has C1..C5 cols but is a VL OUTPUT dump → self-reconcile = zero deltas (not a real expected file).`);
}

async function main() {
  console.log('================ OB-212 PREREQ-2 CROSS-CHECK (read-only) ================');
  await batchesProbe();
  const file = await readClt14b();
  await bclDeepDive(file);
  await meridianContext();
  console.log('\n================ END CROSS-CHECK ================');
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
