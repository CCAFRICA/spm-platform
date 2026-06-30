# DIAG-080 FINDINGS — Classification Regression

**Mode:** read-only diagnostic. No code changes. **Branch:** `diag-080-classification-regression` from `main` (`6a22b684`). **Date:** 2026-06-30.

## Summary

Transaction (per-period performance) data is classified `data_type='entity'` because the SCI sheet
classifier's **Branch 2.5** (`expression-classifier.ts:150`, introduced by **HF-351 F2**, commit `8e84a68a`,
2026-06-27) returns `entity` for any sheet with an entity-scope identifier + a name column + no
transaction-scope event id — **even when the sheet carries a temporal period column + measures** (which make
it per-period transaction data, not a static roster). The BCL `Datos` sheet (ID_Empleado + Nombre_Completo +
Periodo + measures) satisfies that condition, so it lands as `entity` at confidence `0.88` — the **exact
confidence recorded** on VLTEST2's live `processing_jobs` (`recognition_tier: 3` = full LLM, *not* a cached
fingerprint replay). The proven BCL tenant's correct `transaction` rows are **historical** — imported before
HF-351 added Branch 2.5 (BCL has **zero** `processing_jobs`). **The directive's primary hypothesis (OB-255
PARTIAL claims / OB-256) is REFUTED:** the regression window (HF-356 → HEAD) never touched
`expression-classifier.ts`, the carrier (HF-351) predates that window, and the misclassification is a *single*
`entity` classification, not a PARTIAL `::split`.

---

## Finding 1: Classification Decision Point

`committed_data.data_type` derives deterministically from the content unit's `classification`:

`commit-content-unit.ts:402` → `const dataType = resolveDataTypeFromClassification(classification);`
(`classification` = the SCI `confirmedClassification`; `data-type-resolver.ts:25`).

`classification` itself is produced by `deriveClassificationFromExpression` (`resolver.ts:23`, the HF-341 R6
resolver) → `expression-classifier.ts`. The entity-vs-transaction decision is a **deterministic branch
ladder** over LLM-recognized signals (Decision 158: the LLM recognizes column scope/nature; the code derives
the class). Branch order (`expression-classifier.ts:121-190`), VERBATIM of the deciding branch:

```ts
// ── Branch 2.5: roster / entity master (HF-351 F2) ──   [:138-156]
if (hasEntityScopeIdentifier && hasName && !hasTxnScopeIdentifier) {
  return {
    classification: 'entity',
    confidence: 0.88,
    matchedConditions: ['entity-scope identifier', 'HAS name', 'NO transaction-scope event id', 'per-entity record (roster/master) — not a transaction despite a measure / reference-key'],
  };
}

// ── Branch 3: transaction — events that REFERENCE entities ──   [:158-174]
if (identifierCount >= 1 && hasReferenceKey) { return { classification: 'transaction', confidence: 0.85, ... }; }
if (identifierCount >= 1 && hasTxnScopeIdentifier) { return { classification: 'transaction', confidence: 0.85, ... }; }

// ── Branch 4: target — entity-level records with measures ──   [:176-186]
if (identifierCount >= 1) { return { classification: 'target', confidence: 0.85, ... 'HAS temporal but NO transaction-scope identifier — per-entity records' ... }; }
```

**The defect:** Branch 2.5 is evaluated **before** Branch 3 (transaction) and Branch 4 (target). For the BCL
`Datos` sheet:
- `hasEntityScopeIdentifier = true` (LLM scoped `ID_Empleado` as the entity), `hasName = true`
  (`Nombre_Completo`), `hasTxnScopeIdentifier = false` (`Periodo` is a period column, **not** a per-row event
  id like a folio/receipt) → **Branch 2.5 fires → `entity` @ 0.88**.
- Branch 2.5's guard recognizes only a per-row **event id** as the transaction signal. It does **not** treat
  the **temporal period column + measures** (the hallmark of per-period performance data) as a transaction /
  target signal — so it claims the sheet as a static roster. Had Branch 2.5 not fired, the sheet would reach
  Branch 3 (with `Sucursal` read as a reference key → `transaction`, exactly BCL's historical result) or
  Branch 4 (`target`, "HAS temporal but NO transaction-scope identifier — per-entity records").

**HALT-1: not triggered** — the `data_type` assignment IS in the path traced from `execute-bulk`
(`commit-content-unit.ts:402`, fed by the resolver/expression-classifier).

## Finding 2: OB-255 PARTIAL Mechanism — NOT the cause (directive hypothesis REFUTED)

The PARTIAL claims mechanism exists (`synaptic-ingestion-state.ts:182` `buildProposalFromState`; `:236`
"PARTIAL claims — two content units from one tab"; `:330` "BOTH entities AND a commission plan. Emit an
ADDITIONAL `plan` ::split CU"). Its trigger is a dual-natured split that emits a **secondary `::split` content
unit** for a `plan` (`plan-interpretation.ts:95-98`: `n >= 3 && rate/n >= 0.5`, a rate-bearing ≥3-col cluster).

It **did not fire** on the datos sheet. Live evidence — the VLTEST2 `Datos` job's `classification_result`:
```json
{ "contentUnits": [ { "tabName": "Datos", "confidence": 0.88, "contentUnitId": "BCL_Datos_Nov2025.xlsx::Datos::0", "classification": "entity" } ], "recognitionTier": 3 }
```
A SINGLE content unit, `classification: "entity"`, **no `::split`, no `plan`**, confidence `0.88` = Branch
2.5's literal. The PARTIAL path would have produced an additional `::split` CU; none exists. The misclassified
`entity` came from the **primary** expression-classifier (Branch 2.5), not the PARTIAL/dual mechanism.

**HALT-2: not triggered** — the PARTIAL mechanism does not fire on single-natured datos sheets in this case.

## Finding 3: Entity Metadata Write Path

When the datos sheet is (mis)classified `entity`, entity construction projects its **non-identifier columns
as entity attributes** (`entity-resolution.ts:144` "HF-199 D3: discover attribute columns per batch for
entities.materializedState projection"; `:276` "Only entity-typed batches (Plantilla / roster) carry
attribute projections"; `:314-380` builds `external_id → {attrCol → value}` from the row's
`field_identities`-marked attribute columns; `:421` "Step 4: Create new entities … attribute projections in
temporal_attributes"). The datos sheet's attribute columns are `Periodo`, `Sucursal` — so the entity record
gets `{periodo, sucursal}` instead of the roster's `{role, cargo, region}`.

Live evidence — `entities.metadata`:
- BCL (correct, from the 85-row roster): `{"role":"Ejecutivo Senior","cargo":"Gerente Regional","region":"Sierra", ...}`
- VLTEST2 (broken, from the misclassified datos): `{"periodo":"2025-10-01","sucursal":"BCL-MAC-001"}`

## Finding 4: Variant Token Source

The variant matcher reads the entity's `metadata.role` to generate discriminant tokens
(`entity-enrichment.test.ts:63` asserts `r.metadata.role`). With VLTEST2 entity metadata `{periodo, sucursal}`
there is **no `role`** → zero discriminant tokens → zero overlap with the variant discriminant → every entity
excluded → grand total `$0`. Independently, the calc engine queries `data_type='transaction'` committed_data
and finds **zero** rows on VLTEST2 (all 510 datos rows are `entity`). Both failure legs trace to Finding 1.
**Fixing entity metadata alone is insufficient** — the engine also needs the rows under `data_type='transaction'`,
i.e. the classification itself must be corrected.

## Finding 5: Fingerprint / Recognition State — NOT the carrier

The classification is `recognition_tier: 3` = "**Novel structure → full LLM classification**"
(`fingerprint-flywheel.ts:7`), i.e. a **fresh** classification, not a Tier-1 cached fingerprint replay. The
VLTEST2 `structural_fingerprints` rows for the datos carry **no `data_type`/`classification`** field (only the
unrelated `reference` band-table fingerprint does). So the cached fingerprint is **not** carrying a stale
classification — the **live** Branch-2.5 path produces `entity` on every fresh import.

## Finding 6: Period Creation in Import Path — none found

`grep` for `from('periods')` / `createPeriod` / period inserts across `app/api/import/sci` and `lib/sci`
returns **nothing**. **HALT-3: not triggered** — no period-creation code in the execute-bulk / finalize path;
Decision 92 / OB-153 is upheld on the current `main`. (All committed_data rows have `period_id = null` on both
tenants, consistent with periods being created at calculate time.)

---

## Root Cause Determination

**Root cause:** `expression-classifier.ts:150` **Branch 2.5** (HF-351 F2, commit **`8e84a68a`**, 2026-06-27)
returns `classification: 'entity'` (confidence `0.88`) for the BCL `Datos` sheet because it has an entity-scope
identifier (`ID_Empleado`) + a name (`Nombre_Completo`) + no transaction-scope event id — and Branch 2.5's
guard does not exclude sheets that carry a **temporal period column + measures** (per-period performance =
transaction/target data). The branch fires ahead of Branch 3 (transaction) and Branch 4 (target).

**Causal chain:** Branch 2.5 → `classification='entity'` → `resolveDataTypeFromClassification` →
`data_type='entity'` (`commit-content-unit.ts:402`) → entity construction projects `Periodo`/`Sucursal` as
attributes → `entities.metadata = {periodo, sucursal}` (no `role`) → variant matcher generates zero
discriminant tokens → all entities excluded → **`$0`**; and zero `transaction` rows exist for the engine.

**Introducing change:** **HF-351 F2 (`8e84a68a`)** — NOT a change in the directive's regression window
(HF-356 → HF-362). `git log 30365579~1..HEAD -- expression-classifier.ts` is **empty**: no window merge
touched the classifier. The directive's named suspects (OB-255 PARTIAL, OB-256) are refuted (Finding 2). The
reason the defect surfaced now: VLTEST2 is a **fresh** import on current code (Tier-3 LLM → Branch 2.5),
whereas BCL's `transaction` rows are **historical** (imported before HF-351; BCL has zero `processing_jobs`).
Any re-import of the BCL `Datos` files on current `main` would reproduce the misclassification (relevant to
the sealed-anchor re-verification residual §6A.4).

**Confidence: HIGH.** The branch literal (`entity`, `0.88`) matches the live `processing_jobs` record exactly;
the branch condition is satisfied by the verified column identity; the introducing commit and the
window-did-not-touch fact are git-confirmed; the cached-fingerprint and PARTIAL alternatives are positively
excluded.

**Fix direction (a separate HF, NOT this diagnostic):** Branch 2.5 must yield to the transaction/target
branches when the sheet carries a temporal period column (+ measures) — a per-period performance record about
an entity is not a roster definition of one. The minimal change is to add the temporal/period signal to
Branch 2.5's exclusion (it currently excludes only a per-row event id), or to order Branch 2.5 after the
temporal-aware Branch 3/4. The HF must re-verify it does not regress the HF-351 F2 case it was built for (a
salaried roster `Personal` with a branch column and NO period), and re-verify the BCL/Meridian/MIR anchors.

---

## ARTIFACT SYNC

**MC (newly discovered):**
- The SCI classifier branch ladder is evaluated `Branch 1 → 2 → 2.5 → 3 → 4`; **order is load-bearing** —
  Branch 2.5 (entity) preempts Branch 3 (transaction)/4 (target) for any named, entity-scope-identified sheet.
- `recognition_tier` (1=tenant fingerprint replay, 2=cross-tenant + targeted LLM, 3=novel full LLM) is the
  decisive lens for "cached vs fresh classification" in any future classification diagnostic.
- A sealed-anchor tenant's correctness can be **historical** (pre-regression import); 0 rows in
  `processing_jobs` is the tell that its classification was not produced by current code.

**REGISTRY:**
- AP-25 (Korean Test): Branch 2.5 reads LLM scope/nature, not column names — Korean-compliant in mechanism;
  the defect is a missing **structural** signal (temporal), not a language one. No AP-25 violation.
- Decision 158: classification is LLM-recognition-derived (scope/nature) → deterministic branch. Intact.
- Decision 92 / OB-153: no period creation in the import path (Finding 6). Intact.

**R1 (criterion → status):**
- "data_type assignment traceable from execute-bulk" → MET (Finding 1; HALT-1 clear).
- "regression carrier identified with SHA + file:line" → MET (`8e84a68a`, `expression-classifier.ts:150`).
- "cached-fingerprint vs live-code disambiguated" → MET (Finding 5; tier 3).

**BOARD (CAPS deltas):** Classification confidence surface gains the explicit fact that Branch 2.5 is a known
over-firing point for per-period performance sheets — candidate for a regression guard/test fixture.

**SUBSTRATE (entries exercised / ICA candidates):** the `expression-classifier` branch ladder; the
fingerprint-tier router (`fingerprint-flywheel.ts`); the entity attribute-projection (`entity-resolution.ts`
HF-199 D3). ICA capture candidate: a classifier fixture asserting `Datos`-shaped input (entity-scope id + name
+ temporal period + measures) → `transaction`/`target`, never `entity`.
