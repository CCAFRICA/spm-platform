/**
 * HF-341 R7 — A2 live demonstration on MIR Plan 1. Converges Plan 1 (applies the
 * A1/C1 literal reconciliation), then folds the accelerator as a ×multiplier into
 * the commission DAG (A2) and evaluates the COMPOSED DAG over each seller's real
 * June Ventas — showing commission × accelerator (the corrected Plan 1), vs the
 * pre-fix additive form (commission + ~1.0 factor → grand≈68). The folded subtrees
 * are MIR's own recognized DAGs; the multiply relationship is the plan's stated
 * "volume accelerator multiplier" — a derivation from carried reality, not fabrication.
 * Run: cd web && npx tsx scripts/_hf341r7_a2_proof.ts
 */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { convergeBindings } from '@/lib/intelligence/convergence-service';
import { foldComposedModifiers, type InterpretedComponent } from '@/lib/compensation/ai-plan-interpreter';
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

async function main() {
  const plans = await fetchAll('rule_sets', 'id, name');
  const plan1 = plans.find(p => /COMISIONES/i.test(String(p.name)))!;
  const conv = await convergeBindings(MIR, String(plan1.id), sb);
  const root = (conv.correctedComponents ?? null) as Any;
  if (!root) { console.log('No corrected components (reconciliation produced no change?) — aborting'); return; }
  const comps = ((root.variants as Any[])?.[0]?.components as Any[]) ?? (root.components as Any[]);
  const commission = comps[0], accelerator = comps[1];
  console.log(`commission id=${commission.id}  accelerator id=${accelerator.id}`);

  // build InterpretedComponents and fold the accelerator as a ×multiplier into the commission
  const mk = (c: Any, composesInto?: { target: string; operator: 'multiply' }): InterpretedComponent => ({
    id: String(c.id), name: String(c.name), type: 'prime_dag' as InterpretedComponent['type'],
    appliesToEmployeeTypes: ['all'], calculationMethod: { type: 'prime_dag' } as InterpretedComponent['calculationMethod'],
    calculationIntent: c.calculationIntent as Any, confidence: 0.9, reasoning: '', composesInto,
  });
  const folded = foldComposedModifiers([mk(commission), mk(accelerator, { target: String(commission.id), operator: 'multiply' })]);
  console.log(`\nfoldComposedModifiers: ${folded.length} component (was 2) — composed DAG prime=${(folded[0].calculationIntent as Any).prime}/${(folded[0].calculationIntent as Any).op}`);
  const foldedDag = folded[0].calculationIntent as PrimeNode;

  // evaluate the composed DAG per seller over June Ventas (inject metrics.Monto_Total = total sales,
  // exactly as the engine's convergence binding resolves the accelerator's entity-level reference)
  const cd = await fetchAll('committed_data', 'entity_id, row_data, source_date');
  const ventas = cd.filter(r => { const rd = r.row_data as Any; return rd && 'Monto_Total' in rd && 'Categoria' in rd && String(r.source_date).slice(0, 7) === '2025-06'; });
  const byEnt = new Map<string, Any[]>(); for (const r of ventas) { const e = String(r.entity_id); (byEnt.get(e) ?? byEnt.set(e, []).get(e)!).push(r); }

  let grandMultiply = 0, grandAdditive = 0, accelerated = 0;
  const commDag = commission.calculationIntent as PrimeNode;
  for (const [, rows] of byEnt) {
    const rowData = rows.map(r => r.row_data as Any);
    const totalSales = rowData.reduce((s, r) => s + (Number(r.Monto_Total) || 0), 0);
    const ctx = (m: Any): EvalContext => ({ entity: { metadata: {} }, activeRows: rowData, allEntityRows: rowData, metrics: m, priorPeriodRows: [] } as unknown as EvalContext);
    const composed = evaluate(foldedDag, ctx({ Monto_Total: totalSales })).toNumber();
    const base = evaluate(commDag, ctx({ Monto_Total: totalSales })).toNumber();
    const factor = totalSales >= 150000 ? 1.25 : 1;
    if (factor > 1) accelerated++;
    grandMultiply += composed;
    grandAdditive += base + factor; // the pre-fix additive form
  }
  console.log(`\n=== MIR Plan 1 (Comisiones) — June 2025, ${byEnt.size} sellers ===`);
  console.log(`  A2-CORRECT (commission × accelerator):  grandTotal = ${grandMultiply.toFixed(2)}  (${accelerated} sellers accelerated ×1.25)`);
  console.log(`  pre-fix ADDITIVE (commission + factor): grandTotal = ${grandAdditive.toFixed(2)}  ← the ~68 defect class (factor added, not multiplied)`);
  console.log(`  (architect reconciles the absolute figure against GT; this shows the multiply composition is now live in the DAG.)`);
}
main().catch(e => { console.error(e); process.exit(1); });
