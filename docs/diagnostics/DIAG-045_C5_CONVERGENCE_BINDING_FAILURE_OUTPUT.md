# DIAG-045 -- C5 Convergence Binding Failure Root Cause Output

**Date:** 2026-05-14
**Branch:** diag-045-c5-convergence-binding-failure
**HEAD commit at scaffold:** ab76ae3676e654f453dcae3e76133b8a7298fb91 (post-HF-223 merge)
**Scope:** Why does C5 convergence binding fail when C1-C4 succeed in the same run?

CC pastes verbatim code and data at every section. No interpretation. No PASS/FAIL. No design proposals.

---

## Phase 1 -- Metric requirement extraction

### Phase 1.1 -- Locator grep (head -40)

```
$ grep -nE "metric|requirement|sourceSpec|numerator|denominator|extractMetric|getMetric|componentInput|inputRequirement" web/src/lib/intelligence/convergence-service.ts | head -40
4: * Matches plan requirements to data capabilities through field identity matching
38:// OB-191: Enriched metric context for Pass 4 AI prompt
43:  name: string;          // Programmatic metric name (e.g., "period_equipment_revenue")
48:  semanticIntent?: string;             // HF-198 E5: AI plan-agent reasoning text (per metric_comprehension signal)
49:  metricInputs?: Record<string, unknown> | null;  // HF-198 E5: input shape from plan-agent (per metric_comprehension signal)
52:/** Convert programmatic metric name to human-readable label */
146:  // HF-196 Phase 3: D153 B-E4 atomic cutover — metricComprehension is the
152:    // HF-196 Phase 3: rule-set-scoped metric comprehension signals read from
154:    // (OB-198 vocabulary aligned). These signals carry plan-agent metric
157:    metricComprehension: MetricComprehensionSignal[];
161:// HF-196 Phase 3: shape of metric_comprehension signals consumed as operative
188:  // HF-196 Phase 3: metricComprehension is read unconditionally (not gated on
190:  const observations: ConvergenceResult['observations'] = { withinRun: [], crossRun: [], metricComprehension: [] };
201:  // 2. Extract plan requirements
205:  // HF-196 Phase 3: D153 B-E4 atomic cutover — read metric_comprehension signals
207:  // 'comprehension:plan_interpretation') carry plan-agent metric semantics that
210:  const metricComprehensionSignals = await loadMetricComprehensionSignals(tenantId, ruleSetId, supabase);
211:  observations.metricComprehension = metricComprehensionSignals;
...
```

### Phase 1.2 -- Function locate (broader)

```
$ grep -nE "function.*[Cc]omponent.*[Bb]inding|function.*generate.*[Bb]inding|function.*extract|function.*[Mm]etric.*[Ff]rom|function extractInputRequirements|function getRequiredMeasure|function generateDerivations" web/src/lib/intelligence/convergence-service.ts
684:  function extractComponents(componentsJson: unknown): PlanComponent[] {
1171: function generateDerivationsForMatch(
1245: function extractInputRequirements(component: PlanComponent): ComponentInputRequirement[] {
2561: function getRequiredMeasureCount(operation: string): number {
```

The relevant requirement-extraction function is `extractInputRequirements` at line 1245. Full body (verbatim, lines 1245-1320):

```typescript
function extractInputRequirements(component: PlanComponent): ComponentInputRequirement[] {
  const intent = component.calculationIntent;
  if (!intent) return [{ role: 'actual', metricField: component.expectedMetrics[0] || 'unknown', expectedRange: null }];

  const reqs: ComponentInputRequirement[] = [];
  const op = intent.operation as string;

  // Helper to get field name from a sourceSpec
  const getField = (spec: Record<string, unknown> | undefined): string =>
    spec?.field ? String(spec.field).replace(/^metric:/, '') : 'unknown';

  switch (op) {
    case 'bounded_lookup_2d': {
      const inputs = intent.inputs as Record<string, Record<string, unknown>> | undefined;
      const rowRange = extractRangeFromBoundaries(intent.rowBoundaries as Array<Record<string, unknown>> | undefined);
      const colRange = extractRangeFromBoundaries(intent.columnBoundaries as Array<Record<string, unknown>> | undefined);
      if (inputs) {
        const rowSpec = inputs.row?.sourceSpec as Record<string, unknown> | undefined;
        const colSpec = inputs.column?.sourceSpec as Record<string, unknown> | undefined;
        reqs.push({ role: 'row', metricField: getField(rowSpec), expectedRange: rowRange });
        reqs.push({ role: 'column', metricField: getField(colSpec), expectedRange: colRange });
      } else {
        reqs.push({ role: 'actual', metricField: component.expectedMetrics[0] || 'unknown', expectedRange: rowRange });
      }
      break;
    }
    case 'bounded_lookup_1d': {
      const range = extractRangeFromBoundaries(intent.boundaries as Array<Record<string, unknown>> | undefined);
      const inputSpec = (intent.input as Record<string, unknown>)?.sourceSpec as Record<string, unknown> | undefined;
      reqs.push({ role: 'actual', metricField: getField(inputSpec), expectedRange: range });
      break;
    }
    case 'scalar_multiply': {
      const input = intent.input as Record<string, unknown> | undefined;
      if (input?.source === 'ratio') {
        const spec = input.sourceSpec as Record<string, unknown> | undefined;
        const num = spec?.numerator ? String(spec.numerator).replace(/^metric:/, '') : 'unknown';
        const den = spec?.denominator ? String(spec.denominator).replace(/^metric:/, '') : 'unknown';
        reqs.push({ role: 'numerator', metricField: num, expectedRange: null });
        reqs.push({ role: 'denominator', metricField: den, expectedRange: null });
      } else {
        const spec = input?.sourceSpec as Record<string, unknown> | undefined;
        reqs.push({ role: 'actual', metricField: getField(spec), expectedRange: null });
      }
      break;
    }
    case 'conditional_gate': {
      const condLeft = (intent.condition as Record<string, unknown>)?.left as Record<string, unknown> | undefined;
      const spec = condLeft?.sourceSpec as Record<string, unknown> | undefined;
      reqs.push({ role: 'actual', metricField: getField(spec), expectedRange: null });
      break;
    }
    case 'piecewise_linear': {
      // OB-185: piecewise_linear has ratioInput (numerator/denominator) and baseInput
      const ratioIn = intent.ratioInput as Record<string, unknown> | undefined;
      const baseIn = intent.baseInput as Record<string, unknown> | undefined;
      const ratioSpec = ratioIn?.sourceSpec as Record<string, unknown> | undefined;
      const baseSpec = baseIn?.sourceSpec as Record<string, unknown> | undefined;
      if (ratioSpec?.numerator) reqs.push({ role: 'numerator', metricField: String(ratioSpec.numerator).replace(/^metric:/, ''), expectedRange: null });
      if (ratioSpec?.denominator) reqs.push({ role: 'denominator', metricField: String(ratioSpec.denominator).replace(/^metric:/, ''), expectedRange: null });
      if (baseSpec?.field) reqs.push({ role: 'actual', metricField: getField(baseSpec), expectedRange: null });
      break;
    }
    case 'linear_function': {
      // OB-185: linear_function has single input
      const lfInput = intent.input as Record<string, unknown> | undefined;
      const lfSpec = lfInput?.sourceSpec as Record<string, unknown> | undefined;
      reqs.push({ role: 'actual', metricField: getField(lfSpec), expectedRange: null });
      break;
    }
    default:
      reqs.push({ role: 'actual', metricField: component.expectedMetrics[0] || 'unknown', expectedRange: null });
  }

  return reqs;
}
```

### Phase 1.3 -- Nested operation handling

```
$ grep -n "conditional_gate\|nested\|recursive\|traverse\|walk\|input\.operation\|input\.source\|deep" web/src/lib/intelligence/convergence-service.ts | head -25
765: // OB-185: Walk nested onTrue/onFalse for conditional_gate chains
766: const walkNested = (obj: Record<string, unknown>) => {
778: if (obj.onTrue && typeof obj.onTrue === 'object') walkNested(obj.onTrue as Record<string, unknown>);
779: if (obj.onFalse && typeof obj.onFalse === 'object') walkNested(obj.onFalse as Record<string, unknown>);
781: if (intent.onTrue || intent.onFalse || intent.condition) walkNested(intent);
1280:    const spec = input.sourceSpec as Record<string, unknown> | undefined;
1291: case 'conditional_gate': {
1610: case 'conditional_gate': {                                                                  (estimateSampleResult — result-estimation, not requirement extraction)
2570: case 'conditional_gate':                                                                    (getRequiredMeasureCount — count only)
```

**The `walkNested` helper (lines 765-781):**

```typescript
      // OB-185: Walk nested onTrue/onFalse for conditional_gate chains
      const walkNested = (obj: Record<string, unknown>) => {
        const spec = (obj.input as Record<string, unknown>)?.sourceSpec as Record<string, unknown> | undefined;
        if (spec?.field) {
          const f = String(spec.field).replace(/^metric:/, '');
          if (!metrics.includes(f)) metrics.push(f);
        }
        const condLeft = (obj.condition as Record<string, unknown>)?.left as Record<string, unknown> | undefined;
        const condSpec = condLeft?.sourceSpec as Record<string, unknown> | undefined;
        if (condSpec?.field) {
          const f = String(condSpec.field).replace(/^metric:/, '');
          if (!metrics.includes(f)) metrics.push(f);
        }
        if (obj.onTrue && typeof obj.onTrue === 'object') walkNested(obj.onTrue as Record<string, unknown>);
        if (obj.onFalse && typeof obj.onFalse === 'object') walkNested(obj.onFalse as Record<string, unknown>);
      };
      if (intent.onTrue || intent.onFalse || intent.condition) walkNested(intent);
```

`walkNested` lives in `extractComponents` (line 684 context per Phase 1.2 locator). It extracts a flat `metrics: string[]` list used elsewhere; it does NOT produce `ComponentInputRequirement` records. It only fires when the *top-level* intent contains `onTrue`/`onFalse`/`condition` (gate at line 781). For C5's HF-223 emission (top-level `operation: 'scalar_multiply'`, with `conditional_gate` *inside* `input`), the gate at line 781 evaluates `intent.onTrue || intent.onFalse || intent.condition` against the scalar_multiply intent — those fields are undefined at the top level, so `walkNested` never runs.

`extractInputRequirements` (the function that produces binding requirements) routes by `intent.operation`. For C5 post-HF-223, `op === 'scalar_multiply'` (line 1277). The `scalar_multiply` branch checks `input?.source === 'ratio'` (line 1279) — but C5's `input` is `{ operation: 'conditional_gate', condition: {...}, onTrue: {...}, onFalse: {...} }`, where `input.source` is `undefined`. Branch falls through to the else clause (line 1285): reads `input?.sourceSpec`, which is also `undefined`. `getField(undefined)` returns `'unknown'` (line 1254). Result: `reqs.push({ role: 'actual', metricField: 'unknown', expectedRange: null })`.

The `case 'conditional_gate'` branch at line 1291 only fires when the *top-level* `intent.operation === 'conditional_gate'`, not when conditional_gate is nested inside scalar_multiply's input.
