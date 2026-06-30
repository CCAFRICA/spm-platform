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

## Finding 4: Variant Token Source — the matcher reads `row_data`, NOT `metadata.role`

(Corrected by the adversarial-verification pass — my first read over-attributed the match to `metadata.role`.)
The HF-119 / OB-194 variant matcher (`app/api/calculation/run/route.ts`) decides the discriminant winner and
the NO-MATCH exclusion **exclusively from `committed_data.row_data` tokens**, not from `entities.metadata.role`:
- **Discriminant tokens** (what each variant is identified by) come from the variant DEFINITION
  (`variantName`/`description`/`variantId`) — `route.ts:2012-2034` (`variantTokenize` → `variantDiscriminants`).
- **Entity tokens** (what is scored, and what the exclusion keys on) are built ONLY from each entity's
  committed rows' `row_data` values — `route.ts:2356-2376` (`entityTokens` over `entityRowsFlat = flatDataByEntity`,
  populated solely from the `committed_data` table). The OB-194 gate excludes when
  `bestDiscScore === 0 && bestOverlap === 0` (`route.ts:2410-2434`) — both derived from `row_data`.
- `entities.metadata.role` IS read (`route.ts:2081-2083`) but only into `materializedState`, which is written
  to `period_entity_state` (audit, `:2094-2108`) and the `[VARIANT-DIAG]` log — **never** into `discScores`
  or the exclusion gate.

**Consequence for VLTEST2:** all datos rows are `data_type='entity'`, so the engine has **zero**
`transaction` rows → `entityRowsFlat` is empty → `entityTokens` empty → `bestDiscScore = 0` → every entity
excluded by the OB-194 gate → `$0`. **Fixing entity metadata alone does NOT fix matching** — the matcher needs
the discriminant tokens to appear in the entity's `committed_data.row_data`, i.e. the rows must exist under
`data_type='transaction'`. **Correcting the classification (Finding 1) is necessary AND sufficient** for the
matcher to see them; metadata is a downstream audit surface, not the matching key.

## Finding 5: Fingerprint / Recognition State — NOT the carrier

The classification is `recognition_tier: 3` = "**Novel structure → full LLM classification**"
(`fingerprint-flywheel.ts:7`), i.e. a **fresh** classification, not a Tier-1 cached fingerprint replay. The
VLTEST2 `structural_fingerprints` rows for the datos carry **no `data_type`/`classification`** field (only the
unrelated `reference` band-table fingerprint does). So the cached fingerprint is **not** carrying a stale
classification — the **live** Branch-2.5 path produces `entity` on every fresh import.

## Finding 6: Period Creation in Import Path — none in the ACTIVE SCI path; PRESENT in the LEGACY endpoint

(Expanded by the adversarial-verification pass, which checked the broader import tree.) The **active SCI
ingestion path** — `app/api/import/sci/*` (execute-bulk, finalize-import, process-job, post-commit-construction)
and `lib/sci/*` (incl. commit-content-unit.ts) — has **zero** period-creation hits; `period_id = null` on every
committed_data row of both tenants, consistent with Decision 92 / OB-153 (periods created at calculate time).

However, **the LEGACY file-import endpoint `app/api/import/commit/route.ts:651-704`** (HF-047 pipeline, NOT the
SCI path) scans rows for year/month and **INSERTs into `periods` (status `'open'`) at commit/import time** —
a **possible Decision-92 / OB-153 violation** (period creation at import, not calculate). **HALT-3: fired
(log-only)** — this is logged here per §4 and is **tangential to the classification regression** (the SCI path
VLTEST2/BCL use does not run it). Disposition is architect-channel (live drift vs dead code — §6A.2).

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

**Confidence: HIGH.** The independent adversarial-verification pass confirmed every code-level claim and could
not refute the mechanism; it correctly flagged that the attribution is decidable only with the live
**confidence value** — Branch 2.5 returns `entity @ 0.88`, whereas the pre-existing Branch 2
(`!hasMeasure → entity`, commit `741cf9d0`, HF-341 R6) returns `entity @ 0.90`. **The live VLTEST2
`processing_jobs` record shows `confidence: 0.88` on all four datos jobs** — disambiguating the cause to
**Branch 2.5 (HF-351 F2)**, not Branch 2, and proving the datos measures WERE recognized as measures (else
Branch 2 would have fired at 0.90). With that empirical fact supplied, the code-only "medium" upgrades to
HIGH: the branch literal matches the live record exactly; the branch condition is satisfied by the verified
column identity; the introducing commit (`git log -L 138,156`) and the window-did-not-touch fact are
git-confirmed; the cached-fingerprint (tier 3) and PARTIAL (no `::split`) and Branch-2 (0.90) alternatives are
all positively excluded.

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
