# DIAG-024 FINDINGS — Importer/Engine Alignment Diagnostic

**Authored:** 2026-04-27
**Branch authored on:** `diag-024-importer-engine-alignment` (feature branch off main)
**Substrate:** `origin/main` at `6504b7cfeac23e8410643c5f0b3a844f59597e67` (post-CLN-001 merge; tree-equivalent to `be2e5321` post-CLT-197 merge for production source)
**Scope (Rule 36):** Read-only code inspection + read-only DB query. No code changes. No DB modifications. No remediation proposed.

---

## DIAGNOSTIC SCOPE

| Field | Value |
|---|---|
| Predecessor | CLT-197 BCL October calc on rebuilt substrate produced **$19,280** vs **~$44,590** expected (~43% of target) |
| Per-component evidence (architect-provided) | C1 Credit Placement = $0 (`matchedTier: 'none'`); C2 Deposit Capture = $0 (`matchedTier: 'none'`); C3 Cross Products = $250; C4 Regulatory Compliance = $150 |
| Concordance status | Intent executor and legacy engine produced 100% concordance on the wrong answer — both returned 0 for C1/C2 |
| Substrate anchor lineage | `283d4c24` → REVERT-001 → AUD-003 → HF-195 → CLT-197 cutover (PR #342 reverted PRs #338, #339; PR #340 / HF-194 retained on main) → CLN-001 |

---

## BLOCK 1 — REFERENCE RULE_SET SHAPES (architect-provided, verbatim)

Proven March substrate — rule_set `03bdd3e6` (BCL, $312,033 verified):

```
C1 Credit Placement:
  componentType: "matrix_lookup"
  matrixConfig: populated 6×5 grid per variant (Senior + Executive)

C2 Deposit Capture:
  componentType: "tier_lookup"
  tierConfig.tiers: 5 tiers per variant
    Senior: $0 / $120 / $250 / $400 / $550
    Executive: $0 / $80 / $180 / $300 / $420

C3 Cross Products:
  componentType: "scalar_multiply"
  rate: 25 (Senior), 18 (Executive)

C4 Regulatory Compliance:
  componentType: "tier_lookup"
  tierConfig.tiers: 2 tiers per variant
    Senior: 0 infractions = $150, ≥1 = $0
    Executive: 0 infractions = $100, ≥1 = $0
```

Proven engine path: `evaluateMatrixLookup(component.matrixConfig, metrics)` for C1; `evaluateTierLookup(component.tierConfig, metrics)` for C2/C4. `tierConfig.tiers` and `matrixConfig` were populated with usable data.

---

## BLOCK 2 — CURRENT RULE_SET SHAPE (production DB)

Query: `SELECT id, name, status, components, input_bindings FROM rule_sets WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111' AND status = 'active' ORDER BY created_at DESC`.

Result: **2 active rule_sets** for BCL (apparent re-import duplicate; both have identical structure):

| rule_set id | created_at |
|---|---|
| `f7b82b93-b2f6-44c6-8a20-317eec182ce7` | 2026-04-27T00:39:32 |
| `26cb1efd-b949-47c8-a7a8-d3b56eb3c3b7` | 2026-04-27T00:38:33 |

Both rule_sets contain two variants (`ejecutivo_senior`, `ejecutivo`), each with 4 components.

### Per-component shape on rebuilt substrate (variant `ejecutivo_senior`; `ejecutivo` differs only in numeric values)

**C1 — `c1_colocacion_credito_senior` (Credit Placement - Senior Executive):**
```
componentType: "tier_lookup"
tierConfig: {"tiers":[],"metric":"unknown","currency":"MXN","metricLabel":"Unknown"}
matrixConfig: undefined
calculationIntent.operation: "bounded_lookup_2d"
metadata.intent keys: inputs,operation,outputGrid,rowBoundaries,noMatchBehavior,columnBoundaries
metadata.intent: {
  "operation":"bounded_lookup_2d",
  "inputs":{
    "row":{"source":"metric","sourceSpec":{"field":"credit_placement_attainment"}},
    "column":{"source":"metric","sourceSpec":{"field":"portfolio_quality_ratio"}}
  },
  "outputGrid":[[0,80,120,160,200],[80,120,180,240,300],[120,180,260,340,420],[180,260,360,460,560],[240,360,480,600,700],[300,420,560,680,700]],
  "rowBoundaries":[6 boundary objects],
  "columnBoundaries":[5 boundary objects],
  "noMatchBehavior":"zero"
}
```

**C2 — `c2_captacion_depositos_senior` (Deposit Capture - Senior Executive):**
```
componentType: "tier_lookup"
tierConfig: {"tiers":[],"metric":"unknown","currency":"MXN","metricLabel":"Unknown"}
matrixConfig: undefined
calculationIntent.operation: "bounded_lookup_1d"
metadata.intent keys: input,outputs,operation,boundaries,noMatchBehavior
metadata.intent: {
  "operation":"bounded_lookup_1d",
  "input":{"source":"metric","sourceSpec":{"field":"deposit_capture_attainment"}},
  "outputs":[0,120,250,400,550],
  "boundaries":[5 boundary objects],
  "noMatchBehavior":"zero"
}
```

**C3 — `c3_productos_cruzados_senior` (Cross Products - Senior Executive):**
```
componentType: "scalar_multiply"
tierConfig: undefined
matrixConfig: undefined
calculationIntent.operation: "scalar_multiply"
metadata.intent keys: rate,input,operation
metadata.intent: {"rate":25,"input":{"source":"metric","sourceSpec":{"field":"cross_products_sold"}},"operation":"scalar_multiply"}
```

**C4 — `c4_cumplimiento_regulatorio_senior` (Regulatory Compliance - Senior Executive):**
```
componentType: "conditional_gate"
tierConfig: undefined
matrixConfig: undefined
calculationIntent.operation: "conditional_gate"
metadata.intent keys: onTrue,onFalse,condition,operation
metadata.intent: {
  "operation":"conditional_gate",
  "condition":{"left":{"source":"metric","sourceSpec":{"field":"regulatory_infractions"}},"right":{"value":0,"source":"constant"},"operator":"="},
  "onTrue":{"value":150,"operation":"constant"},
  "onFalse":{"value":0,"operation":"constant"}
}
```

---

## BLOCK 3 — IMPORTER CODE PATH

### Block 3.1 — Entry points

```
web/src/lib/compensation/ai-plan-interpreter.ts:547  function convertComponent(comp: InterpretedComponent, order: number): PlanComponent {
web/src/lib/compensation/ai-plan-interpreter.ts:725  export function bridgeAIToEngineFormat(
web/src/lib/compensation/ai-plan-interpreter.ts:453  export function interpretationToPlanConfig(
```

`bridgeAIToEngineFormat` (line 725) calls `interpretationToPlanConfig` (line 453), which builds variants and calls `convertComponent` for each component.

### Block 3.2 — convertComponent dispatch

The function reads `calcType` (line 566): `const calcType = (base.calculationIntent?.operation as string) || calcMethod?.type || 'tiered_lookup';` — `calculationIntent.operation` is checked first (HF-160 priority inversion safety net).

The switch (line 571) has explicit cases:

| Case | Component output (key fields) |
|---|---|
| `'matrix_lookup'` (line 572) | `componentType: 'matrix_lookup'` + populated `matrixConfig` |
| `'tiered_lookup'` (line 600) | `componentType: 'tier_lookup'` + populated `tierConfig.tiers` |
| `'percentage'` / `'flat_percentage'` (line 627) | `componentType: 'percentage'` + `percentageConfig` |
| `'conditional_percentage'` (line 642) | `componentType: 'conditional_percentage'` + `conditionalConfig` |
| `'linear_function' \| 'piecewise_linear' \| 'scope_aggregate' \| 'scalar_multiply' \| 'conditional_gate'` (line 666–680) | `componentType: calcType as ...` + `metadata: {...base.metadata, intent: base.calculationIntent}`. **No tierConfig / matrixConfig set.** |
| **DEFAULT** (line 681–697; HF-156 fallback) | If `base.calculationIntent` exists: `componentType: 'tier_lookup'` + `metadata.intent: base.calculationIntent` + **EMPTY** `tierConfig: {metric: 'unknown', metricLabel: 'Unknown', tiers: [], currency: 'MXN'}`. Else: bare `componentType: 'tier_lookup'` + empty `tierConfig`. |

The 5-tuple explicit case at line 666 is verbatim:

```ts
case 'linear_function':
case 'piecewise_linear':
case 'scope_aggregate':
case 'scalar_multiply':
case 'conditional_gate':
  return {
    ...base,
    componentType: calcType as 'linear_function' | 'piecewise_linear' | 'scope_aggregate',
    metadata: {
      ...(base.metadata || {}),
      intent: base.calculationIntent, // Copy to where transformFromMetadata reads
    },
  };
```

The DEFAULT branch is verbatim:

```ts
default:
  // HF-156: If calculationIntent exists, use it as metadata.intent even for legacy types
  if (base.calculationIntent) {
    return {
      ...base,
      componentType: 'tier_lookup',
      metadata: {
        ...(base.metadata || {}),
        intent: base.calculationIntent,
      },
      tierConfig: {
        metric: 'unknown',
        metricLabel: 'Unknown',
        tiers: [],
        currency: 'MXN',
      },
    };
  }
  return {
    ...base,
    componentType: 'tier_lookup',
    tierConfig: {
      metric: 'unknown',
      metricLabel: 'Unknown',
      tiers: [],
      currency: 'MXN',
    },
  };
```

**`bounded_lookup_2d` and `bounded_lookup_1d` are absent from every case in the switch.** They fall through to DEFAULT, producing exactly the EMPTY `tierConfig.tiers: []` + populated `metadata.intent` shape Block 2 captured for C1 and C2.

### Block 3.3 — `componentType` literal-string write sites

```
web/src/lib/compensation/ai-plan-interpreter.ts:578  componentType: 'matrix_lookup'   (matrix_lookup case)
web/src/lib/compensation/ai-plan-interpreter.ts:616  componentType: 'tier_lookup'    (tiered_lookup case)
web/src/lib/compensation/ai-plan-interpreter.ts:686  componentType: 'tier_lookup'    (DEFAULT branch with calculationIntent — C1/C2 land here)
web/src/lib/compensation/ai-plan-interpreter.ts:701  componentType: 'tier_lookup'    (DEFAULT branch without calculationIntent)
```

Note line 674: the 5-tuple case sets `componentType: calcType as ...` — preserving the operation name (e.g., `'scalar_multiply'`, `'conditional_gate'`) as componentType. This is how C3 and C4 acquire their componentType values.

`calcMethod.type | calculationIntent.operation | calcType` references in `web/src/lib/compensation/`:

```
ai-plan-interpreter.ts:561  // HF-158 / DIAG-014: Read calculationIntent.operation as fallback when calculationMethod is undefined.
ai-plan-interpreter.ts:564  // HF-160: calculationIntent.operation checked FIRST (priority inversion safety net)
ai-plan-interpreter.ts:566  const calcType = (base.calculationIntent?.operation as string) || calcMethod?.type || 'tiered_lookup';
ai-plan-interpreter.ts:569  console.log(`[convertComponent] "${base.name}" calcType="${calcType}" ...`);
ai-plan-interpreter.ts:571  switch (calcType) {
ai-plan-interpreter.ts:674  componentType: calcType as 'linear_function' | 'piecewise_linear' | 'scope_aggregate',
```

### Block 3.4 — `tierConfig` / `matrixConfig` / `metadata.intent` write sites

`tierConfig: {` writes in `web/src/lib/compensation/ai-plan-interpreter.ts`:

```
617  tiered_lookup case — populated tierConfig.tiers from rawTiers
691  DEFAULT branch (with calculationIntent) — empty tierConfig.tiers
702  DEFAULT branch (without calculationIntent) — empty tierConfig.tiers
```

`matrixConfig: {` writes in `web/src/lib/compensation/ai-plan-interpreter.ts`:

```
579  matrix_lookup case — populated matrixConfig only
```

`metadata: {...intent:...}` writes:

```
ai-plan-interpreter.ts:677  intent: base.calculationIntent  (5-tuple case — C3/C4 use this path)
ai-plan-interpreter.ts:689  intent: base.calculationIntent  (DEFAULT branch with calculationIntent — C1/C2 use this path)
```

---

## BLOCK 4 — ENGINE READ PATHS

### Block 4.1 — Legacy dispatch in `web/src/lib/calculation/run-calculation.ts`

The switch at line 362 dispatches on `component.componentType`:

```
362  switch (component.componentType) {
363    case 'tier_lookup':
364      if (component.tierConfig) {
365        const r = evaluateTierLookup(component.tierConfig, metrics);
...
377    case 'matrix_lookup':
378      if (component.matrixConfig) {
379        const r = evaluateMatrixLookup(component.matrixConfig, metrics);
...
384    case 'conditional_percentage': { ...
```

Searches for `case 'scalar_multiply'`, `case 'conditional_gate'`, `case 'bounded_lookup_1d'`, `case 'bounded_lookup_2d'` in `run-calculation.ts` returned **empty** — the legacy switch has **no cases for any of the new primitive component types**. (Also no cases for `linear_function | piecewise_linear | scope_aggregate`.)

### Block 4.2 — `evaluateTierLookup` behavior with empty tiers

Located at `web/src/lib/calculation/run-calculation.ts`. Function reads `config.tiers`, runs `resolveBandIndex(config.tiers, metricValue)`, and returns:

```ts
return { payout: 0, details: { metric: config.metric, metricValue, matchedTier: 'none' } };
```

when `tierIdx < 0` (no tier matches). For an EMPTY `config.tiers: []`, `resolveBandIndex` cannot match any tier; `tierIdx = -1`; the function returns `{ payout: 0, details: { matchedTier: 'none', ... } }` — **exactly the architect-observed C1/C2 trace.**

### Block 4.3 — `evaluateMatrixLookup` behavior

Located at `web/src/lib/calculation/run-calculation.ts`. Function reads `config.rowMetric`, `config.columnMetric`, `config.rowBands`, `config.columnBands`, `config.values`. For a component whose `matrixConfig` is `undefined` (C1's case under the rebuilt-substrate shape), the legacy dispatch at line 378 (`if (component.matrixConfig) {`) skips the call entirely; payout remains 0.

But C1's `componentType` is `'tier_lookup'` not `'matrix_lookup'` — the dispatch never reaches the `matrix_lookup` case. C1 enters the `tier_lookup` case (line 363) and falls into the empty-tier path described in Block 4.2.

### Block 4.4 — Intent executor handlers

Intent executor at `web/src/lib/calculation/intent-executor.ts`. The dispatch (line 432, function `executeOperation`) reads `op.operation`:

```
438  switch (op.operation) {
439    case 'bounded_lookup_1d': return executeBoundedLookup1D(op, data, inputLog, trace);
440    case 'bounded_lookup_2d': return executeBoundedLookup2D(op, data, inputLog, trace);
441    case 'scalar_multiply':   return executeScalarMultiply(op, data, inputLog, trace);
442    case 'conditional_gate':  return executeConditionalGate(op, data, inputLog, trace);
443    case 'aggregate':         return executeAggregateOp(op, data, inputLog);
444    case 'ratio':             return executeRatioOp(op, data, inputLog);
445    case 'constant':          return executeConstantOp(op);
446    case 'weighted_blend':    return executeWeightedBlend(op, data, inputLog, trace);
447    case 'temporal_window':   return executeTemporalWindow(op, data, inputLog, trace);
448    case 'linear_function':   return executeLinearFunction(op, data, inputLog, trace);
449    case 'piecewise_linear':  return executePiecewiseLinear(op, data, inputLog, trace);
450  }
```

`executeBoundedLookup1D` (line 197) reads `op.input`, `op.boundaries`, `op.outputs` (lines 203, 205, 213). These are the same field names present in C2's `metadata.intent` per Block 2.

`executeBoundedLookup2D` (line 227) reads `op.inputs.row`, `op.inputs.column`, `op.rowBoundaries`, `op.columnBoundaries`, `op.outputGrid` (lines 233, 234, 236, 237, 247). These match C1's `metadata.intent` field names per Block 2.

### Block 4.5 — Authority dispatch (Decision 151 / HF-188)

Hits in `web/src/app/api/calculation/run/route.ts`:

```
1466  // ── LEGACY ENGINE PATH (concordance shadow — HF-188) ──
1468  addLog('HF-188: Intent executor is sole authority — legacy engine is concordance shadow');
1583  // HF-188: Legacy total preserved for concordance comparison only
1586  // ── HF-188 INTENT ENGINE PATH (authoritative) ──
1670  // HF-188: Intent executor is sole authority. Rounding applied here.
1686  // Apply Decision 122 rounding to intent executor results
1707  // HF-188: Intent executor is authoritative — legacy is concordance shadow
```

No matches for `INTENT_AUTHORITATIVE` / `Decision 151` / `isIntentAuthoritative` / `sole authority` in `web/src/lib/calculation/`.

`executeOperation(...)` invocations:

```
intent-executor.ts:154,291,432,589,594,607  (intra-executor calls)
run-calculation.ts:393  const gatePayout = toNumber(executeOperation(gateIntent as unknown as IntentOperation, entityData, inputLog, {}));
run-calculation.ts:456  const intentPayoutDecimal = executeOperation(intentOp, entityData, inputLog, {});
```

Verdict: **HF-188 declares intent executor sole authority for all components.** Legacy is run as a "concordance shadow" for comparison. There is no per-componentType allow-list — every component routes through the intent executor; legacy result is recorded for concordance only.

---

## BLOCK 5.1 — IMPORTER → ENGINE TABLE

| Component | Importer writes | Legacy reads | Intent executor reads |
|---|---|---|---|
| **C1 Credit Placement** | `componentType: "tier_lookup"` (DEFAULT branch, line 686) `tierConfig: {tiers:[], metric:"unknown", ...}` (line 691) `matrixConfig: undefined` `metadata.intent: {operation:"bounded_lookup_2d", inputs:{row,column}, outputGrid, rowBoundaries, columnBoundaries, noMatchBehavior}` (line 689) | Reads `tierConfig.tiers` (empty); `resolveBandIndex` returns -1; emits `{payout: 0, matchedTier: 'none'}` | Reads `op.inputs.row`, `op.inputs.column`, `op.rowBoundaries`, `op.columnBoundaries`, `op.outputGrid` from `metadata.intent` — **all fields present and correctly named** |
| **C2 Deposit Capture** | `componentType: "tier_lookup"` (DEFAULT branch, line 686) `tierConfig: {tiers:[], metric:"unknown", ...}` (line 691) `metadata.intent: {operation:"bounded_lookup_1d", input, outputs, boundaries, noMatchBehavior}` (line 689) | Reads `tierConfig.tiers` (empty); `resolveBandIndex` returns -1; emits `{payout: 0, matchedTier: 'none'}` | Reads `op.input`, `op.boundaries`, `op.outputs` from `metadata.intent` — **all fields present and correctly named** |
| **C3 Cross Products** | `componentType: "scalar_multiply"` (5-tuple case, line 674) `tierConfig: undefined` `matrixConfig: undefined` `metadata.intent: {operation:"scalar_multiply", rate, input}` (line 677) | No `case 'scalar_multiply'` in switch → fallthrough → no payout assignment in this dispatcher | Reads `op.rate`, `op.input` from `metadata.intent` — **all fields present** |
| **C4 Regulatory Compliance** | `componentType: "conditional_gate"` (5-tuple case, line 674) `tierConfig: undefined` `matrixConfig: undefined` `metadata.intent: {operation:"conditional_gate", condition, onTrue, onFalse}` (line 677) | No `case 'conditional_gate'` in switch → fallthrough → no payout assignment in this dispatcher | Reads `op.condition`, `op.onTrue`, `op.onFalse` from `metadata.intent` — **all fields present** |

**Authority dispatch (HF-188 / Decision 151):**

| Question | Answer |
|---|---|
| Decision 151 list of intent-authoritative types | Per HF-188: ALL components — there is no per-type allow-list; intent executor is sole authority for every component |
| Does C1's componentType (`tier_lookup`) appear in the authoritative list? | YES — all componentTypes are intent-authoritative |
| Does C2's componentType (`tier_lookup`) appear in the authoritative list? | YES |
| Does C3's componentType (`scalar_multiply`) appear in the authoritative list? | YES |
| Does C4's componentType (`conditional_gate`) appear in the authoritative list? | YES |

Legacy is "concordance shadow" — runs in parallel for comparison; result recorded but not authoritative for the user-visible payout.

---

## BLOCK 5.2 — STRUCTURAL VERDICT

**Finding A** — Importer writes shape X. Intent executor reads shape X correctly. Legacy reads shape X via the wrong code path (legacy reads `tierConfig`/`matrixConfig`, which are empty/undefined for new primitives by design of HF-156's default branch; HF-188 documents legacy as a non-authoritative concordance shadow). **The structural mapping importer → intent executor is internally consistent.** The mismatch causing C1/C2 = $0 is downstream of the structural mapping.

### Specifically where the mismatch is NOT (per Block 5.1)

- NOT in `convertComponent` — every component's `metadata.intent` matches the intent executor's read shape (verified field-name-by-field-name).
- NOT in the legacy dispatcher's failure mode — legacy is documented as concordance shadow per HF-188; its $0 result for C1/C2 is the expected design behavior of empty `tierConfig` falling through to `matchedTier: 'none'`.
- NOT in authority routing — HF-188 routes every componentType through the intent executor; no component is excluded.

### Specifically where the mismatch must be (architect's evidence required to localize)

The architect-provided per-component evidence states "Adriana's intent_payout was also 0 for C1 and C2." This means the intent executor itself is returning 0 for C1 and C2 despite the structural shape being correct. The structural diagnostic cannot localize this further. To narrow further requires evidence outside the scope of structural code/DB inspection:

1. **Intent executor runtime trace for one BCL entity** showing `executeBoundedLookup1D` / `executeBoundedLookup2D` execution: the resolved `inputValue` from `resolveValue(op.input, data, inputLog, trace)`, the `findBoundaryIndex` result, and which branch produced 0 (no-match → ZERO at line 207, or output grid lookup → ZERO if rowIdx/colIdx out of range).
2. **`EntityData` shape passed to the intent executor for the BCL period** — specifically whether `credit_placement_attainment`, `portfolio_quality_ratio`, and `deposit_capture_attainment` are present and at what numeric scale (e.g., 0–1 ratio, 0–100 percentage, raw count).
3. **Boundary metadata vs. resolved value** — C1's `rowBoundaries` use `0–69.999, 70–79.999, ..., 120+` (percentage scale, 0–100+); `columnBoundaries` use `0–0.699, 0.7–0.799, ..., 0.95–1` (ratio scale, 0–1). C2's `boundaries` use `0–59.999, 60–79.999, ..., 130+` (percentage scale). If the resolved attainment values are at a different scale than the boundary thresholds expect, `findBoundaryIndex` returns -1 and the executor returns 0.
4. **Comparison to C3/C4** — those components produced correct values from the same intent executor, so the executor is structurally working; the failure is specific to bounded_lookup operations or to the metric resolution for the specific fields C1/C2 reference.

The structural verdict is: importer writes the right shape; intent executor reads the right shape; mismatch lives downstream in either `resolveValue`'s data resolution for the bounded_lookup metrics or in the boundary-vs-input scale alignment.

---

## NO REMEDIATION SECTION

This diagnostic produces evidence only. CC does not propose dispositions, fixes, or remediation. Architect interprets the finding and decides next-step direction.

The structural verdict (Finding A) localizes the mismatch to "downstream of importer→engine structural mapping" — concretely, into the runtime behavior of the intent executor's bounded_lookup handlers for C1/C2. Disposition options (importer-side, engine-side, runtime-trace investigation, scale-detection investigation) are architect-side decisions and intentionally not enumerated here.
