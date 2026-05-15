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
