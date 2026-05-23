# HF-251 — Compositional Intent + Constructor: Decision 158 Implementation

**Branch:** `dev` (off `main @ 37a9f76d` via merge `0e9481ea`)
**Date:** 2026-05-23
**Scope:** Implements Decision 158 LOCKED (LLM Recognition + Code Construction) per DS-024 v1.0. Closes the iteration cycle from OB-200 → HF-250 by moving the LLM emission boundary from tree-shape to intent-shape.

---

## 1. Build verification

```
$ npx tsc --noEmit
(no output — clean)

$ rm -rf .next && npm run build
✓ Compiled successfully

$ npm run dev (curl localhost:3000)
HTTP 307
```

Lint also clean after removing one unused test helper.

---

## 2. Constructor tests (Phase 1.3) — all passing

```
$ node --test --import tsx src/lib/plan-intelligence/__tests__/intent-constructor.test.ts
✔ 1D banded lookup, 4 bands (0.988458ms)
✔ 2D banded lookup 6x5 (BCL C0 shape) — 30 cells, all reachable (1.050041ms)
✔ arithmetic linear rate (multiply reference by constant) (0.148083ms)
✔ conditional gate (if reference >= threshold then arithmetic else constant) (0.101542ms)
✔ composed: sum of two banded lookups (0.111917ms)
✔ banded lookup with mismatched output count throws ConstructionError (0.220167ms)
✔ scale metadata placed on compare-position constants when evaluator side (0.110375ms)
ℹ tests 7  pass 7  fail 0  duration_ms 304.6395
```

Test 2 is the structural proof for BCL C0: a 6×5 = 30-cell 2D matrix that failed across HF-244/247/248/249/250 under LLM tree-emission constraints. Under Decision 158's construction pathway, the constructor produces all 30 distinct output leaves deterministically from the CompositionalIntent. Test verifies all 30 unique output values appear as constant leaves AND that every conditional uses `gte` (Decision 127 half-open intervals).

---

## 3. BCL plan import (architect-manual on production)

This phase requires browser interaction (login as BCL tenant admin, trigger plan import). CC cannot drive the browser. The architect runs the verification against production deployment `5fde465c`.

Expected log signatures from the production deploy:

```
[plan-component] mode=construction component=<id> name="<name>" rateTableCellCount=<N or (absent)>
[plan-component] constructed component=<id> from compositional_intent shape=<banded_lookup|arithmetic|conditional|composed>
[plan-component] SUCCESS component=<id> name="<name>" attempt=1 latencyMs=<ms> method=compositional_intent
```

For each of BCL's 4 components, report:
- Component name
- CompositionalIntent shape
- Whether `[plan-component] constructed ... from compositional_intent` log line fired
- Whether validator passed
- Persisted `rule_sets.components[].metadata.construction_method` value (should be `compositional_intent`)
- Persisted `rule_sets.components[].metadata.compositional_intent` JSON (verbatim from DB)

**C0 (Colocación de Crédito) is the binding proof.** CompositionalIntent ~750 bytes (vs. ~28KB for the PrimeNode tree); construction must produce 30 distinct output leaves. To be filled by architect:

| C0 verification | Value |
|---|---|
| `[plan-component] constructed component=colocacion-credito from compositional_intent shape=...` | _verbatim_ |
| `[plan-component] SUCCESS component=colocacion-credito ... method=compositional_intent` | _verbatim_ |
| C0's `compositional_intent.structure.shape` in persisted metadata | _value_ |
| C0's `compositional_intent.structure.outputs` length | _30 expected_ |
| C0 constructed tree leaf count | _30+ expected_ |

| All 4 components | Status |
|---|---|
| C0 Colocación de Crédito | _PASS/FAIL_ |
| C1 Captación de Depósitos | _PASS/FAIL_ |
| C2 Productos Cruzados | _PASS/FAIL_ |
| C3 Cumplimiento Regulatorio | _PASS/FAIL_ |

---

## 4. BCL October calculation (architect-manual)

After all four components persist, the architect runs October calculation. To be filled:

| Metric | Value |
|---|---|
| Grand total (October) | _$..._ |
| C0 total (October) | _$..._ |
| C1 total (October) | _$..._ |
| C2 total (October) | _$..._ |
| C3 total (October) | _$..._ |
| Entity count processed | _N_ |
| Calculation duration | _ms_ |

Architect reconciles against GT in architect channel. CC reports calculated values verbatim.

---

## 5. Production verification

| Field | Value |
|---|---|
| Squash-merge commit | `5fde465c2e0a22c9d71880dd8259db9f74bb9a0c` |
| Merged at | `2026-05-23T16:30:59Z` |
| Vercel Production deployment SHA | `5fde465c` (matches main HEAD) |
| Vercel Production deployment ID | `4794413019` |
| Vercel deployment created | `2026-05-23T16:32:28Z` (~90s after merge) |
| Vercel deployment status | `success` |
| Production URL | `https://vialuce-prod-jodp1m04r-seaside-altas-projects.vercel.app` |
| Vercel webhook | Fired correctly (no HF-249-style anomaly) |

```
$ git log --oneline -1 origin/main
5fde465c HF-251: Compositional Intent + Constructor — Decision 158 Implementation (#439)
```

```
$ git checkout dev && git merge main && git push origin dev
Merge made by the 'ort' strategy.
   a7535620..24604bbd  dev -> dev
```

Dev synced with main.

---

## 6. Code changes

### Files created

| Path | Purpose |
|---|---|
| `web/src/lib/plan-intelligence/compositional-intent.ts` | CompositionalIntent + StructuralDescription + ReferenceSource + ScaleSpec + ConstructionError types per DS-024 §3.2 |
| `web/src/lib/plan-intelligence/intent-constructor.ts` | `constructTree(intent)` + helper functions for banded_lookup/arithmetic/conditional/composed |
| `web/src/lib/plan-intelligence/__tests__/intent-constructor.test.ts` | 7 test cases including BCL C0 30-cell 2D matrix shape |

### Files modified

| Path | Change |
|---|---|
| `web/src/lib/ai/providers/anthropic-adapter.ts` | `plan_component` system prompt rewritten — emit CompositionalIntent, not PrimeNode tree. 3 illustrations (1D / 2D / arithmetic) |
| `web/src/lib/sci/plan-orchestration.ts` | `callPlanComponentWithRetry` uses construction pathway. Mode A/B chunking dispatch retired (intent fits in single call). Legacy assembler path retained as backward-compat fallback |
| `web/src/lib/compensation/ai-plan-interpreter.ts` | `InterpretedComponent.metadataExtension`; `normalizeComponents` preserves it; `convertComponent` merges it into persisted component metadata |

### Key prompt change (anthropic-adapter.ts `plan_component`)

**BEFORE (HF-249/250):**

```
You are an expert at translating a compensation plan COMPONENT description
into a Prime-DAG calculationIntent tree.

CRITICAL: Extract EVERY numeric value the component's source carries — every
tier threshold, every payout amount, every cell of a rate table. Empty
tiers/matrices will cause $0 payouts. The validator will REJECT any tree
that emits fewer constant leaves than the rateTableCellCount declared.

Response shape:
  { "calculationIntent": { /* PrimeNode tree */ }, ... }
```

**AFTER (HF-251):**

```
You are interpreting ONE component of a compensation plan and emitting a
compact CompositionalIntent that describes its structure. Code constructs
the PrimeNode tree from your intent — you do NOT emit the tree itself.

Per Decision 158: LLM recognition + code construction. You RECOGNIZE what
the plan describes; the platform's deterministic constructor BUILDS the
calculation tree.

CompositionalIntent SHAPE (discriminated on structure.shape):
  banded_lookup — N-dimensional tier table (1D banded rate / 2D matrix)
  arithmetic    — binary numeric composition
  conditional   — gate with then/else
  composed      — sum/max/min/first_match over children

Response shape:
  { "compositional_intent": { component_id, component_name, structure, scale, output_precision }, ... }

DO NOT emit a calculationIntent PrimeNode tree. The constructor builds it.
DO NOT decompose the intent across multiple calls. The intent is compact.
```

### Key orchestrator change (plan-orchestration.ts)

**BEFORE:** Mode A/B dispatch on `shouldUseChunking(spec)`; Mode A calls `interpretPlanComponent` for direct emission; Mode B calls `interpretPlanComponentWithChunking` for skeleton + parallel chunks. Assembler stitches.

**AFTER:** Single call to `interpretPlanComponent`. Detect `result.compositional_intent` → `constructTree(intent)` → assembled PrimeNode tree → validator. Legacy `calculationIntent` field path retained as fallback for backward-compat (in-flight emissions ignoring the new prompt go through the HF-249/250 assembler).

---

## 7. Architectural guarantees (HF-251 closure)

| Property | Mechanism | Verification |
|---|---|---|
| Exhaustive emission | Constructor validates output count vs dimension product | Test 6 (validation failure) |
| Half-open intervals (D127) | Constructor uses descending-break recursion with `gte` | Tests 1, 2 |
| Terminal completeness | Constructor's no-match terminal is `constant(0)` | Tests 1, 2 |
| Scale mutual exclusion (HF-244) | `buildConstantWithScale` applies meta only when `scale.side === 'evaluator'` | Test 7 |
| Grammar canonical vocabulary | Schema imports PrimeNode from intent-types.ts | Compile time |
| AUD-009 structural preclusion | Constructor dispatches on grammar shapes via discriminated union | Code review (no string matching on domain vocabulary) |
| Engine input shape (D151 / T2-E25) | constructTree returns PrimeNode; engine sees identical shape | No engine changes; existing evaluator consumes constructed trees |

---

## 8. Out of scope (per directive §10)

- CRP plan re-import (HF-253 follow-on)
- Meridian plan re-import (HF-254 follow-on)
- HF-249/250 emission-pathway scaffolding deprecation (HF-255 follow-on; retained as fallback for HF-251 backward-compat)
- Signal surface writes for progressive performance (T1-E906 v2 read-before-derive — follow-on after BCL proves)
- VG substrate work (T2-E25 extension, shadow-divergence diagnostic)
- Engine changes (none needed — constructor output matches existing PrimeNode shape)

## 9. Residuals (per directive §6A)

- **Prime count verification:** `prime-grammar.ts` declares 10 primes; the constructor handles whatever the grammar declares via structural recursion. No hardcoded count.
- **C2/C3 validator warnings:** Expected to disappear under construction pathway (constructor guarantees scale_annotation + terminal_completeness). Architect-manual verification confirms.
- **Mode B deprecation:** HF-250's Mode B path is preserved as backward-compat fallback in `callPlanComponentWithRetry` but never triggered when the LLM emits `compositional_intent`. Formal removal in HF-255.
- **Progressive performance:** Not implemented. The signal write for successful constructions is deferred to a follow-on HF after BCL proves the construction pathway works end-to-end. Construction works without it; progressive performance is an optimization.
