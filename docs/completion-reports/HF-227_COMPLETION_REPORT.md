# HF-227 COMPLETION REPORT

## Date
2026-05-16

## Branch
`hf-227-binding-filter-completion` (off main `d625ad6e`; PR target: main).

## Execution Time
Single execution session, 2026-05-16 PDT. Five phase commits (0, 1+2 combined, 3, 4) plus directive prompt and this report.

## COMMITS (in order)

| Hash | Phase | Description |
|---|---|---|
| `38f21067` | Phase 0 | HF-227 Phase 0: commit directive prompt (Rule 5) |
| `f5d0c267` | Phase 0 | HF-227 Phase 0: diagnostic — read current state (evidence in commit body, no file changes) |
| `e2b3ecce` | Phase 1+2 | HF-227 Phase 1+2: resolveColumnMappingsViaAI gains filter vocabulary; bindings carry filters |
| `3e58dd6a` | Phase 3 | HF-227 Phase 3: engine reads filters from binding natively; findMetricFilters bridge removed |
| `ff3bea2c` | Phase 4 | HF-227 Phase 4: clear bindings for re-derivation under HF-227 prompt |
| (this commit) | Phase 5 | HF-227: completion report per Rules 25–28 |

Note: Phase 1 and Phase 2 were combined into a single logical commit because the type-widening of `resolveColumnMappingsViaAI`'s return type (Phase 1) immediately breaks the consumer (`generateAllComponentBindings`, Phase 2). Splitting them would have produced an intermediate commit that fails `tsc --noEmit`, violating the Phase 1 proof gate "npm run build exits 0". Combining preserves the build-clean invariant at every push.

`git log main..HEAD --oneline`:

```
ff3bea2c HF-227 Phase 4: clear bindings for re-derivation under HF-227 prompt
3e58dd6a HF-227 Phase 3: engine reads filters from binding natively; findMetricFilters bridge removed
e2b3ecce HF-227 Phase 1+2: resolveColumnMappingsViaAI gains filter vocabulary; bindings carry filters
f5d0c267 HF-227 Phase 0: diagnostic -- read current state
38f21067 HF-227 Phase 0: commit directive prompt (Rule 5)
```

## FILES CREATED

| Path | Purpose |
|---|---|
| `docs/vp-prompts/HF-227_DIRECTIVE_20260516.md` | Persistence record of the HF-227 directive at the time of work, per standing rule 5. |
| `docs/completion-reports/HF-227_COMPLETION_REPORT.md` | This report. |

## FILES MODIFIED

`git diff main...HEAD --stat`:

```
 docs/vp-prompts/HF-227_DIRECTIVE_20260516.md       |  21 +++
 web/src/app/api/calculation/run/route.ts           |  43 +++++--------
 web/src/lib/intelligence/convergence-service.ts    | 155 +++++++++++++++++++--
 web/src/types/convergence-bindings.ts              |  14 ++++
```

Per-file change summary:

| Path | Change |
|---|---|
| `web/src/lib/intelligence/convergence-service.ts` | (1) `resolveColumnMappingsViaAI` signature gains `categoricalFields` parameter and return type widens to `Record<string, ColumnMappingValue>`. (2) Prompt body grows a `CATEGORICAL FIELDS (available for filtering)` block (appended only when non-empty). (3) `EXAMPLE OUTPUT` shows both the plain-string and enriched-object shapes. (4) Parser accepts both shapes, validates each filter's operator against the canonical union. (5) `isValidColumnMapping` accepts either shape. (6) New exported type aliases `ColumnMappingFilterOperator`, `ColumnMappingFilter`, `ColumnMappingValue`. (7) `ComponentBinding` interface gains `filters?` field with the operator-narrowed type. (8) `generateAllComponentBindings` aggregates categorical fields across matched capabilities and passes them to the AI; consumer loop extracts `column + filters` from the enriched mapping; binding entry written with `filters: proposedFilters`. |
| `web/src/app/api/calculation/run/route.ts` | (1) `findMetricFilters` bridge function (declared in HF-226 Phase 3B) removed. (2) All four `resolveColumnFromBatch` call sites inside `resolveMetricsFromConvergenceBindings` read filters directly from the respective binding entry (`numBinding.filters`, `denBinding.filters`, `actualBinding.filters`, `targetBinding.filters`). (3) Comment block at line 1308 documents the bridge retirement and the Decision 111 single-structure rationale. |
| `web/src/types/convergence-bindings.ts` | `ConvergenceBindingEntry.filters?` field added with the operator-narrowed union mirroring `MetricDerivationRule['filters'][number]['operator']` so engine consumers can pass `binding.filters` directly to `resolveColumnFromBatch` without cast. |
| `docs/vp-prompts/HF-227_DIRECTIVE_20260516.md` | New directive persistence record. |

## PROOF GATES — HARD

### Phase 0 — Diagnostic

| Check | PASS/FAIL | Evidence |
|---|---|---|
| `resolveColumnMappingsViaAI` signature + line number | PASS | convergence-service.ts:1881 (pre-HF-227 signature returns `Record<string, string>`). |
| `generateAllComponentBindings` signature + line number | PASS | convergence-service.ts:2061 (call site to resolveColumnMappingsViaAI at pre-HF-227 line 2148). |
| `resolveMetricsFromConvergenceBindings` signature + line number | PASS | route.ts:1260. |
| `findMetricFilters` signature + line number (bridge to be removed) | PASS | route.ts:1315 (pre-HF-227). |
| `resolveColumnFromBatch` confirms `filters` parameter present (HF-226) | PASS | route.ts:1434 signature includes `filters?: MetricDerivationRule['filters']`. |
| `DataCapability.categoricalFields` type | PASS | convergence-service.ts:79 — `Array<{ field: string; distinctValues: string[]; count: number }>`. |
| Current prompt text in `resolveColumnMappingsViaAI` | PASS | Pasted in Phase 0 commit body `f5d0c267`. EXAMPLE OUTPUT line is `{"metric_a": "Column_A", "metric_b": "Column_B"}` (flat string-to-string). |

### Phase 1 — Prompt + parser evolution

| Check | PASS/FAIL | Evidence |
|---|---|---|
| `resolveColumnMappingsViaAI` signature includes `categoricalFields` parameter | PASS | See below. |
| Prompt text includes CATEGORICAL FIELDS section | PASS | See `categoricalContext` construction below. |
| EXAMPLE OUTPUT shows enriched form with filters | PASS | See userPrompt template below. |
| Parser handles both string and `{column, filters}` forms | PASS | See parser block below. |
| Validator handles both forms | PASS | See `isValidColumnMapping` block below. |
| Return type is `Record<string, string \| { column, filters? }>` | PASS | `ColumnMappingValue` exported as union (see type alias below). |
| `npm run build` exits 0 | PASS | Phase 1+2 commit `e2b3ecce` build clean (see final build at foot). |
| Korean Test grep returns 0 results | PASS | `grep -nE "'product_category'\|'Capital Equipment'\|'Consumables'\|'Cross-Sell'" web/src/lib/intelligence/convergence-service.ts` → no hits. |

New signature:

```typescript
async function resolveColumnMappingsViaAI(
  components: PlanComponent[],
  allRequirements: Array<{ compIndex: number; compName: string; req: ComponentInputRequirement }>,
  measureColumns: Array<{ name: string; fi: FieldIdentity; stats: ColumnValueStats }>,
  metricComprehension: MetricComprehensionSignal[] = [],
  // HF-227: Categorical fields with distinct values so the AI can identify
  // categorical-subset opportunities at column-mapping time. Source comes from
  // DataCapability.categoricalFields (Korean Test: runtime data, not code).
  categoricalFields: Array<{ field: string; distinctValues: unknown[] }> = [],
): Promise<Record<string, ColumnMappingValue>> {
```

New type alias:

```typescript
export type ColumnMappingFilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
export type ColumnMappingFilter = {
  field: string;
  operator: ColumnMappingFilterOperator;
  value: string | number | boolean;
};
export type ColumnMappingValue = string | { column: string; filters?: ColumnMappingFilter[] };
```

Prompt context construction:

```typescript
const categoricalContext = categoricalFields.length > 0
  ? `\n\nCATEGORICAL FIELDS (available for filtering):\n${
      categoricalFields.map((cf, i) =>
        `${i + 1}. "${cf.field}" — distinct values: ${JSON.stringify(cf.distinctValues.slice(0, 20))}`
      ).join('\n')
    }\n\nIf a metric label suggests a subset of a broader numeric field (e.g., a revenue metric that applies only to one product class, a sale count restricted to a specific transaction type), use a categorical field together with one of its distinct values as a filter. The filter value MUST be one of the listed distinct values. Use a plain string mapping when no filter is needed; use the object form when the metric requires categorical subsetting.`
  : '';
```

Updated EXAMPLE OUTPUT:

```typescript
EXAMPLE OUTPUT (plain string when no filter; object with filters when categorical subset applies):
{"${metricFields[0] || 'metric_a'}": "${columnNames[0] || 'Column_A'}", "${metricFields[1] || 'metric_b'}": {"column": "${columnNames[1] || 'Column_B'}", "filters": [{"field": "${categoricalFields[0]?.field || 'Category_Col'}", "operator": "eq", "value": ${JSON.stringify(categoricalFields[0]?.distinctValues?.[0] ?? 'Some_Category')}}]}}
```

Parser:

```typescript
const mapping: Record<string, ColumnMappingValue> = {};
for (const [key, val] of Object.entries(result)) {
  if (typeof val === 'string' && columnNames.includes(val)) {
    mapping[key] = val;
  } else if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>;
    const col = obj.column;
    if (typeof col === 'string' && columnNames.includes(col)) {
      const validOps: ColumnMappingFilterOperator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains'];
      const filters: ColumnMappingFilter[] = Array.isArray(obj.filters)
        ? (obj.filters as Array<Record<string, unknown>>)
            .filter(f => typeof f.field === 'string' && f.value != null)
            .map(f => {
              const op = typeof f.operator === 'string' && (validOps as string[]).includes(f.operator)
                ? (f.operator as ColumnMappingFilterOperator)
                : 'eq';
              return { field: String(f.field), operator: op, value: f.value as string | number | boolean };
            })
        : [];
      mapping[key] = filters.length > 0 ? { column: col, filters } : col;
    }
  }
}
```

Validator:

```typescript
function isValidColumnMapping(
  result: Record<string, unknown>,
  metricFields: string[],
  columnNames: string[],
): boolean {
  const mappedCount = metricFields.filter(m => {
    const val = result[m];
    if (typeof val === 'string') return columnNames.includes(val);
    if (typeof val === 'object' && val !== null) {
      const col = (val as Record<string, unknown>).column;
      return typeof col === 'string' && columnNames.includes(col);
    }
    return false;
  }).length;
  return mappedCount >= Math.ceil(metricFields.length * 0.5);
}
```

### Phase 2 — Binding construction writes filters

| Check | PASS/FAIL | Evidence |
|---|---|---|
| `categoricalFields` extracted from `dataCapabilities` | PASS | See block below. |
| `resolveColumnMappingsViaAI` call passes `categoricalFields` | PASS | See block below. |
| Binding entry construction reads enriched mapping | PASS | See `proposedMapping` / `proposedFilters` block. |
| `compBindings[role]` includes `filters` field | PASS | See binding write block. |
| `npm run build` exits 0 | PASS | Phase 1+2 commit `e2b3ecce` build clean. |
| Korean Test: 0 results | PASS | See Phase 1 grep. |

Aggregation + AI call:

```typescript
const seenCategoricalFields = new Set<string>();
const aggregatedCategoricalFields: Array<{ field: string; distinctValues: unknown[] }> = [];
for (const match of matches) {
  const cap = capabilities.find(c => c.dataType === match.dataType);
  if (!cap) continue;
  for (const cf of cap.categoricalFields || []) {
    if (seenCategoricalFields.has(cf.field)) continue;
    seenCategoricalFields.add(cf.field);
    aggregatedCategoricalFields.push({ field: cf.field, distinctValues: cf.distinctValues });
  }
}
console.log('[Convergence] HF-112 Requesting AI column mapping');
const aiMapping = await resolveColumnMappingsViaAI(
  components,
  allRequirements,
  measureColumns,
  metricComprehension,
  aggregatedCategoricalFields,
);
```

Consumer + binding write:

```typescript
for (const req of requirements) {
  const proposedMapping = aiMapping[req.metricField];
  const proposedColumnName = typeof proposedMapping === 'string'
    ? proposedMapping
    : proposedMapping?.column;
  const proposedFilters = typeof proposedMapping === 'object' && proposedMapping !== null && Array.isArray(proposedMapping.filters)
    ? proposedMapping.filters
    : [];

  if (proposedColumnName) {
    const mc = measureColumns.find(c => c.name === proposedColumnName);
    if (mc && !boundColumns.has(proposedColumnName)) {
      const { score: boundaryScore, scaleFactor } = scoreColumnForRequirement(mc.name, mc.stats, req);
      const isValidated = !req.expectedRange || boundaryScore > 0.1;

      bindings[compKey][req.role] = {
        column: proposedColumnName,
        field_identity: mc.fi,
        match_pass: isValidated ? 1 : 2,
        confidence: isValidated ? 0.9 : 0.6,
        scale_factor: scaleFactor !== 1 ? scaleFactor : undefined,
        learning_provenance: { batch_id: mc.batchId, learned_at: new Date().toISOString() },
        filters: proposedFilters,  // HF-227
      };
      boundColumns.add(proposedColumnName);
      console.log(`[Convergence] HF-112 ${comp.name}:${req.role} → ${proposedColumnName} (AI${isValidated ? '+validated' : ''}, scale=${scaleFactor}, filters=${proposedFilters.length})`);
      continue;
    }
  }
  // ... (boundary fallback unchanged) ...
}
```

### Phase 3 — Engine reads filters natively, bridge removed

| Check | PASS/FAIL | Evidence |
|---|---|---|
| All four `resolveColumnFromBatch` call sites pass `binding.filters` | PASS | See call sites below. |
| `findMetricFilters` function removed (grep returns 0 live references) | PASS | See grep block below. |
| `ConvergenceBindingEntry` type includes `filters?` | PASS | types/convergence-bindings.ts:35 (pasted below). |
| `npm run build` exits 0 | PASS | Phase 3 commit `3e58dd6a` build clean. |
| Korean Test: 0 results on route.ts | PASS | `grep -nE "'product_category'\|'Capital Equipment'\|'Consumables'\|'Cross-Sell'" web/src/app/api/calculation/run/route.ts` → no hits. |

Ratio branch (numerator + denominator):

```typescript
// HF-227: filters read from the binding entry, not from metric_derivations.
const rawNumValue = resolveColumnFromBatch(numBinding.column, lookupKey, numBinding.filters);
const rawDenValue = resolveColumnFromBatch(denBinding.column, lookupKey, denBinding.filters);
```

Single-input branch (actual):

```typescript
// HF-227: filters live on the binding entry (Decision 111 single-
// structure completion; replaces HF-226's findMetricFilters bridge).
const rawActualValue = resolveColumnFromBatch(actualBinding.column, lookupKey, actualBinding.filters);
```

Dual-input target branch:

```typescript
if (targetBinding?.column) {
  // HF-227: filters read from the binding entry directly.
  const rawTargetValue = resolveColumnFromBatch(targetBinding.column, lookupKey, targetBinding.filters);
```

Bridge-function removal verification:

```bash
$ grep -nE "^[^/]*findMetricFilters\(|const findMetricFilters" web/src/app/api/calculation/run/route.ts
(zero hits — bridge removed)

$ grep -n "findMetricFilters" web/src/app/api/calculation/run/route.ts
1309:    // looked up filters from metric_derivations via the findMetricFilters
1362:      // structure completion; replaces HF-226's findMetricFilters bridge).
```

The two remaining references are inside comment blocks documenting the retirement. There is no live function declaration and no call site.

`ConvergenceBindingEntry.filters` added at types/convergence-bindings.ts:

```typescript
// HF-227: filters live on the binding (Decision 111 single-structure
// completion). Engine consumers pass binding.filters directly to
// resolveColumnFromBatch; the HF-226 findMetricFilters cross-structure
// bridge is retired. Empty / absent means "no filter" — rowMatchesFilters
// returns true for empty arrays.
// Operator union mirrors MetricDerivationRule['filters'][number]['operator']
// so binding.filters can pass directly to resolveColumnFromBatch.
filters?: Array<{
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
  value: string | number | boolean;
}>;
```

### Phase 4 — Clear bindings for re-derivation

| Check | PASS/FAIL | Evidence |
|---|---|---|
| `input_bindings` cleared for all three tenants | PASS | See script output. |

Script output:

```
CRP: cleared input_bindings on 4 rule_set(s)
  - Capital Equipment Commission Plan (7ae0fba1-83fe-4674-8664-e6516bb370c9)
  - Cross-Sell Bonus Plan (d7b332e8-4f63-4708-ac53-ce6ca65eab96)
  - Consumables Commission Plan (debe8763-2ff0-4a15-9956-787da822b242)
  - District Override Plan (c8cca63b-aa09-4e3e-a2c5-8490ac2756a5)
Meridian: cleared input_bindings on 5 rule_set(s)
  - (5 instances) Meridian Logistics Group Incentive Plan 2025
BCL: cleared input_bindings on 1 rule_set(s)
  - Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026
```

### Phase 5 — Architect-driven (PENDING)

| Check | PASS/FAIL | Evidence |
|---|---|---|
| 5B: re-import each tenant via browser | PENDING — architect-driven via browser | — |
| 5C: calculate + reconcile against architect ground truth | PENDING — architect-driven via browser | — |

## STANDING RULE COMPLIANCE

| Section / Rule | Compliance |
|---|---|
| **GP-1 — Transparent Architectural Compliance** | `convergence_bindings` is now a structurally complete artifact per Decision 111: each binding entry carries column, role, scale factor, learning provenance, AND filter applicability. The engine reads everything from the same structure. An auditor can verify filter contract correctness from the binding write path alone, without a cross-structure metric-name lookup. |
| **GP-2 — Research-Derived Design** | Completes IRA DS-025 Option D (composite of A+B+C). HF-226 delivered Phases 1-3 of Option D; HF-227 absorbs the filter-bridge instance documented as AP-DCM-4 (Bridge invention — symptom of incomplete design). |
| **Section A — AI-First, Never Hardcoded** | Categorical fields and distinct values flow from `DataCapability` at runtime. Prompt construction uses runtime-supplied `categoricalFields[0]?.field` and `categoricalFields[0]?.distinctValues?.[0]` for the example; no domain literals. |
| **Section A — Fix Logic, Not Data** | Two filter-vocabulary additions in pipeline code (prompt + binding write). No tenant-specific patches. No hardcoded answer values. |
| **Section A — Carry Everything, Express Contextually (T1-E902)** | The enriched mapping format is open to extension (the parser accepts both plain string and object form; future schema extensions can add fields without breaking existing emitters). |
| **Section A — Korean Test (E910 / D154 LOCKED)** | Korean Test grep on all three modified files returns zero hits: `'product_category'`, `'Capital Equipment'`, `'Consumables'`, `'Cross-Sell'`. The CATEGORICAL FIELDS block in the prompt is data-driven, not code-driven. |
| **Section C — AP-DCM-4 (Bridge invention)** | The HF-226 `findMetricFilters` bridge is retired. Decision 111 single-structure completion: `convergence_bindings` is the sole engine output for filter applicability. |
| **Section D, Rule 7 (Service role server-side)** | `scripts/hf226-clear-bindings.ts` reused for Phase 4 (uses service-role client). |
| **Section D, Rule 14 (OB/HF prompt committed to git)** | `docs/vp-prompts/HF-227_DIRECTIVE_20260516.md` committed at first action (Phase 0 commit `38f21067`). |
| **Section D, Rules 15–20 (Proof gates require evidence)** | Every Hard gate above pastes code excerpts, grep output, or script output. PENDING gates marked architect-driven; no PASS claimed without paste. |
| **Section D, Rule 25 (Scale analysis)** | Filter-respecting sum is O(filters × rows) per binding per entity. With filters typically 1–2 predicates and entity rows in low thousands, identical asymptotic behavior to the existing `applyMetricDerivations` path. The AI call cardinality is unchanged (one `resolveColumnMappingsViaAI` invocation per convergence run). |

## KNOWN ISSUES

1. **Phase 1 and Phase 2 combined into one commit.** The directive specifies separate Phase 1 and Phase 2 commits, each with its own proof gate. The return-type widening in Phase 1 is observed by the consumer (`generateAllComponentBindings`) which must be updated in lockstep, otherwise an intermediate commit fails `tsc --noEmit`. Splitting into a build-failing intermediate commit would violate the standing-rule invariant "After EVERY commit … `npm run build` … confirm clean". Architect dispositions: (a) accept combined commit; (b) request rebase split where the intermediate state uses `// @ts-expect-error` to bypass the build gate temporarily; (c) update the directive's phase structure to acknowledge tight Phase-1/Phase-2 coupling.

2. **`metric_derivations` array no longer the engine's filter source for the convergence-binding path.** Post-HF-227 the engine reads filters from `convergence_bindings.<role>.filters` exclusively. `metric_derivations` is still produced by `generateAISemanticDerivations` (HF-226) and is still consumed by `applyMetricDerivations` (run-calculation.ts) for tenants whose `input_bindings` lack `convergence_bindings`. The two paths now produce filters from independent AI calls — `resolveColumnMappingsViaAI` for convergence_bindings, `generateAISemanticDerivations` for metric_derivations. Per the DCM and Decision 111, `convergence_bindings` is the forward direction; `metric_derivations` should retire as part of DS-022 cleanup. Out of HF-227 scope. Surfaced.

3. **Phase 4 used HF-226's existing clear-bindings script (`scripts/hf226-clear-bindings.ts`) rather than a new HF-227-specific script.** The two operations are byte-identical (set `input_bindings` to `{}` on the three proof tenants). Re-running the HF-226 script is the correct minimal action; a duplicate script would be code drift. Surfaced for transparency.

## VERIFICATION SCRIPT OUTPUT

`git log main..HEAD --oneline`:

```
ff3bea2c HF-227 Phase 4: clear bindings for re-derivation under HF-227 prompt
3e58dd6a HF-227 Phase 3: engine reads filters from binding natively; findMetricFilters bridge removed
e2b3ecce HF-227 Phase 1+2: resolveColumnMappingsViaAI gains filter vocabulary; bindings carry filters
f5d0c267 HF-227 Phase 0: diagnostic -- read current state
38f21067 HF-227 Phase 0: commit directive prompt (Rule 5)
```

`git diff main...HEAD --stat`:

```
 docs/vp-prompts/HF-227_DIRECTIVE_20260516.md       |  21 +++
 web/src/app/api/calculation/run/route.ts           |  43 +++++--------
 web/src/lib/intelligence/convergence-service.ts    | 155 +++++++++++++++++++--
 web/src/types/convergence-bindings.ts              |  14 ++++
```

TypeScript type-check after every phase:

```
TSC_EXIT=0
```

Korean Test grep across all three modified source files:

```
$ grep -lE "'product_category'|'Capital Equipment'|'Consumables'|'Cross-Sell'" \
    web/src/lib/intelligence/convergence-service.ts \
    web/src/app/api/calculation/run/route.ts \
    web/src/types/convergence-bindings.ts
(zero hits across all three files)
```

Bridge-function retirement:

```
$ grep -nE "^[^/]*findMetricFilters\(|const findMetricFilters" web/src/app/api/calculation/run/route.ts
(zero hits — bridge removed)
```

Final `npm run build` output:

```
> @vialuce/platform@0.1.0 prebuild
> bash scripts/verify-korean-test.sh

[korean-test-gate] PASS: zero hardcoded legacy primitive-name string literals outside registry

> @vialuce/platform@0.1.0 build
> next build

  ▲ Next.js 14.2.35
  - Environments: .env.local

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...

(lint warnings preserved from pre-HF-227 baseline — non-blocking; full warning list in /tmp/hf227-final-build.log)

   Collecting page data ...
   Generating static pages (...)
   Finalizing page optimization ...

   (full route table emitted; tail follows)

├ ƒ /workforce/permissions                    11 kB           240 kB
├ ƒ /workforce/personnel                      212 B           214 kB
├ ƒ /workforce/roles                          13.3 kB         238 kB
└ ƒ /workforce/teams                          11.5 kB         213 kB
+ First Load JS shared by all                 88.1 kB
  ├ chunks/2117-a743d72d939a4854.js           31.9 kB
  ├ chunks/fd9d1056-5bd80ebceecc0da8.js       53.7 kB
  └ other shared chunks (total)               2.59 kB


ƒ Middleware                                  76 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand


BUILD EXIT: 0
```

Build outcomes:

| Surface | Outcome |
|---|---|
| `prebuild` Korean-test gate (`scripts/verify-korean-test.sh`) | PASS — zero hardcoded legacy primitive-name string literals outside registry |
| TypeScript type-check | Clean — no errors |
| ESLint | Pre-HF-227 warnings preserved (image-element, react-hooks/exhaustive-deps); no new warnings introduced by HF-227 |
| Page compilation | All routes compiled successfully |
| Exit code | `0` |
