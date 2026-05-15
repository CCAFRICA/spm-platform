# DIAG-047 -- CRP Filter Provenance Output

**Date:** 2026-05-15
**Branch:** diag-047-crp-filter-provenance
**HEAD commit:** d8b4640a9f1811a81d02a9c51eef178734694c3d (pre-Phase-0 base; updated below each phase)
**Scope:** How does a product_category filter flow through signal write -> signal read -> derivation construction -> engine application?

CC pastes verbatim code at every section. No interpretation. No PASS/FAIL. No design proposals.

## Phase 1 -- Signal writer

### 1.1 Full file read of `web/src/lib/compensation/plan-comprehension-emitter.ts`

`wc -l web/src/lib/compensation/plan-comprehension-emitter.ts`:

```
     134 web/src/lib/compensation/plan-comprehension-emitter.ts
```

Full file:

```typescript
/**
 * HF-198 E5 — Plan-agent comprehension as L2 signal
 *
 * Emits one `comprehension:plan_interpretation` signal per plan component
 * after rule_set save. Signal carries the metric semantic intent (label, op,
 * inputs, source evidence) so downstream consumers (convergence Pass 4) can
 * read authoritative semantic intent rather than re-deriving it.
 *
 * Read-coupling per AUD-004 v3 §2 E3:
 *   - signal_level: L2 (Comprehension)
 *   - originating_flywheel: tenant
 *   - declared_writers: this module
 *   - declared_readers: web/src/lib/intelligence/convergence-service.ts
 *     (loadMetricComprehensionSignals)
 *
 * Korean Test (AP-25 / Decision 154): signal_type is governance vocabulary
 * ('comprehension:plan_interpretation'); per-metric payload is structural
 * (label/op/inputs from plan-agent output, no language-specific lexicon).
 *
 * Fire-and-forget per signal-write discipline; never throws; rule_set save
 * succeeds independently.
 */

// OB-199 Phase 4: canonical writer migration. The load-bearing emitter for
// comprehension:plan_interpretation now routes through DS-023 §5.1 single
// entry point; §5.2 enforces Decision 30 v2 inclusive bound.
import { writeSignalBatch, CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';

interface PlanInterpretationLike {
  components?: Array<Record<string, unknown>>;
}

interface ComponentLike {
  id?: string;
  name?: string;
  type?: string;
  calculationMethod?: { type?: string; [key: string]: unknown } | null;
  calculationIntent?: Record<string, unknown> | null;
  confidence?: number;
  reasoning?: string;
  expectedMetrics?: string[];
  metrics?: Array<{ metric?: string; metricLabel?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/**
 * Emit one `comprehension:plan_interpretation` signal per plan component.
 *
 * Each signal carries:
 *   - metric_label: human-readable component name
 *   - metric_op: operation type (from calculationMethod.type or calculationIntent)
 *   - metric_inputs: input shape (from calculationIntent.input or method-specific config)
 *   - semantic_intent: AI reasoning text from plan-agent output
 *   - source_evidence: { rule_set_id, plan_confidence }
 *
 * Returns { emitted, errors }; never throws.
 */
export async function emitPlanComprehensionSignals(
  args: {
    tenantId: string;
    ruleSetId: string;
    interpretation: PlanInterpretationLike;
    planConfidence?: number;
  },
): Promise<{ emitted: number; errors: number }> {
  try {
    const components = Array.isArray(args.interpretation.components) ? args.interpretation.components : [];
    if (components.length === 0) {
      return { emitted: 0, errors: 0 };
    }

    const signals = components.map((rawComp) => {
      const comp = rawComp as ComponentLike;
      const calcMethod = (comp.calculationMethod ?? {}) as { type?: string };
      const calcIntent = (comp.calculationIntent ?? null) as Record<string, unknown> | null;

      // metric_op: prefer calculationIntent.calculationType (structural intent), then calculationMethod.type
      const metricOp =
        (calcIntent?.calculationType as string | undefined) ??
        calcMethod?.type ??
        comp.type ??
        'unknown';

      // metric_inputs: extract from calculationIntent.input, or fall back to expectedMetrics list
      const metricInputs =
        (calcIntent?.input as Record<string, unknown> | undefined) ??
        (comp.expectedMetrics ? { expectedMetrics: comp.expectedMetrics } : null);

      const signalValue: Record<string, unknown> = {
        metric_label: comp.name ?? comp.id ?? 'unnamed_component',
        metric_op: metricOp,
        metric_inputs: metricInputs,
        semantic_intent: comp.reasoning ?? null,
        component_id: comp.id ?? null,
        component_type: comp.type ?? null,
        source_evidence: {
          rule_set_id: args.ruleSetId,
          plan_confidence: args.planConfidence ?? null,
          component_confidence: comp.confidence ?? null,
        },
      };

      const conf = comp.confidence ?? args.planConfidence;
      return {
        tenantId: args.tenantId,
        signalType: 'comprehension:plan_interpretation',
        signalValue,
        confidence: typeof conf === 'number' ? conf : undefined,
        source: 'ai_prediction' as const,
        ruleSetId: args.ruleSetId,
      };
    });

    try {
      const result = await writeSignalBatch(
        signals,
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      console.log(`[PlanComprehensionEmitter] Emitted ${result.count} comprehension:plan_interpretation signals (rule_set=${args.ruleSetId}; observability_signals=${result.observabilitySignalsEmitted})`);
      return { emitted: result.count, errors: 0 };
    } catch (err) {
      if (err instanceof CanonicalWriteError) {
        console.warn(`[PlanComprehensionEmitter] Batch CanonicalWriteError (${err.cause}): ${err.message}`);
      } else {
        console.warn('[PlanComprehensionEmitter] Batch unexpected error:', err instanceof Error ? err.message : String(err));
      }
      return { emitted: 0, errors: signals.length };
    }
  } catch (err) {
    console.warn('[PlanComprehensionEmitter] Exception (non-blocking):', err instanceof Error ? err.message : String(err));
    return { emitted: 0, errors: 1 };
  }
}
```

### 1.2 Emitter call sites

`grep -rn "PlanComprehensionEmitter\|planComprehensionEmitter\|comprehensionEmitter\|emitComprehension\|emitPlanComprehension" web/src/ --include="*.ts"`:

```
web/src/app/api/import/sci/execute/route.ts:1257:    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
web/src/app/api/import/sci/execute/route.ts:1259:    void emitPlanComprehensionSignals({
web/src/app/api/import/sci/execute/route.ts:1508:    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
web/src/app/api/import/sci/execute/route.ts:1510:    void emitPlanComprehensionSignals({
web/src/lib/compensation/plan-comprehension-emitter.ts:58:export async function emitPlanComprehensionSignals(
web/src/lib/compensation/plan-comprehension-emitter.ts:120:      console.log(`[PlanComprehensionEmitter] Emitted ${result.count} comprehension:plan_interpretation signals (rule_set=${args.ruleSetId}; observability_signals=${result.observabilitySignalsEmitted})`);
web/src/lib/compensation/plan-comprehension-emitter.ts:124:        console.warn(`[PlanComprehensionEmitter] Batch CanonicalWriteError (${err.cause}): ${err.message}`);
web/src/lib/compensation/plan-comprehension-emitter.ts:126:        console.warn('[PlanComprehensionEmitter] Batch unexpected error:', err instanceof Error ? err.message : String(err));
web/src/lib/compensation/plan-comprehension-emitter.ts:131:    console.warn('[PlanComprehensionEmitter] Exception (non-blocking):', err instanceof Error ? err.message : String(err));
```

Caller context at `execute/route.ts` line ~1257 (batched plan path):

```typescript
  const variants = engineFormat.components.variants || [];
  const componentCount = variants.reduce((sum: number, v: { components?: unknown[] }) => sum + (v.components?.length || 0), 0);
  console.log(`[SCI Execute] Batched plan saved: ${planName} (${ruleSetId}), ${variants.length} variants, ${componentCount} components from ${planUnits.length} sheets`);

  // HF-198 E5 + HF-201: Emit per-component comprehension:plan_interpretation signals (L2)
  // so convergence Pass 4 reads authoritative semantic intent before AI derivation.
  // HF-201 Shape B: pass plan-agent's original output (interpretation.components) so the
  // signal carries plan-agent reasoning verbatim. PlanComponent (engine-format) drops
  // reasoning during convertComponent; routing to interpretation.components preserves it.
  try {
    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
    const componentsForSignals = (interpretation.components ?? []) as unknown as Array<Record<string, unknown>>;
    void emitPlanComprehensionSignals({
      tenantId,
      ruleSetId,
      interpretation: { components: componentsForSignals },
      planConfidence: response.confidence,
    });
  } catch (sigErr) {
    console.warn('[SCI Execute] Plan comprehension signal emission threw (non-blocking):', sigErr instanceof Error ? sigErr.message : String(sigErr));
  }
```

Caller context at `execute/route.ts` line ~1508 (per-unit plan path):

```typescript
  const variants = engineFormat.components.variants || [];
  const componentCount = variants.reduce((sum: number, v: { components?: unknown[] }) => sum + (v.components?.length || 0), 0);
  console.log(`[SCI Execute] Plan saved: ${planName} (${ruleSetId}), ${variants.length} variants, ${componentCount} components`);

  // HF-198 E5 + HF-201: Emit per-component comprehension:plan_interpretation signals (L2).
  // HF-201 Shape B: pass plan-agent's original output (interpretation.components) so the
  // signal carries plan-agent reasoning verbatim.
  try {
    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
    const componentsForSignals = (interpretation.components ?? []) as unknown as Array<Record<string, unknown>>;
    void emitPlanComprehensionSignals({
      tenantId,
      ruleSetId,
      interpretation: { components: componentsForSignals },
      planConfidence: response.confidence,
    });
  } catch (sigErr) {
    console.warn('[SCI Execute] Plan comprehension signal emission threw (non-blocking):', sigErr instanceof Error ? sigErr.message : String(sigErr));
  }
```

### 1.3 CRP Plan 1 signal_value content from the database

Command: `cd web && set -a && source .env.local && set +a && npx tsx scripts/diag047-signal-content.ts`

```
Rule set: Capital Equipment Commission Plan (7ae0fba1-83fe-4674-8664-e6516bb370c9, created: 2026-05-15T11:35:43.089993+00:00)

Total signals for this rule_set: 2

---
signal_type: comprehension:plan_interpretation
confidence: 1
signal_value: {
  "metric_op": "linear_function",
  "component_id": "senior_rep_commission",
  "metric_label": "Senior Rep Equipment Commission",
  "metric_inputs": {
    "source": "metric",
    "sourceSpec": {
      "field": "period_equipment_revenue"
    }
  },
  "component_type": "linear_function",
  "semantic_intent": "Document explicitly states linear formula: Commission = (Rate x Period Equipment Revenue) + Period Base Draw. For Senior Rep: 6.0% rate and $200 base draw.",
  "source_evidence": {
    "rule_set_id": "7ae0fba1-83fe-4674-8664-e6516bb370c9",
    "plan_confidence": 1,
    "component_confidence": 1
  }
}

---
signal_type: comprehension:plan_interpretation
confidence: 1
signal_value: {
  "metric_op": "linear_function",
  "component_id": "rep_commission",
  "metric_label": "Rep Equipment Commission",
  "metric_inputs": {
    "source": "metric",
    "sourceSpec": {
      "field": "period_equipment_revenue"
    }
  },
  "component_type": "linear_function",
  "semantic_intent": "Document explicitly states linear formula: Commission = (Rate x Period Equipment Revenue) + Period Base Draw. For Rep: 4.0% rate and $150 base draw.",
  "source_evidence": {
    "rule_set_id": "7ae0fba1-83fe-4674-8664-e6516bb370c9",
    "plan_confidence": 1,
    "component_confidence": 1
  }
}
```

The script's secondary `>>> Signal … CONTAINS filter/product_category/Capital Equipment reference` scan printed nothing for either signal — the substring check (`filter` | `product_category` | `Capital Equipment`) found no match in either `signal_value` payload.

## Phase 2 -- Signal consumption and derivation construction

### 2.1 Full body of `loadMetricComprehensionSignals`

`grep -n "function loadMetricComprehensionSignals" web/src/lib/intelligence/convergence-service.ts`:

```
830:async function loadMetricComprehensionSignals(
```

```typescript
// Korean Test (IGF-T1-E910) compliance: signal_type is a stable governance string,
// not a domain-name literal. tenant_id + rule_set_id are runtime parameters.
// ──────────────────────────────────────────────

async function loadMetricComprehensionSignals(
  tenantId: string,
  ruleSetId: string,
  supabase: SupabaseClient,
): Promise<MetricComprehensionSignal[]> {
  const { data, error } = await supabase
    .from('classification_signals')
    .select('signal_value, confidence, rule_set_id')
    .eq('tenant_id', tenantId)
    .eq('rule_set_id', ruleSetId)
    .eq('signal_type', 'comprehension:plan_interpretation')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn(`[Convergence] metric_comprehension signal read failed (non-blocking): ${error.message}`);
    return [];
  }
  return (data ?? []) as MetricComprehensionSignal[];
}
```

### 2.2 metricComprehension consumption sites

`grep -n "metricComprehension\|metric_comprehension_signal\|metricInputs" web/src/lib/intelligence/convergence-service.ts | head -40`:

```
49:  metricInputs?: Record<string, unknown> | null;  // HF-198 E5: input shape from plan-agent (per metric_comprehension signal)
146:  // HF-196 Phase 3: D153 B-E4 atomic cutover — metricComprehension is the
157:    metricComprehension: MetricComprehensionSignal[];
188:  // HF-196 Phase 3: metricComprehension is read unconditionally (not gated on
190:  const observations: ConvergenceResult['observations'] = { withinRun: [], crossRun: [], metricComprehension: [] };
210:  const metricComprehensionSignals = await loadMetricComprehensionSignals(tenantId, ruleSetId, supabase);
211:  observations.metricComprehension = metricComprehensionSignals;
212:  if (metricComprehensionSignals.length > 0) {
213:    console.log(`[Convergence] HF-196 D153 cutover: ${metricComprehensionSignals.length} metric_comprehension signals loaded as operative input (rule_set=${ruleSetId})`);
312:  // metricComprehension signals (HF-198 E5) flow through as authoritative semantic intent,
345:    observations.metricComprehension,
595:      const matchedSignal = observations.metricComprehension.find(sig => {
604:      const metricInputs = (sigValue.metric_inputs as Record<string, unknown> | null | undefined) ?? null;
612:        metricInputs,
1847:  metricComprehension: MetricComprehensionSignal[] = [], // HF-199 D2
1859:    const matchedSignal = metricComprehension.find(sig => {
2021:  metricComprehension: MetricComprehensionSignal[] = [], // HF-199 D2: E5 signals threaded through
2102:  const aiMapping = await resolveColumnMappingsViaAI(components, allRequirements, measureColumns, metricComprehension);
2451:    if (mc.metricInputs && Object.keys(mc.metricInputs).length > 0) {
2453:        desc += `\n  PLAN-AGENT INPUTS: ${JSON.stringify(mc.metricInputs).slice(0, 240)}`;
```

**Consumption site at 210-213 (load + persist into observations):**

```typescript
  const metricComprehensionSignals = await loadMetricComprehensionSignals(tenantId, ruleSetId, supabase);
  observations.metricComprehension = metricComprehensionSignals;
  if (metricComprehensionSignals.length > 0) {
    console.log(`[Convergence] HF-196 D153 cutover: ${metricComprehensionSignals.length} metric_comprehension signals loaded as operative input (rule_set=${ruleSetId})`);
```

**Consumption site at 339-349 (thread into generateAllComponentBindings):**

```typescript
  await generateAllComponentBindings(
    components,
    matches,
    capabilities,
    componentBindings,
    existingConvergenceBindings,
    observations.metricComprehension,
    tenantEntityExternalIds,
    tenantId,
    supabase,
  );
```

**Consumption site at 594-613 (Pass 4 metric-context build):**

```typescript
      // HF-198 E5: Find matching metric_comprehension signal by metric label / component name.
      const matchedSignal = observations.metricComprehension.find(sig => {
        const sv = sig.signal_value as Record<string, unknown> | null;
        if (!sv) return false;
        const sigLabel = (sv.metric_label as string | undefined) ?? '';
        const ownerName = ownerComp?.name ?? '';
        return sigLabel === ownerName || sigLabel === metricName;
      });
      const sigValue = (matchedSignal?.signal_value ?? {}) as Record<string, unknown>;
      const semanticIntent = (sigValue.semantic_intent as string | undefined) ?? undefined;
      const metricInputs = (sigValue.metric_inputs as Record<string, unknown> | null | undefined) ?? null;
      return {
        name: metricName,
        label: humanizeMetricName(metricName),
        componentName: ownerComp?.name || 'Unknown',
        operation: ownerComp?.calculationOp || 'unknown',
        scope,
        semanticIntent,
        metricInputs,
      };
    });
```

**Consumption site at 1842-1873 (resolveColumnMappingsViaAI builds AI prompt context from signals):**

```typescript
async function resolveColumnMappingsViaAI(
  components: PlanComponent[],
  allRequirements: Array<{ compIndex: number; compName: string; req: ComponentInputRequirement }>,
  measureColumns: Array<{ name: string; fi: FieldIdentity; stats: ColumnValueStats }>,
  metricComprehension: MetricComprehensionSignal[] = [], // HF-199 D2
): Promise<Record<string, string>> {
  const metricFields = allRequirements.map(r => r.req.metricField).filter(f => f !== 'unknown');
  const columnNames = measureColumns.map(c => c.name);

  // HF-199 D2: Build per-metric semantic intent map from comprehension signals.
  // Match by component name (signal.metric_label) and then by metricField. Per
  // AUD-004 v3 §2 E5, plan-agent semantic intent is authoritative; AI prompt
  // includes it so column-to-metric binding has structured plan context.
  const semanticIntentByMetricField = new Map<string, { intent: string; inputs: string }>();
  for (const r of allRequirements) {
    const ownerComp = components.find(c => c.name === r.compName);
    const matchedSignal = metricComprehension.find(sig => {
      const sv = sig.signal_value as Record<string, unknown> | null;
      if (!sv) return false;
      const sigLabel = (sv.metric_label as string | undefined) ?? '';
      return sigLabel === r.compName || sigLabel === ownerComp?.name;
    });
    if (matchedSignal) {
      const sv = (matchedSignal.signal_value ?? {}) as Record<string, unknown>;
      const intent = (sv.semantic_intent as string | undefined) ?? '';
      const inputs = sv.metric_inputs ? JSON.stringify(sv.metric_inputs).slice(0, 200) : '';
      if (intent || inputs) {
        semanticIntentByMetricField.set(r.req.metricField, { intent, inputs });
      }
    }
  }
```

**Consumption site at 2447-2457 (Pass 4 AI prompt — metric descriptions read `metricInputs`):**

```typescript
  // 3. Build AI prompt — enriched with metric labels, component context (OB-191),
  // and HF-198 E5 plan-agent semantic intent from comprehension:plan_interpretation
  // signals (read before derive per AUD-004 v3 §2 E5).
  // Korean Test: No hardcoded field names. AI receives column metadata and sample values at runtime.
  const metricDescriptions = metricContexts.map(mc => {
    let desc = `- ${mc.name} (label: "${mc.label}", used in: ${mc.operation}, component: "${mc.componentName}")`;
    if (mc.scope) desc += `\n  NOTE: This metric should be aggregated at the ${mc.scope} scope level`;
    if (mc.semanticIntent) desc += `\n  PLAN-AGENT INTENT: ${mc.semanticIntent}`;
    if (mc.metricInputs && Object.keys(mc.metricInputs).length > 0) {
      try {
        desc += `\n  PLAN-AGENT INPUTS: ${JSON.stringify(mc.metricInputs).slice(0, 240)}`;
      } catch {}
    }
    return desc;
  }).join('\n');
```

The four consumption sites read these fields from `signal_value`: `metric_label`, `semantic_intent`, `metric_inputs`, `component_id`. None of them read a `filter`, `filters`, or `product_category` field from `signal_value`.

### 2.3 derivations.push sites

`grep -n "derivations\.push" web/src/lib/intelligence/convergence-service.ts`:

```
297:    derivations.push(...generated);
508:      derivations.push({
518:      derivations.push({
624:      derivations.push(...aiResult.derivations);
2571:        derivations.push({
```

**Push at 297 (within `for match of matches` loop) — spreads `generated` rules from `generateDerivationsForMatch`:**

```typescript
  // 5. Generate derivation rules
  for (const match of matches) {
    const cap = capabilities.find(c => c.dataType === match.dataType);
    if (!cap) continue;

    matchReport.push({
      component: match.component.name,
      dataType: match.dataType,
      confidence: match.matchConfidence,
      reason: match.matchReason,
    });

    if (match.matchConfidence < 0.5) continue;

    const generated = generateDerivationsForMatch(match, cap, components, matches);
    derivations.push(...generated);
```

The `generated` rules come from `generateDerivationsForMatch`. The relevant excerpt of that function (the two `rules.push` sites that supply the spread):

```typescript
function generateDerivationsForMatch(
  match: BindingMatch,
  capability: DataCapability,
  allComponents: PlanComponent[],
  allMatches: BindingMatch[]
): MetricDerivationRule[] {
  const rules: MetricDerivationRule[] = [];
  const comp = match.component;

  const sameDataTypeMatches = allMatches.filter(m => m.dataType === match.dataType);
  const isSharedBase = sameDataTypeMatches.length > 1;

  if (isSharedBase && capability.categoricalFields.length > 0) {
    return generateFilteredCountDerivations(comp, match.dataType, capability);
  }

  for (const metricName of comp.expectedMetrics) {
    const needsCount = comp.calculationOp === 'scalar_multiply' && comp.calculationRate !== undefined
      && comp.calculationRate > 1;
    const needsSum = !needsCount && capability.numericFields.length > 0;

    if (needsSum) {
      // OB-162: Prefer field identity measure column over highest-average heuristic
      let bestField: { field: string; avg: number } | undefined;
      // ... (column selection) ...
      if (bestField) {
        rules.push({
          metric: metricName,
          operation: 'sum',
          source_pattern: match.dataType,
          source_field: bestField.field,
          filters: [],
        });
      }
    } else if (needsCount) {
      rules.push({
        metric: metricName,
        operation: 'count',
        source_pattern: match.dataType,
        filters: [],
      });
    }
  }
```

Both `rules.push` calls here ship an empty array literal for `filters`. The `isSharedBase && categoricalFields.length > 0` early return delegates to `generateFilteredCountDerivations` which may or may not populate filters (not read in this phase).

**Push at 508 (target-pair derivation):**

```typescript
      const baseMetric = actualsDerivation.metric;

      derivations.push({
        metric: `${baseMetric}_target`,
        operation: 'sum',
        source_pattern: targetCap.dataType,
        source_field: targetCap.targetField,
        filters: [],
      });

      const scaleFactor = detectBoundaryScale(ruleSet.components, comp.index);

      derivations.push({
        metric: baseMetric,
        operation: 'ratio',
        source_pattern: '',
        filters: [],
        numerator_metric: `${baseMetric}_actuals`,
        denominator_metric: `${baseMetric}_target`,
        scale_factor: scaleFactor,
      });
```

Both pushes ship `filters: []` literally.

**Push at 624 (AI Pass 4 derivations — spreads `aiResult.derivations`):**

```typescript
    try {
      const aiResult = await generateAISemanticDerivations(
        metricContexts, capabilities, supabase, tenantId
      );
      derivations.push(...aiResult.derivations);
      for (const g of aiResult.gaps) {
        gaps.push({
          component: components.find(c => c.expectedMetrics.includes(g.metric))?.name || 'Unknown',
          componentIndex: components.find(c => c.expectedMetrics.includes(g.metric))?.index || 0,
          requiredMetrics: [g.metric],
          calculationOp: 'derived',
          reason: g.reason,
          resolution: g.resolution,
        });
      }
```

The `aiResult.derivations` are constructed inside `generateAISemanticDerivations` (the Pass 4 AI call). The construction at line 2571 (below) is the site where the AI's JSON response is mapped to a typed `MetricDerivationRule[]`:

**Push at 2571 (Pass 4 typed-derivation construction from AI JSON):**

```typescript
        const filters: MetricDerivationRule['filters'] = [];
        if (Array.isArray(d.filters)) {
          for (const f of d.filters as Array<Record<string, unknown>>) {
            if (f.field && f.value != null) {
              filters.push({
                field: String(f.field),
                operator: (String(f.operator || 'eq') as MetricDerivationRule['filters'][0]['operator']),
                value: f.value as string | number | boolean,
              });
            }
          }
        }

        derivations.push({
          metric,
          operation: operation as MetricDerivationRule['operation'],
          source_pattern: sourcePattern,
          source_field: d.source_field ? String(d.source_field) : undefined,
          filters,
        });
```

Per-site filter-field documentation (per directive 2.3):

| Push site | Filter field | Source of filter value |
|---|---|---|
| 297 — `derivations.push(...generated)` | Spreads rules from `generateDerivationsForMatch`. Inside that helper, both `rules.push` sites (the `needsSum` branch at line 1221 and the `needsCount` branch at line 1230) ship `filters: []` (empty array literal). The `generateFilteredCountDerivations` delegate path is not read in this phase. | empty literal |
| 508 — target-pair `_target` derivation | `filters: []` | empty literal |
| 518 — `ratio` derivation | `filters: []` | empty literal |
| 624 — `derivations.push(...aiResult.derivations)` | Spreads AI-derived rules. Construction at site 2571. | derived from AI Pass 4 JSON response (see below) |
| 2571 — Pass 4 typed-derivation construction | `filters` populated from `d.filters` on the AI JSON output via a typed copy. Only entries with both `f.field` and `f.value != null` are kept. | AI Pass 4 LLM response |
