# AUD-009 -- LLM Output Fidelity Audit Output

**Date:** 2026-05-15
**Branch:** aud-009-llm-output-fidelity
**HEAD commit:** f782612272ee35f4cdfa76f8fe071851b3182a70 (pre-Phase-0 base; updated below per phase)
**Scope:** Every function that transforms, reduces, or gates LLM output or signal content across the full pipeline.

Defect class: function cherry-picks known fields from rich input, silently discarding unenumerated content.

CC pastes verbatim code at every section. No interpretation. No PASS/FAIL. No fix proposals.

## Phase 1 -- Pipeline inventory

### 1.1 LLM output consumers (`interpretation.*`, `response.*`, `rawResult.*`, `aiResult.*`, `llmResult.*`, `planResult.*`)

```
web/src/lib/compensation/plan-comprehension-emitter.ts:67:    const components = Array.isArray(args.interpretation.components) ? args.interpretation.components : [];
web/src/lib/compensation/ai-plan-interpreter.ts:284:  const employeeTypes = interpretation.employeeTypes || [];
web/src/lib/compensation/ai-plan-interpreter.ts:285:  const allComponents = interpretation.components || [];
web/src/lib/compensation/ai-plan-interpreter.ts:363:    name: interpretation.ruleSetName,
web/src/lib/compensation/ai-plan-interpreter.ts:364:    description: interpretation.description,
web/src/lib/compensation/ai-plan-interpreter.ts:497: * @param rawResult - The raw `response.result` from `aiService.interpretPlan()`
web/src/lib/ai/training-signal-service.ts:63:      signalType: lookupAITaskSignalType(response.task) ?? response.task,
web/src/lib/ai/training-signal-service.ts:66:        requestId: response.requestId,
web/src/lib/ai/training-signal-service.ts:67:        task: response.task,
web/src/lib/ai/training-signal-service.ts:68:        aiOutput: response.result,
web/src/lib/ai/training-signal-service.ts:71:      confidence: response.confidence,
web/src/lib/ai/training-signal-service.ts:76:        provider: response.provider,
web/src/lib/ai/training-signal-service.ts:77:        model: response.model,
web/src/lib/ai/training-signal-service.ts:78:        tokenUsage: response.tokenUsage,
web/src/lib/ai/training-signal-service.ts:79:        latencyMs: response.latencyMs,
web/src/app/api/import/sci/execute/route.ts:1176:  const interpretation = response.result;
web/src/app/api/import/sci/execute/route.ts:1230:        aiConfidence: response.confidence,
web/src/app/api/import/sci/execute/route.ts:1253:  // HF-201 Shape B: pass plan-agent's original output (interpretation.components) so the
web/src/app/api/import/sci/execute/route.ts:1255:  // reasoning during convertComponent; routing to interpretation.components preserves it.
web/src/app/api/import/sci/execute/route.ts:1258:    const componentsForSignals = (interpretation.components ?? []) as unknown as Array<Record<string, unknown>>;
web/src/app/api/import/sci/execute/route.ts:1263:      planConfidence: response.confidence,
web/src/app/api/import/sci/execute/route.ts:1429:  const interpretation = response.result;
web/src/app/api/import/sci/execute/route.ts:1483:        aiConfidence: response.confidence,
web/src/app/api/import/sci/execute/route.ts:1505:  // HF-201 Shape B: pass plan-agent's original output (interpretation.components) so the
web/src/app/api/import/sci/execute/route.ts:1509:    const componentsForSignals = (interpretation.components ?? []) as unknown as Array<Record<string, unknown>>;
web/src/app/api/import/sci/execute/route.ts:1514:      planConfidence: response.confidence,
```

(`web/src/lib/ai/file-classifier.ts`, `ai-service.ts`, `anthropic-adapter.ts` hits filtered: HTTP `response.ok` / `response.status` / `response.json` — fetch-response handling, not LLM-output handling.)

### 1.2 Signal writers

```
web/src/lib/intelligence/classification-signal-service.ts:21:import { writeSignal, writeSignalBatch, CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
web/src/lib/intelligence/classification-signal-service.ts:77:  // OB-199 Phase 4: canonical writer (replaces persistSignal thin-wrap).
web/src/lib/intelligence/classification-signal-service.ts:137:  // OB-199 Phase 4: canonical writer batch (replaces persistSignalBatch thin-wrap).
web/src/lib/intelligence/classification-signal-service.ts:138:  writeSignalBatch(signals, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
web/src/lib/intelligence/canonical-signal-writer.ts:172: * Build the canonical `classification_signals` insert row from a
web/src/lib/intelligence/canonical-signal-writer.ts:295:    const { error } = await supabase.from('classification_signals').insert(row);
web/src/lib/intelligence/canonical-signal-writer.ts:317:      const { error: obsError } = await supabase.from('classification_signals').insert(obsRow);
web/src/lib/intelligence/canonical-signal-writer.ts:354:export async function writeSignalBatch(
web/src/lib/intelligence/canonical-signal-writer.ts:372:export async function writeSignalBatchWithClient(
web/src/lib/intelligence/canonical-signal-writer.ts:395:    const { error } = await supabase.from('classification_signals').insert(rows);
web/src/lib/intelligence/canonical-signal-writer.ts:437:      const { error: obsError } = await supabase.from('classification_signals').insert(obsRows);
web/src/lib/signals/briefing-signals.ts:13:import { writeSignalBatchWithClient, ... } from '@/lib/intelligence/canonical-signal-writer';
web/src/lib/signals/briefing-signals.ts:73:    await writeSignalBatchWithClient(signals, supabase);
web/src/lib/signals/stream-signals.ts:13:import { writeSignalBatchWithClient, ... } from '@/lib/intelligence/canonical-signal-writer';
web/src/lib/signals/stream-signals.ts:68:    await writeSignalBatchWithClient(signals, supabase);
web/src/lib/sci/signal-capture-service.ts:12:import { writeSignal, writeSignalBatch, CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
```

### 1.3 Signal consumers (read `classification_signals`)

```
web/src/app/api/ingest/classification/route.ts:45:      .from('classification_signals')
web/src/app/api/signals/route.ts:37:      .from('classification_signals')
web/src/app/api/signals/route.ts:127:      .from('classification_signals')
web/src/app/api/platform/observatory/route.ts:223,389,717
web/src/app/api/import/sci/trace/route.ts:27:      .from('classification_signals')
web/src/lib/intelligence/ai-metrics-service.ts:96:    .from('classification_signals')
web/src/lib/sci/contextual-reliability.ts:67:      .from('classification_signals')
web/src/lib/intelligence/convergence-service.ts:210:  const metricComprehensionSignals = await loadMetricComprehensionSignals(...)
web/src/lib/intelligence/convergence-service.ts:240,250 .from('classification_signals')
web/src/lib/intelligence/convergence-service.ts:830:async function loadMetricComprehensionSignals(...)
web/src/lib/intelligence/convergence-service.ts:836:    .from('classification_signals')
```

### 1.4 Derivation constructors in `convergence-service.ts`

```
181:  const derivations: MetricDerivationRule[] = [];
297:    derivations.push(...generated);
508:      derivations.push({                 (filters: [] at 513)
518:      derivations.push({                 (filters: [] at 522)
624:      derivations.push(...aiResult.derivations);
1184:): MetricDerivationRule[] {              (generateDerivationsForMatch)
1185:  const rules: MetricDerivationRule[] = [];
1226:          filters: [],                   (rules.push, sum branch)
1234:        filters: [],                     (rules.push, count branch)
2328:): MetricDerivationRule[] {              (second helper signature)
2329:  const rules: MetricDerivationRule[] = [];
2370:  const filters: MetricDerivationRule['filters'] = [...]
2395:// MetricDerivationRule entries.
2405:): Promise<{ derivations: MetricDerivationRule[]; gaps: ... }>  (generateAISemanticDerivations)
2406:  const derivations: MetricDerivationRule[] = [];
2540:        // Validate operation is a valid MetricDerivationRule operation
2558:        const filters: MetricDerivationRule['filters'] = [];
2564:                operator: (String(f.operator || 'eq') as ...)
2571:        derivations.push({
2573:          operation: operation as MetricDerivationRule['operation'],
```

### 1.5 AI response parsers in `convergence-service.ts`

```
311:  // HF-112 / HF-199 D2: Generate all component bindings with AI mapping + boundary validation.
621:      const aiResult = await generateAISemanticDerivations(...)
624:      derivations.push(...aiResult.derivations);
625:      for (const g of aiResult.gaps) {
1830:// HF-113: Validate that AI response is a metric→column mapping (not a narrative)
1932:    console.log(`[Convergence] HF-114 AI mapping: ${JSON.stringify(mapping)}`);
2099:  // HF-112 / HF-199 D2: AI-assisted column mapping (ONE call) with metric_comprehension
2102:  const aiMapping = await resolveColumnMappingsViaAI(components, allRequirements, measureColumns, metricComprehension);
2120:      const proposedColumnName = aiMapping[req.metricField];
```

### 1.6 Bridge functions

```
web/src/app/api/import/sci/execute/route.ts:1190:  const { bridgeAIToEngineFormat } = await import('@/lib/compensation/ai-plan-interpreter');
web/src/app/api/import/sci/execute/route.ts:1191:  const engineFormat = bridgeAIToEngineFormat(...)
web/src/app/api/import/sci/execute/route.ts:1444:  const { bridgeAIToEngineFormat } = await import('@/lib/compensation/ai-plan-interpreter');
web/src/app/api/import/sci/execute/route.ts:1445:  const engineFormat = bridgeAIToEngineFormat(...)
web/src/lib/compensation/ai-plan-interpreter.ts:275:export function interpretationToPlanConfig(
web/src/lib/compensation/ai-plan-interpreter.ts:298:        return convertComponent(compCopy, index);
web/src/lib/compensation/ai-plan-interpreter.ts:347:        return convertComponent(compCopy, index);
web/src/lib/compensation/ai-plan-interpreter.ts:382:function convertComponent(comp: InterpretedComponent, order: number): PlanComponent {
web/src/lib/compensation/ai-plan-interpreter.ts:502:export function bridgeAIToEngineFormat(...)
```

### Deduplicated function inventory

| # | Function | File | Stage |
|---|---|---|---|
| 1 | `emitPlanComprehensionSignals` | `lib/compensation/plan-comprehension-emitter.ts` | Signal Write |
| 2 | `writeSignal` / `writeSignalBatch` / `writeSignalBatchWithClient` | `lib/intelligence/canonical-signal-writer.ts` | Signal Write (canonical) |
| 3 | `writeClassificationSignal` / `aggregateToFoundational` / `aggregateToDomain` | `lib/sci/classification-signal-service.ts` | Signal Write (SCI) |
| 4 | `writeFingerprint` / signal-capture-service helpers | `lib/sci/signal-capture-service.ts` | Signal Write (fingerprint) |
| 5 | briefing-signals.ts / stream-signals.ts helpers | `lib/signals/*` | Signal Write (UI) |
| 6 | `loadMetricComprehensionSignals` | `lib/intelligence/convergence-service.ts` | Signal Read |
| 7 | metricComprehension consumers (Pass 4 prompt builder, resolveColumnMappingsViaAI) | `convergence-service.ts` | Signal Read |
| 8 | `generateDerivationsForMatch` | `convergence-service.ts` | Derivation construction |
| 9 | `generateFilteredCountDerivations` | `convergence-service.ts` (≈2328) | Derivation construction |
| 10 | `generateAISemanticDerivations` | `convergence-service.ts` (≈2405) | AI parse → Derivation |
| 11 | `resolveColumnMappingsViaAI` | `convergence-service.ts` (≈1843) | AI prompt + parse |
| 12 | `bridgeAIToEngineFormat` | `lib/compensation/ai-plan-interpreter.ts` (≈502) | Bridge |
| 13 | `interpretationToPlanConfig` | `lib/compensation/ai-plan-interpreter.ts` (275) | Bridge |
| 14 | `convertComponent` | `lib/compensation/ai-plan-interpreter.ts` (382) | Bridge |
| 15 | `transformFromMetadata` / `normalizeIntentInput` / `transformVariant` | `lib/calculation/intent-transformer.ts` | Bridge (intent shape) |
| 16 | `applyMetricDerivations` + `rowMatchesFilters` | `lib/calculation/run-calculation.ts` | Engine |
| 17 | `resolveMetricsFromConvergenceBindings` | `app/api/calculation/run/route.ts` | Engine |
| 18 | `resolveColumnFromBatch` | `app/api/calculation/run/route.ts` | Engine |
| 19 | `recordAITrainingSignal` | `lib/ai/training-signal-service.ts` | Signal Write (training) |

## Phase 2 -- Signal emission stage

### 2.1 `emitPlanComprehensionSignals` -- full file at current HEAD

`wc -l web/src/lib/compensation/plan-comprehension-emitter.ts`:

```
     134 web/src/lib/compensation/plan-comprehension-emitter.ts
```

Full file (134 lines):

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

`signalValue` is a new object literal (lines 89-101). Fields included: `metric_label`, `metric_op`, `metric_inputs`, `semantic_intent`, `component_id`, `component_type`, `source_evidence`. No spread of `rawComp`. Any field on `rawComp` (e.g., `filters`, plan-specific predicate vocabulary) that is not one of the enumerated extractions above is discarded before the signal row is built.

### 2.2 Other signal writers

#### 2.2.1 `writeSignal` / `writeSignalBatch` (canonical writer)

`canonical-signal-writer.ts:181-204` — `buildInsertRow`:

```typescript
function buildInsertRow(signal: CanonicalSignalInput, confidenceToPersist: number | null): Record<string, unknown> {
  return {
    tenant_id: signal.tenantId,
    entity_id: signal.entityId ?? null,
    signal_type: signal.signalType,
    signal_value: (signal.signalValue ?? {}) as Json,
    confidence: confidenceToPersist,
    source: signal.source ?? 'ai_prediction',
    context: (signal.context ?? {}) as Json,
    calculation_run_id: signal.calculationRunId ?? null,
    rule_set_id: signal.ruleSetId ?? null,
    // Dedicated columns (AUD-001 F-002 collapse; nullable when not provided)
    source_file_name: signal.sourceFileName ?? null,
    sheet_name: signal.sheetName ?? null,
    structural_fingerprint: (signal.structuralFingerprint ?? null) as Json | null,
    classification: signal.classification ?? null,
    decision_source: signal.decisionSource ?? null,
    classification_trace: (signal.classificationTrace ?? null) as Json | null,
    vocabulary_bindings: (signal.vocabularyBindings ?? null) as Json | null,
    agent_scores: (signal.agentScores ?? null) as Json | null,
    human_correction_from: signal.humanCorrectionFrom ?? null,
    scope: signal.scope ?? null,
  };
}
```

`buildInsertRow` constructs a new row literal from the `CanonicalSignalInput` enumerated fields. `signal_value` is carried whole into the JSONB column (`(signal.signalValue ?? {}) as Json`). No field on `signalValue` is inspected or stripped at this layer.

`writeSignal` body (lines 268-340) and `writeSignalBatch` body (lines 354-430) wrap `buildInsertRow` plus a `validateSignal(signal)` confidence check and DB insert. Neither function inspects `signalValue` contents beyond passing through.

#### 2.2.2 `writeClassificationSignal` (SCI dedicated-column emitter)

`lib/sci/classification-signal-service.ts:100-127`:

```typescript
export async function writeClassificationSignal(
  payload: ClassificationSignalPayload,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<void> {
  await writeSignal(
    {
      tenantId: payload.tenantId,
      signalType: 'classification:outcome',
      sourceFileName: payload.sourceFileName,
      sheetName: payload.sheetName,
      structuralFingerprint: payload.fingerprint as unknown as Record<string, unknown>,
      classification: payload.classification,
      confidence: payload.confidence,
      decisionSource: payload.decisionSource,
      classificationTrace: payload.classificationTrace as unknown as Record<string, unknown>,
      vocabularyBindings: payload.vocabularyBindings,
      agentScores: payload.agentScores,
      humanCorrectionFrom: payload.humanCorrectionFrom,
      scope: 'tenant',
      source: payload.humanCorrectionFrom ? 'user_corrected' : 'sci_agent',
      context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' },
      calculationRunId: payload.calculationRunId ?? null,
    },
    supabaseUrl,
    supabaseServiceKey,
  );
}
```

`writeClassificationSignal` constructs a new `CanonicalSignalInput` literal from `ClassificationSignalPayload` enumerated fields. The payload is fully matched 1:1 to canonical input fields with no `signalValue` JSONB body (the SCI path uses dedicated columns: classification, decisionSource, classificationTrace, etc.).

#### 2.2.3 `recordSignal` / `recordAIClassificationBatch` (intelligence/classification-signal-service)

`lib/intelligence/classification-signal-service.ts:69-99`:

```typescript
export function recordSignal(
  signal: Omit<ClassificationSignal, 'id' | 'timestamp'>,
  calculationRunId?: string,
): string {
  if (typeof window === 'undefined') return '';

  const id = `cs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // OB-199 Phase 4: canonical writer (replaces persistSignal thin-wrap).
  writeSignal({
    tenantId: signal.tenantId,
    signalType: 'classification:outcome',
    signalValue: {
      domain: signal.domain,
      fieldName: signal.fieldName,
      semanticType: signal.semanticType,
    },
    confidence: signal.confidence,
    source: signal.source,
    context: signal.metadata ?? {},
    calculationRunId,
  }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
    if (err instanceof CanonicalWriteError) {
      console.warn(`[ClassificationSignalService] recordSignal CanonicalWriteError (${err.cause}): ${err.message}`);
    } else {
      console.warn('[ClassificationSignalService] recordSignal unexpected error:', err instanceof Error ? err.message : String(err));
    }
  });

  return id;
}
```

`signalValue` is a new literal with exactly three fields: `domain`, `fieldName`, `semanticType`. Any other field on the input `signal` (other than `confidence`, `source`, `metadata`) is discarded.

`recordAIClassificationBatch` (lines 109-147) maps over `mappings` (each `{ fieldName, semanticType, confidence }`) and produces `signalValue: { domain, fieldName, semanticType }` per row — identical three-field literal.

## Phase 3 -- Signal consumption and derivation construction stage

### 3.1 `loadMetricComprehensionSignals` consumption sites

(`loadMetricComprehensionSignals` body already in DIAG-047 Phase 2.1 — unchanged on current HEAD.) Per-site consumption sites:

| Site (line) | Code surface | Fields read from `signal_value` |
|---|---|---|
| 595-604 (Pass 4 metric-context build) | `MetricContext` literal builder | `metric_label`, `semantic_intent`, `metric_inputs` |
| 1857-1873 (resolveColumnMappingsViaAI) | `semanticIntentByMetricField` map | `metric_label`, `semantic_intent`, `metric_inputs` |
| 2447-2457 (Pass 4 AI prompt metric description) | `metricDescriptions` text | `metric_label`, `semantic_intent`, `metric_inputs` (carried through via `mc.*`) |

No consumption site inspects keys outside `metric_label`, `semantic_intent`, `metric_inputs`. Other fields in `signal_value` (`component_id`, `component_type`, `source_evidence`) are not read.

### 3.2 `derivations.push` sites — filters source

Already enumerated in DIAG-047 Phase 2.3:

| Push site | Filter field source |
|---|---|
| 297 — `derivations.push(...generated)` | Spreads from `generateDerivationsForMatch`. Inside the helper, both `rules.push` sites ship `filters: []` (empty literal). Delegate path via `generateFilteredCountDerivations` — see §3.3. |
| 508 — `_target` derivation | `filters: []` empty literal |
| 518 — `ratio` derivation | `filters: []` empty literal |
| 624 — `derivations.push(...aiResult.derivations)` | Spreads AI-derived rules; construction at site 2571. |
| 2571 — Pass 4 typed-derivation construction | `filters` populated from `d.filters` on AI JSON response, copied via typed loop. Only entries with `f.field && f.value != null` admitted. |

### 3.3 `generateFilteredCountDerivations` -- full body (lines 2324-2389)

```typescript
function generateFilteredCountDerivations(
  component: PlanComponent,
  dataType: string,
  capability: DataCapability
): MetricDerivationRule[] {
  const rules: MetricDerivationRule[] = [];
  const compTokens = tokenize(component.name);

  let bestCatField: { field: string; matchedValue: string } | null = null;
  let bestCatScore = 0;

  for (const catField of capability.categoricalFields) {
    for (const value of catField.distinctValues) {
      const valueTokens = tokenize(value);
      const overlap = compTokens.filter(t =>
        valueTokens.some(v => v.includes(t) || t.includes(v))
      );
      const score = overlap.length / Math.max(valueTokens.length, 1);
      if (score > bestCatScore) {
        bestCatScore = score;
        bestCatField = { field: catField.field, matchedValue: value };
      }
    }
  }

  if (!bestCatField || bestCatScore < 0.3) {
    for (const metricName of component.expectedMetrics) {
      const metricTokens = tokenize(metricName);
      for (const catField of capability.categoricalFields) {
        for (const value of catField.distinctValues) {
          const valueTokens = tokenize(value);
          const overlap = metricTokens.filter(t =>
            valueTokens.some(v => v.includes(t) || t.includes(v))
          );
          const score = overlap.length / Math.max(metricTokens.length, 1);
          if (score > bestCatScore) {
            bestCatScore = score;
            bestCatField = { field: catField.field, matchedValue: value };
          }
        }
      }
    }
  }

  if (!bestCatField) return rules;

  const filters: MetricDerivationRule['filters'] = [
    { field: bestCatField.field, operator: 'eq', value: bestCatField.matchedValue },
  ];

  if (capability.booleanFields.length > 0) {
    const qualField = capability.booleanFields[0];
    filters.push({ field: qualField.field, operator: 'eq', value: qualField.trueValue });
  }

  for (const metricName of component.expectedMetrics) {
    rules.push({
      metric: metricName,
      operation: 'count',
      source_pattern: dataType,
      filters,
    });
  }

  return rules;
}
```

Trigger condition (from `generateDerivationsForMatch` at line 1191): `if (isSharedBase && capability.categoricalFields.length > 0) return generateFilteredCountDerivations(...);` — fires only when two or more matched components share the same `dataType` and the capability exposes at least one categorical field. The `rules.push` at line 2380 unconditionally uses `operation: 'count'`. The function never produces `operation: 'sum'` derivations and therefore never produces filtered sum derivations from this path. Filter values are derived from token overlap between component name (or metric name) and `capability.categoricalFields[*].distinctValues` — not from LLM output or signals.

### 3.4 `generateAISemanticDerivations` -- full body (lines 2400-2615)

```typescript
async function generateAISemanticDerivations(
  metricContexts: MetricContext[],
  capabilities: DataCapability[],
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ derivations: MetricDerivationRule[]; gaps: Array<{ metric: string; reason: string; resolution: string }> }> {
  const derivations: MetricDerivationRule[] = [];
  const gaps: Array<{ metric: string; reason: string; resolution: string }> = [];

  if (metricContexts.length === 0) return { derivations, gaps };
  const unresolvedMetrics = metricContexts.map(mc => mc.name);

  // 1. Build column inventory for AI
  const columnDescriptions: string[] = [];
  for (const cap of capabilities) {
    columnDescriptions.push(`Data type: "${cap.dataType}" (${cap.rowCount} rows)`);
    for (const nf of cap.numericFields) {
      const stats = cap.columnStats[nf.field];
      columnDescriptions.push(`  - ${nf.field}: numeric (avg=${nf.avg.toFixed(2)}${stats ? `, min=${stats.min}, max=${stats.max}` : ''})`);
    }
    for (const cf of cap.categoricalFields) {
      columnDescriptions.push(`  - ${cf.field}: categorical (values: ${cf.distinctValues.join(', ')})`);
    }
    for (const bf of cap.booleanFields) {
      columnDescriptions.push(`  - ${bf.field}: boolean (true="${bf.trueValue}", false="${bf.falseValue}")`);
    }
  }

  // 2. Get sample rows
  // HF-196 Phase 1E: filter out superseded batches per Rule 30.
  const { fetchSupersededBatchIds: fetchSupersededBatchIds2 } = await import('@/lib/sci/import-batch-supersession');
  const supersededIds3 = await fetchSupersededBatchIds2(supabase, tenantId);
  let q3 = supabase
    .from('committed_data')
    .select('row_data')
    .eq('tenant_id', tenantId)
    .not('row_data', 'is', null)
    .limit(3);
  if (supersededIds3.length > 0) q3 = q3.not('import_batch_id', 'in', `(${supersededIds3.join(',')})`);
  const { data: sampleRows } = await q3;

  const sampleData = (sampleRows || []).map(r => r.row_data);

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

  const userPrompt = `You are a data analyst bridging calculation plan metrics to available data columns.

You receive:
1. Required metrics with semantic labels describing what each metric represents
2. Available data columns with types, statistics, and categorical values

Your task: For each required metric, determine how to derive it from the available data.

IMPORTANT RULES:
- Match the metric's semantic label to available data fields. If the label suggests a subset of a broader numeric field (e.g., "Equipment Revenue" from a general "total_amount"), identify the categorical field and value that filters to the correct subset.
- Use the categorical field's distinct values to find exact filter matches. The filter value must be one of the listed distinct values.
- For count metrics (e.g., "Deal Count", "Cross Sell Count"), use the "count" operation with appropriate filters.
- For metrics with a scope note, the derivation defines how to compute the metric per entity — the platform handles scope aggregation separately.

Operations:
- sum: SUM a numeric field, optionally filtered by a categorical field value
- count: COUNT rows, optionally filtered by a categorical field value
- ratio: Divide one derived metric by another
- delta: Difference between two values

Respond with ONLY valid JSON, no markdown, no explanation:
{
  "derivations": [
    {
      "metric": "the_metric_name",
      "operation": "sum",
      "source_field": "column_name_to_aggregate",
      "filters": [
        { "field": "column_name", "operator": "eq", "value": "filter_value" }
      ]
    }
  ],
  "gaps": [
    {
      "metric": "the_metric_name",
      "reason": "Why this metric cannot be derived",
      "resolution": "What data the user should import"
    }
  ]
}

Required metrics:
${metricDescriptions}

Available data columns:
${columnDescriptions.join('\n')}

Data sample (first ${sampleData.length} rows):
${JSON.stringify(sampleData, null, 2)}

Generate derivation rules for each required metric. Use filters to narrow broad fields to specific subsets when the metric label implies a category.`;

  // 4. Call AI
  try {
    const aiService = getAIService();
    const response = await aiService.execute({
      task: 'natural_language_query',
      input: { question: userPrompt, context: {} },
      options: { responseFormat: 'json', maxTokens: 4096, temperature: 0 },
    }, false);

    // 5. Parse response — handle different response shapes
    let parsedResult: Record<string, unknown> = response.result as Record<string, unknown>;
    // If wrapped in natural_language_query response format, extract from answer
    if (parsedResult?.answer && typeof parsedResult.answer === 'string') {
      try {
        parsedResult = JSON.parse(parsedResult.answer);
      } catch {
        // answer might already be an object or unparseable
      }
    }
    // If the result itself has derivations, use it directly
    const aiDerivations = (parsedResult?.derivations as Array<Record<string, unknown>>) ?? [];
    const aiGaps = (parsedResult?.gaps as Array<Record<string, unknown>>) ?? [];

    if (Array.isArray(aiDerivations)) {
      for (const d of aiDerivations) {
        const metric = String(d.metric || '');
        const operation = String(d.operation || 'sum');
        if (!metric || !unresolvedMetrics.includes(metric)) continue;

        // Validate operation is a valid MetricDerivationRule operation
        const validOps = ['sum', 'count', 'ratio', 'delta'];
        if (!validOps.includes(operation)) continue;

        // Find the data_type that contains the source_field
        let sourcePattern = '.*';
        for (const cap of capabilities) {
          const hasField = cap.numericFields.some(f => f.field === d.source_field) ||
            cap.categoricalFields.some(f => f.field === d.source_field) ||
            (Array.isArray(d.filters) && d.filters.some((df: Record<string, unknown>) =>
              cap.categoricalFields.some(f => f.field === df.field)
            ));
          if (hasField) {
            sourcePattern = cap.dataType;
            break;
          }
        }

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
      }
    }
```

AI response-schema fields requested by the prompt: `metric`, `operation`, `source_field`, `filters[{field, operator, value}]`, plus a `gaps[]` array. AI response parsing extracts only `metric`, `operation`, `source_field`, `filters`. Any other field in the AI's JSON output is silently discarded. The typed-rule construction at 2571 enumerates: `metric`, `operation`, `source_pattern`, `source_field`, `filters` — no spread of `d`, no carry of additional fields.

## Phase 4 -- Bridge and transformation stage

### 4.1 `bridgeAIToEngineFormat` (lines 502-526)

```typescript
export function bridgeAIToEngineFormat(
  rawResult: Record<string, unknown>,
  tenantId: string,
  userId: string,
): {
  name: string;
  description: string;
  components: { variants: Array<{ variantId: string; variantName: string; description?: string; components: PlanComponent[] }> };
  inputBindings: Record<string, unknown>;
} {
  // Step 1: Normalize the raw AI output through the same pipeline as the plan import page
  // OB-199 Phase 1: standalone function call (no class indirection per architect Option (b))
  const normalized = validateAndNormalizePlanInterpretation(rawResult);

  // Step 2: Convert to engine format via interpretationToPlanConfig
  const config = interpretationToPlanConfig(normalized, tenantId, userId);
  const additiveLookup = config.configuration as AdditiveLookupConfig;

  return {
    name: normalized.ruleSetName,
    description: normalized.description,
    components: { variants: additiveLookup.variants },
    inputBindings: {},
  };
}
```

Return literal enumerates four fields: `name`, `description`, `components`, `inputBindings`. `inputBindings: {}` is a hardcoded empty object. The full `rawResult` after `validateAndNormalizePlanInterpretation` flows through `interpretationToPlanConfig`; the resulting `additiveLookup.variants` is the only `rawResult`-derived data returned. The `normalized` value itself is not returned; `rawResult` fields not picked up by `validateAndNormalizePlanInterpretation` (e.g., any free-form LLM keys) are discarded.

### 4.2 `interpretationToPlanConfig` (lines 275-380)

```typescript
export function interpretationToPlanConfig(
  interpretation: PlanInterpretation,
  tenantId: string,
  userId: string
): RuleSetConfig {
  const now = new Date().toISOString();
  const ruleSetId = crypto.randomUUID();

  // Build variants from employee types
  const employeeTypes = interpretation.employeeTypes || [];
  const allComponents = interpretation.components || [];

  const variants = employeeTypes.map((empType) => {
    const components = allComponents
      .filter(
        (c) =>
          (c.appliesToEmployeeTypes?.includes('all') ?? true) ||
          (c.appliesToEmployeeTypes?.includes(empType.id) ?? false)
      )
      .map((comp, index) => {
        const compCopy = JSON.parse(JSON.stringify(comp)) as InterpretedComponent;
        return convertComponent(compCopy, index);
      });
    // ... (logging only) ...
    return {
      variantId: empType.id,
      variantName: empType.name,
      description: empType.nameEs || empType.name,
      eligibilityCriteria: empType.eligibilityCriteria || {},
      components,
    };
  });

  if (variants.length === 0) {
    variants.push({
      variantId: 'default',
      variantName: 'Default',
      description: 'Default plan variant',
      eligibilityCriteria: {},
      components: allComponents.map((comp, index) => {
        const compCopy = JSON.parse(JSON.stringify(comp)) as InterpretedComponent;
        return convertComponent(compCopy, index);
      }),
    });
  }

  const config: AdditiveLookupConfig = {
    type: 'additive_lookup',
    variants,
  };

  return {
    id: ruleSetId,
    tenantId,
    name: interpretation.ruleSetName,
    description: interpretation.description,
    ruleSetType: 'additive_lookup',
    status: 'draft',
    effectiveDate: now,
    endDate: null,
    eligibleRoles: [], // HF-161
    version: 1,
    previousVersionId: null,
    createdBy: userId,
    createdAt: now,
    updatedBy: userId,
    approvedBy: null,
    approvedAt: null,
    configuration: config,
  };
}
```

Input fields read: `interpretation.employeeTypes`, `interpretation.components`, `interpretation.ruleSetName`, `interpretation.description`. Each component flows through `convertComponent`. Each variant literal enumerates `variantId`, `variantName`, `description`, `eligibilityCriteria`, `components` — no spread of `empType`, no carry of other fields. Final `RuleSetConfig` literal enumerates 17 fields; `interpretation`-side input contributes only `ruleSetName` and `description`. Any field on `interpretation` outside `employeeTypes`, `components`, `ruleSetName`, `description` is discarded.

### 4.3 `convertComponent` (lines 382-487)

```typescript
function convertComponent(comp: InterpretedComponent, order: number): PlanComponent {
  const base: Omit<PlanComponent, 'componentType' | 'matrixConfig' | 'tierConfig' | 'percentageConfig' | 'conditionalConfig'> = {
    id: comp?.id || `component-${order}`,
    name: comp?.name || `Component ${order + 1}`,
    description: comp?.nameEs || comp?.reasoning || '',
    order: order + 1,
    enabled: true,
    measurementLevel: 'store',
    // OB-77: Pass through AI-produced structural intent
    calculationIntent: comp?.calculationIntent,
  };

  const calcMethod = comp?.calculationMethod;
  const calcType = (base.calculationIntent?.operation as string) || calcMethod?.type || '';

  if (!isRegisteredPrimitive(calcType)) {
    throw new UnconvertibleComponentError(...);
  }

  // (boundary canonicalization for bounded_lookup primitives)

  switch (calcType as FoundationalPrimitive) {
    case 'bounded_lookup_1d':
    case 'bounded_lookup_2d':
    case 'scalar_multiply':
    case 'conditional_gate':
    case 'aggregate':
    case 'ratio':
    case 'constant':
    case 'weighted_blend':
    case 'temporal_window':
    case 'linear_function':
    case 'piecewise_linear':
    case 'scope_aggregate':
      return {
        ...base,
        componentType: calcType as FoundationalPrimitive,
        metadata: {
          ...(base.metadata || {}),
          intent: base.calculationIntent, // copy for transformFromMetadata
        },
      };
    default: {
      // (exhaustive guard throw)
    }
  }
}
```

`base` literal enumerates seven fields from `comp`: `id`, `name`, `description` (from `nameEs || reasoning`), `order`, `enabled`, `measurementLevel`, `calculationIntent`. No spread of `comp`. The `comp` fields NOT read here: `reasoning` (read only as fallback for `description`), `confidence`, `expectedMetrics`, `metrics[]`, `appliesToEmployeeTypes` (read earlier in `interpretationToPlanConfig` for variant filtering), plus any free-form LLM field. The returned object spreads `base` and adds `componentType` + `metadata.intent` — no other `comp` field flows through to the final `PlanComponent`.

### 4.4 `transformVariant` / `normalizeIntentInput` / `transformFromMetadata` (intent-transformer.ts)

`transformVariant` (lines 52-61) — pure delegation loop; carries every component result.

`normalizeIntentInput` (lines 86-129) — discriminator with five branches:
- `null` → `{ source: 'constant', value: 0 }`
- `string` → `{ source: 'metric', sourceSpec: { field: raw } }`
- `number` → `{ source: 'constant', value: raw }`
- `'operation' in obj && obj.operation === 'ratio'` → `{ operation: 'ratio', numerator, denominator, zeroDenominatorBehavior }` (recurses)
- `'operation' in obj` (other operations) → `return obj as IntentOperation` (full carry)
- `obj.source === 'ratio'` → constructs ratio operation (recurses)
- `obj.source ∈ { metric, constant, entity_attribute, prior_component, cross_data, scope_aggregate, aggregate }` → `return obj as IntentSource` (full carry)
- fallback → `{ source: 'constant', value: 0 }`

Non-`ratio` operation and recognized-source branches return `obj` directly (no field cherry-pick).

`transformFromMetadata` (lines 131-268):

```typescript
function transformFromMetadata(
  component: PlanComponent,
  componentIndex: number
): ComponentIntent | null {
  const meta = (component.metadata || {}) as Record<string, unknown>;
  const rawIntent = (meta?.intent || (component as unknown as Record<string, unknown>).calculationIntent) as Record<string, unknown> | undefined;
  if (!rawIntent) return null;

  let operation: IntentOperation;
  if (rawIntent.additionalConstant != null && rawIntent.rate != null) {
    operation = {
      operation: 'linear_function',
      input: normalizeIntentInput(rawIntent.input),
      slope: Number(rawIntent.rate),
      intercept: Number(rawIntent.additionalConstant),
    } as IntentOperation;
  } else if (rawIntent.operation === 'scalar_multiply' && rawIntent.rate != null) {
    operation = {
      operation: 'scalar_multiply',
      input: normalizeIntentInput(rawIntent.input),
      rate: Number(rawIntent.rate),
    } as IntentOperation;
  } else if (rawIntent.operation === 'piecewise_linear') {
    // ... ratioInput/baseInput/targetValue/segments construction ...
    operation = { operation: 'piecewise_linear', ratioInput, baseInput, ...(tv...), segments } as IntentOperation;
  } else if (rawIntent.operation === 'conditional_gate') {
    operation = {
      operation: 'conditional_gate',
      condition: { left, operator, right },
      onTrue: normalizeIntentInput(rawIntent.onTrue) as IntentOperation,
      onFalse: normalizeIntentInput(rawIntent.onFalse) as IntentOperation,
    } as IntentOperation;
  } else {
    operation = rawIntent as unknown as IntentOperation;
  }

  // HF-223 Phase 1: validation-passthrough modifiers
  const modifiers: IntentModifier[] = [];
  if (Array.isArray(rawIntent.modifiers)) {
    for (const mod of rawIntent.modifiers) {
      // discriminator-specific construction for cap / floor / proration / temporal_adjustment
      // ... 4 modifier discriminants ...
      // Unrecognized modifier discriminants: not pushed to typed array.
      // The LLM emission is preserved in rule_sets.components[].calculationIntent
      // (source of record). The executor processes typed modifiers only.
    }
  }

  // Legacy meta.cap / meta.floor shortcut
  if (meta.cap != null && Number(meta.cap) > 0) {
    modifiers.push({ modifier: 'cap', maxValue: Number(meta.cap), scope: 'per_period' });
  }
  if (meta.floor != null && Number(meta.floor) > 0) {
    modifiers.push({ modifier: 'floor', minValue: Number(meta.floor), scope: 'per_period' });
  }

  return {
    componentIndex,
    label: component.name,
    confidence: typeof meta.confidence === 'number' ? meta.confidence : 0.5,
    dataSource: {
      sheetClassification: 'transaction',
      entityScope: entityScope(component.measurementLevel),
      requiredMetrics: [],
    },
    intent: operation,
    modifiers,
    metadata: { ... },
  };
}
```

Construction pattern depends on the operation discriminant. Five named operations (`linear_function`, `scalar_multiply`, `piecewise_linear`, `conditional_gate`, plus the implicit chain) construct a new operation literal with cherry-picked fields. The fall-through branch (`else { operation = rawIntent as unknown as IntentOperation; }`) carries the full `rawIntent` for any unrecognized operation. Modifiers: four discriminants handled (cap, floor, proration, temporal_adjustment); unrecognized discriminants are dropped from the typed array (comment block lines 234-237 documents this; the unrecognized modifier remains visible only via `rule_sets.components[].calculationIntent` storage).

Returned `ComponentIntent` literal enumerates `componentIndex`, `label`, `confidence`, `dataSource`, `intent`, `modifiers`, `metadata` — no spread of `component`, no carry of other PlanComponent fields.

## Phase 5 -- AI response parsing stage

### 5.1 Convergence Pass 4 AI prompt response format

Hits from `grep -n "JSON.*response\|response.*format\|Return.*JSON\|respond.*with\|schema.*response\|Respond with ONLY valid JSON"`:

```
2479:Respond with ONLY valid JSON, no markdown, no explanation:
2522:    // If wrapped in natural_language_query response format, extract from answer
```

Both hits are inside `generateAISemanticDerivations`. Prompt schema definition (lines 2479-2498) — already pasted in Phase 3.4. The schema requested by the prompt:

```
{
  "derivations": [
    {
      "metric": "the_metric_name",
      "operation": "sum",
      "source_field": "column_name_to_aggregate",
      "filters": [
        { "field": "column_name", "operator": "eq", "value": "filter_value" }
      ]
    }
  ],
  "gaps": [
    {
      "metric": "the_metric_name",
      "reason": "Why this metric cannot be derived",
      "resolution": "What data the user should import"
    }
  ]
}
```

Derivation schema asks the LLM for: `metric`, `operation`, `source_field`, `filters[{field, operator, value}]`. The prompt actively encourages filters via rule statements at lines 2468-2472:

```
- Match the metric's semantic label to available data fields. If the label suggests a subset of a broader numeric field (e.g., "Equipment Revenue" from a general "total_amount"), identify the categorical field and value that filters to the correct subset.
- Use the categorical field's distinct values to find exact filter matches. The filter value must be one of the listed distinct values.
- For count metrics (e.g., "Deal Count", "Cross Sell Count"), use the "count" operation with appropriate filters.
- For metrics with a scope note, the derivation defines how to compute the metric per entity — the platform handles scope aggregation separately.
```

Final-line instruction at 2509: `Generate derivation rules for each required metric. Use filters to narrow broad fields to specific subsets when the metric label implies a category.`

### 5.2 AI response parser for Pass 4

Hits from `grep -n "parse.*response\|JSON\.parse\|aiResult\.\|mapping\["`:

```
624:      derivations.push(...aiResult.derivations);
625:      for (const g of aiResult.gaps) {
635:      console.log(`[Convergence] OB-185 Pass 4: ${aiResult.derivations.length} derivations, ${aiResult.gaps.length} gaps`);
636:      for (const d of aiResult.derivations) {
1929:        mapping[key] = val;
2521:    let parsedResult: Record<string, unknown> = response.result as Record<string, unknown>;
2525:        parsedResult = JSON.parse(parsedResult.answer);
```

Pass 4 parser body (lines 2520-2578) — already pasted in Phase 3.4. The parser:
1. Pulls `parsedResult` from `response.result`, optionally unwrapping `.answer` and re-parsing.
2. Reads `parsedResult.derivations` and `parsedResult.gaps`.
3. For each `d`: reads `d.metric`, `d.operation`, `d.source_field`, `d.filters`. Validates operation against `['sum', 'count', 'ratio', 'delta']`. Validates each filter has `f.field && f.value != null` before typed-copying `field`, `operator`, `value`.
4. Constructs `derivations.push({ metric, operation, source_pattern, source_field, filters })` — five-field literal.

Any field on the AI's `d` beyond those four is discarded. No spread of `d`. No carry of LLM-extension fields.

### 5.3 `resolveColumnMappingsViaAI` -- full body (lines 1843-1939)

Used by HF-114 column-name → metric-field mapping (the AI call whose log line was `[Convergence] HF-114 AI mapping: {...}`):

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

  const metricList = metricFields.map((f, i) => {
    const ctx = semanticIntentByMetricField.get(f);
    if (ctx) {
      const parts = [`${i + 1}. "${f}"`];
      if (ctx.intent) parts.push(`   plan-agent intent: ${ctx.intent}`);
      if (ctx.inputs) parts.push(`   plan-agent inputs: ${ctx.inputs}`);
      return parts.join('\n');
    }
    return `${i + 1}. "${f}"`;
  }).join('\n');

  const columnList = measureColumns.map((c, i) =>
    `${i + 1}. "${c.name}" (${c.fi.contextualIdentity})`
  ).join('\n');

  const userPrompt = `Match each metric field to the best data column. Each column used at most once.
Plan-agent intent and inputs (when shown) are AUTHORITATIVE — bind columns that
satisfy the stated intent over columns that merely share contextual labels.

METRIC FIELDS:
${metricList}

DATA COLUMNS:
${columnList}

EXAMPLE OUTPUT:
{"${metricFields[0] || 'metric_a'}": "${columnNames[0] || 'Column_A'}", "${metricFields[1] || 'metric_b'}": "${columnNames[1] || 'Column_B'}"}`;

  try {
    const aiService = getAIService();
    const response = await aiService.execute({
      task: 'convergence_mapping',
      input: { userMessage: userPrompt },
      options: { maxTokens: 500, responseFormat: 'json' as const },
    }, false);

    const result = response.result as Record<string, unknown>;

    if (!isValidColumnMapping(result, metricFields, columnNames)) {
      console.error(`[Convergence] HF-114 AI response invalid (keys: ${Object.keys(result).join(', ')}). Falling back to boundary matching.`);
      return {};
    }

    const mapping: Record<string, string> = {};
    for (const [key, val] of Object.entries(result)) {
      if (typeof val === 'string' && columnNames.includes(val)) {
        mapping[key] = val;
      }
    }
    console.log(`[Convergence] HF-114 AI mapping: ${JSON.stringify(mapping)}`);
    return mapping;
  } catch (err) {
    console.error('[Convergence] HF-114 AI mapping failed:', err);
  }

  return {};
}
```

Prompt example output schema: `{"metric_field_name": "column_name"}` — string→string map. No `filters` field. No category subsetting. No structured filter predicate vocabulary.

Validator (`isValidColumnMapping` lines 1830-1840):

```typescript
function isValidColumnMapping(
  result: Record<string, unknown>,
  metricFields: string[],
  columnNames: string[],
): boolean {
  const mappedCount = metricFields.filter(m =>
    typeof result[m] === 'string' && columnNames.includes(result[m] as string)
  ).length;
  return mappedCount >= Math.ceil(metricFields.length * 0.5);
}
```

Parser (lines 1926-1933): iterates `Object.entries(result)`, retains only entries whose value is a string that appears in `columnNames`. Any other key/value pair in the AI response is dropped. The returned `mapping: Record<string, string>` is strictly a metric→column-name map with no auxiliary fields preserved.

## Phase 6 -- Engine consumption stage

### 6.1 `applyMetricDerivations` -- filter application

(Full body already pasted in DIAG-047 Phase 3.2 from `web/src/lib/calculation/run-calculation.ts:111-196`.)

`sum` branch (run-calculation.ts:138-149):

```typescript
    if (rule.operation === 'sum' && rule.source_field) {
      // HF-172: Apply filters to sum (was missing — caused cross-category aggregation)
      let total = 0;
      for (const row of matchingRows) {
        const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
          ? row.row_data as Record<string, unknown>
          : {};
        if (!rowMatchesFilters(rd, rule.filters)) continue;
        const val = rd[rule.source_field];
        if (typeof val === 'number') total += val;
      }
      derived[rule.metric] = total;
    }
```

`rowMatchesFilters(rd, rule.filters)` is invoked on every row. `rowMatchesFilters` body (run-calculation.ts:91-109) returns `true` when `filters` is `null`/`undefined`/`[]`. The HF-172 filter-application code path is present and unchanged.

### 6.2 `resolveMetricsFromConvergenceBindings` (route.ts:1247-1399)

```typescript
  function resolveMetricsFromConvergenceBindings(
    compBindings: Record<string, unknown>,
    component: PlanComponent,
    entityExternalId: string,
    componentIdx?: number,
  ): Record<string, number> | null {
    if (shouldEmitTrace(entityExternalId)) {
      bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:entry entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} componentName=${JSON.stringify(component.name)} | compBindingsKeys=${Object.keys(compBindings).join(',')}`);
    }
    // HF-111: Support multiple binding roles — actual, row, column, numerator, denominator
    const actualBinding = (compBindings.actual || compBindings.row) as ConvergenceBindingEntry | undefined;
    const targetBinding = (compBindings.target || compBindings.column) as ConvergenceBindingEntry | undefined;
    const numBinding = compBindings.numerator as ConvergenceBindingEntry | undefined;
    const denBinding = compBindings.denominator as ConvergenceBindingEntry | undefined;

    if (!actualBinding?.column && !numBinding?.column) return null;

    // HF-216 via-clause translation
    const eidBinding = compBindings.entity_identifier as ConvergenceBindingEntry | undefined;
    let lookupKey = entityExternalId;
    if (eidBinding?.via?.roster_data_type && eidBinding.via.roster_field && eidBinding.via.entity_field) {
      const viaKey = `${eidBinding.via.roster_data_type}|${eidBinding.via.entity_field}|${eidBinding.via.roster_field}`;
      const map = rosterJoinIndex.get(viaKey);
      const translated = map?.get(String(entityExternalId).trim());
      if (translated) {
        lookupKey = translated;
        ...
      } else {
        addLog(`[CalcRecon-T3] EXCEPTION entity=${entityExternalId} type=via_join_unresolved viaKey=${viaKey}`);
        currentEntityFlags.push('viaJoinUnresolved');
        return null;
      }
    }

    const expectedMetrics = getExpectedMetricNames(component);
    if (expectedMetrics.length === 0) return null;

    const metrics: Record<string, number> = {};

    // Ratio branch (numBinding + denBinding):
    if (numBinding?.column && denBinding?.column) {
      const rawNumValue = resolveColumnFromBatch(numBinding.column, lookupKey);
      const rawDenValue = resolveColumnFromBatch(denBinding.column, lookupKey);

      let numValue = rawNumValue;
      let denValue = rawDenValue;
      if (numBinding.scale_factor) numValue = numValue !== null ? numValue * numBinding.scale_factor : null;
      if (denBinding.scale_factor) denValue = denValue !== null ? denValue * denBinding.scale_factor : null;

      // HF-224: Find the ratio leaf anywhere in the intent tree.
      const ratioLeafForNames = extractLeafSources(component.calculationIntent).find(l => l.source === 'ratio');
      const ratioSpec = ratioLeafForNames?.sourceSpec;
      const numMetricName = typeof ratioSpec?.numerator === 'string'
        ? ratioSpec.numerator.replace(/^metric:/, '')
        : null;
      const denMetricName = typeof ratioSpec?.denominator === 'string'
        ? ratioSpec.denominator.replace(/^metric:/, '')
        : null;

      if (numMetricName && numValue !== null) {
        metrics[numMetricName] = numValue;
      }
      if (denMetricName && denValue !== null) {
        metrics[denMetricName] = denValue;
      }
      return Object.keys(metrics).length > 0 ? metrics : null;
    }

    // Single or dual input branch:
    if (actualBinding?.column) {
      const rawActualValue = resolveColumnFromBatch(actualBinding.column, lookupKey);
      if (rawActualValue === null) return null;

      let actualValue = rawActualValue;
      if (actualBinding.scale_factor) actualValue *= actualBinding.scale_factor;

      metrics[expectedMetrics[0]] = actualValue;

      if (targetBinding?.column) {
        const rawTargetValue = resolveColumnFromBatch(targetBinding.column, lookupKey);
        let targetValue = rawTargetValue;
        if (targetBinding.scale_factor && targetValue !== null) targetValue *= targetBinding.scale_factor;

        if (targetValue !== null && targetValue !== 0) {
          const targetMetricName = expectedMetrics.length > 1
            ? expectedMetrics[1]
            : `${expectedMetrics[0]}_target`;
          metrics[targetMetricName] = targetValue;

          if (compBindings.actual && compBindings.target) {
            metrics['attainment'] = actualValue / targetValue;
          }
        }
      }
    }

    return Object.keys(metrics).length > 0 ? metrics : null;
  }
```

`compBindings` fields read: `actual`, `row`, `target`, `column` (in binding keys), `numerator`, `denominator`, `entity_identifier`. Each binding entry's fields read: `column`, `scale_factor`, `via.{roster_data_type, roster_field, entity_field}`. No `filters` parameter. No filter parameter passed to `resolveColumnFromBatch`. No category subsetting. The returned `metrics` map enumerates only `expectedMetrics[0]`, optionally `expectedMetrics[1]` or `{expectedMetrics[0]}_target`, and `attainment` (for actual+target pair). Any other field on `compBindings` is unused.

### 6.3 `resolveColumnFromBatch` (route.ts:1411-1454)

```typescript
  function resolveColumnFromBatch(
    column: string,
    entityExternalId: string,
  ): number | null {
    let entityRows: Array<Record<string, unknown>> | undefined;
    for (const [, map] of Array.from(dataByBatch.entries())) {
      const rows = map.get(entityExternalId);
      if (rows && rows.length > 0) {
        entityRows = rows;
        break;
      }
    }
    if (!entityRows) {
      if (shouldEmitTrace(entityExternalId)) {
        bufferTrace(`[CalcTrace] resolveColumnFromBatch:exit entity=${entityExternalId} | column=${column} | reason=no_rows | returned=null`);
      }
      return null;
    }

    let sum = 0;
    let found = false;
    const perRowValues: unknown[] = [];
    for (const rd of entityRows) {
      const val = rd[column];
      perRowValues.push(val);
      if (val === null || val === undefined) continue;
      if (typeof val === 'number') {
        sum += val;
        found = true;
      } else if (typeof val === 'string') {
        const parsed = parseFloat(val.replace(/[,$\s]/g, ''));
        if (!isNaN(parsed)) {
          sum += parsed;
          found = true;
        }
      }
    }

    if (shouldEmitTrace(entityExternalId)) {
      bufferTrace(`[CalcTrace] resolveColumnFromBatch:exit entity=${entityExternalId} | column=${column} | rowCount=${entityRows.length} | perRowValues=${JSON.stringify(perRowValues)} | sum=${sum} | found=${found} | returned=${found ? sum : 'null'}`);
    }

    return found ? sum : null;
  }
```

Two parameters: `column: string`, `entityExternalId: string`. No filter parameter. The function iterates every row in `entityRows` (the entity's full row set from `dataByBatch`) and adds `rd[column]` to `sum` whenever it parses as a number, regardless of any other field on `rd`. There is no category gate, no `product_category` predicate, no `rowMatchesFilters` invocation.

## Phase 7 -- Function-by-function readiness summary

"Carries full input?" = the function spreads, returns, or passes through the input object whole. "Cherry-picks fields?" = the function constructs a new object literal enumerating specific known fields. "filters handled?" = the function reads, writes, copies, or passes through a `filters` array.

| Function | File | Stage | Carries full input? | Cherry-picks fields? | filters handled? | Details |
|---|---|---|---|---|---|---|
| `emitPlanComprehensionSignals` | `lib/compensation/plan-comprehension-emitter.ts` | Signal Write | no | yes | no | `signalValue` literal enumerates 7 keys (metric_label, metric_op, metric_inputs, semantic_intent, component_id, component_type, source_evidence). No spread of `rawComp`; `comp.calculationMethod.filters` or any other field is dropped before write. |
| `writeSignal` / `writeSignalBatch` / `writeSignalBatchWithClient` | `canonical-signal-writer.ts` | Signal Write (canonical) | yes (signal_value JSONB) | yes (row columns) | n/a (passthrough) | `buildInsertRow` enumerates 19 row columns; `signal_value` carried whole as JSONB. No inspection of `signal_value` contents. |
| `writeClassificationSignal` | `lib/sci/classification-signal-service.ts` | Signal Write (SCI) | no | yes | n/a | 1:1 map of `ClassificationSignalPayload` enumerated fields to `CanonicalSignalInput` literal; no `signal_value` body emitted. |
| `recordSignal` / `recordAIClassificationBatch` | `lib/intelligence/classification-signal-service.ts` | Signal Write | no | yes | no | `signal_value` literal: 3 fields exactly (`domain`, `fieldName`, `semanticType`). |
| `loadMetricComprehensionSignals` | `lib/intelligence/convergence-service.ts:830` | Signal Read | yes | no | n/a | Returns raw `data` rows from Supabase select (`signal_value`, `confidence`, `rule_set_id`). |
| metricComprehension consumption sites (Pass 4 metricContext build, resolveColumnMappingsViaAI, AI prompt builder) | `convergence-service.ts:595,1857,2447` | Signal Read | no | yes | no | Each site reads `metric_label`, `semantic_intent`, `metric_inputs` — three fields. `component_id`, `component_type`, `source_evidence` ignored. |
| `generateDerivationsForMatch` (rules.push) | `convergence-service.ts:1179` | Derivation construction | no | yes | yes (literal `[]`) | `rules.push` enumerates `metric`, `operation`, `source_pattern`, `source_field?`, `filters: []`. Filter literal is empty array. Shared-base early return delegates to `generateFilteredCountDerivations`. |
| `generateFilteredCountDerivations` | `convergence-service.ts:2324` | Derivation construction | no | yes | yes (token-overlap derived) | `rules.push` operation=`count` only; filters come from heuristic token-overlap match against `capability.categoricalFields`. Never produces `sum` operation; not invoked when `isSharedBase` is false. |
| `generateAISemanticDerivations` | `convergence-service.ts:2400` | AI parse → Derivation | no | yes | yes (from AI `d.filters`) | `derivations.push` enumerates `metric`, `operation`, `source_pattern`, `source_field?`, `filters`. Filter content typed-copies `field`, `operator`, `value` from each `d.filters[]` entry when `f.field && f.value != null`. Other fields on `d` dropped. |
| `resolveColumnMappingsViaAI` | `convergence-service.ts:1843` | AI prompt + parse | no | yes | no (schema lacks filters) | AI prompt example output schema is `{"metric_field": "column_name"}` only. Parser retains only entries whose value is in `columnNames`. No filter vocabulary in the prompt or the response shape. |
| `bridgeAIToEngineFormat` | `lib/compensation/ai-plan-interpreter.ts:502` | Bridge | no | yes | no | Return literal: 4 keys (`name`, `description`, `components`, `inputBindings`). `inputBindings: {}` hardcoded empty. |
| `interpretationToPlanConfig` | `lib/compensation/ai-plan-interpreter.ts:275` | Bridge | no | yes | no | Reads `interpretation.{employeeTypes, components, ruleSetName, description}`. RuleSetConfig literal enumerates 17 fields. `interpretation` fields outside those four are dropped. |
| `convertComponent` | `lib/compensation/ai-plan-interpreter.ts:382` | Bridge | partial (spreads `base`) | yes | no | `base` literal: 7 fields from `comp`. Return spreads `base` and adds `componentType`, `metadata.intent`. `comp` fields outside `id`, `name`, `description`-fallback, `calculationIntent` are dropped at PlanComponent level. |
| `transformVariant` | `lib/calculation/intent-transformer.ts:52` | Bridge (intent shape) | yes (pure delegation) | no | n/a | Loops `transformComponent`; carries every result. |
| `normalizeIntentInput` | `lib/calculation/intent-transformer.ts:86` | Bridge (intent shape) | yes (recognized shapes) / no (ratio branch) | partial | n/a | Discriminator: recognized `obj.source ∈ {metric, constant, ...}` returns `obj` unchanged. Ratio branch (operation=`ratio` or source=`ratio`) constructs new `{operation, numerator, denominator, zeroDenominatorBehavior}` literal. |
| `transformFromMetadata` | `lib/calculation/intent-transformer.ts:131` | Bridge (intent shape) | yes (fallback branch) / no (named ops) | yes (named ops) | no | Four named operations (`linear_function`, `scalar_multiply`, `piecewise_linear`, `conditional_gate`) construct new operation literals from cherry-picked fields; fall-through `else { operation = rawIntent as IntentOperation }` carries unrecognized operations whole. Modifier loop handles 4 typed discriminants; unrecognized modifier discriminants are not pushed to the typed array (raw emission remains in `rule_sets.components[].calculationIntent`). Returned `ComponentIntent` literal enumerates 7 fields. |
| `applyMetricDerivations` + `rowMatchesFilters` | `lib/calculation/run-calculation.ts:111` | Engine | n/a | n/a | yes (applies `rule.filters` to sum/count/delta) | `sum`, `delta`, `count` branches each call `rowMatchesFilters(rd, rule.filters)`; `rowMatchesFilters` returns `true` for empty/missing filter arrays so empty `filters: []` admits every row. |
| `resolveMetricsFromConvergenceBindings` | `app/api/calculation/run/route.ts:1247` | Engine | no | yes | no | Reads `compBindings.{actual, row, target, column, numerator, denominator, entity_identifier}` and each binding's `column`, `scale_factor`, `via.*`. Builds `metrics` map with `expectedMetrics[0]` (+ optional target and `attainment`). No filter parameter. |
| `resolveColumnFromBatch` | `app/api/calculation/run/route.ts:1411` | Engine | n/a | n/a | no (no filter param) | Two parameters: `column`, `entityExternalId`. Sums `rd[column]` across all entity rows. No predicate. |
