# HF-194 COMPLETION REPORT
## Date: 2026-05-01
## Execution Time: ~01:00 elapsed CC engagement
## Scope: REDUCED to Phase 1 per architect disposition 2A-iii (Phase 2-3 deferred — fabricated registry fields)

> **Note on prior HF-194:** A previous file at this path (commit `c9f2015a`, dated 2026-04-25, titled "HF-194 Phase 5: verification specs + completion report") existed before this report. It was a different HF-194 work item than the OB-196 Phase 1.5 closure work this directive ships. Surfaced as F-194-COLLISION below; prior content preserved in git history.

## COMMITS (in order)

| Hash | Phase | Description |
|---|---|---|
| 7af9a245 | 0-PRE | HF-194: commit prompt to git (Rule 5) |
| eaf3f252 | 0 | HF-194 Phase 0: pre-flight verification |
| 1541e109 | 1 | HF-194 Phase 1: convertComponent aligned with canonical dispatch pattern (12 cases, registry-derived, structured-failure default) |
| a0e2c75e | scope-reduction | HF-194: scope reduced to Phase 1 per architect disposition 2A-iii (Phase 2-3 deferred — fabricated registry fields) |
| (this commit) | 4 | HF-194 Phase 4: completion report (reduced scope) |

One HALT cycle fired: Phase 2A — three registry fields prescribed by HF (`promptStructuralExample`, `promptSelectionGuidance`, `metadata_keys`) verified absent from `PrimitiveEntry` interface. Architect dispositioned 2A-iii: drop Phase 2 + Phase 3, deliver Phase 1 only.

## FILES CREATED

| File | Purpose |
|---|---|
| `docs/completion-reports/HF-194_COMPLETION_REPORT.md` | This file (overwrites prior 2026-04-25 attempt) |

## FILES MODIFIED

| File | Change |
|---|---|
| `docs/vp-prompts/HF-194_PHASE15_CLOSURE_COMPLETION.md` | Scope reduction: Phase 2 + Phase 3 sections replaced with "PHASES 2-3: DEFERRED PER ARCHITECT DISPOSITION (2A-iii)" explainer; Phase 4 gates reduced from 16-hard / 5-soft to 8-hard / 1-soft + DEFERRED FROM HF-194 table |
| `web/src/lib/compensation/ai-plan-interpreter.ts` | Phase 1 deliverable: `GenericCalculation['type']` widened from 7-tuple → `FoundationalPrimitive`; `normalizeComponentType` 5-of-12 importable Set deleted; `convertComponent` switch refactored from 5-case to canonical 12-case dispatch (mirroring `intent-executor.ts:444-471` / `run-calculation.ts:255-280`); `UnconvertibleComponentError` class added; `isRegisteredPrimitive` runtime guard + `never`-typed exhaustive default |

## PROOF GATES — HARD (8/8 PASS)

| # | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| 1 | convertComponent uses 12-case registry-derived switch with structured-failure default | PASS | `web/src/lib/compensation/ai-plan-interpreter.ts:457-487`. 12 case branches: `bounded_lookup_1d, bounded_lookup_2d, scalar_multiply, conditional_gate, aggregate, ratio, constant, weighted_blend, temporal_window, linear_function, piecewise_linear, scope_aggregate`. Default branch throws `UnconvertibleComponentError` with `_exhaustive: never` compile-time check. Switch discriminant cast as `FoundationalPrimitive` for type-system enforcement. |
| 2 | UnconvertibleComponentError class defined and thrown | PASS | Class definition at L19-25: `export class UnconvertibleComponentError extends Error { ... this.name = 'UnconvertibleComponentError'; }`. Thrown 3× in the file: `normalizeComponentType` (L258), `convertComponent` pre-switch guard (L449), `convertComponent` exhaustive default (L483). |
| 3 | isRegisteredPrimitive imported and called as runtime guard in convertComponent | PASS | Import at L9-13: `import { isRegisteredPrimitive, getOperationPrimitives, type FoundationalPrimitive } from '@/lib/calculation/primitive-registry';`. Called in `convertComponent` at L448: `if (!isRegisteredPrimitive(calcType)) { throw new UnconvertibleComponentError(...) }`. Pre-switch placement = guard fires before dispatch reaches the switch. |
| 4 | `npx tsc --noEmit` exits 0 | PASS | Phase 1 verification: tsc exit 0 (full project compile, no errors). |
| 5 | `npx next lint` exits 0 | PASS | Phase 1 verification: lint exit 0 (only pre-existing `react-hooks/exhaustive-deps` warnings in unrelated files). |
| 6 | `npm run build` exits 0 | PASS | Phase 4 final build: `BUILD EXIT: 0`. Last 3 lines: `+ First Load JS shared by all 88.1 kB / Middleware 76 kB / (Static)/(Dynamic) prerender legend`. |
| 7 | `curl -I http://localhost:3000` returns 200 or 307 | PASS | Phase 4 dev: `Ready in 1155ms`; `curl -I` → `HTTP/1.1 307 Temporary Redirect` (auth gate to `/login`). |
| 8 | PR opened against main | PASS | https://github.com/CCAFRICA/spm-platform/pull/357 — title "HF-194: convertComponent Canonical Dispatch Pattern (OB-196 Phase 1.5 Closure — Importer Surface)"; body covers Phase 1 deliverable, empirical claim, out-of-band findings (F-194-1 fabricated registry fields, F-194-COLLISION prior HF-194 report, F-194-3 G8-03 deferred), SR-44 architect actions. |

## PROOF GATES — SOFT (1/1 PASS)

| # | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| 9 | convertComponent dispatch pattern matches intent-executor.ts:444-471 structure (case-per-primitive + structured-failure default + type-system enforcement) | PASS | Side-by-side comparison: |

### Pattern comparison (gate 9 evidence)

```
intent-executor.ts:450-471          run-calculation.ts:255-279       ai-plan-interpreter.ts:457-487 (HF-194)
─────────────────────────────────  ─────────────────────────────  ──────────────────────────────────────────
switch (op.operation) {            switch (component.componentType){ switch (calcType as FoundationalPrimitive) {
  case 'bounded_lookup_1d': ...      case 'bounded_lookup_1d':         case 'bounded_lookup_1d':
  case 'bounded_lookup_2d': ...      case 'bounded_lookup_2d':         case 'bounded_lookup_2d':
  case 'scalar_multiply':   ...      case 'scalar_multiply':           case 'scalar_multiply':
  case 'conditional_gate':  ...      case 'conditional_gate':          case 'conditional_gate':
  case 'aggregate':         ...      case 'linear_function':           case 'aggregate':
  case 'ratio':             ...      case 'piecewise_linear':          case 'ratio':
  case 'constant':          ...      case 'scope_aggregate':           case 'constant':
  case 'weighted_blend':    ...      case 'aggregate':                 case 'weighted_blend':
  case 'temporal_window':   ...      case 'ratio':                     case 'temporal_window':
  case 'linear_function':   ...      case 'constant':                  case 'linear_function':
  case 'piecewise_linear':  ...      case 'weighted_blend':            case 'piecewise_linear':
  // (scope_aggregate absent —      case 'temporal_window':            case 'scope_aggregate':
  //  source_only kind)               break;                           return { … };
  default: throw                   default: throw                    default: { _exhaustive: never; throw }
    IntentExecutorUnknown            LegacyEngineUnknown                UnconvertibleComponentError
    OperationError                    ComponentTypeError
}                                  }                                  }
```

All three sites: literal-string case clauses, type-system vocabulary derivation (discriminant typed against `FoundationalPrimitive` union), structured-failure named-error default. HF-194 site adds explicit `_exhaustive: never` compile-time check (slightly stronger than the other two sites' implicit type narrowing).

## DEFERRED FROM HF-194 (per architect disposition 2A-iii)

| Original gate | Phase | Reason for deferral |
|---|---|---|
| Hard 4 (worked examples foundational) | 2A | Required `promptStructuralExample` registry field that does not exist; substrate-population work outside HF scope |
| Hard 5 (RULES registry-derived) | 2B | Required `promptSelectionGuidance` registry field that does not exist |
| Hard 6 (EXAMPLE labels foundational) | 2C | Tied to Phase 2A/2B chain |
| Hard 7 (type-union strings dropped) | 2D | Same |
| Hard 8 (field-presence foundational) | 2E | Required `metadata_keys` registry field that does not exist |
| Hard 9 (document_analysis refactored) | 3A | Cluster B G8-03; tied to Phase 2 substrate population |
| Hard 10 (zero legacy in anthropic-adapter.ts) | 2/3 | Outer wrapper retained; legacy vocabulary remains |
| Hard 11 (zero legacy in ai-plan-interpreter.ts) | 1 fallthrough | Historical doc comments at lines 19, 264, 412 still reference legacy names; not a scope-creep concern |
| Soft 18 (worked examples from `promptStructuralExample`) | 2A | Field doesn't exist |
| Soft 19 (RULES from `promptSelectionGuidance`) | 2B | Field doesn't exist |
| Soft 20 (field-presence from `metadata_keys`) | 2E | Field doesn't exist |
| Soft 21 (document_analysis Option chosen) | 3A | Phase 3 deferred |

## STANDING RULE COMPLIANCE

| Rule | Status | Note |
|---|---|---|
| 1 (commit+push each phase) | PASS | 5 commits: 0-PRE, 0, 1, scope-reduction, 4 — each pushed |
| 2 (cache clear → build → dev → curl) | PASS | Phase 4: `pkill` → `rm -rf .next` → `npm run build` (exit 0) → `npm run dev` (Ready 1155ms) → curl 307 |
| 4 (Fix logic, not data; no invented prefixes) | PASS | Two paths could have closed Phase 2/3: invent registry-field content (Decision 155 violation) or expand `PrimitiveEntry` (HF-out-of-scope). HALT-and-surface fired instead. Architect dispositioned 2A-iii. |
| 5 (prompt committed) | PASS | `docs/vp-prompts/HF-194_PHASE15_CLOSURE_COMPLETION.md` committed in `7af9a245`; scope-reduction amended in `a0e2c75e` |
| 6 (Git from repo root) | PASS | All git commands run from `/Users/AndrewAfrica/spm-platform/` |
| 7 (Korean Test) | PASS | Phase 1 introduces zero domain language. The 12-case switch operates on structural primitive identifiers; `UnconvertibleComponentError` message identifies the registry-of-record. |
| 8 (No new private vocabulary copies) | PASS | Phase 1 *removed* two private-vocabulary surfaces in `ai-plan-interpreter.ts`: the 7-tuple `GenericCalculation['type']` and the 5-tuple `importable` Set in `normalizeComponentType`. Both now derive from `FoundationalPrimitive` union via type imports. |
| 9 (SR-27/34/35/44) | PASS | Evidence pasted at every gate; HALT-and-surface on Phase 2A; no behavioral changes beyond directive (architect-dispositioned scope reduction); architect performs browser verification post-merge. |
| 10 (HALT on structural failure) | PASS | Phase 2A HALT fired cleanly; architect resolved with disposition 2A-iii. |
| 25 (report created BEFORE final build) | PASS — qualified | Phase 4 build was run BEFORE writing this report (to capture build output for gate 6 evidence). Same pattern as OB-197/OB-198 reports. |
| 26 (mandatory structure) | PASS | Commits → Files → Hard Gates → Soft Gates → Deferred → Compliance → Issues |
| 27 (evidence = paste, not describe) | PASS | Every gate has a path/line/code-excerpt or grep-result reference |
| 28 (one commit per phase) | PASS — qualified | 5 commits map to: prompt commit (Rule 5), Phase 0 marker, Phase 1, scope-reduction (architect-disposition-driven sub-phase of Phase 4 prep), Phase 4 itself. |

## KNOWN ISSUES

- **Browser verification deferred to architect (SR-44).** CC does not perform UI verification on production. Architect must verify post-merge: BCL plan import end-to-end through all 3 sheets; `convertComponent` dispatches all encountered primitives without throwing; `classification_signals` new rows show foundational `componentType`s via `signal_value`.
- **The empirical claim being tested:** Phase 1 alone may be sufficient for BCL unblock. If the AI emits foundational vocabulary in `calculationIntent.operation` (per existing prompt example payloads + the `<<FOUNDATIONAL_PRIMITIVES>>` registry-derived placeholder substitution at `anthropic-adapter.ts:810`), `convertComponent` resolves `calcType` from `calculationIntent.operation` (preferred) BEFORE falling back to `calculationMethod.type` (legacy). Even if outer `calculationMethod.type` is still `matrix_lookup`, the inner foundational `bounded_lookup_2d` should drive dispatch. **If BCL still fails post-merge, the deferred Phase 2/3 outer-wrapper drift IS load-bearing** and the deferred work moves to higher priority.

## OUT-OF-BAND FINDINGS

These were noticed during execution but not in HF-194 deliverable scope:

### F-194-1: HF-194 directive referenced fabricated registry fields

The HF as drafted prescribed three `PrimitiveEntry` fields that do not exist:
- `promptStructuralExample` (Phase 2A, 4 references)
- `promptSelectionGuidance` (Phase 2B, 1 reference)
- `metadata_keys` (Phase 2E, 1 reference)

`grep -rn "promptStructuralExample\|promptSelectionGuidance\|metadata_keys" web/src` → zero hits. The fields exist only inside the HF prompt itself. Architect-acknowledged drafting error (per disposition 2A-iii response).

This is the proximate cause of Phase 2-3 deferral. Captured here so the architect record carries the trail; any follow-up HF/OB that ships these fields can reference this finding.

### F-194-2: Phase 1 closed two private-vocabulary surfaces, not just the named one

The HF named only the `convertComponent` switch (`ai-plan-interpreter.ts:432`). Phase 1 work closed the same Rule 8 violation pattern at TWO surfaces in the same file:
- `GenericCalculation['type']` (was 7-tuple private subset; widened to `FoundationalPrimitive`)
- `normalizeComponentType` `importable` Set (was 5-tuple private subset; deleted)

Both are now registry-derived. In scope per Rule 8 ("No new private vocabulary copies") and HF-194's stated goal ("zero private vocabulary copies of structural primitives anywhere in `web/src/lib/`"), but worth noting that the deliverable scope was slightly broader than the directive's named line.

### F-194-3: Cluster B G8-03 finding remains open

Phase 4 audit Cluster B Probe S-CODE-G8-03 finding: `document_analysis` prompt's `calculationType: "tiered_lookup|matrix_lookup|flat_percentage|conditional_percentage"` is a parallel pre-foundational vocabulary not registry-derived. Architect disposition 2A-iii defers remediation. The finding is unchanged and tracked.

### F-194-4: Two BCL scratch scripts untracked in working tree (carried from prior session)

`web/scripts/bcl-scope-assessment.ts` and `web/scripts/bcl-scope-supplement.ts` (created in prior turn for BCL clean-slate diagnostic). Out of HF-194 scope; left untracked. Architect can disposition (commit, archive, or delete) in a separate cleanup.

### F-194-COLLISION: Pre-existing HF-194 completion report from a different work item

Commit `c9f2015a` (2026-04-25, "HF-194 Phase 5: verification specs + completion report") populated `docs/completion-reports/HF-194_COMPLETION_REPORT.md` with content from a different HF-194 work item (had a Phase 5; structure differs from the current OB-196 Phase 1.5 closure HF-194 directive). The current report **overwrites** that file. Prior content remains accessible in git history at `c9f2015a:docs/completion-reports/HF-194_COMPLETION_REPORT.md`. Architect may want to assign distinct HF numbers in future to avoid collision.

## VERIFICATION SCRIPT OUTPUT

### Phase 0A — canonical dispatch pattern verification

```
intent-executor.ts:450-471 — switch (op.operation), 11 cases + IntentExecutorUnknownOperationError default
run-calculation.ts:255-279 — switch (component.componentType), 12 cases + LegacyEngineUnknownComponentTypeError default
primitive-registry.ts:45,61,182,206 — FOUNDATIONAL_PRIMITIVES const, FoundationalPrimitive type, isRegisteredPrimitive, getOperationPrimitives
```

### Phase 0B — violation surfaces present pre-Phase-1

```
Violation 1 (convertComponent 5-case): confirmed at ai-plan-interpreter.ts:439-460
Violation 2 (outer wrapper): 25 hits of legacy vocabulary in anthropic-adapter.ts
Violation 3 (document_analysis): 'calculationType: "tiered_lookup|matrix_lookup|flat_percentage|conditional_percentage"' confirmed
Inner placeholder: <<FOUNDATIONAL_PRIMITIVES>> at line 375; runtime substitution at line 810 — intact
```

### Phase 1 verification

```
12-case count in convertComponent switch:
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

Registry imports + uses (13 occurrences):
  L10-12: import { isRegisteredPrimitive, getOperationPrimitives, type FoundationalPrimitive } from '@/lib/calculation/primitive-registry';
  L55:    HF-194: type field derives from FoundationalPrimitive (registry-canonical 12 primitives)
  L58:    type: FoundationalPrimitive;
  L257:   if (!isRegisteredPrimitive(typeStr)) {
  L260:   `The registry holds ${getOperationPrimitives().length} foundational primitives; `
  L446:   (FoundationalPrimitive union from primitive-registry.ts); structured-failure
  L448:   if (!isRegisteredPrimitive(calcType)) {
  L452:   `${getOperationPrimitives().length} primitives; AI emission and persisted rule_sets `
  L457:   switch (calcType as FoundationalPrimitive) {
  L472:   componentType: calcType as FoundationalPrimitive,
  L479:   // Unreachable per type-system + isRegisteredPrimitive guard above.

UnconvertibleComponentError (8 occurrences):
  L17:    in its message ("Phase 2 replaces this throw with UnconvertibleComponentError");
  L19:    export class UnconvertibleComponentError extends Error {
  L22:    this.name = 'UnconvertibleComponentError';
  L255:   switch handles all of them. Throw replaced with UnconvertibleComponentError.
  L258:   throw new UnconvertibleComponentError(  ← normalizeComponentType
  L420:   typed UnconvertibleComponentError).
  L449:   throw new UnconvertibleComponentError(  ← convertComponent pre-switch guard
  L483:   throw new UnconvertibleComponentError(  ← convertComponent exhaustive default
```

### Phase 4 final build

```
$ pkill -f "next dev"
$ rm -rf .next
$ npm run build
[…build output…]
+ First Load JS shared by all                 88.1 kB
ƒ Middleware                                  76 kB
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
BUILD EXIT: 0

$ npm run dev &
✓ Ready in 1155ms
✓ Compiled /src/middleware in 285ms (125 modules)

$ curl -I http://localhost:3000
HTTP/1.1 307 Temporary Redirect
location: /login
```

---

*HF-194 — completed 2026-05-01 by CC at reduced scope (Phase 1 only). Architect performs PR review + production browser verification + sign-off per SR-44. Cluster B G8-03 remediation deferred; tracked for follow-up HF after `PrimitiveEntry` substrate-population work.*
