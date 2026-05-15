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
