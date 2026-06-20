#!/usr/bin/env npx tsx
/**
 * OB-225 Phase 2 verification.
 *  (A) Construct + EVALUATE the new filter shapes (P4 filtered count, P1 categorized rates +
 *      accelerator) against synthetic rows — proves the filter→aggregate path end-to-end.
 *  (B) DAG-EQUIVALENCE regression (HALT-REGRESSION): constructTree(stored compositional_intent)
 *      must reproduce the stored calculationIntent byte-identical for BCL + Meridian (they use
 *      only pre-existing shapes; the additive filter/categorized cases cannot alter them).
 *
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob-225-construct-verify.ts
 */
import { createClient } from '@supabase/supabase-js';
import { constructTree } from '@/lib/plan-intelligence/intent-constructor';
import type { CompositionalIntent } from '@/lib/plan-intelligence/compositional-intent';
import { evaluate, buildEvalContext } from '@/lib/calculation/intent-executor';
import { validatePrimeTree } from '@/lib/calculation/prime-grammar';
import type { PrimeNode } from '@/lib/calculation/intent-types';

const criticalViolations = (dag: PrimeNode): string[] =>
  validatePrimeTree(dag).violations.filter(v => v.severity === 'critical').map(v => `${v.check}@${v.nodePath}: ${v.message}`);

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const MERIDIAN = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

const pass: string[] = []; const fail: string[] = [];
const ok = (c: boolean, m: string) => (c ? pass : fail).push(m);

const evalRows = (dag: PrimeNode, rows: Record<string, unknown>[]): number =>
  evaluate(dag, buildEvalContext({ entityId: 'e1', metrics: {}, attributes: {}, activeRows: rows })).toNumber();

// deep canonical stringify (sort object keys; arrays keep order) for DAG comparison
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.keys(o).sort().reduce((acc, k) => { acc[k] = canon(o[k]); return acc; }, {} as Record<string, unknown>);
  }
  return v;
}
const eq = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

function findNode(n: PrimeNode | undefined, pred: (x: PrimeNode) => boolean): PrimeNode | null {
  if (!n || typeof n !== 'object') return null;
  if (pred(n)) return n;
  for (const v of Object.values(n as Record<string, unknown>)) {
    if (Array.isArray(v)) { for (const c of v) { const r = findNode(c as PrimeNode, pred); if (r) return r; } }
    else if (v && typeof v === 'object') { const r = findNode(v as PrimeNode, pred); if (r) return r; }
  }
  return null;
}

async function main() {
  // ───────── (A1) P4 — filtered count × constant ─────────
  const p4: CompositionalIntent = {
    component_id: 'p4', component_name: 'cliente nuevo verificado', output_precision: 0, scale: null,
    structure: { shape: 'arithmetic', operation: 'multiply', operands: [
      { kind: 'reference', source: { type: 'filtered_aggregate', op: 'count', predicate: { field: 'Verificado', operator: 'eq', value: 'Si' } } },
      { kind: 'constant', value: 150 },
    ] },
  };
  const p4dag = constructTree(p4);
  const p4filter = findNode(p4dag, n => (n as { prime?: string }).prime === 'filter');
  ok(!!p4filter, `P4 DAG contains a filter node: ${p4filter ? JSON.stringify((p4filter as { predicate?: unknown }).predicate) : 'MISSING'}`);
  const p4rows = [{ Verificado: 'Si' }, { Verificado: 'Si' }, { Verificado: 'No' }, { Verificado: 'Si' }, { Verificado: '' }];
  const p4val = evalRows(p4dag, p4rows);
  ok(p4val === 450, `P4 eval: 3×'Si' × 150 = 450 (got ${p4val})`);
  const p4viol = criticalViolations(p4dag);
  ok(p4viol.length === 0, `P4 DAG passes validatePrimeTree (no critical violations)${p4viol.length ? ' — ' + p4viol.join('; ') : ''}`);

  // ───────── (A2) P1 — categorized per-row rates ─────────
  const categories = [{ value: 'ALI', rate: 0.025 }, { value: 'BEB', rate: 0.020 }, { value: 'LIM', rate: 0.030 }, { value: 'CPE', rate: 0.035 }];
  const p1cat: CompositionalIntent = {
    component_id: 'p1', component_name: 'category commission', output_precision: 2, scale: null,
    structure: { shape: 'categorized', category_field: 'Categoria', measure_field: 'Monto_Total', op: 'sum', categories },
  };
  const p1dag = constructTree(p1cat);
  const rows = [
    { Categoria: 'ALI', Monto_Total: 1000 }, { Categoria: 'BEB', Monto_Total: 2000 },
    { Categoria: 'LIM', Monto_Total: 500 }, { Categoria: 'CPE', Monto_Total: 100 },
    { Categoria: 'ALI', Monto_Total: 1000 },
  ];
  // ALI 2000×.025=50, BEB 2000×.020=40, LIM 500×.030=15, CPE 100×.035=3.5 → 108.5
  const p1val = evalRows(p1dag, rows);
  ok(Math.abs(p1val - 108.5) < 1e-9, `P1 categorized eval = 108.5 (got ${p1val})`);
  const p1viol = criticalViolations(p1dag);
  ok(p1viol.length === 0, `P1 categorized DAG passes validatePrimeTree${p1viol.length ? ' — ' + p1viol.join('; ') : ''}`);

  // ───────── (A3) P1 — categorized wrapped in volume accelerator ─────────
  const p1full: CompositionalIntent = {
    component_id: 'p1a', component_name: 'category commission + accelerator', output_precision: 2, scale: null,
    structure: { shape: 'conditional',
      condition: { reference: { type: 'aggregate', field: 'Monto_Total', op: 'sum' }, operator: 'gte', threshold: 150000 },
      then: { shape: 'arithmetic', operation: 'multiply', operands: [ { kind: 'structure', structure: { shape: 'categorized', category_field: 'Categoria', measure_field: 'Monto_Total', op: 'sum', categories } }, { kind: 'constant', value: 1.25 } ] },
      else: { shape: 'categorized', category_field: 'Categoria', measure_field: 'Monto_Total', op: 'sum', categories },
    },
  };
  const p1fdag = constructTree(p1full);
  const lowVol = evalRows(p1fdag, rows); // sum 4600 < 150000 → else → 108.5
  ok(Math.abs(lowVol - 108.5) < 1e-9, `P1 accelerator OFF (sum<150k) = 108.5 (got ${lowVol})`);
  const hiRows = [{ Categoria: 'ALI', Monto_Total: 100000 }, { Categoria: 'BEB', Monto_Total: 60000 }]; // sum 160000 >= 150000
  // categorized = 100000×.025 + 60000×.020 = 2500+1200 = 3700; ×1.25 = 4625
  const hiVol = evalRows(p1fdag, hiRows);
  ok(Math.abs(hiVol - 4625) < 1e-9, `P1 accelerator ON (sum>=150k) = 3700×1.25 = 4625 (got ${hiVol})`);

  // ───────── (B) DAG-equivalence regression: BCL + Meridian ─────────
  for (const [name, tenant] of [['BCL', BCL], ['Meridian', MERIDIAN]] as const) {
    const { data: rs } = await sb.from('rule_sets').select('name, components').eq('tenant_id', tenant).eq('status', 'active');
    let comps = 0, matched = 0; const diffs: string[] = [];
    for (const r of rs ?? []) {
      const variants = ((r.components as { variants?: unknown[] } | null)?.variants ?? []) as Array<{ components?: unknown[] }>;
      for (const v of variants) {
        for (const c of (v.components ?? []) as Array<Record<string, unknown>>) {
          const ci = (c.metadata as { compositional_intent?: CompositionalIntent } | undefined)?.compositional_intent;
          const stored = c.calculationIntent as PrimeNode | undefined;
          if (!ci || !stored) continue;
          comps++;
          let built: PrimeNode | null = null;
          try { built = constructTree(JSON.parse(JSON.stringify(ci))); } catch (e) { diffs.push(`${(r.name as string)}/${c.componentId}: constructTree threw ${e instanceof Error ? e.message : e}`); continue; }
          if (eq(built, stored)) matched++;
          else diffs.push(`${(r.name as string)}/${c.componentId}: DAG differs`);
        }
      }
    }
    ok(comps > 0 && matched === comps, `${name} DAG-equivalence: ${matched}/${comps} components byte-identical${diffs.length ? ' — ' + diffs.join('; ') : ''}`);
  }

  console.log('\n===== OB-225 Phase 2 verification =====');
  for (const p of pass) console.log('  ✅', p);
  for (const f of fail) console.log('  ❌', f);
  console.log(`\n${pass.length} passed, ${fail.length} failed`);
  if (fail.some(f => f.includes('DAG-equivalence'))) console.log('\n⚠️  HALT-REGRESSION: a BCL/Meridian DAG diverged — investigate before proceeding.');
  process.exit(fail.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
