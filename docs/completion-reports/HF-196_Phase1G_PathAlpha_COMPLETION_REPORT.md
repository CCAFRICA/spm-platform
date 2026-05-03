# HF-196 Phase 1G Path α (option ii) — Completion Report

**Phase:** 1G Path α (option ii) — Full HC-Primacy Architectural Realignment per Decision 108
**Branch:** `hf-196-platform-restoration-vertical-slice`
**Final commit (Phase 1G):** `dc3aa558`
**Date executed:** 2026-05-03
**Architect:** Andrew (vialuce founder)
**Status at report:** Phase 1G-1 through 1G-11 complete; Phase 5-RESET-7 architect signals awaited (per §11.13 amendment — reconciliation discipline)

---

## Phase 1G-0: Working-Tree State Reconciliation

Pre-existing working tree state at directive entry (per interim completion report `64235c41`):
- `web/src/lib/sci/agents.ts` modified (Site 2 gating; Path β shape)
- `web/src/lib/sci/negotiation.ts` modified (Site 1 split + gating; Path β shape)

**Diff vs Path α:** Sites 1+2 working-tree edits already applied the HC-silence-gating with confidence 0.85→0.75 — directly conformant with Path α §11.2 + §11.3.

**Reconciliation action taken:** integrate-as-is + extend additively (architect-dispositioned). No `git checkout HEAD`. Path α extended with Sites 3, 4, 5, 6, 7, 8 + HF-203 + pipeline reordering atomically in a single Phase 1G-11 commit.

---

## Phase 1G-1: Pre-Edit Verification

All 8 sites + HF-203 + pipeline ordering surfaced and confirmed at expected line numbers.

**Critical architectural finding (Critical HALT #3):** content-profile.ts `detectStructuralIdentifier` is module-private (only callers at lines 459, 464). Both call sites execute during Phase A profile generation — BEFORE HC runs (per `header-comprehension.ts:430` doc comment "Called AFTER generateContentProfile, BEFORE agent scoring"). HC runs after content-profile produces the profile object with patterns already computed. Pipeline reordering required to achieve HC primacy on Sites 3, 7, and the 461-inline duplicate of Site 7.

**Architect disposition:** α-1 two-phase content-profile split (per §11.4 amendment).

---

## Phase 1G-2: Site 1 — `negotiation.ts:299`

**Pre-edit:** `if (hcRole === 'identifier' || (field.dataType === 'integer' && !!field.distribution.isSequential)) { ... }` (single coupled OR predicate; structural arm OR-peer with HC).

**Post-edit:**
- HC-primary branch: `if (hcRole === 'identifier') { ... LLM-primary path + cardinality fallback at confidence 0.85 ... }`
- Structural fallback: `if ((!hcRole || hcRole === 'unknown') && field.dataType === 'integer' && !!field.distribution.isSequential) { ... cardinality at confidence 0.75 (reduced from 0.85) ... }`

Confidence reduced 0.85 → 0.75 in HC-silence branch (signaling reduced authoritativeness of structural-only classification).

LLM-primary path (`if (identifiesWhat)`) preserved inside HC-primary branch only — fires when HC said `'identifier'`.

---

## Phase 1G-3: Site 2 — `agents.ts:536`

**Pre-edit:** `if (field.dataType === 'integer' && field.distribution.isSequential) { ... confidence: 0.85 ... }` (twin defect of Site 1 in `assignSemanticRole`).

**Post-edit:** `if ((!hcRole || hcRole === 'unknown') && field.dataType === 'integer' && field.distribution.isSequential) { ... confidence: 0.75 ... }`. Twin gating to Site 1.

---

## Phase 1G-4: Pipeline Reordering — `content-profile.ts` (Sites 3, 7, plus 461-inline)

**Architectural change implemented:** α-1 two-phase split.

### New module exports
- `ContentProfileStats` type (alias of ContentProfile — same shape; placeholder pattern fields)
- `ContentProfilePatterns` interface (Phase B output bundle)
- `generateContentProfileStats(tabName, tabIndex, sourceFile, columns, rows, totalRowCount?)` — Phase A
- `generateContentProfilePatterns(stats, hcInterpretations?, rows?)` — Phase B
- `generateContentProfile(...)` — composite wrapper (backward-compat; HC silent → structural fallback)

### Phase A function signature (no HC parameter)
Returns `ContentProfileStats` with placeholder/zero pattern values. Stats fields (rowCount, columnCount, sparsity, headerQuality, fields, observations) are final. Pattern-derived structure fields (numericFieldRatio, categoricalFieldRatio, categoricalFieldCount, identifierRepeatRatio) are zero-initialized; patterns object zero-initialized.

### Phase B function signature
```typescript
export function generateContentProfilePatterns(
  stats: ContentProfileStats,
  hcInterpretations?: Map<string, HeaderInterpretation>,
  rows: Record<string, unknown>[] = [],
): ContentProfile
```
Mutates `stats` in place to populate patterns + structure-derived fields, append observations, mutate field-level looksLikePersonName signal.

### Sites 3 + 7: `detectStructuralIdentifier` HC primacy
```typescript
function detectStructuralIdentifier(
  field: FieldProfile,
  rowCount: number,
  hcRole?: ColumnRole,
): boolean {
  // HC primacy: HC any role except 'unknown' → structural arm yields
  if (hcRole && hcRole !== 'unknown') return false;
  // Site 7 — sequential integer (HC silent only)
  if (field.dataType === 'integer' && field.distribution.isSequential) return true;
  // Site 3 — high-cardinality integer (HC silent only)
  if (field.dataType === 'integer' && uniquenessRatio > 0.90) return true;
  ...
}
```

### `hasEntityIdentifier` OR-fold (line 461-inline) HC-aware in Phase B
All three OR-fold components (detectStructuralIdentifier + nameSignals.containsId + isSequential-inline) gate on HC silence. HC `'identifier'` returns true; HC any-other-role suppresses; HC silent → structural fallback.

### `idField` finder HC-aware
HC `'identifier'` columns chosen first via `find(getHCRole === 'identifier')`. Structural fallback chains only fire on HC-silent fields.

### Composite wrapper (backward-compat)
`generateContentProfile` calls Phase A + Phase B with `hcInterpretations=undefined` → structural arms fire (legacy behavior). Used by test fixtures and any non-production caller.

### Caller updates
- `web/src/app/api/import/sci/analyze/route.ts:91` (Phase A) + `:185` (Phase B inserted between Tier-1 flywheel injection and HC diagnostic logging)
- `web/src/app/api/import/sci/process-job/route.ts:152` (Phase A) + `:180` (Phase B inserted after HC enhancement, before classification)

### Architectural verdict
**Pipeline reordered structurally.** `generateContentProfileStats` runs first (no HC dependency, no patterns); HC runs against statsMap (or skipped for Tier 1 with flywheel injection); `generateContentProfilePatterns` runs against profile with HC interpretations. Sites 3, 7, 461-inline now operate under HC primacy.

### HC additive-override status
Preserved as defensive (header-comprehension.ts:508-509, 571-572). Architect-dispositioned: small code surface; non-defective in post-1G architecture; catches future structural-pattern sites that may bypass Phase B.

---

## Phase 1G-5: Site 8 — `tenant-context.ts:144-147`

**Pre-edit:** `const idField = profile.fields.find(f => f.nameSignals.containsId || (f.dataType === 'integer' && f.distribution.isSequential));`

**Post-edit:**
```typescript
const hcInterpretations = profile.headerComprehension?.interpretations;
const getHCRole = (fieldName: string) => hcInterpretations?.get(fieldName)?.columnRole;

const idField =
  profile.fields.find(f => getHCRole(f.fieldName) === 'identifier') ??
  profile.fields.find(f => {
    const hcRole = getHCRole(f.fieldName);
    if (hcRole && hcRole !== 'unknown') return false;
    return f.nameSignals.containsId || (f.dataType === 'integer' && f.distribution.isSequential);
  });
```

`computeEntityIdOverlap` is invoked AFTER HC has run (analyze/route.ts ~210, process-job/route.ts ~210), so `profile.headerComprehension` is populated. No signature change required.

---

## Phase 1G-6: Affinity Sites — `negotiation.ts:34, 79, 125`

| Site | Pre-edit | Post-edit |
|---|---|---|
| 4 (line 34) | `hcRole === 'identifier' \|\| (integer && isSequential)` | `hcRole === 'identifier' \|\| ((!hcRole \|\| hcRole === 'unknown') && integer && isSequential)` |
| 5 (line 79) | `f.dataType === 'integer' && !!f.distribution.isSequential` (no HC parameter consumed) | `(!hcRole \|\| hcRole === 'unknown') && f.dataType === 'integer' && !!f.distribution.isSequential` (test signature now reads `hcRole`) |
| 6 (line 125) | `hcRole === 'identifier' \|\| (field.dataType === 'integer' && !!field.distribution.isSequential)` | `hcRole === 'identifier' \|\| ((!hcRole \|\| hcRole === 'unknown') && integer && isSequential)` |

---

## Phase 1G-7: `hasEntityIdentifier` OR-fold (`content-profile.ts:461-inline`)

Closed via Phase B HC-aware redesign in §1G-4. The 461-inline `(f.dataType === 'integer' && f.distribution.isSequential)` is now inside the HC-silent branch of the some-fold (line 599); it only fires when HC is silent on the column being tested.

Verification approach: code review — the OR-fold reads HC role via `getHCRole(f.fieldName)`; if HC has any role other than `'unknown'`, the some-fold returns false on that field; structural arm only reached on HC-silent fields.

---

## Phase 1G-8: HF-203 SCALE ANOMALY Architectural Inversion

**Pre-edit detection (`convergence-service.ts:1558-1591`):**
- Detected `ratioToMedian > 10`; iterated scaleDivisor `[100, 10, 1000]` to find scale that brings ratio into `[0.1, 10]`; produced `proposedCorrection: { type: 'scale_factor', currentScale, proposedScale, correctedResult, bindingRole }`.

**Post-edit detection:**
- Detected `ratioToMedian > 10`; produces `proposedAction: { type: 'binding_rejection', rejectedColumn, bindingRole, rationale }`. No scale-divisor search. `anomalyType = 'binding_misalignment'` (new enum value added).

**Pre-edit application (`convergence-service.ts:316-333`):**
- `binding.scale_factor = pr.proposedCorrection.proposedScale` (mutation masked the misalignment).

**Post-edit application:**
- `binding.match_pass = 'failed'`; `binding.failure_reason = pr.proposedAction.rationale`. Type `match_pass` widened from `number` to `number | 'failed'`. Type extension added to `ComponentBinding` interface (`failure_reason?: string`).

**Classification signal row:**
- `decision_source: 'binding_misalignment'` (was `'structural_anomaly'`)
- `signal_value` carries `action_applied + action_type + rejected_column` (was `correction_applied + correction_type + corrected_result`)

**Engine consumption changes:** none. Lines 1416-1417, 1429, 1443, 1483-1484 (`value *= binding.scale_factor`) preserved — they operate only on bindings with legitimate scale_factor from `generateAllComponentBindings` (column-mapping process). Rejected bindings have `match_pass='failed'` for downstream handling.

**AI re-mapping fallback strategy:** out of scope for this phase. Rejected bindings produce convergence gaps; calc continues with `scale_factor` untouched. Re-mapping logic candidate for HF-204 if architect dispositions.

---

## Phase 1G-9: Build + Korean Test

- `npx tsc --noEmit`: **EXIT=0**
- `npm run build`: **EXIT=0** (full Next.js build green)
- Korean Test verifier: **`[korean-test-gate] PASS: zero hardcoded legacy primitive-name string literals outside registry`**

---

## Phase 1G-10: Self-Test

| Verification | Result |
|---|---|
| Site 1 (`negotiation.ts:299`) post-edit form | ✓ HC-primary branch + HC-silence-gated structural fallback |
| Site 2 (`agents.ts:536`) post-edit form | ✓ HC-silence gating |
| Sites 3 + 7 (`detectStructuralIdentifier`) | ✓ HC primacy gate at function entry |
| Site 4 (`negotiation.ts:34`) | ✓ HC-silence-gated structural arm |
| Site 5 (`negotiation.ts:79`) | ✓ HC-silence-gated; test reads hcRole parameter |
| Site 6 (`negotiation.ts:125`) | ✓ HC-silence-gated `isShared` |
| Site 7 transitive (`hasEntityIdentifier` OR-fold) | ✓ HC-aware in Phase B |
| Site 8 (`tenant-context.ts:144-147`) | ✓ HC-aware via `profile.headerComprehension` |
| HF-203 detection | ✓ `binding_misalignment` produced; no scale-divisor search |
| HF-203 application | ✓ `binding.match_pass = 'failed'`; zero `binding.scale_factor =` mutations |
| Pipeline two-phase exports | ✓ `generateContentProfileStats` + `generateContentProfilePatterns` exported |
| Pipeline call sites updated | ✓ analyze/route.ts + process-job/route.ts both use stats → HC → patterns |
| `grep "hcRole === 'identifier' \|\| (...isSequential)"` | ✓ zero unguarded matches |
| `grep "binding\.scale_factor ="` in convergence-service | ✓ zero mutations |

---

## Phase 1G-11: Commit

- **Commit SHA:** `dc3aa558`
- **Push:** `64235c41..dc3aa558` to `origin/hf-196-platform-restoration-vertical-slice`
- **Files changed (7):**
  - `web/src/app/api/import/sci/analyze/route.ts`
  - `web/src/app/api/import/sci/process-job/route.ts`
  - `web/src/lib/intelligence/convergence-service.ts`
  - `web/src/lib/sci/agents.ts`
  - `web/src/lib/sci/content-profile.ts`
  - `web/src/lib/sci/negotiation.ts`
  - `web/src/lib/sci/tenant-context.ts`
- **Line counts:** +330 / -109

---

## Phase 1G-12: Interim Completion Report (this document)

Sections 1G-0 through 1G-11 populated. Phase 5-RESET-7 + final verdict sections will be appended after empirical verification.

---

## Phase 1G-14: HF-204 Absorption — Visitor-Pattern Metadata Extraction

**Commit:** `88e93fa3` (2026-05-03)
**Files:** `web/src/lib/calculation/run-calculation.ts` (+72 / -49)

### Defect grounding
- Phase 5-RESET-7 architect-channel reconciliation: October calc total `$45,790`. C4 Cumplimiento Regulatorio overshoot $1,200 across 11 entities — entities with `Infracciones_Regulatorias > 0` paid full bonus instead of disqualified to $0.
- Forensic chain (CC-localized, read-only):
  1. C4 component declares `componentType: 'conditional_gate'` with `intent.condition.left.sourceSpec.field = 'infracciones_regulatorias'` (lowercase, AI-plan-interpreter convention).
  2. Source data column: `Infracciones_Regulatorias` (Title_Snake_Case in `committed_data.row_data`).
  3. `getExpectedMetricNames` (run-calculation.ts:434-491) walked `intent.input` and `intent.inputs` — did NOT walk `intent.condition.left/right`.
  4. For conditional_gate components, `getExpectedMetricNames` returned `[]`.
  5. `buildMetricsForComponent`'s expectedNames-driven semantic-key normalization loop skipped — no lowercase semantic key inserted into `resolvedMetrics`.
  6. `data.metrics` reaching executor contained only Title_Snake_Case keys; no lowercase `infracciones_regulatorias`.
  7. `resolveSource` (intent-executor.ts:71): direct case-sensitive `data.metrics[key]` lookup returned `undefined` → `?? 0` fallback returned `0` for all entities.
  8. `executeConditionalGate`: `0 < 1` → always TRUE → onTrue branch → 100/150 paid regardless of source value.
- Empirical confirmation: `intentTraces.inputs.infracciones_regulatorias = { source: 'metric', resolvedValue: 0 }` with `rawValue` JSON-stripped (`undefined` → stripped on serialization).

### Architectural shape
- `getExpectedMetricNames` rewritten as recursive visitor over `IntentOperation` AST.
- Surfaces every `IntentSource` of `source ∈ {'metric', 'ratio', 'aggregate'}` regardless of position.
- Adjacent-Arm Drift defect class structurally closed at metadata-extraction layer.
- Future operation types automatically covered (visitor walks AST shape, not enumerated positions).

### Orphans closed (per IntentOperation AST inventory)
- `conditional_gate.condition.left/right` (DIAGNOSED INSTANCE)
- `conditional_gate.onTrue/onFalse` (nested IntentOperations with embedded metrics)
- `aggregate.source` (top-level)
- `ratio.numerator/denominator` (top-level)
- `scalar_multiply.rate` when IntentSource
- `weighted_blend.inputs[i].source` (array of objects)
- `piecewise_linear.ratioInput/baseInput`
- Modifier positions (`proration.numerator/denominator`, `temporal_adjustment.triggerCondition`)
- Variant routing positions (`routingAttribute`, `routes[i].intent`)

### Verification
- `npx tsc --noEmit`: **EXIT 0**
- `npm run build`: **EXIT 0**
- Korean Test gate: **PASS**
- Self-test (8 synthetic cases): **8 PASS / 0 FAIL**
  - PASS: conditional_gate (diagnosed defect — visitor surfaces `infracciones_regulatorias`)
  - PASS: bounded_lookup_2d (regression check)
  - PASS: scalar_multiply singular input (regression check)
  - PASS: scalar_multiply metric-rate (was orphan — now covered)
  - PASS: conditional_gate with nested metric in onTrue (was orphan — now covered)
  - PASS: weighted_blend with inputs array (was orphan — now covered)
  - PASS: piecewise_linear ratioInput/baseInput (was orphan — now covered)
  - PASS: top-level ratio numerator/denominator (was orphan — now covered)

### Substrate citations
- **Decision 108** (HC Override Authority Hierarchy LOCKED): operative across full SCI + calculation surface
- **SR-34** (product-readiness; no known defects shipped at HF-196 closure)
- **Adjacent-Arm Drift discipline:** fix structural shape, not diagnosed instance

### HF-204 status
**ABSORBED into HF-196 Phase 1G** (no longer carry-forward).

---

## Phase 1G-15: Decision 127 Structural Adoption

**Commit:** `6f46c58e` (2026-05-03)
**Files:** 4 (`boundary-canonicalizer.ts` NEW; `intent-executor.ts`, `ai-plan-interpreter.ts`, `anthropic-adapter.ts` modified)
**Line counts:** +245 / -29

### Defect grounding
- Phase 5-RESET-8 architect-channel reconciliation against `BCL_Resultados_Esperados.xlsx` Detalle: 4 entity-component C1 mismatches across 6 months × 85 entities × 4 components (2,040 cells). All 4 mismatches concentrated in C1 Colocación de Crédito (`bounded_lookup_2d`); each calculates C1 = $0; ground truth expects positive amount.
- Forensic chain (CC-localized):
  1. AI plan interpreter persisted `columnBoundaries` with `.X99` inclusive-end pattern: `[..0.899] [0.9..0.949] [0.95..]` (each `maxInclusive: true`).
  2. Persisted boundaries form non-contiguous partition: gap between `boundary[i].max=0.X99` and `boundary[i+1].min=0.X+1`.
  3. Source `Indice_Calidad_Cartera` for 4 entity-periods: 0.8992, 0.8994, 0.8996, 0.9491 — all values fall in gap regions.
  4. `findBoundaryIndex` (`intent-executor.ts:165-191`) returns `-1` for gap-falling values.
  5. OB-169 `.999` snap heuristic only fires for `(1 - frac) < 0.01`: detects `0.999` patterns but not `.X99` patterns where X≠9 (frac=0.899 → (1-0.899)=0.101 > 0.01 → no snap).
  6. `executeBoundedLookup2D`: `colIdx < 0` → `outputValue: 0`; final calc value 0 regardless of `rowBoundaryMatched`.
- Empirical confirmation: BCL-5071 intentTrace `columnBoundaryMatched: undefined`, `outputValue: 0`, `rowBoundaryMatched: { min: 100, max: 119.999, index: 4 }`.

### Decision 127 implementation gap
- Decision 127 LOCKED 2026-03-16: half-open intervals `[min, max)` throughout; final band inclusive at max.
- OB-169 implementation: pattern-detection heuristic for `.999` truncation at integer ceilings only.
- `grep -rnE "Decision 127|D127|half-open|halfOpen" web/src/` → **zero matches** prior to Phase 1G-15.
- Pattern-detection heuristic shipped as compromise; remained latent until substrate evolution moved boundary representation onto path heuristic doesn't cover.

### Architectural shape (Approach 4 — full structural adoption)

1. **Plan interpreter prompt amended** (`anthropic-adapter.ts:424-471`): half-open boundary directive with `maxInclusive: false` consistently; explicit ceilings (no `.999`/`.X99` truncation); final boundary `max: null` or `maxInclusive: true`. Worked examples rewritten with consecutive `max === next.min` contiguous partitions. Explicit DO NOT directives forbid truncation patterns, gaps, overlaps.

2. **Boundary canonicalization layer** (`boundary-canonicalizer.ts` NEW): exports `canonicalizeBoundaries(input)` and `assertCanonicalBoundaries(boundaries)`.
   - Validates non-empty input; sorts by min ascending.
   - Forces non-final `maxInclusive: false`.
   - Detects gap (`current.max < next.min`): auto-closes if `relativeGap <= 0.05`; throws `BoundaryCanonicalizationError` if too large.
   - Detects overlap: throws structured error.
   - Final boundary: `max: null` OR `maxInclusive: true` (sets if missing).
   - `assertCanonicalBoundaries`: invariant check post-canonicalization.

3. **Plan persistence integration** (`ai-plan-interpreter.ts:convertComponent`): for `calcType ∈ {bounded_lookup_1d, bounded_lookup_2d}`, invokes `canonicalizeBoundaries` on `intent.boundaries` / `rowBoundaries` / `columnBoundaries`. `BoundaryCanonicalizationError` wrapped in `UnconvertibleComponentError` for unified plan-import error surface.

4. **`findBoundaryIndex` resolver simplified** (`intent-executor.ts:165-194`): pure half-open semantics — `value >= b.min && (isLast && maxInclusive ? value <= b.max : value < b.max)`. OB-169 `.999` snap heuristic removed (redundant — canonicalizer at persistence guarantees half-open invariant; resolver applies pure comparison without pattern detection).

5. **Existing rule_sets** handled via Phase 5-RESET-9 BCL re-import. Canonicalizer runs at plan-persistence time, not retroactively. Fresh import produces canonical rule_set.

### Verification
- `npx tsc --noEmit`: **EXIT 0**
- `npm run build`: **EXIT 0**
- Korean Test gate: **PASS**
- Synthetic boundary tests: **19/19 PASS**
  - Test 1: BCL-shape `.X99` input → canonicalized half-open (gap closed at 0.9 + 0.95)
  - Test 2: Already-canonical no-op (regression)
  - Test 3: Overlap → reject with `BoundaryCanonicalizationError`
  - Test 4: Gap too large to auto-close → reject
  - Tests 5a-c: BCL-mismatch values 0.8996, 0.9491, 0.7139 resolve to boundary indices 2, 3, 1 (all `-1` pre-1G-15)
  - Tests 5d-g: boundary-edge values 0.899, 0.9, 0.95, 0.99 resolve correctly under half-open semantics
  - Tests 6a-g: 1D bounded lookup canonical example (regression for prompt-shape boundaries)

### Substrate citations
- **Decision 127** LOCKED 2026-03-16 (half-open interval convention) — implementation gap closed; locked semantic now operative
- **Adjacent-Arm Drift discipline:** close defect class at construction layer, not pattern-detection at resolver
- **SR-34:** no bypass; OB-169 heuristic deprecated as redundant rather than retained as defensive code
- **Korean Test (T1-E910):** half-open intervals are domain-agnostic mathematical convention; canonicalizer validates structural property (contiguous partition); zero domain literals introduced

### Phase 1G-15 status
**Decision 127 structurally adopted.** `OB-169` deprecated. `trajectory-engine.ts` has parallel `findBoundaryIndex` implementation (line 63-78) — not on operative calc path; deferred unless surfaced live.

---

## Phase 5-RESET-7: Empirical Verification

Per §11.13 amendment — reconciliation discipline:
- CC verifies structural correctness; CC reports raw calculated values.
- Architect performs reconciliation against `BCL_Resultados_Esperados.xlsx` in architect channel.
- CC does not author or load any reference dataset; CC does not produce reconciliation interpretation.

### Architect signal 1 — wipe applied
- Wipe verification (10-table count = 0): **PASS** — all 10 tables verified empty for BCL tenant pre-import.

### Architect signal 2 — 7 imports done
- Operative `import_batches` count: **7**
- `committed_data` total: **595** (85 entity + 510 transaction)
- Transaction `source_date` histogram: 6 contiguous months × 85 each
- DS-017 fingerprint flywheel: roster `a94f3b01211a` cls=entity match=1; transaction `fbead6eed137` cls=transaction match=6
- **Persisted field_identities — Phase 1G HC primacy empirical confirmation:**
  - `Cantidad_Productos_Cruzados.structuralType`: **`measure`** ✓
  - `Depositos_Nuevos_Netos.structuralType`: **`measure`** ✓
  - `ID_Empleado.structuralType`: **`identifier`** ✓

### Architect signal 3 — plan import done
- `rule_sets` count: **1 active** ("Plan de Comisiones — Banca Minorista 2025-2026", v=1)
- Convergence bindings: 4 component bindings populated
- **Productos Cruzados (component_2) → bound column: `Cantidad_Productos_Cruzados`** ✓ (was `Depositos_Nuevos_Netos` pre-1G)
- `scale_factor` on component_2: **absent** (no anomaly correction needed; HF-203 inversion present, inert)
- HF-203 emissions (`match_pass='failed'`, `binding_misalignment`): **0**
- Plan-import emission scan (`seeds`, `UnconvertibleComponentError`, `SCALE ANOMALY`): **0/0/0**

### Architect signal 4 — calc done (Phase 5-RESET-7 — Oct calc only at this signal)
- `calculation_batches` for Oct 2025: 1 (`5de6d77e…`, lifecycle_state=PREVIEW)
- Oct 2025 calculated total: **$45,790** (CC reported value verbatim)
- 100% intent-executor concordance (85 match, 0 mismatch)

### Architect signal 5 — architect-reconcile complete
- **Architect-channel verdict (Phase 5-RESET-7):** Oct calc surfaced C4 Cumplimiento Regulatorio overshoot $1,200 across 11 entities — defect localized; Phase 1G-14 (HF-204) absorbed for resolution. Reconciliation discipline: not architecturally complete on Phase 5-RESET-7 alone — Phase 1G-14 + Phase 5-RESET-8 follow.

---

## Phase 5-RESET-8: Empirical Verification (post-HF-204)

### Architect signal 1 — Oct re-calc done
- Oct 2025 calculated total: **$44,590** (Δ −$1,200 vs Phase 5-RESET-7; 11 entities × {100, 150} now correctly disqualified per `Infracciones_Regulatorias > 0`)
- C4 component sums per period: ejecutivo 6,300 / senior 1,650 (was 7,200 / 1,950 pre-HF-204)
- HF-204 visitor pattern operative end-to-end: `getExpectedMetricNames` walks AST including `intent.condition.left/right`; `data.metrics` populated with lowercase `infracciones_regulatorias`; resolveSource direct-key lookup hits; conditional_gate evaluates correctly per source value.

### Architect signal 2 — Nov-Mar periods+calc done
- Per-period totals: Nov 45,681 / Dic 61,986 / Ene 47,285 / Feb 53,215 / Mar 57,976
- 6-month grand: **$310,733**
- 6 calc batches × 85 entities × 100% concordance

### Architect signal 3 — architect-reconcile complete
- **Architect-channel verdict (Phase 5-RESET-8):** 4 entity-component C1 mismatches across Nov / Ene / Mar — boundary-gap defect localized; Phase 1G-15 (Decision 127 structural adoption) absorbed for resolution.

---

## Phase 5-RESET-9: Empirical Verification (post-Decision-127)

### Architect signal 1 — wipe applied
- Wipe verification (10-table count = 0): **PASS** — all 10 tables verified empty for BCL tenant pre-import.

### Architect signal 2 — imports done
- Operative `import_batches` count: **7**
- `committed_data` total: **595** (85 entity + 510 transaction)
- Transaction `source_date` histogram: 6 contiguous months × 85 each
- `entities` count: **85**
- `rule_sets` count: **1 active** (`bceb9330`, "Plan de Comisiones — Banca Minorista 2025-2026", v=1)
- Phase 1G HC primacy gate: `Cantidad_Productos_Cruzados.structuralType = 'measure'` ✓
- **Phase 1G-15 critical gate — boundary canonicalization (Decision 127):**
  - All 8 boundary arrays (2 variants × 4 components × {row+col / single}) pass `assertCanonicalBoundaries`
  - All `bounded_lookup_2d` and `bounded_lookup_1d` boundaries are contiguous half-open partitions (`max === next.min`, `maxInclusive: false` on non-final, final `max: null` or `maxInclusive: true`)
  - Zero `.X99` truncation patterns; zero gaps; zero overlaps
  - Example (`colocacion_credito_senior` columnBoundaries): `[0..0.7) [0.7..0.8) [0.8..0.9) [0.9..0.95) [0.95..]`

### Architect signal 3 — periods+calc done

| Period | Calculated Total | Entities | Batch | Concordance |
|---|---:|---:|---|---|
| Oct 2025 | 44,590.00 | 85 | `d18fd35b…` | 100% |
| Nov 2025 | 46,291.00 | 85 | `09a17393…` | 100% |
| Dic 2025 | 61,986.00 | 85 | `fee26b11…` | 100% |
| Ene 2026 | 47,545.00 | 85 | `6cf17714…` | 100% |
| Feb 2026 | 53,215.00 | 85 | `9d148825…` | 100% |
| Mar 2026 | 58,406.00 | 85 | `5eed594e…` | 100% |
| **GRAND (Oct-Mar)** | **312,033.00** | | | |

Component-variant aggregates (8 componentIds across 6 periods × 85 entities): 6 itemized TSVs at `docs/CC-artifacts/HF-196_Phase5RESET9_<period>_itemized.tsv` (commit `55209cda`).

Decision 127 closure verification — 4 C1 boundary-gap entity-period cells now resolve to non-zero values:
- BCL-5071 + BCL-5077 (Nov 2025): Δ +610 in Nov c1 sums
- BCL-5061 (Ene 2026): Δ +260 in Ene c1_senior
- BCL-5046 (Mar 2026): Δ +430 in Mar c1_ejecutivo
- Net Δ +1,300 vs Phase 5-RESET-8 (matches architect-channel reconciliation gap)

### Architect signal 4 — architect-reconcile complete

**Architect-channel reconciliation verdict (2026-05-03):**
- Reconciliation reference: `BCL_Resultados_Esperados.xlsx` Detalle
- Coverage: **6 periods × 4 components × 85 entities × 2 variants = 2,040 cells**
- Verdict: **PASS-RECONCILED**
- Match precision: **All 2,040 cells exact match**
- Grand total calculated: **$312,033.00** = Grand total ground truth: **$312,033.00**

---

## Phase 1G Path α Closure Verdict

**Structural gates (CC self-asserts):**

| Gate | Verdict |
|---|---|
| HC primacy operative at `field_identities` (Phase 1G Path α — Sites 1-8 + α-1 pipeline reordering) | **PASS** |
| Pipeline reordering operative (α-1 two-phase content-profile split) | **PASS** |
| Convergence binding correctness (Productos Cruzados → `Cantidad_Productos_Cruzados`) | **PASS** |
| HF-203 architectural inversion present + correctly inert on this substrate | **PASS** |
| Calc completes across 6 periods (100% concordance, zero anomalies) | **PASS** |
| HF-204 visitor-pattern metadata extraction (Phase 1G-14) | **PASS** |
| Decision 127 structural adoption (Phase 1G-15 boundary canonicalization) | **PASS** |

**Reconciliation gate (architect-channel):**

| Gate | Verdict |
|---|---|
| Architect reconciliation verdict against `BCL_Resultados_Esperados.xlsx` Detalle | **PASS-RECONCILED** |
| All 2,040 cells exact match | **PASS** |
| Grand total $312,033 = ground truth | **PASS** |

**Phase 1G Path α: PASS** ✓ (all structural gates + architect-channel PASS-RECONCILED)

---

## HF-196 Closure

| Closure dimension | Status |
|---|---|
| Break #1 — Convergence path drift (D153 atomic cutover) | **CLOSED** (Phase 3) |
| Break #2 — Entity binding gap (calc-time resolver) | **CLOSED** (Phase 2) |
| Break #3 — Import surface fragmentation | **CLOSED** (Phase 1) |
| Phase 1B — HF-186/HF-110 regressions | **CLOSED** |
| Phase 1C — TEMPORAL_ROLES whitelist | **CLOSED** |
| Phase 1D — D154/D155 single-canonical data_type | **CLOSED** |
| Phase 1E — import_batches supersession schema | **CLOSED** |
| Phase 1F + 1F-corrective — SHA-256 supersession primitive (raw file bytes) | **CLOSED** |
| Phase 1G Path α — HC primacy + pipeline reordering + HF-203 inversion | **CLOSED** |
| Phase 1G-14 — HF-204 absorption (visitor-pattern metadata extraction) | **CLOSED** |
| Phase 1G-15 — Decision 127 structural adoption (boundary canonicalization) | **CLOSED** |
| Phase 5-RESET-9 reconciliation (Oct-Mar 2,040 cells) | **PASS-RECONCILED** |

**HF-196: ARCHITECTURALLY COMPLETE.**
**PR #359: Ready for Ready-for-Review transition.**

---

## Out-of-Scope Carry-Forward (post-HF-196)

- **HF-198 candidate** — `calculation_batches.superseded_at` + `supersession_reason` audit-column gap (logged Phase 1E-1).
- **HF-199 candidate** — OB-50 surface restoration (15 schema columns missing on `ingestion_events`; SCI flow bypasses).
- **Plan-path data_type vocabulary** (`commit/route.ts` + `intelligence/wire/route.ts`) — Phase 5D verified non-blocking; carry-forward.
- **HF-202** — ABSORBED into Phase 1G Path α (no longer carry-forward).
- **HF-203** — ABSORBED into Phase 1G Path α (no longer carry-forward).
- **HF-204** — ABSORBED into Phase 1G-14 (no longer carry-forward).
- **HF-205** — ABSORBED into Phase 1G Path α (no longer carry-forward).
- **trajectory-engine.ts parallel `findBoundaryIndex`** (line 63-78) — not on operative calc path; deferred unless surfaced live (not blocking HF-196 closure).

---

## Memory Entry 30 Closure Verification

Phase 1G Path α + Phase 1G-14 + Phase 1G-15 are collectively **substrate-APPLYING** (Decision 108 to predicates that always violated it; Decision 127 to boundary representation that never realized its locked semantic) AND **substrate-EXTENDING** (α-1 pipeline reordering modifies SCI architecture; HF-204 visitor pattern replaces position-by-position enumeration; Phase 1G-15 introduces canonicalization layer at plan persistence).

**Authorial intent restoration:**
- HF-095 Phase 2 ("HC primary, structural fallback") restored across the entire SCI classification surface
- Decision 127 (LOCKED 2026-03-16 half-open intervals) implementation gap closed; locked semantic now operative

**Adjacent-Arm Drift defect-class structurally closed at four layers:**
1. Pipeline ordering (Phase 1G α-1 two-phase split)
2. Role-binding predicates (Phase 1G Sites 1-8 HC-silence gating)
3. Metadata extraction (Phase 1G-14 visitor pattern over IntentOperation AST)
4. Boundary representation (Phase 1G-15 canonicalization layer at plan persistence)

Each prior partial fix (HF-169, HF-171, HF-186, HF-196 Phase 1B, OB-169) closed an adjacent arm without addressing the structural defect class. Phase 1G-* phases close the defect class at the construction layer; future operation types and AI emission patterns automatically covered.

**End of report — HF-196 architecturally complete; Phase 5-RESET-9 PASS-RECONCILED.**
