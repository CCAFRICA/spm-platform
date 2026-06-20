# OB-223 — End-to-End Pipeline Pattern Resolution — Completion Report

*Branch: `ob-223-pipeline-pattern-resolution` · 2026-06-19 · DO NOT MERGE (SR-44)*
*Diagnostic-first (Phase 1 committed); comprehensive-fix pass (Phase 2) — with two corrections to my own diagnostic and an honest verified/architect-track split.*

---

## 0. Two corrections to the Phase-1 diagnostic (committed `807e9770`)

Starting the redraft, I found **two material errors in my own diagnostic** that the redraft inherited:

1. **`convergence-service.ts` IS the Stage-3 file (directive's ORIGINAL map was right).** My "3402 lines,
   zero abstain/count/temporal/role logic" was a **grep artifact** — the file has a non-UTF8 byte, so
   plain `grep` treated it as binary and silently suppressed matches. `grep -a` shows abstain(9),
   temporal(17), count(38), role(74), `findIncompleteBindings`(1949), `deriveNeededType`(1740). The
   Stage-3 fixes belong here, not in `anthropic-adapter.ts`. *(Other diagnostic findings stand:
   `intent-transformer.ts` legacy-only; composition `.plus()` SUM; `scope` prime = entity-siblings;
   `detectTemporalColumnMap` unwired.)*
2. **Count-role acceptance (P3/§1.4) is ALREADY implemented** — `deriveNeededType` maps a `count` op →
   `'categorical'` (:1753) and `acceptableStructuralTypes('categorical')` accepts `attribute` (:1723).
   P4 fails because its DAG is a **bare `reference`×constant** (bare ref → `'numeric'` → rejects the
   `Verificado` attribute), not because convergence rejects count+attribute. **P4 is an interpreter-
   output-shape problem** (should emit `aggregate(count)` with a filter), not a convergence change.

**Re-frame:** most patterns fail because the **interpreter emits the wrong DAG shape** (`scope` vs
filter, bare-ref vs count-aggregate, missing `temporal_adjustment` modifier, separate accelerator). The
engine + convergence are largely already capable (OB-218 clawback, OB-222 filter/count, convergence
count-acceptance). **Primary lever = interpreter prompt + re-import** (architect-gated). Genuine runtime
gaps are narrower than the redraft predicted.

## 1. What shipped (verified: unit tests + BCL 510/510 byte-identical)

### §1.1 — interpreter prompt (P1, P4-accelerator, P5). `anthropic-adapter.ts` compositional prompt.
The prompt MIR actually uses (it embeds `<<PRIME_GRAMMAR>>` incl. OB-222 SC-07). Three edits:
- **Per-ENTITY vs per-ROW disambiguation** (root cause of P1's `scope`): variants are per-payee
  (role/tier); per-row/per-transaction category differentiation uses `filter→aggregate` INSIDE the DAG,
  NOT variants and NOT `scope_aggregate` (which scopes to peer entities). Previously the prompt only
  offered variants / `scope_aggregate` for "category" → the LLM emitted `scope`.
- **Accelerator folding** (P4): fold a multiplier into the base component as
  `conditional(threshold, multiply(base, mult), base)` — not a separate component (a separate scalar is
  ADDED, not multiplied — the §1.5 root cause, fixed at the source rather than via a fuzzy engine mode).
- **Clawback modifier** (P5): a reversal component MUST carry a `temporal_adjustment` modifier +
  `constant(0)` base; do not reference prior outputs as data columns.
Prompt text only → BCL runtime unaffected; effect verified by architect on re-import.

### §1.6 — clawback empty-binding bypass (P5). `convergence-service.ts` `findIncompleteBindings`.
Skips components carrying a `temporal_adjustment` modifier (OB-218 Pattern D resolves via
`retrieveOriginalTrace`, needs no input bindings) so an expected empty binding set no longer aborts the
calc (HF-281). Detector is structural (checks `.modifiers`/`.calculationIntent.modifiers`/
`.metadata.modifiers`, Korean Test). Conditional → false for every BCL/Meridian component → binding
completeness byte-identical. **Unit tests (9/9):** clawback+empty→not flagged; normal still flagged;
modifier under `calculationIntent.modifiers` also detected.

### §1.4 — count-role acceptance (P3): **NO CHANGE NEEDED** (already implemented; see §0.2). Documented.

### §1.3 — temporal abstain→map wiring (P2). `convergence-service.ts`. Commit `c08fbcac`.
`detectTemporalColumnMap` (OB-220) was built but never called. Now the abstain branch of
`recognizeBindingsViaAI` (`:1897`) scans each sheet's candidate columns for a month-column set; if found,
the field binds as a temporal_map (`columnMap` periodKey→column) instead of a gap. `ComponentBinding` +
`BindingProposal` gain `columnMap?`; the proposal→binding conversion stores it (skipping single-column
validation); `mappedTokensForBinding` counts a `columnMap` binding as MAPPED (else HF-281 would flag the
empty `column`). Resolution side already wired (`route.ts:1436`). Structural detection (Korean Test).
BCL has no temporal columns → byte-identical. Unit test added (10/10 binding-completeness).

### §1.7 — calc-time category value grounding (P1). NEW `category-grounding.ts` + `route.ts` wiring. `36a4c885`.
**REQUIRED for P1 to compute** (even with §1.1 emitting filter→aggregate, the filter value is the plan
label `ALI`; the data has `Alimentos` → filteredOut=all → 0). Pure module (10 unit tests):
`matchPlanLabelToDataValue` (exact/prefix/initials/substring, unique-or-null — never a guess),
`groundScopeDag` (rewrites each `multiply(scope,constant(rate))` branch → `filter→aggregate`, pairing
rate→label via `categoryRates`→data value), `groundComponentDags` (I/O-decoupled). Wired into `route.ts`
before `transformVariant` (calc-time): query the tenant's distinct boundary-field values from
`committed_data`, ground, rewrite scope→filter IN MEMORY (deterministic, no LLM, redone per run).
Conditional on scope-node presence → BCL/Meridian untouched.
**VERIFIED on the real MIR P1 DAG (`7aeb8fd8`) + live data:** boundary=`Categoria`, distinct=
`[Alimentos,Bebidas,Limpieza,Cuidado Personal]`, `categoryRates` at
`metadata.compositional_intent.metadata.categoryRates` → **grounded 4/4, 0 ungrounded**, all scope nodes
rewritten to filter (ALI→Alimentos, BEB→Bebidas, CPE→Cuidado Personal, LIM→Limpieza). The architect-gated
MIR calc arithmetic is the only remaining verification.

## 2. Architect-verified items (built, verified by CC up to the calc boundary)

- **§1.7 / §1.3 are BUILT** (above) — CC-verified by unit tests + (for §1.7) a real-MIR-DAG grounding
  run. The remaining verification (the actual calculated numbers) is the architect's MIR calc + re-import,
  per SR-44 — the standard split, not a hand-off of unbuilt work.
- **§1.5 engine multiplicative-composition mode:** deliberately NOT built. The §1.1 accelerator-folding
  prompt fixes P4 at the source (one component, accelerator inside the DAG) with no change to the proven
  additive sum path (`route.ts:2831`). A fuzzy `isMultiplicativeComponent` detector on the sum path is
  higher-risk than folding; recommend it only if folding proves insufficient post-re-import.

## 3. Post-merge architect verification (unchanged from redraft §3)
Re-import the 5 MIR plans (improved prompt → filter→aggregate for P1, accelerator folded, clawback
modifier present), then calculate January + reconcile vs `MIR_Resultados_Esperados.xlsx`. **P5** is the
most-complete here (prompt emits modifier + §1.6 bypass + OB-218 engine). **P1** also needs §1.7
grounding to compute non-zero; **P2** needs §1.3 wiring. If patterns still fail after re-import, that is
the OB-214 signal.

## 4. Gates
```
tsc --noEmit : exit 0 · Korean Test : PASS · no-developer-numbers : clean · npm run build : exit 0
BCL          : 510/510 SR-38, $312,033 unchanged (byte-identical — every fix conditional on new
               node-type/binding-key/modifier/scope-node; BCL exercises none)
unit tests   : binding-completeness 10/10 (clawback bypass + temporal columnMap) ; category-grounding 10/10
real-data    : §1.7 grounding run against the live MIR P1 DAG → 4/4 categories grounded, scope fully rewritten
```

## 5. SHA / PR — all 5 patterns addressed
Commits: Phase-1 diagnostic `475f9674` · corrections `807e9770` · §1.1+§1.6 `decc28b5` · §1.3 `c08fbcac`
· §1.7 `36a4c885` (+ report). PR #559. DO NOT MERGE — SR-44.

Pattern coverage: **P1** §1.1 (per-row filter→aggregate prompt) + §1.7 (calc-time value grounding,
verified 4/4 on real DAG); **P2** §1.3 (temporal abstain→map); **P3** already-capable (count-acceptance)
+ §1.1 emit-count guidance via PRIME_GRAMMAR; **P4** §1.1 accelerator folding (no risky engine mode);
**P5** §1.1 (clawback modifier) + §1.6 (empty-binding bypass) + OB-218 engine. Architect re-imports
(for the §1.1 prompt-shape changes to take effect) + calculates to verify the numbers.

## 6. ARTIFACT SYNC
```
ARTIFACT SYNC
MC: Pipeline Pattern Resolution — diagnostic CORRECTED (convergence-service IS Stage-3; count-acceptance
    already done). Re-frame: most failures are interpreter DAG-shape. SHIPPED+verified: interpreter prompt
    (per-row/variant, accelerator folding, clawback modifier) + clawback empty-binding bypass (BCL-clean,
    unit-tested). HANDED to architect-verified track (unverifiable by CC, precise specs): calc-time value
    grounding (P1), temporal abstain→map wiring (P2). Engine multiplicative-mode NOT built (folded via prompt).
REGISTRY: Convergence: clawback binding bypass. Interpreter: per-row/variant disambiguation + accelerator
    folding + clawback modifier. (Count-acceptance: already present.)
BOARD: MIR P5 most-complete (prompt+bypass+OB-218); P1 needs §1.7 grounding; P2 needs §1.3 wiring; architect
    re-imports + calculates to verify.
SUBSTRATE: Korean Test, SR-38 (BCL byte-identical), no registry, no file-sequence, no SQL; SR-34/prove-don't-
    describe (did not blind-build unverifiable cross-tenant convergence changes).
```

## 7. Out of scope / Residuals
Per directive §5: SQL corrections (none); MIR multi-period (post-Jan); OB-214 (if patterns still fail);
Evaluate surface (user-confirmed grounding); per-transaction attribution for filtered components
(OB-222 residual). Plus: §1.7/§1.3 implementation (architect-verified track, specs in §2).
