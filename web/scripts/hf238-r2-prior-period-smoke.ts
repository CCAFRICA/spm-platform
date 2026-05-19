// HF-238 R2 Closure 5 — synthetic prior_period prime smoke test.
//
// Exercises the new delta-via-DAG path with hand-built EvalContext rows so
// the prior_period prime narrows activeRows to the priorPeriodRows set and
// the arithmetic(subtract) prime yields current - prior. No production data.

import { evaluate, buildEvalContext, type EntityData } from '../src/lib/calculation/intent-executor';
import { legacyDerivationToDAG } from '../src/lib/calculation/legacy-intent-to-dag';
import { toNumber } from '../src/lib/calculation/decimal-precision';
import type { EvalContext } from '../src/lib/calculation/intent-types';

// Helper to print a DAG compactly.
function dagShape(node: unknown, depth = 0): string {
  if (!node || typeof node !== 'object') return String(node);
  const n = node as Record<string, unknown>;
  const prefix = '  '.repeat(depth);
  if (n.prime === 'arithmetic') {
    return `${prefix}arithmetic(${n.op})\n${dagShape(((n.inputs as unknown[]) ?? [])[0], depth + 1)}\n${dagShape(((n.inputs as unknown[]) ?? [])[1], depth + 1)}`;
  }
  if (n.prime === 'prior_period') {
    return `${prefix}prior_period\n${dagShape(n.downstream, depth + 1)}`;
  }
  if (n.prime === 'filter') {
    const p = n.predicate as { field: string; operator: string; value: unknown };
    return `${prefix}filter(${p.field} ${p.operator} ${JSON.stringify(p.value)})\n${dagShape(n.downstream, depth + 1)}`;
  }
  if (n.prime === 'aggregate') return `${prefix}aggregate(${n.op}, ${n.field})`;
  if (n.prime === 'constant') return `${prefix}constant(${n.value})`;
  if (n.prime === 'reference') return `${prefix}reference(${n.field})`;
  return `${prefix}${JSON.stringify(n)}`;
}

// 1) Translate a delta derivation
const dag = legacyDerivationToDAG({
  metric: 'monthly_delta',
  operation: 'delta',
  source_field: 'amount',
  filters: [{ field: 'category', operator: 'eq', value: 'A' }],
});

console.log('=== Synthetic prior_period smoke ===');
console.log('Translated DAG shape:');
console.log(dagShape(dag));

// 2) Construct EvalContext with synthetic current + prior rows
const entityData: EntityData = {
  entityId: 'synth-e1',
  metrics: {},
  attributes: {},
};
const baseCtx = buildEvalContext(entityData);
const context: EvalContext = {
  ...baseCtx,
  activeRows: [
    { category: 'A', amount: 100 },
    { category: 'A', amount: 50 },
    { category: 'B', amount: 999 },
  ],
  priorPeriodRows: [
    { category: 'A', amount: 60 },
    { category: 'A', amount: 20 },
    { category: 'B', amount: 999 },
  ],
};

// Expected: (100 + 50) - (60 + 20) = 150 - 80 = 70
const result = toNumber(evaluate(dag, context));
console.log(`\nResult: ${result}`);
console.log(`Expected: 70`);
console.log(result === 70 ? 'OK' : `MISMATCH — got ${result}, expected 70`);

// 3) Empty prior period → current side only
const ctxNoPrior: EvalContext = { ...context, priorPeriodRows: [] };
const noPriorResult = toNumber(evaluate(dag, ctxNoPrior));
console.log(`\nEmpty prior set result: ${noPriorResult}`);
console.log(`Expected: 150 (current sum, prior_period yields 0 on empty rows)`);
console.log(noPriorResult === 150 ? 'OK' : `MISMATCH — got ${noPriorResult}, expected 150`);

// 4) Absent priorPeriodRows → also yields 0 on the prior side
const ctxAbsent: EvalContext = { ...context };
delete ctxAbsent.priorPeriodRows;
const absentResult = toNumber(evaluate(dag, ctxAbsent));
console.log(`\nAbsent prior set result: ${absentResult}`);
console.log(`Expected: 150 (priorPeriodRows undefined → empty active set)`);
console.log(absentResult === 150 ? 'OK' : `MISMATCH — got ${absentResult}, expected 150`);
