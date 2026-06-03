# HF-270 — Resolve plan_component Field References Against Comprehended Field Identities

**Status:** 🚧 In progress
**Branch:** `dev`
**Pinned SHA (Phase 1 base):** `4c4977d7a79ee2d99efc243f467eb31acd8f6e31`
**Standing rules:** `CC_STANDING_ARCHITECTURE_RULES.md` — AP-25/IGF-T1-E910 (Korean Test), SR-34, SR-38, SR-41, SR-43, Rules 25-28.

---

## Phase 1 — AUD (read-only): reachability + anchor selection

### 1.1 Pinned SHA
`4c4977d7a79ee2d99efc243f467eb31acd8f6e31` (dev HEAD). All Phase-1 line refs are against it.

### 1.2 Primary anchor reachable at plan-interpretation time — **CONFIRMED**

**(a) HC computed at analyze, attached to `classificationTrace.headerComprehension` per unit.**
`web/src/lib/sci/synaptic-ingestion-state.ts:461-475` (`initializeTrace`), invoked per content unit:
```ts
function initializeTrace(unitId: string, profile: ContentProfile): ClassificationTrace {
  const headerComp = profile.headerComprehension;
  const hcData: ClassificationTrace['headerComprehension'] = headerComp ? {
    available: true,
    interpretations: Object.fromEntries(
      Array.from(headerComp.interpretations.entries()).map(([col, interp]) => [
        col,
        { semanticMeaning: interp.semanticMeaning, columnRole: interp.columnRole, confidence: interp.confidence },
      ])
    ),
    crossSheetInsights: headerComp.crossSheetInsights, /* … */
  } : null;
```
`web/src/app/api/import/sci/analyze/route.ts:594-598` reads `unit.classificationTrace.headerComprehension.interpretations` over `proposal.contentUnits` (the data/reference/target units carrying measure columns), confirming it is populated for those units, not only plan units.

**(b) The trace survives to `execute-bulk` on data units.** `web/src/app/api/import/sci/execute-bulk/route.ts:81` declares `classificationTrace?: Record<string, unknown>` on `BulkContentUnit`. Proof it is non-empty for data units: the data-commit path (`commitContentUnit`, called per data unit at execute-bulk:699/741/801) extracts field identities directly from it —
`web/src/lib/sci/commit-content-unit.ts:290-293`:
```ts
// HF-110 — field_identities: HC trace primary, confirmedBindings fallback (DS-009 1.3).
const fieldIdentities =
  extractFieldIdentitiesFromTrace(unit.classificationTrace) ??
  buildFieldIdentitiesFromBindings(unit.confirmedBindings);
```
OB-162 persists this to `committed_data.metadata.field_identities`; it is non-null only because the data units arrive at execute-bulk with `headerComprehension` on their trace. The plan loop (`executeBatchedPlanInterpretation`, execute-bulk:248) runs in the SAME handler holding these `contentUnits[]` → the comprehended data-sheet identities are in scope at plan-interpretation time. **HALT-1a not triggered.**

**(c) Comprehended-set shape.** `web/src/lib/sci/header-comprehension.ts:272-293` (`extractFieldIdentitiesFromTrace`) yields, per column: key `columnName` → `{ structuralType: columnRole, contextualIdentity: semanticMeaning, confidence }`. Available fields per column: **`columnName`, `semanticMeaning`, `columnRole`, `confidence`.**

### 1.3 Fallback anchor (plan-only imports) — **AVAILABLE**
`plan_skeleton` emits `requiredInputs` (adapter schema `anthropic-adapter.ts:467-469`):
```
"requiredInputs": [
  { "field": "field_name", "description": "what it measures", "scope": "employee|store", "dataType": "number|percentage|currency" }
]
```
The orchestrator carries it through (`plan-orchestration.ts:318-321`, `skeletonRaw.requiredInputs`). When the HC set is empty (no data sheet in the upload), the fallback anchor is `requiredInputs[].field` — the plan's own declared identifiers (runtime-derived, not enumerated).

### 1.4 Construction seam — **CONFIRMED, reference leaves extractable**
`web/src/lib/sci/plan-orchestration.ts:431-433`:
```ts
const ci = compositionalIntentRaw as unknown as CompositionalIntent;
const constructedTree = constructTree(ci);
intent = constructedTree as unknown as Record<string, unknown>;
```
The `reference`/`aggregate` leaves of `constructedTree` are extractable via `extractReferencesFromDAG` (`convergence-service.ts:1451-1481`, matches `obj.prime === 'reference'|'aggregate'` and returns `obj.field`). convergence-service already calls it on this exact tree shape (`:1614`). The post-construction check (Phase 3.2) attaches immediately after line 432. **HALT-1b not triggered.**

### 1.5 AUD finding
Primary anchor (HC of the data sheets in this import) is **reachable** at execute-bulk plan-interpretation time, shape `{columnName, semanticMeaning, columnRole, confidence}`. Fallback anchor (`plan_skeleton.requiredInputs[].field`) is **available** for plan-only imports. Construction seam is `constructTree(ci)` at `plan-orchestration.ts:432`, with reference leaves extractable via `extractReferencesFromDAG`. **Phase 3 anchor: primary = HC-of-data-sheets-when-present, fallback = plan-declared-fields otherwise.** No HALT; proceed to Phase 2.

---

## Phase 2 — Thread the comprehended-field set to the plan_component call
**Commit:** `3f75b022` — _HF-270 Phase 2: thread comprehended-field set …_

- **2.1** `execute-bulk/route.ts`: before the `planByPath` loop, assemble a deduplicated `comprehendedFields: Array<{field, meaning, role}>` from the non-plan content units' `classificationTrace.headerComprehension.interpretations`; log `[SCI Bulk] HF-270 comprehended-field set: N fields from M data sheets`. Pass it as a new 6th arg to `executeBatchedPlanInterpretation`.
- **2.2** `plan-interpretation.ts`: `executeBatchedPlanInterpretation` accepts `comprehendedFields = []` and forwards it as `OrchestrationInput.fieldComprehension`.
- **2.3** `plan-orchestration.ts`: `OrchestrationInput.fieldComprehension` added; `PerComponentCallArgs.fieldAnchor` added; `runOne` passes the resolved anchor into `callPlanComponentWithRetry`, which forwards it as a new arg to `aiService.interpretPlanComponent` (`ai-service.ts`, sets `input.fieldAnchor`). Bounded-concurrency + retry unchanged (DD-7).
- **2.4** Anchor resolution (orchestrator): `input.fieldComprehension` when non-empty (HC of data sheets), else `skeletonRaw.requiredInputs[].field` (plan-declared). Logs `[plan-orchestrator] HF-270 field anchor = HC-data-sheets|plan-declared (N fields)`.

Pure threading — no behavior change yet (DD-7). Korean Test: every value is runtime HC/declared output.

## Phase 3 — Constrain emission + deterministic post-construction resolution check
**Commits:** `8d52ce34` (constrain + check) · `55603ab8` (normalization refinement)

- **3.1** `anthropic-adapter.ts` `buildUserPrompt` `plan_component` case: inject `AVAILABLE COMPREHENDED FIELDS` block built verbatim from `input.fieldAnchor` (`  <field> — <meaning> (<role>)` per line) + a `FIELD RESOLUTION RULE` instructing the LLM to emit only a listed identifier, matched by semantic meaning. Absent anchor → no block (DD-7).
- **3.2** `plan-orchestration.ts`: after `constructTree(ci)`, walk the constructed tree's `reference`/`aggregate` leaves via `extractReferencesFromDAG` and verify each resolves to an anchor member. Unresolved → `FieldResolutionError` (new class in `compositional-intent.ts`) → mapped to `cognition_violation` in the existing catch → routed through retry → `failed` ComponentOutcome on exhaustion (never persists an unresolved reference).
- **3.2-refinement (`55603ab8`)**: membership compared under a **structural token normalization** `s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')` so HC column headers (`Volumen_Rutas_Hub`) match conventionally-lowercased reference tokens (`volumen_rutas_hub`) — protecting BCL byte-identity (DD-7). Not a synonym table: `cargas_mes_hub` still does not normalize to `cargas_flota_hub` and is correctly rejected.

### 3.3 EPG — literal enumeration (Korean Test, HALT-3 clear)
**Prompt block builder** (`anthropic-adapter.ts`): every `<field>/<meaning>/<role>` token interpolates from `input.fieldAnchor` (runtime). Literals are exclusively: the prose strings `"AVAILABLE COMPREHENDED FIELDS …"`, `"FIELD RESOLUTION RULE: …"`, the `  ${field} — ${meaning} (${role})` format scaffold, and the JSON/schema keys `reference_field` / `ReferenceSource.field` / `reasoning`. **No data-field name, no synonym.**
**Post-check** (`plan-orchestration.ts`): every compared string originates from `args.fieldAnchor` (runtime) or `extractReferencesFromDAG(constructedTree)` (the constructed tree). The only literals are the `normalizeToken` regex character classes (`[^a-z0-9]+`, `_`) and the `FieldResolutionError` message text. **No enumerated field/synonym literal → HALT-3 not triggered.**

## Phase 4 — Build + verification

### 4.1 Build gate — **PASS**
`rm -rf .next && npm run build` → `✓ Compiled successfully`; full route table emitted; dev server `localhost:3000` returns (the `Dynamic server usage` lines are the expected cookie/`request.url` API-route behavior, not errors).

### 4.2–4.4 Cold-cycle determinism (Meridian) + BCL regression — **ARCHITECT'S LIVE GATE (not self-attested)**
The cold-cycle determinism runs require the architect's clean-slate + import procedure: a `structural_fingerprints`-inclusive wipe, a live SCI import of the Meridian plan PDF + data sheets (exercising the modified live-AI `plan_component` path), and recalculation of all three periods — twice, cache-cold — plus the BCL identity-mapped regression. This is live AI + tenant-data runtime in the architect's reconciliation channel; per the directive's evidentiary discipline it is **not self-attested here**. The branch is ready for that gate. Expected per directive: `component_0` resolves to the route-volume field (NOT `cargas_mes_hub`), identical across both cold cycles; BCL footers byte-identical.

### Deterministic enforcement proof (safe, no DB/AI) — `scripts/hf270-resolution-check.ts`
Exercises the exact `normalizeToken` + membership logic against the directive's named Meridian fields:
```
PASS resolves("volumen_rutas_hub")=true   — c0 correct: route-volume ↔ Volumen_Rutas_Hub (drift tolerated)
PASS resolves("Volumen_Rutas_Hub")=true   — verbatim column-name token resolves
PASS resolves("cargas_flota_hub")=true    — c4 legit: fleet-loads ↔ Cargas_Flota_Hub
PASS resolves("cargas_mes_hub")=false     — THE BUG's symptom: invented key REJECTED (FieldResolutionError)
PASS resolves("cumplimiento_depositos")=true — identity-mapped ref resolves (BCL DD-7 safety)
PASS resolves("inventado_xyz")=false      — genuinely-absent field REJECTED
PROOF: 6/6 assertions pass.
```
This proves the resolution mechanism accepts the correct field, rejects the `cargas_mes_hub` non-determinism symptom, and tolerates casing drift — the determinism the cold-cycle gate confirms end-to-end.

---

## Commits
- `3f75b022` Phase 2 — thread comprehended-field set
- `8d52ce34` Phase 3 — constrain emission + post-construction resolution check
- `55603ab8` Phase 3 refinement — normalization-tolerant resolution (DD-7 safety)
- (report + verification script commit follows)

## Status
Phases 1–3 complete, committed, pushed, build-gated, EPG-clean (Korean Test verified). Phase 4.1 build gate PASS. Phase 4.2–4.4 cold-cycle determinism is the architect's live clean-slate gate (not self-attested). PR opened for that verification.
