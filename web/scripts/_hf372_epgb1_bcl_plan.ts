// HF-372 Phase B / EPG-B1 — LIVE plan interpretation of the real BCL plan workbook through the
// REAL pipeline entry (executeBatchedPlanInterpretation), with the deterministic rate-matrix
// constructor active. Prints the produced components' cell values verbatim against the de-banded
// grid, and the construction latency log lines. Run twice for the determinism gate ('reset' arg
// clears the idempotency claim + created rule_sets between runs).
//   from web/:  npx tsx scripts/_hf372_epgb1_bcl_plan.ts [reset]
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { executeBatchedPlanInterpretation } from '../src/lib/sci/plan-interpretation';
import { debandWorksheet } from '../src/lib/sci/deband-sheet';
import type { ContentUnitExecution } from '../src/lib/sci/sci-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';
const SHEETS = ['Plan General', 'Tablas de Tasas', 'Metas Mensuales'];

function collectConstants(node: unknown, out: number[]): void {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  if (n.prime === 'constant' && typeof n.value === 'number' && !n.meta) out.push(n.value);
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) v.forEach(x => collectConstants(x, out));
    else if (v && typeof v === 'object') collectConstants(v, out);
  }
}

async function main() {
  const reset = process.argv[2] === 'reset';
  if (reset) {
    const { data: runs } = await sb.from('plan_interpretation_runs').delete().eq('tenant_id', VLTEST2).select('content_hash');
    const { data: rs } = await sb.from('rule_sets').delete().eq('tenant_id', VLTEST2).select('id, name');
    console.log(`reset: deleted ${runs?.length ?? 0} interpretation runs, ${rs?.length ?? 0} rule_sets`);
    return;
  }

  // the real uploaded plan file (from today's imports)
  const { data: jobs } = await sb.from('processing_jobs')
    .select('file_name, file_storage_path, created_at')
    .eq('tenant_id', VLTEST2).ilike('file_name', '%Plan_Comisiones%')
    .order('created_at', { ascending: false }).limit(1);
  const storagePath = jobs?.[0]?.file_storage_path as string;
  if (!storagePath) { console.log('no BCL plan job found'); return; }
  console.log(`storagePath: ${storagePath}`);

  // a real user id for created_by
  const { data: profs } = await sb.from('profiles').select('id').limit(1);
  const userId = profs?.[0]?.id as string;

  const planUnits = SHEETS.map(s => ({
    contentUnitId: `BCL_Plan_Comisiones_2025.xlsx::${s}::split-plan`,
    confirmedClassification: 'plan',
    confirmedBindings: [],
    rawData: [],
    tabName: s,
  })) as unknown as ContentUnitExecution[];

  const t0 = Date.now();
  const results = await executeBatchedPlanInterpretation(sb, VLTEST2, planUnits, userId, storagePath);
  console.log(`\nTOTAL wall time: ${Date.now() - t0}ms`);
  for (const r of results) console.log(`  result: ${r.contentUnitId} success=${r.success} err=${r.error ?? ''}`);

  // the persisted rule_set(s): components + their cell constants
  const { data: rsets } = await sb.from('rule_sets').select('id, name, status, components, metadata, created_at')
    .eq('tenant_id', VLTEST2).eq('status', 'active').order('created_at', { ascending: false });
  console.log(`\nactive rule_sets: ${rsets?.length ?? 0}`);
  for (const rs of rsets ?? []) {
    console.log(`\n=== rule_set "${rs.name}" ===`);
    for (const v of rs.components?.variants ?? []) {
      for (const c of v.components ?? []) {
        const cells: number[] = [];
        collectConstants(c.calculationIntent ?? c.metadata?.intent, cells);
        const cm = c.metadata?.construction_method ?? c.metadata?.metadataExtension?.construction_method;
        console.log(`  [${v.variantName ?? v.variantId}] "${c.name}" method=${cm ?? '?'} rate_matrix=${JSON.stringify(c.metadata?.rate_matrix ?? null)}`);
        console.log(`    cell constants (${cells.length}): ${cells.join(', ')}`);
      }
    }
  }

  // the de-banded grid for Tablas de Tasas — the verbatim source of truth to diff against
  const { data: blob } = await sb.storage.from('ingestion-raw').download(storagePath);
  const wb = XLSX.read(Buffer.from(await blob!.arrayBuffer()), { type: 'buffer', dense: true });
  const db = debandWorksheet(XLSX, wb.Sheets['Tablas de Tasas'], 'Tablas de Tasas');
  console.log(`\n=== de-banded grid: Tablas de Tasas (${db.rows.length} rows) ===`);
  console.log(db.columns.join(' | '));
  for (const r of db.rows) console.log(db.columns.map(c => String((r as Record<string, unknown>)[c] ?? '')).join(' | '));
}

main().catch(e => { console.error(e); process.exit(1); });
