// DIAG-054 Probe 5: evaluate() trace for BCL-5003 components.

import { createClient } from '@supabase/supabase-js';
import { evaluate, buildEvalContext, type EntityData } from '../src/lib/calculation/intent-executor';
import { componentIntentToDAG } from '../src/lib/calculation/legacy-intent-to-dag';
import { toNumber } from '../src/lib/calculation/decimal-precision';
import type { ComponentIntent } from '../src/lib/calculation/intent-types';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

// Verbose trace: walk the DAG and print each node's evaluation result
function verboseEval(node: unknown, ctx: { metrics: Record<string, number> }, depth = 0): number {
  if (!node || typeof node !== 'object') return 0;
  const n = node as Record<string, unknown>;
  const pad = '  '.repeat(depth);
  if (n.prime === 'constant') {
    const v = Number(n.value);
    console.log(`${pad}constant(${v}) → ${v}`);
    return v;
  }
  if (n.prime === 'reference') {
    const v = ctx.metrics[String(n.field)] ?? 0;
    console.log(`${pad}reference(${n.field}) → ${v}`);
    return v;
  }
  if (n.prime === 'arithmetic') {
    const a = verboseEval((n.inputs as unknown[])[0], ctx, depth + 1);
    const b = verboseEval((n.inputs as unknown[])[1], ctx, depth + 1);
    let v = 0;
    switch (n.op) {
      case 'add': v = a + b; break;
      case 'subtract': v = a - b; break;
      case 'multiply': v = a * b; break;
      case 'divide': v = b === 0 ? 0 : a / b; break;
    }
    console.log(`${pad}arithmetic(${n.op}) ${a} ⊕ ${b} → ${v}`);
    return v;
  }
  if (n.prime === 'compare') {
    const a = verboseEval((n.inputs as unknown[])[0], ctx, depth + 1);
    const b = verboseEval((n.inputs as unknown[])[1], ctx, depth + 1);
    let r = false;
    switch (n.op) {
      case 'gt': r = a > b; break;
      case 'gte': r = a >= b; break;
      case 'lt': r = a < b; break;
      case 'lte': r = a <= b; break;
      case 'eq': r = a === b; break;
      case 'neq': r = a !== b; break;
    }
    console.log(`${pad}compare(${n.op}) ${a} ${n.op} ${b} → ${r ? 1 : 0}`);
    return r ? 1 : 0;
  }
  if (n.prime === 'logical') {
    const inputs = (n.inputs as unknown[]).map((c, i) => {
      console.log(`${pad}logical(${n.op}) input ${i}:`);
      return verboseEval(c, ctx, depth + 1);
    });
    let r = false;
    if (n.op === 'and') r = inputs.every(v => v > 0);
    else if (n.op === 'or') r = inputs.some(v => v > 0);
    else if (n.op === 'not') r = inputs[0] === 0;
    console.log(`${pad}logical(${n.op}) → ${r ? 1 : 0}`);
    return r ? 1 : 0;
  }
  if (n.prime === 'conditional') {
    console.log(`${pad}conditional — evaluating condition:`);
    const cond = verboseEval(n.condition, ctx, depth + 1);
    if (cond > 0) {
      console.log(`${pad}conditional → THEN branch:`);
      return verboseEval(n.then, ctx, depth + 1);
    } else {
      console.log(`${pad}conditional → ELSE branch:`);
      return verboseEval(n.else, ctx, depth + 1);
    }
  }
  console.log(`${pad}<unhandled prime=${n.prime}>`);
  return 0;
}

(async () => {
  const { data: allRs } = await sb
    .from('rule_sets')
    .select('id, components, input_bindings, updated_at')
    .eq('tenant_id', BCL)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });
  const rs = allRs![0];

  // Metrics from Probe 4 (hand-resolved for BCL-5003)
  const bcl5003Metrics: Record<string, number> = {
    cumplimiento_colocacion: 1.1354,
    calidad_cartera: 0.9412,
    cumplimiento_depositos: 1.282,
    productos_cruzados_vendidos: 10,
    infracciones_regulatorias: 0,
  };

  console.log('=== DIAG-054 Probe 5: evaluate() trace for BCL-5003 (Gabriela, Senior Exec, October) ===');
  console.log(`Metrics: ${JSON.stringify(bcl5003Metrics)}\n`);

  // Flatten components (Senior Executive variant only — indices 0-3)
  const comps = rs.components as Record<string, unknown>;
  const variant0 = (comps.variants as Array<Record<string, unknown>>)[0];
  const seniorComps = (variant0.components as Array<Record<string, unknown>>);

  for (let i = 0; i < seniorComps.length; i++) {
    const c = seniorComps[i];
    console.log(`\n──────────── Component ${i}: "${c.name}" ────────────`);
    const ci = c.calculationIntent as ComponentIntent | undefined;
    if (!ci) { console.log('  no intent'); continue; }

    // Engine path: evaluate via componentIntentToDAG → evaluate()
    const wrapper: ComponentIntent = {
      componentIndex: i,
      label: String(c.name),
      confidence: 1,
      dataSource: { sheetClassification: '', entityScope: 'entity', requiredMetrics: [] },
      intent: ci as ComponentIntent['intent'],
      modifiers: [],
      metadata: {},
    };
    const entityData: EntityData = {
      entityId: 'BCL-5003',
      metrics: bcl5003Metrics,
      attributes: {},
    };
    const ctx = buildEvalContext(entityData);

    try {
      const { dag } = componentIntentToDAG(wrapper);
      const engineResult = toNumber(evaluate(dag, ctx));
      console.log(`  ENGINE evaluate() result: ${engineResult}`);
    } catch (err) {
      console.log(`  ENGINE evaluate() FAILED: ${(err as Error).message}`);
    }

    // Verbose walk for transparency
    console.log(`  VERBOSE trace:`);
    const verboseResult = verboseEval(ci, { metrics: bcl5003Metrics }, 1);
    console.log(`  VERBOSE final: ${verboseResult}`);
  }
})();
