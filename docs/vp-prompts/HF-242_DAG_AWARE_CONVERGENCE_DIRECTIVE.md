# HF-242 — DAG-Aware Convergence

**Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.**

---

## PROBLEM STATEMENT

Convergence cannot bind component metrics to committed_data columns for `prime_dag` components. BCL produces $9,150 across every period instead of $44,590 (October reference). Components c0, c1, c2 are all zero. Only c3 (Regulatory Compliance) produces a value — a flat $150/$100 per variant regardless of entity data.

The convergence log shows:
```
[Convergence] HF-112 AI proposed 0 mappings
[Convergence] HF-222: Credit Placement - Senior Executive:actual: candidate distribution insufficient to bind (top=0.1000, n=9)
```

The AI column mapping receives empty metric field names because `extractInputRequirements` reads `component.calculationOp` and `component.expectedMetrics` — fields that exist on legacy operation-format components but are absent or differently shaped on `prime_dag` components. The AI mapping returns `{}`. Convergence produces component bindings with only `period` + `entity_identifier`. The engine evaluates DAG intents against empty metrics → $0 for c0/c1/c2.

This is Closure 6 from HF-238 R2: convergence is not DAG-aware.

---

## ROOT CAUSE (PRECISE)

`extractInputRequirements` in `convergence-service.ts` builds `ComponentInputRequirement[]` from:
- `component.calculationOp` → determines requirement roles (actual, row, column, numerator, denominator)
- `component.expectedMetrics` → provides metric field names for the AI mapping prompt

For `prime_dag` components:
- `calculationOp` is `'prime_dag'` — not one of the recognized operation types (bounded_lookup_2d, scalar_multiply, conditional_gate, etc.)
- `expectedMetrics` may be empty or absent — the metric names are inside the DAG tree as `reference` node `field` values

The AI mapping prompt receives metric fields like `['unknown']` or `[]`. The LLM returns `{}`. Zero mappings. Zero measure bindings.

---

## FIX

Two changes, both in `convergence-service.ts`:

### Change 1 — Extract metric references from DAG trees

Add a function that walks a `PrimeNode` tree and collects all `reference` node `field` values. These are the metric names the DAG will try to resolve at evaluation time — they are exactly the fields convergence needs to bind.

```typescript
function extractReferencesFromDAG(node: PrimeNode | unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const n = node as Record<string, unknown>;
  if (n.prime === 'reference' && typeof n.field === 'string') {
    return [n.field];
  }
  const refs: string[] = [];
  if (n.prime === 'arithmetic' && Array.isArray(n.inputs)) {
    for (const input of n.inputs) refs.push(...extractReferencesFromDAG(input));
  }
  if (n.prime === 'filter' && n.downstream) refs.push(...extractReferencesFromDAG(n.downstream));
  if (n.prime === 'scope' && n.downstream) refs.push(...extractReferencesFromDAG(n.downstream));
  if (n.prime === 'conditional') {
    refs.push(...extractReferencesFromDAG(n.condition));
    refs.push(...extractReferencesFromDAG(n.then));
    refs.push(...extractReferencesFromDAG(n.else));
  }
  if (n.prime === 'compare' && Array.isArray(n.inputs)) {
    for (const input of n.inputs) refs.push(...extractReferencesFromDAG(input));
  }
  if (n.prime === 'logical' && Array.isArray(n.inputs)) {
    for (const input of n.inputs) refs.push(...extractReferencesFromDAG(input));
  }
  if (n.prime === 'aggregate') {
    if (typeof n.field === 'string') refs.push(n.field);
  }
  if (n.prime === 'prior_period' && n.downstream) refs.push(...extractReferencesFromDAG(n.downstream));
  return [...new Set(refs)];
}
```

This function is domain-agnostic. It walks any PrimeNode tree and returns the set of field names the tree will read at evaluation time. Korean Test compliant — no field name matching, pure structural traversal.

### Change 2 — Update extractInputRequirements for prime_dag

In `extractInputRequirements`, add a `prime_dag` case:

```typescript
if (component.calculationOp === 'prime_dag' || component.componentType === 'prime_dag') {
  const intent = component.calculationIntent;
  const refs = extractReferencesFromDAG(intent);
  
  // Each reference field becomes a requirement with role 'actual'
  // The AI mapping will match these field names to committed_data columns
  const requirements: ComponentInputRequirement[] = refs.map(field => ({
    role: 'actual',
    metricField: field,
    expectedRange: undefined,
    isRequired: true,
  }));
  
  // If the DAG contains aggregate nodes with field references,
  // those fields need binding too (they read from activeRows)
  // extractReferencesFromDAG already captures aggregate.field
  
  return requirements.length > 0 ? requirements : [{
    role: 'actual',
    metricField: 'unknown',
    expectedRange: undefined,
    isRequired: true,
  }];
}
```

The requirement roles map to binding slots. For `prime_dag` components, every reference field gets role `actual` because the DAG evaluator reads all fields from `context.metrics` uniformly — it doesn't distinguish actual/target/numerator/denominator. The binding slot name doesn't matter for DAG evaluation; what matters is that the field name appears in the convergence AI mapping prompt so the LLM can match it to a committed_data column.

### Change 3 — Update resolveMetricsFromConvergenceBindings for prime_dag

The metric resolution function currently looks for specific binding roles (`actual`, `row`, `column`, `numerator`, `denominator`). For `prime_dag` components with multiple reference fields, each field has its own binding entry keyed by the field name (not by role). Update the resolution to handle this:

Read the existing `resolveMetricsFromConvergenceBindings` at HEAD. Determine how component bindings are keyed — by role name or by some other key. If keyed by role (`actual`, `row`, `column`), the `prime_dag` requirements should use the metric field name as the role so each field gets its own binding entry. Adjust `extractInputRequirements` accordingly if needed.

The goal: for a BCL Credit Placement component with DAG references to `credit_placement_attainment` and `portfolio_quality_ratio`, convergence produces:
```json
{
  "component_0": {
    "credit_placement_attainment": { "column": "Cumplimiento_Colocacion", ... },
    "portfolio_quality_ratio": { "column": "Indice_Calidad_Cartera", ... },
    "entity_identifier": { "column": "ID_Empleado", ... },
    "period": { "column": "Periodo", ... }
  }
}
```

And `resolveMetricsFromConvergenceBindings` reads each keyed binding, resolves the column value, and populates `metrics['credit_placement_attainment']` and `metrics['portfolio_quality_ratio']` for the DAG evaluator.

---

## VERIFICATION

After the fix:

1. **Do NOT re-import BCL data or plan.** The data and plan are already in the database from the prior import. The convergence runs at calc time and will use the fixed code.

2. Delete BCL's stored `input_bindings` so calc-time convergence re-runs with the fixed code. Run this in Supabase SQL Editor:
```sql
UPDATE rule_sets SET input_bindings = '{}' WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

3. Trigger calculation for BCL October through the browser.

4. Check the convergence log for:
   - `HF-112 AI proposed N mappings` where N > 0
   - Component bindings with measure columns (not just period + entity_identifier)
   - Non-zero values for c0, c1, c2

5. Report per-component totals and grand total for October. Do NOT interpret.

---

## COMPLETION REPORT

Save to `docs/completion-reports/HF-242_COMPLETION_REPORT.md` and commit.

Must include:
1. The implemented `extractReferencesFromDAG` function
2. The updated `extractInputRequirements` prime_dag case
3. The updated `resolveMetricsFromConvergenceBindings` prime_dag handling
4. Convergence log showing AI mapping success
5. BCL October calculation results (per-component, grand total)
6. Build verification

---

## BUILD AND DEPLOY

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — zero errors
4. `npm run dev` — `localhost:3000` responds
5. Git from repo root (`spm-platform`)
6. Branch: `hf-242-dag-aware-convergence` off `main`
7. `gh pr create --base main --head hf-242-dag-aware-convergence` with title: "HF-242: DAG-aware convergence — extract metric references from PrimeNode trees for AI column mapping"
8. PR body: "Convergence extractInputRequirements now walks PrimeNode DAG trees to discover reference field names and aggregate field names. These populate the AI column mapping prompt so the LLM can bind component metrics to committed_data columns. Fixes $9,150→$44,590 regression where prime_dag components produced zero measure bindings."
