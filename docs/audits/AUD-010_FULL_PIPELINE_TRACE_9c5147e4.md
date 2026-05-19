# AUD-010 — Full Pipeline Trace: Convergence → Intent → Execution

**Date:** 2026-05-19
**Type:** Read-only code audit
**HEAD:** `9c5147e4` (PR #416 merged 2026-05-19, HF-236 DIAG-050 closure)
**Branch (audit):** `aud-010-full-pipeline-trace`
**Read-only:** no source modifications; one new doc + grep-output artifacts

---

## Phase 0 — HEAD state

```
$ git log --oneline -5
9c5147e4 Merge pull request #416 from CCAFRICA/hf-236-diag050-closure
0fea552d HF-236: completion report per Rule 25
b8157bea HF-236 Phase 3: CRP flywheel cache invalidated (poisoned by pre-HF-236 PARTIAL filtering)
dab247b8 HF-236 Phase 2: Layer 1 — materialization-layer alignment; roleMap registry eliminated
8f3e54ec HF-236 Phase 1: Layer 3 — row_data persists unconditionally; PARTIAL narrows bindings only

$ git rev-parse --short HEAD
9c5147e4

$ wc -l web/src/lib/intelligence/convergence-service.ts \
       web/src/lib/calculation/intent-transformer.ts \
       web/src/lib/compensation/ai-plan-interpreter.ts \
       web/src/app/api/calculation/run/route.ts \
       web/src/lib/calculation/intent-executor.ts
    2935 web/src/lib/intelligence/convergence-service.ts
     268 web/src/lib/calculation/intent-transformer.ts
     534 web/src/lib/compensation/ai-plan-interpreter.ts
    2991 web/src/app/api/calculation/run/route.ts
     721 web/src/lib/calculation/intent-executor.ts
```

(Note: directive §4 said `web/src/app/api/calculate/run/route.ts`. Actual path is `web/src/app/api/calculation/run/route.ts` — `calculation/`, not `calculate/`. All §4 / §5 / §6 paste evidence in this report cites the actual path.)

---

## Stage 1 — Convergence Pipeline

### 1A. Entry point

Function declaration — `web/src/lib/intelligence/convergence-service.ts:194-199`:

```typescript
export async function convergeBindings(
  tenantId: string,
  ruleSetId: string,
  supabase: SupabaseClient,
  calculationRunId?: string,  // OB-197 G11: scope signals emitted by this convergence to a calculation run
): Promise<ConvergenceResult> {
```

Call site — `web/src/app/api/calculation/run/route.ts:37, 252`:

```typescript
 37 import { convergeBindings, extractLeafSources } from '@/lib/intelligence/convergence-service';
 ...
252         const convResult = await convergeBindings(tenantId, ruleSetId, supabase, calculationRunId);
```

### 1B. Pass sequence

Five operative passes in `convergeBindings`, in this order:

| # | Function / Block | Lines | What it produces | When it fires |
|---|---|---|---|---|
| Pass 1 | `inventoryData` (called from convergeBindings) | `convergence-service.ts:908-1133` (helper); invoked at 236 | `DataCapability[]` per data_type — fieldIdentities, numericFields, categoricalFields, columnStats, semanticRoles | Always — once per convergence call |
| Pass 2 | `matchComponentsToData` | `convergence-service.ts:1140+` (helper); invoked at 299 | `BindingMatch[]` linking each plan component to its best-fit data_type | Always |
| Pass 3 (legacy ratio block) | targets-pair detection inline at `convergence-service.ts:486-590` | inside `convergeBindings` | `_actuals` + `_target` ratio derivations pushed to `derivations[]` (lines 539/549). HF-226 Phase 2B note at line 322-328 says the prior `generateDerivationsForMatch` call was commented out; the targets-pair block remains and operates on `derivations` populated by Pass 5. | Per match where `targetCap.hasTargetData === true` AND an existing `sum` derivation already targets this component |
| Pass 4 | `generateAllComponentBindings` → `resolveColumnMappingsViaAI` (Call 1) → HF-222 `distinctEnoughToBind` fallback | `convergence-service.ts:2173-2533` (function); invoked at 370 | `componentBindings[compKey][role]` — column + filters per role per component. Plus HF-218 entity_identifier self-verification + period binding | Always when matches exist |
| Pass 5 | `generateAISemanticDerivations` | `convergence-service.ts:2622-2868` (function); invoked at 674 | `MetricDerivationRule[]` with operation + source_field + filters, pushed to `derivations[]` | When `unresolvedForAI.length > 0 && capabilities.length > 0` per gate at line 612. Per HF-234 gate at 613-620 (post-edit): when any capability has categoricalFields, ALL required metrics flow through Pass 5 |

### 1C. Filter production

Filters are produced in **Pass 5** (`generateAISemanticDerivations`). The AI returns derivations with a `filters` array; the parser validates and writes them to the rule. `convergence-service.ts:2793-2827`:

```typescript
2793         const filters: MetricDerivationRule['filters'] = [];
2794         if (Array.isArray(d.filters)) {
2795           for (const f of d.filters as Array<Record<string, unknown>>) {
2796             if (f.field && f.value != null) {
2797               filters.push({
2798                 field: String(f.field),
2799                 operator: (String(f.operator || 'eq') as MetricDerivationRule['filters'][0]['operator']),
2800                 value: f.value as string | number | boolean,
2801               });
2802             }
2803           }
2804         }
...
2820         derivations.push({
2821           ...d,
2822           metric,
2823           operation: operation as MetricDerivationRule['operation'],
2824           source_pattern: sourcePattern,
2825           source_field: d.source_field ? String(d.source_field) : undefined,
2826           filters,
2827         });
```

The filter values are **AI-emitted**, not hardcoded — `f.field`, `f.operator`, `f.value` are all read from the AI's JSON response. Per HF-235 (PR #414), the prompt no longer includes a 3-row sample; categorical-field distinct values are sourced from `cap.categoricalFields` populated at `convergence-service.ts:2642-2644`.

Filters are also attached to **binding entries** in Pass 4 (`generateAllComponentBindings:2329-2353`):

```typescript
2329       const proposedFilters = typeof proposedMapping === 'object' && proposedMapping !== null && Array.isArray(proposedMapping.filters)
2330         ? proposedMapping.filters
2331         : [];
2332
2333       if (proposedColumnName) {
2334         const mc = measureColumns.find(c => c.name === proposedColumnName);
2335         if (mc && !boundColumns.has(proposedColumnName)) {
2336           ...
2337           bindings[compKey][req.role] = {
2338             column: proposedColumnName,
2339             field_identity: mc.fi,
2340             match_pass: isValidated ? 1 : 2,
2341             confidence: isValidated ? 0.9 : 0.6,
2342             scale_factor: scaleFactor !== 1 ? scaleFactor : undefined,
2343             learning_provenance: { batch_id: mc.batchId, learned_at: new Date().toISOString() },
2344             // HF-227: filters live on the binding ...
2345             filters: proposedFilters,
2346           };
```

Per HF-234 (PR #412), Call 1's prompt no longer requests filters; `proposedFilters` is now always `[]` in normal operation (defensive parsing retained for backward compatibility).

### 1D. Role binding

Roles are extracted from each `PlanComponent`'s `calculationIntent` via `extractInputRequirements` (`convergence-service.ts:1396+`), then per-role bindings are written in `generateAllComponentBindings:2316-2392`. Role-uniform path (post-HF-227):

```typescript
2316   for (const match of matches) {
2317     const comp = match.component;
2318     const cap = capabilities.find(c => c.dataType === match.dataType);
2319     if (!cap) continue;
2320
2321     const compKey = `component_${comp.index}`;
2322     if (!bindings[compKey]) bindings[compKey] = {};
2323
2324     const batchId = cap.batchIds[0] || '';
2325     const requirements = extractInputRequirements(comp);
2326
2327     for (const req of requirements) {
2328       // HF-227: the AI mapping value may be a plain column-name string
2329       // (backward compatible) or the enriched shape { column, filters? }.
2330       const proposedMapping = aiMapping[req.metricField];
2331       const proposedColumnName = typeof proposedMapping === 'string'
2332         ? proposedMapping
2333         : proposedMapping?.column;
2334       ...
2337       if (proposedColumnName) {
2338         const mc = measureColumns.find(c => c.name === proposedColumnName);
2339         if (mc && !boundColumns.has(proposedColumnName)) {
...
2346           bindings[compKey][req.role] = { column, field_identity, match_pass, confidence, scale_factor?, learning_provenance, filters };
```

Role values (`actual`, `numerator`, `denominator`, `target`, `period`, `entity_identifier`) are NOT enumerated in the code — they flow from `req.role` which comes from `extractInputRequirements(comp)`. Period + entity_identifier are written by separate later blocks (lines 2406-2522) outside the role-uniform requirement loop.

### 1E. Output shape

`web/src/lib/intelligence/convergence-service.ts:156-178`:

```typescript
156 export interface ConvergenceResult {
157   derivations: MetricDerivationRule[];
158   matchReport: Array<{ component: string; dataType: string; confidence: number; reason: string }>;
159   signals: Array<{ domain: string; fieldName: string; semanticType: string; confidence: number }>;
160   gaps: ConvergenceGap[];
161   // OB-162: Per-component input bindings (Decision 111)
162   componentBindings: Record<string, Record<string, ComponentBinding>>;
163   // OB-197 G11: signal-surface observations (within-run + cross-run).
164   observations: {
165     withinRun: ConvergenceSignalObservation[];
166     crossRun: ConvergenceSignalObservation[];
167     metricComprehension: MetricComprehensionSignal[];
168   };
169 }
```

Of this shape, the calc route writes two surfaces into `input_bindings` on the rule_set. From the calc route — `web/src/app/api/calculation/run/route.ts:251-273`:

```typescript
251         if (derivationCount > 0 || bindingCount > 0) {
252           // Store convergence results on the rule_set for future calculations
253           const updatedBindings: Record<string, unknown> = {};
254
255           if (bindingCount > 0) {
256             // Decision 111: convergence_bindings is the primary output
257             updatedBindings.convergence_bindings = convResult.componentBindings;
258           }
259
260           if (derivationCount > 0) {
261             updatedBindings.metric_derivations = convResult.derivations;
262           }
263
264           // HF-234: stamp the convergence_version so the reuse gate at line ~228
265           // can distinguish pre-HF-234 (filters on binding) from post-HF-234
266           // (filters on metric_derivations only) outputs.
267           updatedBindings.convergence_version = 'HF-234';
268
269           // Persist to rule_set for reuse on subsequent calculations
270           await supabase
271             .from('rule_sets')
272             .update({ input_bindings: updatedBindings as unknown as Json })
273             .eq('id', ruleSetId);
```

`matchReport`, `signals`, `gaps`, `observations` are not persisted to `input_bindings` — they remain on the in-memory `convResult` and are consumed by signal writers / addLog calls within the same calc run.

### 1F. The spurious `actual` binding (HF-222 distribution-distinct fallback)

The path that produced `actual → unit_price (distribution-distinct, top=0.1000)` for CRP Consumables is the HF-222 boundary fallback at `convergence-service.ts:2360-2391`:

```typescript
2360       // Fallback: boundary matching for unmapped requirements (HF-111 logic)
2361       // HF-222 Phase 2: boundary-fallback acceptance uses distribution-derived
2362       // distinguishability (see distinctEnoughToBind). The threshold is computed
2363       // from the candidate distribution at decision time — no developer-stated
2364       // numerical constants. Cluster cases refuse to bind and surface convergence
2365       // gaps; clear-outlier cases bind.
2366       const candidates = measureColumns
2367         .filter(mc => !boundColumns.has(mc.name))
2368         .map(mc => {
2369           const { score, scaleFactor } = scoreColumnForRequirement(mc.name, mc.stats, req);
2370           return { ...mc, score, scaleFactor };
2371         })
2372         .sort((a, b) => b.score - a.score);
2373
2374       if (candidates.length > 0 && distinctEnoughToBind(candidates)) {
2375         const best = candidates[0];
2376         bindings[compKey][req.role] = {
2377           column: best.name,
2378           field_identity: best.fi,
2379           match_pass: 3,  // Boundary-only fallback (distribution-derived acceptance)
2380           confidence: Math.min(0.7, match.matchConfidence * (0.3 + best.score * 0.4)),
2381           scale_factor: best.scaleFactor !== 1 ? best.scaleFactor : undefined,
2382           learning_provenance: { batch_id: best.batchId, learned_at: new Date().toISOString() },
2383         };
2384         boundColumns.add(best.name);
2385         console.log(`[Convergence] HF-222 ${comp.name}:${req.role} → ${best.name} (distribution-distinct, top=${candidates[0].score.toFixed(4)})`);
2386       } else if (candidates.length > 0) {
2387         console.log(`[Convergence] HF-222: ${comp.name}:${req.role}: candidate distribution insufficient to bind (top=${candidates[0].score.toFixed(4)}, n=${candidates.length}); surfacing as convergence gap.`);
2388       }
2389     }
```

The fallback is gated by `distinctEnoughToBind` at `convergence-service.ts:2161-2171`:

```typescript
2161 export function distinctEnoughToBind(scoredCandidates: Array<{ score: number }>): boolean {
2162   if (scoredCandidates.length === 0) return false;
2163   if (scoredCandidates.length === 1) {
2164     return scoredCandidates[0].score > 0;
2165   }
2166   const scores = scoredCandidates.map(c => c.score);
2167   const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
2168   const variance = scores.reduce((s, x) => s + (x - mean) ** 2, 0) / scores.length;
2169   const stddev = Math.sqrt(variance);
2170   return scoredCandidates[0].score - scoredCandidates[1].score > stddev;
2171 }
```

**Trigger:** when the AI mapping path (line 2331-2356) did NOT bind a column for this `req.role` (because the AI didn't produce a mapping for the metric, or the proposed column was already bound by another role's earlier pass), AND `candidates.length > 0` AND `distinctEnoughToBind(candidates)` returns true (top score minus next score exceeds population stddev of all candidate scores). For the CRP Consumables case, the `actual` role lacked an AI mapping (Consumables is a ratio plan that AI mapped `numerator`/`denominator` but not `actual`), the remaining unbound `measureColumns` were scored against the role's `req.expectedRange`, `unit_price` topped the score distribution by enough to satisfy the distinctness test, and the binding was written with `match_pass: 3, confidence: 0.263`.

---

## Stage 2 — Intent Transformation

### 2A. transformFromMetadata dispatch

`web/src/lib/calculation/intent-transformer.ts:28-47`:

```typescript
 28 export function transformComponent(
 29   component: PlanComponent,
 30   componentIndex: number
 31 ): ComponentIntent | null {
 32   if (!component.enabled) return null;
 33
 34   switch (component.componentType) {
 35     case 'linear_function':
 36     case 'piecewise_linear':
 37     case 'scope_aggregate':
 38     case 'scalar_multiply':
 39     case 'conditional_gate':
 40       return transformFromMetadata(component, componentIndex);
 41     default:
 42       // Default path: any component with calculationIntent or metadata.intent
 43       // routes through metadata-driven construction. Components lacking either
 44       // produce null (no transform).
 45       return transformFromMetadata(component, componentIndex);
 46   }
 47 }
```

The switch is effectively single-arm: every branch calls `transformFromMetadata`. The case labels are documentary — they enumerate the primitives that transformFromMetadata is expected to handle, but the default branch handles all the same. The actual primitive selection happens inside `transformFromMetadata` via `rawIntent.operation` / shape detection at lines 140-181.

### 2B. PiecewiseLinearOp shape

Type definition — `web/src/lib/calculation/intent-types.ts:180-197`:

```typescript
180 /** OB-180: Piecewise linear — attainment determines rate segment, applied to base input */
181 export interface PiecewiseLinearOp {
182   operation: Op<'piecewise_linear'>;
183   /** The ratio/attainment input that determines which segment applies */
184   ratioInput: IntentSource | IntentOperation;
185   /** The base value to multiply the rate by (e.g., revenue) */
186   baseInput: IntentSource | IntentOperation;
187   /** OB-186: Target/quota value for computing attainment when denominator metric unavailable.
188    *  When ratioInput resolves to 0 (missing denominator), evaluator uses:
189    *  attainment = baseValue / targetValue */
190   targetValue?: number;
191   /** Rate segments — each defines a range and its rate */
192   segments: Array<{
193     min: number;
194     max: number | null;  // null = no upper bound
195     rate: number;
196   }>;
197 }
```

Construction in transformer — `intent-transformer.ts:153-166`:

```typescript
153   } else if (rawIntent.operation === 'piecewise_linear') {
154     const calcMethod = (component as unknown as Record<string, unknown>).calculationMethod as Record<string, unknown> | undefined;
155     const tv = rawIntent.targetValue ?? calcMethod?.targetValue ?? meta?.targetValue;
156     operation = {
157       operation: 'piecewise_linear',
158       ratioInput: normalizeIntentInput(rawIntent.ratioInput),
159       baseInput: normalizeIntentInput(rawIntent.baseInput),
160       ...(tv != null && Number(tv) > 0 ? { targetValue: Number(tv) } : {}),
161       segments: Array.isArray(rawIntent.segments) ? rawIntent.segments.map((seg: Record<string, unknown>) => ({
162         min: Number(seg.min ?? 0),
163         max: seg.max != null ? Number(seg.max) : null,
164         rate: Number(seg.rate ?? 0),
165       })) : [],
166     } as IntentOperation;
```

Notes on shape:
- `ratioInput` and `baseInput` flow through `normalizeIntentInput` (line 86-129), which converts `{ source: 'ratio', sourceSpec: { numerator, denominator } }` into `{ operation: 'ratio', numerator, denominator, zeroDenominatorBehavior }` (lines 112-120) — so a `ratioInput` carrying a `source: 'ratio'` spec becomes a NESTED RatioOp inside the PiecewiseLinearOp.
- `targetValue` is read from `rawIntent.targetValue || calcMethod.targetValue || meta.targetValue` and dropped if not > 0.
- The pre-HF-187 `actual` role is not referenced; the executor reads `baseInput` (the dollar base) and `ratioInput` (the attainment).

### 2C. ConditionalGateOp shape

Type definition — `intent-types.ts:119-129`:

```typescript
119 /** Conditional branching — evaluate condition, execute one of two operations */
120 export interface ConditionalGate {
121   operation: Op<'conditional_gate'>;
122   condition: {
123     left: IntentSource;
124     operator: '>=' | '>' | '<=' | '<' | '=' | '==' | '!=';
125     right: IntentSource;
126   };
127   onTrue: IntentOperation;
128   onFalse: IntentOperation;
129 }
```

Construction — `intent-transformer.ts:167-181`:

```typescript
167   } else if (rawIntent.operation === 'conditional_gate') {
168     const cond = (rawIntent.condition || {}) as Record<string, unknown>;
169     operation = {
170       operation: 'conditional_gate',
171       condition: {
172         left: normalizeIntentInput(cond.left),
173         operator: String(cond.operator || '>='),
174         right: normalizeIntentInput(cond.right),
175       },
176       onTrue: normalizeIntentInput(rawIntent.onTrue) as IntentOperation,
177       onFalse: normalizeIntentInput(rawIntent.onFalse) as IntentOperation,
178     } as IntentOperation;
```

Cross-plan data is referenced via the `cross_data` IntentSource (intent-types.ts:30-35). The condition's `left` and `right` can each be a `cross_data` source — e.g. for Plan 3's gate "did this rep close ≥ 1 equipment deal" the left would be `{ source: 'cross_data', sourceSpec: { dataType: '...', aggregation: 'count' } }`. resolveSource handles this at `intent-executor.ts:151-157` by reading from `data.crossDataCounts[key]`, which is pre-computed by the calc route.

### 2D. ScopeAggregateOp existence

`grep -rn "scope_aggregate|ScopeAggregate|scopeAggregate" web/src/lib/calculation/ web/src/lib/compensation/`:

```
web/src/lib/calculation/intent-executor.ts:47:  scopeAggregates?: Record<string, number>;  // key: "scope:field:aggregation" → value
web/src/lib/calculation/intent-executor.ts:158:    // OB-181: Scope aggregate — reads pre-computed hierarchical aggregate from scopeAggregates
web/src/lib/calculation/intent-executor.ts:159:    case 'scope_aggregate': {
web/src/lib/calculation/intent-executor.ts:162:      const val = data.scopeAggregates?.[key] ?? 0;
web/src/lib/calculation/intent-executor.ts:163:      inputLog[`scope_aggregate:${key}`] = { ... };
web/src/lib/calculation/run-calculation.ts:270:    case 'scope_aggregate':
web/src/lib/calculation/run-calculation.ts:510:  // cross_data, scope_aggregate) do not resolve via data.metrics — skip harvest
web/src/lib/calculation/primitive-registry.ts:38: * `scope_aggregate` is recognized vocabulary (named in plan-agent prompt examples
web/src/lib/calculation/primitive-registry.ts:41: * scope aggregation as `scalar_multiply { input.source: 'scope_aggregate' }`.
web/src/lib/calculation/primitive-registry.ts:42: * Phase 2's `UnknownPrimitiveError` surfaces any AI emission of `scope_aggregate`
web/src/lib/calculation/primitive-registry.ts:57:  'scope_aggregate',
web/src/lib/calculation/primitive-registry.ts:81:   * input spec). `scope_aggregate` is recognized at the source level
web/src/lib/calculation/primitive-registry.ts:215:    id: 'scope_aggregate',
web/src/lib/calculation/intent-types.ts:37:  | { source: 'scope_aggregate'; sourceSpec: {
web/src/lib/calculation/intent-validator.ts:72:  // in the registry). `scope_aggregate` is registered as kind: 'source_only'; if
web/src/lib/calculation/intent-transformer.ts:37:    case 'scope_aggregate':
web/src/lib/calculation/intent-transformer.ts:124:    || obj.source === 'scope_aggregate' || obj.source === 'aggregate') {
web/src/lib/compensation/ai-plan-interpreter.ts:467:    case 'scope_aggregate':
```

**There is NO standalone `ScopeAggregateOp` interface.** `scope_aggregate` exists as:
1. An `IntentSource` (input type) — `intent-types.ts:37-41`:
   ```typescript
   | { source: 'scope_aggregate'; sourceSpec: {
       field: string;        // metric field to aggregate
       scope: 'district' | 'region';  // hierarchy level
       aggregation: AggregationType;
     }};
   ```
2. A registered primitive name in `primitive-registry.ts:57, 215` — declared but with the explicit doc note at lines 38-42 saying *"scope aggregation expressed as `scalar_multiply { input.source: 'scope_aggregate' }`"*. The registry has it; there is no executor case for it as a top-level operation; the executor reads it at the source layer (resolveSource, intent-executor.ts:159-165) consuming `data.scopeAggregates[key]`.
3. A no-op pass-through case in `convertComponent` (ai-plan-interpreter.ts:467) and `intent-transformer.ts:37` — both delegate to `transformFromMetadata`. The component's `calculationIntent` for a `scope_aggregate` plan must wrap the scope source inside a `scalar_multiply` or similar operation that the executor can dispatch.

In short: as a top-level component primitive, scope_aggregate is not directly executable — it depends on the plan-agent emitting an outer `scalar_multiply` (or similar) wrapping `{ source: 'scope_aggregate', ... }` as its input.

### 2E. convertComponent (ai-plan-interpreter.ts:382-487)

```typescript
382 function convertComponent(comp: InterpretedComponent, order: number): PlanComponent {
383   // OB-196 Phase 1.5: legacy alias elimination + truncation. AI emits foundational
384   // identifiers directly; importer carries calculationIntent through without
385   // per-shape translation.
...
389   const base: Omit<PlanComponent, 'componentType' | 'matrixConfig' | 'tierConfig' | 'percentageConfig' | 'conditionalConfig'> = {
390     id: comp?.id || `component-${order}`,
391     name: comp?.name || `Component ${order + 1}`,
...
397     calculationIntent: comp?.calculationIntent,
398   };
...
405   const calcType = (base.calculationIntent?.operation as string) || calcMethod?.type || '';
...
416   if (!isRegisteredPrimitive(calcType)) {
417     throw new UnconvertibleComponentError(...);
418   }
...
455   switch (calcType as FoundationalPrimitive) {
456     case 'bounded_lookup_1d':
457     case 'bounded_lookup_2d':
458     case 'scalar_multiply':
459     case 'conditional_gate':
460     case 'aggregate':
461     case 'ratio':
462     case 'constant':
463     case 'weighted_blend':
464     case 'temporal_window':
465     case 'linear_function':
466     case 'piecewise_linear':
467     case 'scope_aggregate':
468       return {
469         ...base,
470         componentType: calcType as FoundationalPrimitive,
471         metadata: {
472           ...(base.metadata || {}),
473           intent: base.calculationIntent, // copy for transformFromMetadata
474         },
475       };
476     default: {
477       const _exhaustive: never = calcType as never;
478       void _exhaustive;
479       throw new UnconvertibleComponentError(...);
480     }
481   }
482 }
```

All 12 cases land in the same return shape: the AI's `calculationIntent` is copied into `metadata.intent` for transformFromMetadata to consume downstream. No per-primitive translation. Including `piecewise_linear` with `ratio`/`numerator`/`denominator` via the metadata-passthrough — the transformer's `normalizeIntentInput` (intent-transformer.ts:86-129) handles the ratio shape.

---

## Stage 3 — Data Resolution at Calculation Time

### 3A. The `usedConvergenceBindings` flag and fork

Flag declaration — `web/src/app/api/calculation/run/route.ts:1817`:

```typescript
1817       let usedConvergenceBindings = false;
```

Set inside the resolution loop — lines 2157-2218:

```typescript
2157         const cbMetrics = resolveMetricsFromConvergenceBindings(
2158           compBindings, component, entityInfo?.external_id ?? '', compIdx
2159         );
2160         metrics = cbMetrics && Object.keys(cbMetrics).length > 0 ? cbMetrics : {};
2161         if (cbMetrics && Object.keys(cbMetrics).length > 0) usedConvergenceBindings = true;
2162       } else if (compBindings && dataByBatch.size > 0) {
2163         const cbMetrics = resolveMetricsFromConvergenceBindings(
2164           compBindings, component, entityInfo?.external_id ?? '', compIdx
2165         );
2166         if (cbMetrics && Object.keys(cbMetrics).length > 0) {
2167           metrics = cbMetrics;
2168           usedConvergenceBindings = true;
2169         } else {
2170           // Convergence binding resolution returned nothing — fall back.
...
2191           // HF-220 R1 / ADR Decision 2: legacy buildMetricsForComponent fallback retired
2192           // (Decision 153 atomic cutover completion). Component evaluates to zero per
2193           // existing refuse-with-empty-metrics semantics; HF-218 Component 4a signal
2194           // above preserves observability.
2195           metrics = {};
2196         }
2197       } else {
2198         // HF-220 R1 / ADR Decision 2: no convergence_bindings for this component.
...
2217         metrics = {};
2218       }
```

Log branch — line 2222:

```typescript
2222         addLog(`HF-108 Resolution path: ${usedConvergenceBindings ? 'convergence_bindings (Decision 111)' : 'sheet-matching (fallback)'}`);
```

The legacy `buildMetricsForComponent` sheet-matching fallback was **retired** at HF-220 R1 (annotated at lines 2191-2194 and 2225-2227). With sheet-matching retired, the fork is now effectively binary: either convergence_bindings succeed (cbMetrics non-empty → `usedConvergenceBindings = true`) or `metrics = {}` (component evaluates to zero, engine:exception signal written for observability). The "sheet-matching (fallback)" log string at line 2222 is preserved but now reports the `metrics = {}` zero-fallback path, not a legacy sheet match.

CRP follows the convergence_bindings path: per DIAG-049 Probe C all 4 CRP plans have `convergence_bindings` populated; `resolveMetricsFromConvergenceBindings` returns non-empty for the bound roles; `usedConvergenceBindings = true`.

### 3B. resolveMetricsFromConvergenceBindings

Function at `route.ts:1272-1427`. The ratio branch at lines 1332-1368:

```typescript
1332     if (numBinding?.column && denBinding?.column) {
1333       const ratioLeafForNames = extractLeafSources(component.calculationIntent).find(l => l.source === 'ratio');
1334       const ratioSpec = ratioLeafForNames?.sourceSpec;
1335       const numMetricName = typeof ratioSpec?.numerator === 'string'
1336         ? ratioSpec.numerator.replace(/^metric:/, '')
1337         : null;
1338       const denMetricName = typeof ratioSpec?.denominator === 'string'
1339         ? ratioSpec.denominator.replace(/^metric:/, '')
1340         : null;
1341
1342       // HF-227: filters read from the binding entry, not from metric_derivations.
1343       const rawNumValue = resolveColumnFromBatch(numBinding.column, lookupKey, numBinding.filters);
1344       const rawDenValue = resolveColumnFromBatch(denBinding.column, lookupKey, denBinding.filters);
1345
1346       let numValue = rawNumValue;
1347       let denValue = rawDenValue;
1348       if (numBinding.scale_factor) numValue = numValue !== null ? numValue * numBinding.scale_factor : null;
1349       if (denBinding.scale_factor) denValue = denValue !== null ? denValue * denBinding.scale_factor : null;
...
1355       if (numMetricName && numValue !== null) {
1356         metrics[numMetricName] = numValue;
1357       }
1358       if (denMetricName && denValue !== null) {
1359         metrics[denMetricName] = denValue;
1360       }
1361       const result = Object.keys(metrics).length > 0 ? metrics : null;
...
1366       return result;
1367     }
```

The single/dual branch at lines 1372-1420:

```typescript
1372     if (actualBinding?.column) {
1373       const rawActualValue = resolveColumnFromBatch(actualBinding.column, lookupKey, actualBinding.filters);
1374       if (rawActualValue === null) { ...; return null; }
1375
1376       let actualValue = rawActualValue;
1377       if (actualBinding.scale_factor) actualValue *= actualBinding.scale_factor;
...
1391       metrics[expectedMetrics[0]] = actualValue;
1392
1393       if (targetBinding?.column) {
1394         const rawTargetValue = resolveColumnFromBatch(targetBinding.column, lookupKey, targetBinding.filters);
1395         let targetValue = rawTargetValue;
1396         if (targetBinding.scale_factor && targetValue !== null) targetValue *= targetBinding.scale_factor;
...
1403         if (targetValue !== null && targetValue !== 0) {
1404           const targetMetricName = expectedMetrics.length > 1 ? expectedMetrics[1] : `${expectedMetrics[0]}_target`;
1405           metrics[targetMetricName] = targetValue;
1406
1407           // Only compute attainment for actual+target pairs, NOT row+column 2D lookups
1408           if (compBindings.actual && compBindings.target) {
1409             metrics['attainment'] = actualValue / targetValue;
1410           }
1411         }
1412       }
1413     }
```

`resolveColumnFromBatch` at `route.ts:1439+`, key passes:

```typescript
1467     const hasActiveFilters = Array.isArray(filters) && filters.length > 0;
1468     let sum = 0;
1469     ...
1472     for (const rd of entityRows) {
1473       if (hasActiveFilters && !rowMatchesFilters(rd, filters!)) {
1474         filteredOut += 1;
1475         continue;
1476       }
1477       const val = rd[column];
...
1480       if (typeof val === 'number') {
1481         sum += val;
1482         found = true;
1483       } else if (typeof val === 'string') {
1484         const parsed = parseFloat(val.replace(/[,$\s]/g, ''));
```

Filters from the binding entry are passed through `rowMatchesFilters`; rows that don't match are excluded from the sum.

### 3C. Scope-aggregate resolution

Populated at `route.ts:2345-2397`:

```typescript
2345     // HF-155 Item 2 + OB-186: Populate scopeAggregates for entities with scope data
2346     // Resolves scope from entities.metadata (district, region, store_id)
2347     // OB-186: Produces BOTH unfiltered aggregates (raw field sums) AND filtered
2348     // aggregates (metric_derivation rules applied). Filtered aggregates use the
2349     // derived metric name as key (e.g., "district:equipment_revenue:sum").
2350     const entityScopeAgg: Record<string, number> = {};
2351     const entityMeta = entityMap.get(entityId);
2352     const entityMetadata = (entityMeta?.metadata || {}) as Record<string, unknown>;
2353     const entityDistrict = entityMetadata.district || entityMetadata.store_id;
2354     const entityRegion = entityMetadata.region;
2355
2356     // Helper: aggregate rows from other entities in same scope
2357     const aggregateScopeRows = (
2358       scopeField: string,
2359       scopeValue: unknown,
2360       scopePrefix: string,
2361     ) => {
2362       for (const [otherId, otherSheetMap] of Array.from(dataByEntity.entries())) {
2363         if (otherId === entityId) continue;
2364         const otherMeta = entityMap.get(otherId);
2365         const otherMetaData = (otherMeta?.metadata || {}) as Record<string, unknown>;
2366         const otherScope = scopeField === 'district'
2367           ? (otherMetaData.district || otherMetaData.store_id)
2368           : otherMetaData.region;
2369         if (otherScope !== scopeValue) continue;
2370
2371         for (const [, rows] of Array.from(otherSheetMap.entries())) {
2372           for (const row of rows) {
2373             const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
2374               ? row.row_data as Record<string, unknown> : {};
2375
2376             // Unfiltered: sum all numeric fields
2377             for (const [key, val] of Object.entries(rd)) {
2378               if (key.startsWith('_') || typeof val !== 'number') continue;
2379               entityScopeAgg[`${scopePrefix}:${key}:sum`] = (entityScopeAgg[`${scopePrefix}:${key}:sum`] || 0) + val;
2380             }
2381
2382             // OB-186: Filtered scope aggregates from metric_derivation rules
2383             for (const rule of metricDerivations) {
2384               if (rule.operation !== 'sum' || !rule.source_field) continue;
2385               if (!rowMatchesFilters(rd, rule.filters)) continue;
2386               const val = rd[rule.source_field];
2387               if (typeof val === 'number') {
2388                 entityScopeAgg[`${scopePrefix}:${rule.metric}:sum`] = (entityScopeAgg[`${scopePrefix}:${rule.metric}:sum`] || 0) + val;
2389               }
2390             }
2391           }
2392         }
2393       }
2394     };
2395
2396     if (entityDistrict) aggregateScopeRows('district', entityDistrict, 'district');
2397     if (entityRegion) aggregateScopeRows('region', entityRegion, 'region');
```

Critical features of this implementation:
- The aggregation **excludes the current entity** (`if (otherId === entityId) continue;`, line 2363). A district manager's own rows do NOT contribute to the `district:*` aggregate they receive.
- The scope hierarchy field comes from `entities.metadata.district || entities.metadata.store_id` (line 2353) and `entities.metadata.region` (line 2354) — both must be populated on the entity rows in `entities` table or scope aggregation produces 0.
- Two key formats: unfiltered `${scope}:${rowDataField}:sum` (line 2379), and filtered `${scope}:${ruleMetricName}:sum` (line 2388).

The output `entityScopeAgg` is assigned to `data.scopeAggregates` at line 2426 below.

### 3D. Cross-plan metric resolution (OB-186)

`route.ts:318-337`:

```typescript
318   // OB-186: Cross-plan metric resolution for scope_aggregate plans.
319   // When current plan has 0 derivations, look for derivation rules in OTHER plans
320   // for this tenant. Scope aggregate plans consume metrics that other plans define.
321   if (metricDerivations.length === 0) {
322     const { data: otherPlans } = await supabase
323       .from('rule_sets')
324       .select('id, input_bindings')
325       .eq('tenant_id', tenantId)
326       .neq('id', ruleSetId);
327     const crossPlanDerivations: MetricDerivationRule[] = [];
328     for (const op of otherPlans || []) {
329       const opBindings = op.input_bindings as Record<string, unknown> | null;
330       const opDerivs = (opBindings?.metric_derivations as MetricDerivationRule[] | undefined) ?? [];
331       crossPlanDerivations.push(...opDerivs);
332     }
333     if (crossPlanDerivations.length > 0) {
334       metricDerivations = crossPlanDerivations;
335       addLog(`OB-186: Cross-plan metric resolution — ${crossPlanDerivations.length} derivations from other plans`);
336     }
337   }
```

The trigger is "current plan has 0 derivations of its own." When that's true (typical for a scope_aggregate / override plan that consumes other plans' metrics), all `metric_derivations` from sibling rule_sets in the tenant are concatenated and used. The same `metricDerivations` array then feeds `aggregateScopeRows` (3C above, line 2383) and the per-entity metric derivation execution.

---

## Stage 4 — Primitive Execution

### 4A. Dispatch table

`web/src/lib/calculation/intent-executor.ts:500-528`:

```typescript
500 export function executeOperation(
501   op: IntentOperation,
502   data: EntityData,
503   inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
504   trace: Partial<ExecutionTrace>
505 ): Decimal {
506   switch (op.operation) {
507     case 'bounded_lookup_1d': return executeBoundedLookup1D(op, data, inputLog, trace);
508     case 'bounded_lookup_2d': return executeBoundedLookup2D(op, data, inputLog, trace);
509     case 'scalar_multiply':   return executeScalarMultiply(op, data, inputLog, trace);
510     case 'conditional_gate':  return executeConditionalGate(op, data, inputLog, trace);
511     case 'aggregate':         return executeAggregateOp(op, data, inputLog);
512     case 'ratio':             return executeRatioOp(op, data, inputLog);
513     case 'constant':          return executeConstantOp(op);
514     case 'weighted_blend':    return executeWeightedBlend(op, data, inputLog, trace);
515     case 'temporal_window':   return executeTemporalWindow(op, data, inputLog, trace);
516     case 'linear_function':   return executeLinearFunction(op, data, inputLog, trace);
517     case 'piecewise_linear':  return executePiecewiseLinear(op, data, inputLog, trace);
518     default: {
519       const operation = (op as { operation?: string }).operation ?? '<undefined>';
520       throw new IntentExecutorUnknownOperationError(...);
521     }
522   }
523 }
```

11 cases; no `scope_aggregate` case — confirms Stage 2D's finding that scope_aggregate is a source-only primitive, not a top-level operation.

### 4B. resolveSource / resolveValue

`intent-executor.ts:68-167` (resolveSource — 8 source types):

```typescript
 68 function resolveSource(
 69   src: IntentSource,
 70   data: EntityData,
 71   inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>
 72 ): Decimal {
 73   switch (src.source) {
 74     case 'metric': {
...
 84       const raw = data.metrics[key] ?? 0;
...
 92       return toDecimal(raw);
 93     }
 94     case 'ratio': {
...
103       const num = toDecimal(data.metrics[numKey] ?? 0);
104       const den = toDecimal(data.metrics[denKey] ?? 0);
105       const val = den.isZero() ? ZERO : num.div(den);
...
111       return val;
112     }
113     case 'aggregate': {
...
120       if (src.sourceSpec?.scope === 'group' && data.groupMetrics) {
121         const raw = data.groupMetrics[key] ?? 0;
...
123         return toDecimal(raw);
124       }
125       const raw = data.metrics[key] ?? 0;
...
131       return toDecimal(raw);
132     }
133     case 'constant': {
...
135       return toDecimal(src.value);
136     }
137     case 'entity_attribute': {
138       const attr = src.sourceSpec.attribute;
139       const raw = data.attributes[attr];
...
143     }
144     case 'prior_component': {
145       const idx = src.sourceSpec.componentIndex;
146       const val = data.priorResults?.[idx] ?? 0;
...
149     }
150     case 'cross_data': {
151       const { dataType, field, aggregation } = src.sourceSpec;
152       const key = field ? `${dataType}:${aggregation}:${field}` : `${dataType}:${aggregation}`;
153       const val = data.crossDataCounts?.[key] ?? 0;
...
157     }
158     case 'scope_aggregate': {
159       const { field, scope, aggregation } = src.sourceSpec;
160       const key = `${scope}:${field}:${aggregation}`;
161       const val = data.scopeAggregates?.[key] ?? 0;
...
165     }
166   }
167 }
```

`ratio` IS a handled source type at line 94 — HF-187 status confirmed shipped. `aggregate`, `scope_aggregate`, `cross_data` all handled.

`resolveValue` (recursive helper for nested IntentOperation inside an IntentSource slot) — `intent-executor.ts:173-185`:

```typescript
173 function resolveValue(
174   sourceOrOp: IntentSource | IntentOperation,
175   data: EntityData,
176   inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
177   trace: Partial<ExecutionTrace>
178 ): Decimal {
179   if (isIntentOperation(sourceOrOp)) {
180     return executeOperation(sourceOrOp, data, inputLog, trace);
181   }
182   return resolveSource(sourceOrOp, data, inputLog);
183 }
```

### 4C. PiecewiseLinear evaluation

`intent-executor.ts:549-580`:

```typescript
549 function executePiecewiseLinear(
550   op: import('./intent-types').PiecewiseLinearOp,
551   data: EntityData,
552   inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
553   trace: Partial<ExecutionTrace>
554 ): Decimal {
555   let ratio = toNumber(resolveValue(op.ratioInput, data, inputLog, trace));
556   const baseValue = resolveValue(op.baseInput, data, inputLog, trace);
557
558   // OB-186: If ratio resolved to 0 (missing denominator metric) and component
559   // has a targetValue (quota), compute attainment = baseValue / targetValue.
560   // This handles plans where quota is a plan parameter, not in transaction data.
561   if (ratio === 0 && op.targetValue && op.targetValue > 0 && toNumber(baseValue) > 0) {
562     ratio = toNumber(baseValue) / op.targetValue;
563     inputLog['piecewise_linear:targetValue'] = {
564       source: 'component_parameter',
565       rawValue: op.targetValue,
566       resolvedValue: ratio,
567     };
568   }
569
570   // Find the matching segment
571   for (const seg of op.segments) {
572     const inRange = ratio >= seg.min && (seg.max === null || ratio < seg.max);
573     if (inRange) {
574       return baseValue.mul(seg.rate);
575     }
576   }
577
578   // No segment matched — return zero
579   return ZERO;
580 }
```

Execution shape:
- `ratio` ← resolveValue(op.ratioInput). If `ratioInput` is `{ operation: 'ratio', numerator, denominator }` (typical for piecewise plans after normalization), this dispatches to executeRatioOp which reads numerator and denominator from `data.metrics`.
- `baseValue` ← resolveValue(op.baseInput). Typically `{ source: 'metric', sourceSpec: { field: '<numerator>' } }` — the dollar revenue base.
- **OB-186 fallback** at line 561: when ratio = 0 (e.g. denominator metric is missing), fall back to `attainment = baseValue / targetValue`. The `targetValue` is the plan parameter from intent-transformer.ts:155.
- Segment selection at line 572: `ratio >= seg.min && (seg.max === null || ratio < seg.max)` — half-open intervals.
- Output: `baseValue × seg.rate`. No `actual` role read. No `targetValue` multiplication (target is only used for attainment-from-base fallback).

The "`boundaryFallback` flag" referenced in §5 (4C) of the directive does NOT exist as a named field on the ExecutionTrace. The closest analog is the OB-186 path at line 561-568 which writes `inputLog['piecewise_linear:targetValue']` when the fallback fires. The convergence-side `match_pass: 3` (HF-222 boundary fallback, Stage 1F) is a separate concept on the binding entry, not on the executor trace.

### 4D. ConditionalGate evaluation

`intent-executor.ts:326-348`:

```typescript
326 function executeConditionalGate(
327   op: ConditionalGate,
328   data: EntityData,
329   inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
330   trace: Partial<ExecutionTrace>
331 ): Decimal {
332   const leftVal = resolveSource(op.condition.left, data, inputLog);
333   const rightVal = resolveSource(op.condition.right, data, inputLog);
334
335   let conditionMet = false;
336   switch (op.condition.operator) {
337     case '>=': conditionMet = leftVal.gte(rightVal); break;
338     case '>':  conditionMet = leftVal.gt(rightVal);  break;
339     case '<=': conditionMet = leftVal.lte(rightVal); break;
340     case '<':  conditionMet = leftVal.lt(rightVal);  break;
341     case '=':
342     case '==': conditionMet = leftVal.eq(rightVal);  break;
343     case '!=': conditionMet = !leftVal.eq(rightVal); break;
344   }
345
346   const branch = conditionMet ? op.onTrue : op.onFalse;
347   return resolveValue(branch, data, inputLog, trace);
348 }
```

`condition.left` and `condition.right` are typed as `IntentSource` (not Source-or-Op) — see ConditionalGate type at intent-types.ts:122-126. Cross-plan data flows through `cross_data` source at line 332/333 resolving to `data.crossDataCounts[key]`.

`onTrue` and `onFalse` are typed as `IntentOperation` (intent-types.ts:127-128) but the executor calls them via `resolveValue` which accepts both — defensive routing for plans that emit a source shape in onTrue/onFalse.

### 4E. LinearFunction evaluation

`intent-executor.ts:534-543`:

```typescript
534 function executeLinearFunction(
535   op: import('./intent-types').LinearFunctionOp,
536   data: EntityData,
537   inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
538   trace: Partial<ExecutionTrace>
539 ): Decimal {
540   const inputValue = resolveValue(op.input, data, inputLog, trace);
541   const result = inputValue.mul(op.slope).plus(op.intercept);
542   return result;
543 }
```

`y = inputValue × slope + intercept`. For CRP Plan 1 (Senior Rep Equipment Commission): `commission = period_equipment_revenue × 0.06 + 200`. With `period_equipment_revenue` resolved by the metric source — sum of `total_amount` filtered by `product_category = "Capital Equipment"`.

---

## Stage 5 — CRP-Specific Trace

### 5A. Plan 2 (Consumables Commission, piecewise_linear) trace

**Convergence output (per DIAG-049 Probe C, post-HF-234 / post-HF-236 expected to be similar shape):**
```
convergence_bindings.component_0:
  actual:           { column: "unit_price",    confidence: 0.263, match_pass: 3, contextualIdentity: "cross_source_numeric" }
  period:           { column: "effective_date", confidence: 0.775, match_pass: 1 }
  numerator:        { column: "total_amount",   filters: [], confidence: 0.9, match_pass: 1 }
  denominator:      { column: "monthly_quota",  filters: [], confidence: 0.9, match_pass: 1 }
  entity_identifier:{ column: "entity_id",      confidence: 1.0, match_pass: 1 }
metric_derivations: [
  { metric: "monthly_quota", filters: [], operation: "sum", source_field: "monthly_quota", source_pattern: "target" }
]
```

Note: the directive's premise mentions a `consumable_revenue → sum(total_amount) filters=[product_category=Consumables]` derivation. DIAG-049 Probe C did NOT show this filter (filters=[] on every derivation observed). Post-HF-234 / HF-235 / HF-236, Pass-5 should produce it if the AI consistently emits filtered output, but the DIAG-049 snapshot pre-dates the HF-236 flywheel cache invalidation. The trace below assumes the HF-236 + HF-235 closure produces the filtered derivation; if instead Pass-5 emits `filters=[]`, the result diverges as noted.

**Intent transformation (intent-transformer.ts:153-166):**

If the plan-agent emitted `calculationIntent.operation === 'piecewise_linear'`, transformFromMetadata produces:

```
{
  operation: 'piecewise_linear',
  ratioInput: normalizeIntentInput(rawIntent.ratioInput),
       // Likely { source: 'ratio', sourceSpec: { numerator: 'consumable_revenue', denominator: 'monthly_quota' } }
       // → normalized to { operation: 'ratio', numerator, denominator, zeroDenominatorBehavior: 'zero' }
  baseInput: normalizeIntentInput(rawIntent.baseInput),
       // Likely { source: 'metric', sourceSpec: { field: 'consumable_revenue' } }
  targetValue: undefined,  // unless rawIntent.targetValue or calcMethod.targetValue > 0
  segments: [ ... AI-emitted rate tiers ... ],
}
```

The `actual → unit_price` binding from Stage 1F is **not consumed** by the piecewise_linear intent — neither `ratioInput` nor `baseInput` references the `actual` role. The spurious binding lives in `convergence_bindings.component_0.actual` and produces a value in the resolved metrics map (per resolveMetricsFromConvergenceBindings:1391 `metrics[expectedMetrics[0]] = actualValue`), but if the intent references `consumable_revenue` and `monthly_quota` by name, the `unit_price` value won't be read.

However, the single/dual branch of resolveMetricsFromConvergenceBindings (line 1372+) takes precedence over the ratio branch (line 1332+) when actualBinding is present — both branches fire for the same component if all of numerator + denominator + actual bindings exist. So the metrics map will contain `unit_price`-derived value under `expectedMetrics[0]` AND `total_amount` / `monthly_quota` under the ratio names. The piecewise executor reads by metric NAME (not role), so the resolved metric `consumable_revenue` (or whatever `expectedMetrics[0]` corresponds to) determines the outcome.

**Data resolution:**
- `numBinding.column = "total_amount"`, `numBinding.filters = []` (or filtered to Consumables, post-HF-236)
- `resolveColumnFromBatch("total_amount", entityId, [])` sums ALL total_amount for the entity if filters=[]; sums only Consumables rows if filters carry the product_category predicate.
- numMetricName = `consumable_revenue` (from extractLeafSources reading the ratio's sourceSpec.numerator)
- denMetricName = `monthly_quota`
- `metrics.consumable_revenue = ` filtered or unfiltered sum
- `metrics.monthly_quota = ` quota value from `target` data

**Primitive execution (executePiecewiseLinear:549-580):**
- `ratio = resolveValue(ratioInput, ...)` → executeRatioOp(consumable_revenue, monthly_quota) → `consumable_revenue / monthly_quota`
- `baseValue = resolveValue(baseInput, ...)` → resolveSource (metric: consumable_revenue) → `consumable_revenue`
- Segment selection by ratio, output = `baseValue × segmentRate`

**Where the $3,244.03 January delta comes from:** If filters=[] (the pre-HF-236 / pre-HF-235 state captured by DIAG-049), `consumable_revenue` sums BOTH Capital Equipment AND Consumables rows — overstating the numerator. The piecewise commission rate × overstated revenue = overstated commission. The $3,244.03 delta is the per-entity per-period excess from including Capital Equipment in the Consumables base. Post-HF-236, if Pass 5 emits the filter consistently, this delta should reduce to zero. Whether it does is a reconciliation test — out of scope for this audit, which traces the code paths only.

The spurious `actual → unit_price` binding is a DIFFERENT defect that doesn't directly affect Plan 2's commission (since piecewise reads by metric name, not by `actual` role). It DOES affect the entity result emission (line 1391 writes `unit_price`-derived value into the metrics map) which may surface in other downstream consumers (e.g. signal writers, reconciliation comparisons).

### 5B. Plan 4 (District Override, scope_aggregate) trace

**Convergence output (per DIAG-049 Probe C):**
```
convergence_bindings.component_0:
  period:            { column: "effective_date", confidence: 0.775, match_pass: 1 }
  entity_identifier: { column: "entity_id",      confidence: 1.0,   match_pass: 1 }
metric_derivations: (none — empty array)
```

No `actual` binding. No metric derivations of its own.

**OB-186 cross-plan resolution fires** (route.ts:321-337) because the plan's own `metricDerivations.length === 0`. Cross-plan derivations from sibling plans (Plan 1 = Capital Equipment, Plan 2 = Consumables, Plan 3 = Cross-Sell) are loaded — likely 1-5 derivations covering metrics like `monthly_quota`, `equipment_revenue`, etc.

**Scope aggregation fires** (route.ts:2345-2397) for each entity that has `entityMetadata.district` or `entityMetadata.region` populated. For each cross-plan derivation rule, the scope loop sums `rd[rule.source_field]` filtered by `rule.filters` across all OTHER entities in the same district/region. The key format `${scope}:${rule.metric}:sum` (line 2388) — e.g., `district:equipment_revenue:sum`.

**Why every entity produces $0:** Multiple potential causes, in order of probability:

1. **`scopeAggregates` is empty for every entity.** If `entityMetadata.district` is null/undefined on the District Manager entity rows (the entity_attribute "district" may not be populated in the post-import entities table), `aggregateScopeRows` is never called (line 2396 conditional: `if (entityDistrict)`). The DM entity then has `scopeAggregates = {}`. The intent reads `scope_aggregate:district:equipment_revenue:sum` → `data.scopeAggregates?.[key] ?? 0` → `0`. Component output = 0 regardless of intent shape.

2. **The intent doesn't reference `scope_aggregate`.** If the plan-agent emitted a different primitive shape (e.g., `scalar_multiply` with `input.source = 'metric'`), the entity_attribute hop into `scopeAggregates` never happens. Per Stage 2D, scope_aggregate as top-level operation is not executable — it must be wrapped in `scalar_multiply { input.source: 'scope_aggregate' }` per primitive-registry.ts:41. If the plan-agent emitted `scope_aggregate` as top-level operation it would throw `IntentExecutorUnknownOperationError` at line 518 — but the entity result is $0, not an error, so the intent must be valid (likely an aggregate of metrics that all resolve to 0).

3. **The cross-plan derivations don't match the District Manager's metric expectations.** If Plan 4's `extractInputRequirements` looks for `district_total_revenue` or similar, but the cross-plan derivations carry metric names like `period_equipment_revenue`, the resolver populates `entityScopeAgg[district:period_equipment_revenue:sum]` but the executor reads `entityScopeAgg[district:district_total_revenue:sum]` → 0.

The audit cannot determine which of these is operative without the live Plan 4 `calculationIntent` JSON. The audit identifies the three trigger surfaces; architect reconciles against the live rule_set's intent shape and entity metadata.

**There IS code that aggregates across entities within a district scope:** Stage 3C `aggregateScopeRows` at route.ts:2356-2394. The aggregation correctly sums sibling-entity row values per scope hierarchy. The output is exposed to the executor via `data.scopeAggregates` at line 2426. The mechanism is operative; if Plan 4 produces $0 for every entity, the cause is upstream of this code (entity metadata, intent shape, or derivation key naming) rather than missing aggregation logic.

---

## Summary — Data flow per CRP plan, divergence vs reference

| Plan | Primitive | Convergence output (metrics consumed by executor) | Executor reads | Reference (Plan 1 = known good) | Likely divergence |
|---|---|---|---|---|---|
| **Plan 1** (Senior Rep Equipment Commission) | `linear_function` | Pass 5 emits `period_equipment_revenue → sum(total_amount) WHERE product_category=Capital Equipment`. Metric resolves filtered. | `inputValue = data.metrics['period_equipment_revenue']`; `outcome = inputValue × 0.06 + 200`. | This is the reference. Reconciles when Pass 5 emits the filter. | None when Pass 5 fires correctly. Failure mode: Pass 5 emits `filters=[]` → unfiltered sum → over-payment. |
| **Plan 2** (Consumables Commission) | `piecewise_linear` | Pass 5 expected to emit `consumable_revenue → sum(total_amount) WHERE product_category=Consumables` + `monthly_quota → sum(monthly_quota) FROM target`. HF-222 spurious `actual → unit_price` written but unread by intent. | `ratio = resolveRatio(consumable_revenue, monthly_quota)`; `base = consumable_revenue`; `outcome = base × segmentRate`. | Same primitive shape as Plan 1 but with attainment-driven rate selection. | If Pass 5 emits `filters=[]` (per DIAG-049 snapshot): numerator includes Capital Equipment rows → ratio overstates → rate selection lands in higher segment → output overstated. $3,244.03 January delta consistent with this divergence. Post-HF-236 expected to close if Pass 5 emits the filter. |
| **Plan 3** (Cross-Sell Bonus) | `conditional_gate` likely wrapping a `bounded_lookup_1d` or `scalar_multiply` | Pass 5 expected to emit per-class count derivations (e.g., `equipment_deal_count = count WHERE Capital Equipment`, `cross_sell_count = count WHERE Cross-Sell`). Bindings + `cross_data` sources for gate eligibility. | `condition.left = cross_data(equipment_deal_count) >= 1`; if true execute the bonus computation, else $0. | Conditional resolves `cross_data` from pre-computed `crossDataCounts` cache; gates payment on at least 1 equipment deal. | Failure modes: (1) `crossDataCounts` populated with `dataType:'transaction':count` instead of `dataType:'transaction':count:product_category=Capital Equipment` — gate evaluates against unfiltered count. (2) Pass 5 doesn't emit count-with-filter derivation. (3) The plan-agent's gate condition references a metric name the resolver doesn't produce. |
| **Plan 4** (District Override) | wrapper around `scope_aggregate` source (likely `scalar_multiply` per primitive-registry.ts:41) | OB-186 cross-plan resolution loads sibling plans' derivations (Plan 1/2/3). Scope aggregation in route.ts:2345-2397 sums those across other entities in the DM's district. | `scope_aggregate` source → `data.scopeAggregates[scope:metric:aggregation]`. | District manager receives % of sibling reps' commission base. | All scope_aggregates = 0 for every entity → consistent with either (a) `entityMetadata.district` null/undefined on DM entities, or (b) intent's metric-name key doesn't match the key the scope-aggregation pre-compute writes, or (c) cross-plan derivations don't include the metric Plan 4's intent expects. Stage 5B identifies all three trigger surfaces. |

### Path-level findings

1. **Sheet-matching fallback retired.** Per HF-220 R1 (route.ts:2191-2227), the legacy `buildMetricsForComponent` path was deleted. The `usedConvergenceBindings ? '...' : 'sheet-matching (fallback)'` log line is preserved but the "sheet-matching" branch now means `metrics = {}` (component → $0), not a legacy sheet scan. **A component without a convergence_binding pays $0 in production**; this is operative behavior, not a regression.

2. **The HF-222 distribution-distinct fallback writes `actual` bindings for roles the AI did not map.** For ratio plans (Plan 2's Consumables), the `actual` role is supernumerary — the intent reads numerator/denominator/baseInput by name. The fallback binding is structurally consistent but functionally inert for piecewise_linear plans. It may surface in non-executor consumers (signal writers, reconciliation comparators).

3. **Pass 5 filter production is the operative leverage point for CRP Plans 1-3.** Whether each plan's revenue / count metric carries a filter on `product_category` / `order_type` determines whether the commission is correct. The post-HF-236 cache invalidation forces fresh-LLM HC and a fresh Pass-5 invocation on next CRP import; if Pass 5 consistently emits the filter, Plans 1-3 reconcile.

4. **Plan 4 has 3 distinct failure surfaces.** Without entity metadata population AND correct scope_aggregate intent shape AND matching cross-plan derivation metric names, the scope_aggregate evaluator returns 0. Stage 5B enumerates the surfaces; the audit cannot identify which is operative without the live Plan 4 calculationIntent and a sample DM entity's metadata.

5. **Cross-plan resolution (OB-186) is a structural dependency.** Plan 4's correctness depends on Plans 1/2/3 producing metric_derivations with filters. If those plans' derivations have empty filter arrays (the DIAG-049 snapshot state), Plan 4's scope-aggregation sums unfiltered values, and even with correct entity metadata + intent shape, the result is structurally inflated. The post-HF-236 closure must verify Plans 1/2/3 derivations AND Plan 4 cross-plan consumption simultaneously.

### Open questions for architect channel

- Does Plan 4's `calculationIntent` reference `scope_aggregate` as a source inside a `scalar_multiply`, or some other shape? (Resolves Stage 5B trigger #2.)
- Do the CRP entity rows for District Managers carry `metadata.district` populated? (Resolves Stage 5B trigger #1.)
- After HF-236 + fresh-LLM HC re-emission, does Pass 5 reliably emit `filters` on revenue / count derivations across all 5 import attempts (idempotency over LLM noise)? (Determines whether HF-236 closes Plans 1-3.)
