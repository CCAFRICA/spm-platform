# DIAG-081 FINDINGS — Identifier Signal Loss

**Mode:** READ-ONLY trace. No code changed. Branch `diag-081-identifier-signal-loss`.
**Tenant:** `5b078b52-55c9-4612-8f86-96038c198bfe` (VLTEST2). Job `b06361fe` — `BCL_Plantilla_Personal.xlsx`, status `classified`, tier **3 (fresh LLM)**, classified `reference@0.75`.

## Summary

The model's identifier recognition is **not** lost in transit — it is **overwritten inside the classifier by a keyword scan of the model's own prose**. The LLM comprehension emitted, for `ID_Empleado`, `data_nature="identifier"`, `identifies="entity (an individual employee…)"`, confidence **0.99** — persisted and queryable. The classifier (`expression-classifier.ts`) reads that structured field, but its nature predicates run their regex over `natureText = data_nature + characterization` — i.e. the clean structured field **concatenated with the LLM's free-form description sentence**. `isReferenceKey` (checked *first*, and it suppresses `isIdentifier`) matches incidental words in that sentence — "reference", "foreign key" — so all three identifier-bearing columns flip to reference-key, `identifierCount` collapses to 0, and the sheet classifies as `reference`. The model said "identifier"; the classifier out-voted it with a substring match on the model's description of *why* it is an identifier ("…used to **reference** employees across the dataset").

## The Fork (Phase 1) — DOWNSTREAM (Phase 2)

The model emitted `identifier`, not `unknown`. Queried live from `processing_jobs.proposal` → `contentUnits[0].classificationTrace.headerComprehension.interpretations`:

| column | data_nature | identifies | conf |
|---|---|---|---|
| **ID_Empleado** | **`identifier`** | **`entity (an individual employee who may recur…)`** | 0.99 |
| Nombre_Completo | `name` | `entity (the human person…)` | 0.99 |
| ID_Gerente | `identifier (foreign key referencing ID_Empleado…)` | `entity (references another employee…)` | 0.99 |
| Sucursal_ID | `categorical identifier` | `reference (a branch…)` | 0.82 |
| Fecha_Ingreso | `temporal` | `nothing` | 0.99 |
| Cargo / Nivel_Cargo / Region | `categorical` | `nothing` / `reference` | 0.9+ |

The recognition is correct and **persisted** → HALT-3 does **not** fire. The loss is downstream, between this output and the classifier's decision.

## Downstream Trace (Phase 2)

Chain (all on `main`):
1. `process-job/route.ts:366` `resolveClassification(state)`.
2. `resolver.ts:35` `deriveClassificationFromExpression(profile)` — reads `profile.headerComprehension.interpretations` **directly**. There is **no enumerated translation map** between comprehension and the classifier (residual #2's map hypothesis is *not* the culprit; the classifier reads the model's fields directly). The same object is read at `resolver.ts:85` to build the persisted trace — which is why the trace and the classifier see the *same* interps, and why the trace looks correct while the verdict is wrong.
3. `expression-classifier.ts:278` `interps = hc.interpretations.values().filter(hasNature)` → `readStructuralSignals` → `buildDominanceFacets` → `classifyByDominance`.

**The exact loss point — `expression-classifier.ts:57-78`:**

```ts
function natureText(interp) {                       // :57
  return `${interp.data_nature ?? ''} ${interp.characterization ?? ''}`;   // ← folds the PROSE sentence in
}
function isReferenceKey(interp) {                    // :71  — checked FIRST, wins
  return /\b(reference|foreign[\s_-]?key|lookup|dimensional)\b/i.test(natureText(interp));
}
function isIdentifier(interp) {                      // :76
  if (isReferenceKey(interp)) return false;          // ← reference SUPPRESSES identifier
  return /\b(identifier|identity|\bid\b|primary[\s_-]?key|unique[\s_-]?key)\b/i.test(natureText(interp));
}
```

Feeding the **model's real output** into the **real** `deriveClassificationFromExpression` reproduces production byte-for-byte, and the per-column predicate dump shows exactly why:

```
ID_Empleado : nature="identifier"            refKey=TRUE  ID=false  meas=TRUE
   charact="…Serves as the primary key… and is used to REFERENCE employees across the dataset." (also "…a NUMERIC code…")
ID_Gerente  : nature="identifier (foreign key…)"  refKey=TRUE  ID=false
Sucursal_ID : nature="categorical identifier"     refKey=TRUE  ID=false
   charact="…though it may also REFERENCE specific branch IDs in other sheets."
→ identifierCount=0  hasReferenceKey=true  hasMeasure=true
>>> deriveClassificationFromExpression(model output) = reference @ 0.75
    matchedConditions = ["reference key with no identifier — a pure lookup", "measures with no identifier — an aggregate parameter table"]
```

Every identifier column carries the word "reference" (or "foreign key") **in its description of why it is an identifier**, and `ID_Empleado`'s "numeric code" phrase even trips `isMeasure`. The structured `data_nature="identifier"` is correct; the prose scan overrides it.

**On the directive's evidence #2 (`columnRoles contains 'unknown'`):** that log is `fingerprint-flywheel.ts:183`, gating the flywheel *write*. Its `columnRoles` is built at `process-job/route.ts:440-441` from `fieldBinding.semanticRole` — the *post-classification* role assignment. When the sheet mis-classifies as `reference`, downstream role binding can't seat an entity identifier and emits `unknown` for a column, which trips the write gate. It is a **symptom** of the misclassification, not the classifier's input. The classifier's input for `ID_Empleado` was `identifier`, not `unknown`.

## Comprehension Trace (Phase 3)

Not applicable — comprehension succeeded (Phase-1 fork = identifier). Noted for the record: comprehension did **not** depend on numeric contrast here; it recognized the all-text identifier at 0.99 and even read the `ID_Gerente → ID_Empleado` self-join. The all-text sheet is *not* the problem — the model handled it. (The CRP roster "worked before" most plausibly because its LLM descriptions did not contain the trigger substrings; this defect is data-dependent on the prose the model happens to emit, which is exactly why it is fragile.)

## Reproduction (Phase 4)

Two reproductions, both matching production:
1. **Live interps → real classifier:** the model's persisted output for the Plantilla → `deriveClassificationFromExpression` = `reference@0.75` with both production rationales (above).
2. **Minimal isolated fixture** — an all-text roster of `EmpID` (`identifier`, charact "…used to *reference* each employee…"), `FullName` (`name`), `MgrID` (`identifier`, charact "…a *self-reference*…"):
   - AS-IS (`natureText = data_nature + characterization`) → `reference`.
   - Predicates reading `data_nature` **only** → recognized identifiers `[EmpID, MgrID]`, identifierCount=2 → **entity roster**.

## Root Cause

`web/src/lib/sci/expression-classifier.ts:57-78`. The nature discriminators read `data_nature` **concatenated with the free-form `characterization` sentence** (`natureText`, :57), and `isReferenceKey` (:71) is evaluated first and suppresses `isIdentifier` (:77). An identifier column whose description prose mentions "reference"/"foreign key"/"key"/"numeric" is therefore reclassified against the model's own explicit `data_nature="identifier"` / `identifies="entity"`. Introduced with the expression-derived classifier at **HF-341 R6** (`741cf9d0`); the reference-wins-first suppression was carried into **HF-364** (`c559e971`). Violates Principle 1 (AI-First): the classifier re-derives a column's nature from a keyword scan of the model's prose instead of consuming the model's structured decision.

## Fix Direction (structural only — no registry)

Honor the model's **structured judgment** as authoritative for the nature discriminators, instead of keyword-scanning its prose description:
- Read the nature from `data_nature` (the field the model uses to name the nature) and the scope from `identifies` — **not** from `data_nature + characterization`. The model already emitted `data_nature="identifier"` and `identifies="entity"` here; faithful pass-through restores `identifierCount≥1` and the entity roster (proven above).
- Keep `characterization` for display/audit, not as a discriminator input; a full-sentence description is not a nature label and must not out-vote the nature the model assigned.
- Equivalently/additionally, corroborate structurally when nature and scope conflict — `ID_Empleado` is high-cardinality (one distinct value per row) and `ID_Gerente` draws its values from `ID_Empleado` (a self-join); these are language-agnostic entity-key signals already available on the sheet.

**This is NOT a dictionary of identifier column names or patterns (HALT-2 respected).** No enumerated map, no known-ID list. It is faithful consumption of the model's own per-column `data_nature`/`identifies` decision — the recognition the classifier currently discards by scanning the prose. The precise implementation (read `data_nature` only, vs. structured-vs-prose precedence, vs. structural corroboration) is a separate architect decision.

## ARTIFACT SYNC

- **MC:** identifier signal-loss LOCATED — `expression-classifier.ts:57-78`; the classifier overrides the model's `data_nature="identifier"` via a regex over the concatenated `characterization` prose (`isReferenceKey` priority-suppresses `isIdentifier`). Reproduced live + in isolation.
- **REGISTRY:** none added; fix direction is structural pass-through of the model's decision, explicitly not a name dictionary (HALT-2).
- **R1:** BCL Plantilla → model emits `identifier@0.99`, classifier emits `reference@0.75`; data_nature-only reading → entity. Fork = downstream (Phase 2). HALT-1/2/3 none fire.
- **BOARD:** roster misclassification root-caused; fix is a separate directive.
- **SUBSTRATE:** HALT-CALC neutral (read-only). VLTEST2 end-to-end ($312,033) remains blocked until the fix lands (architect-only, residual #3).
