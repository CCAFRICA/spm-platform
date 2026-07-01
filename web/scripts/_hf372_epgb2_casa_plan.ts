// HF-372 Phase B / EPG-B2 — LIVE plan interpretation of one Casa Diaz rate-bearing sheet
// (LOCALES REFAC: per-row "% AUTORIZADO" rates — NOT a fixed grid; the recognition mode must
// correctly not fire, and references must bind verbatim column headers per OB-256 W-1).
//   from web/:  npx tsx scripts/_hf372_epgb2_casa_plan.ts [reset]
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { executeBatchedPlanInterpretation } from '../src/lib/sci/plan-interpretation';
import type { ContentUnitExecution } from '../src/lib/sci/sci-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CASA = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';
const LOCAL_FILE = '/Users/AndrewAfrica/Desktop/ViaLuce AI/2026 Customer Data/Casa Diaz/wetransfer_ventas-demo_2026-06-26_2117/COMISIONES % AUTORIZADOS - copia.xlsx';
const STORAGE_PATH = `${CASA}/hf372-epgb2/COMISIONES_AUTORIZADOS_copia.xlsx`;

function refsAndConstants(node: unknown, refs: Set<string>, consts: number[]): void {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  if (n.prime === 'reference' && typeof n.field === 'string') refs.add(n.field);
  if (n.prime === 'constant' && typeof n.value === 'number' && !n.meta) consts.push(n.value);
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) v.forEach(x => refsAndConstants(x, refs, consts));
    else if (v && typeof v === 'object') refsAndConstants(v, refs, consts);
  }
}

async function main() {
  if (process.argv[2] === 'reset') {
    const { data: runs } = await sb.from('plan_interpretation_runs').delete().eq('tenant_id', CASA).select('content_hash');
    const { data: rs } = await sb.from('rule_sets').delete().eq('tenant_id', CASA).select('id');
    console.log(`reset: deleted ${runs?.length ?? 0} runs, ${rs?.length ?? 0} rule_sets`);
    return;
  }
  // ensure the workbook is in storage (upload once)
  const { data: existing } = await sb.storage.from('ingestion-raw').list(`${CASA}/hf372-epgb2`);
  if (!existing?.some((f: { name: string }) => f.name === 'COMISIONES_AUTORIZADOS_copia.xlsx')) {
    const { error } = await sb.storage.from('ingestion-raw').upload(STORAGE_PATH, readFileSync(LOCAL_FILE), { upsert: true });
    console.log(`upload: ${error ? 'ERR ' + error.message : 'ok'}`);
  }
  const { data: profs } = await sb.from('profiles').select('id').limit(1);
  const planUnits = [{
    contentUnitId: 'COMISIONES_AUTORIZADOS_copia.xlsx::LOCALES REFAC::split-plan',
    confirmedClassification: 'plan',
    confirmedBindings: [],
    rawData: [],
    tabName: 'LOCALES REFAC',
  }] as unknown as ContentUnitExecution[];

  const t0 = Date.now();
  const results = await executeBatchedPlanInterpretation(sb, CASA, planUnits, profs?.[0]?.id, STORAGE_PATH);
  console.log(`TOTAL wall time: ${Date.now() - t0}ms`);
  for (const r of results) console.log(`  result: success=${r.success} err=${String(r.error ?? '').slice(0, 200)}`);

  const { data: rsets } = await sb.from('rule_sets').select('name, components, created_at').eq('tenant_id', CASA).eq('status', 'active').order('created_at', { ascending: false }).limit(3);
  for (const rs of rsets ?? []) {
    console.log(`\n=== rule_set "${rs.name}" ===`);
    for (const v of rs.components?.variants ?? []) {
      for (const c of v.components ?? []) {
        const refs = new Set<string>(); const consts: number[] = [];
        refsAndConstants(c.calculationIntent ?? c.metadata?.intent, refs, consts);
        const cm = c.metadata?.construction_method;
        console.log(`  [${v.variantName ?? v.variantId}] "${c.name}" method=${cm ?? '?'}`);
        console.log(`    references: ${[...refs].map(f => JSON.stringify(f)).join(', ')}`);
        console.log(`    plain constants (${consts.length}): ${consts.slice(0, 12).join(', ')}${consts.length > 12 ? '…' : ''}`);
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
