/**
 * HF-341 R7 — A1/C1 live proof. Runs the REAL convergence (incl. the new literal-
 * domain reconciliation + real LLM) on MIR Plan 1 (Comisiones) and Plan 4 (Cartera
 * Nueva), shows the DAG literals reconciled to the data domain ('ALI'→'Alimentos',
 * 'Si'→'Sí'), then EVALUATES the corrected DAGs over real committed_data to show the
 * components produce NON-ZERO (vs the pre-fix silent $0). Read-only on rule_sets.
 * Run: cd web && npx tsx scripts/_hf341r7_a1c1_proof.ts
 */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { convergeBindings } from '@/lib/intelligence/convergence-service';
import { evaluate } from '@/lib/calculation/intent-executor';
import type { EvalContext, PrimeNode } from '@/lib/calculation/intent-types';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MIR = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';
type Any = Record<string, unknown>;

async function fetchAll(t: string, s: string): Promise<Any[]> {
  const o: Any[] = []; let f = 0;
  for (;;) { const { data, error } = await sb.from(t).select(s).eq('tenant_id', MIR).range(f, f + 999);
    if (error) { console.error(error.message); break; } if (!data?.length) break; o.push(...(data as Any[])); if (data.length < 1000) break; f += 1000; }
  return o;
}
const ctx = (rows: Any[]): EvalContext => ({ entity: { metadata: {} }, activeRows: rows, allEntityRows: rows, metrics: {}, priorPeriodRows: [] } as unknown as EvalContext);

function firstComponentDag(corrected: unknown): PrimeNode | null {
  const root = corrected as Any; const variants = (root?.variants as Any[]) ?? [root];
  for (const v of variants) for (const c of (v.components as Any[]) ?? []) if (c.calculationIntent) return c.calculationIntent as PrimeNode;
  return null;
}

async function main() {
  const plans = await fetchAll('rule_sets', 'id, name');
  const plan1 = plans.find(p => /COMISIONES/i.test(String(p.name)))!;
  const plan4 = plans.find(p => /Cartera Nueva/i.test(String(p.name)))!;
  const cd = await fetchAll('committed_data', 'entity_id, data_type, row_data, source_date');

  // ── Plan 1 (Comisiones): converge → reconcile → evaluate component_0 over one entity's June Ventas ──
  console.log(`\n══════ PLAN 1: ${plan1.name} ══════`);
  const c1 = await convergeBindings(MIR, String(plan1.id), sb);
  console.log('literalRewrites:', JSON.stringify(c1.literalRewrites));
  console.log('literalFailures:', JSON.stringify(c1.literalFailures?.map(f => f.value)));
  const dag1 = firstComponentDag(c1.correctedComponents ?? null);
  // one entity's June ventas rows
  const ventas = cd.filter(r => { const rd = r.row_data as Any; return rd && 'Monto_Total' in rd && 'Categoria' in rd && String(r.source_date).slice(0, 7) === '2025-06'; });
  const byEnt = new Map<string, Any[]>(); for (const r of ventas) { const e = String(r.entity_id); (byEnt.get(e) ?? byEnt.set(e, []).get(e)!).push(r); }
  const [ent, rows] = [...byEnt][0];
  if (dag1) {
    const val = evaluate(dag1, ctx(rows.map(r => r.row_data as Any))).toNumber();
    console.log(`  component_0 (corrected DAG) over entity ${ent} June (${rows.length} rows) = ${val.toFixed(2)}  ${val > 0 ? '✓ NON-ZERO (was $0 with ALI/BEB/LIM/CPE)' : '✗ STILL ZERO'}`);
  } else console.log('  (no corrected DAG — reconciliation produced no change?)');

  // ── Plan 4 (Cartera Nueva): converge → reconcile → evaluate over one entity's Clientes_Nuevos ──
  console.log(`\n══════ PLAN 4: ${plan4.name} ══════`);
  const c4 = await convergeBindings(MIR, String(plan4.id), sb);
  console.log('literalRewrites:', JSON.stringify(c4.literalRewrites));
  console.log('literalFailures:', JSON.stringify(c4.literalFailures?.map(f => f.value)));
  const dag4 = firstComponentDag(c4.correctedComponents ?? null);
  const cartera = cd.filter(r => { const rd = r.row_data as Any; return rd && 'Verificado' in rd; });
  const byEnt4 = new Map<string, Any[]>(); for (const r of cartera) { const e = String(r.entity_id); (byEnt4.get(e) ?? byEnt4.set(e, []).get(e)!).push(r); }
  const [ent4, rows4] = [...byEnt4][0];
  if (dag4) {
    const val = evaluate(dag4, ctx(rows4.map(r => r.row_data as Any))).toNumber();
    const siCount = rows4.filter(r => (r.row_data as Any).Verificado === 'Sí').length;
    console.log(`  component_0 (corrected DAG) over entity ${ent4} (${rows4.length} rows, ${siCount} 'Sí') = ${val.toFixed(2)}  ${val > 0 ? `✓ NON-ZERO (= ${siCount}×150, was $0 with 'Si')` : '✗ STILL ZERO'}`);
  } else console.log('  (no corrected DAG)');
}
main().catch(e => { console.error(e); process.exit(1); });
