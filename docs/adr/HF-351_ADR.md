# ADR — HF-351 Import Identity Resolution: Entity-ID Selection, Classification Guard, Import UX

**Status:** Accepted (committed before implementation, per §3.0)
**Date:** 2026-06-27 · **Branch:** `hf-351-import-identity-resolution` (from main `daa30c64`) · **Directive commit:** `e04e27f7`
**Author:** CC (ULTRACODE autonomous)

Documents the evidenced fix points (4-stage parallel evidence gate + a live MIR DB probe), the premise corrections, and the design + neutrality argument for each of the 5 in-scope findings (F1, F2, F3, F5, F6; F4 is held out of scope).

---

## 1. Evidence summary

| Finding | Fix point (existing file) | Defect |
|---|---|---|
| **F5** | `findHcEntityIdColumn` (`commit-content-unit.ts:159-188`) + call site (`:378`) | entity_id_field chosen by **deterministic first-match in `Object.entries` order** among `identifies='entity'` columns — no value/cardinality/domain check |
| **F2** | `deriveClassificationFromExpression` (`expression-classifier.ts:109-150`) | Branch 2 entity gate `if (!hasMeasure)` too narrow; Branch 3 `identifierCount>=1 && hasReferenceKey` over-fires → a roster with a salary measure + a categorical reference-key dimension → `transaction` |
| **F3** | `looksLikeContentTitle` (`commit-content-unit.ts:414-420`) | commit refused on **5 column-NAME lexical predicates** (length>40, `C1:` prefix, em/en-dash, colon+caps) — a long merged-header id-column name hard-fails the import |
| **F1** | `ImportReadyState.tsx` (`CompletionRow`, `sheetOf`, render sites) | summary renders only the worksheet name; the source file name is in `contentUnitId` (`${file}::${tab}::${i}`) and `UnitStateView.sourceFileName` but dropped |
| **F6** | `VialuceTopbar.tsx:102-107` (`.btn-calc`) | gold Calculate CTA in the persistent header (rendered on every Vialuce surface via `auth-shell.tsx:54`) |

### Live MIR probe (carried reality for F5 / PG-3) — `_hf351_probe.ts`

MIR `transaction` sheet, per-column `[distinct, repeatRatio=rows/distinct, domainOverlap%]` vs the 68-entity domain:

```
DNI_Vendedor   distinct=8    repeatRatio=125×  domainOverlap=100%   ← entity id ✓
Folio          distinct=1000 repeatRatio=1.0×  domainOverlap=0%     ← transaction key
Almacen(branch)distinct=2    repeatRatio=500×  domainOverlap=0%     ← the 'sucursal' trap
Nombre_Vendedor distinct=8   repeatRatio=125×  domainOverlap=100%   ← but role=name (excluded)
```

**The decisive fact:** Almacen out-repeats DNI_Vendedor (500× vs 125×), so the deleted CRP cardinality-only fix would pick the branch. **Value-domain overlap is the discriminator** (DNI 100% vs Almacen/Folio 0%). MIR's stored `entity_id_field = DNI_Vendedor` (correct baseline).

---

## 2. Premise corrections (directive vs reality)

1. **F2 — the structural classifier the directive describes is DEAD.** `signatures.ts` (entity/transaction signatures over `idRepeatRatio`/`hasStructuralNameColumn`/`hasEntityIdentifier`/temporal) and the Bayesian scorer were removed from the decision path by **HF-341 R6**; `detectSignatures` is called by no live route. The live classifier `deriveClassificationFromExpression` reads ONLY the LLM's per-column `identifies`/`data_nature`/`characterization` (Korean-Test clean). So the directive's named subtraction ("the `__EMPTY` name-dependent path that downgrades a roster") **does not exist in live code** — the live downgrade is the expression-classifier branch gates. The fix uses the LLM's **identifies-scope** (a structural recognition signal, Decision 158), NOT a reintroduced structural-cardinality profile.

2. **F5 — no cardinality logic guards the multi-identifier selection.** The OB-231/HF-333 cardinality override was deleted (R7 R3); R7 D1's value-overlap (`reconcileEntityKeysByValueOverlap`, `entity-resolution.ts:58-135`) runs **post-commit on roster batches only** and builds its canonical domain FROM the transaction sheet's already-chosen `idColumn` — so if F5 picks the wrong column, D1 is poisoned. The fix must be at **commit time, upstream of D1**.

3. **F3 — the guard's "structural" claim is structural-over-the-NAME.** Replace with a value-functioning check (mirroring the value-based presence check already at `:393-398`, which only WARNS).

---

## 3. Design decisions

**D1 — F5: candidate collection + value-domain-overlap tie-break (pure, testable).**
`findHcEntityIdColumn` returns the **first** entity-scope identifier. New `findHcEntityIdCandidates` returns **all** of them. A pure `selectEntityIdField(candidates, rows, entityDomain)` ranks them:
- **1 candidate** → return it (BCL `ID_Empleado`, Meridian `No_Empleado` — byte-identical, the common case).
- **≥2 candidates, entity domain non-empty** → highest value-domain overlap wins, with a `UNIQUE_MIN`-style guard to reject many:1 grouping columns (the `sucursal`/`Almacen` trap). Reuses R7 D1's `OVERLAP_MIN=0.5` semantics.
- **≥2 candidates, cold start (empty domain)** → fall back to repeat-ratio among candidates with a paired-name tiebreak (an entity identifier co-occurs with a name column), per directive P-F5(b)(c).
- **still ambiguous** → C2: warn, name the competitors, return the first (preserve current behavior, never silently worse). The selection is called at the `:378` call site where `rows`/`tenantId`/`supabase` are in scope; the entity domain is read via `entities.external_id` (the `entity-resolution.ts:408-412` pattern). **The normal flow (F2 fixed → roster commits first → domain exists) makes value-overlap the operative path** — that is the F2→F5 chain.
Korean Test: ranks by VALUES only; no column-name match.

**D2 — F2: a structural roster branch using the LLM identifies-scope (neutral for sealed transactions).**
Add a roster recognition BEFORE Branch 3: a sheet with an **entity-scope identifier + a name column + NO transaction-scope identifier** is a per-entity record (`entity`), even when it carries a measure + a categorical reference-key. Sheets that carry a **transaction-scope identifier** (folio/receipt — `hasTxnScopeIdentifier`) keep hitting Branch 3 unchanged → **byte-identical** for every real transaction sheet (BCL/Meridian/MIR Ventas all carry a folio/receipt-scoped id; verified MIR has `Folio`). This narrows the over-firing transaction gate without reintroducing the dead structural profile and without any column-name logic.

**D3 — F3: replace the name heuristic with a value-functioning validation that WARNS, not refuses.**
Remove the 5 lexical predicates. Validate structurally: does the resolved `entityIdField` column carry per-row identifier-functioning values (present + non-empty + not unique-degenerate)? Consistent with the `:393-398` precedent, a structural anomaly **flags for review (warn)** rather than hard-failing the import_batch. A long merged-header name is never, by itself, a reason to refuse.

**D4 — F1: carry the source file name into the completion row.**
`CompletionRow` gains `fileName`, populated from `u.sourceFileName` (already in `UnitStateView`) with a fallback to `deriveFileLabel(unitId)` (`import-failure.ts:112`, strips the upload prefix off the first `::` segment). Rendered alongside the worksheet name at all four sites.

**D5 — F6: remove the persistent-header Calculate CTA + its orphans.**
Delete the `.btn-calc` button (`VialuceTopbar.tsx:102-107`) and the now-orphaned `calcAccessible` memo + sole-use imports (`Zap`, `getAccessibleWorkspaces`, `WORKSPACES['calculate']`). Calculate stays reachable via the workspace nav / sidebar / command palette.

---

## 4. Neutrality & blast radius (HALT-CALC)

- **F5** changes behavior ONLY when ≥2 entity-scope identifiers compete; single-identifier sheets (BCL/Meridian) are byte-identical. Selection is **import-time** — it does not touch already-committed data or calc. BCL $312,033 / Meridian $556,985 unaffected.
- **F2** is the highest-risk surface (data_type is the calc partition key, all tenants). Mitigated by: the new roster branch fires only for entity-id + name + measure + **no txn-scope id**; real transaction sheets (with a folio/receipt id) are unchanged. Proven by the existing `expression-classifier.test.ts` (sealed-tenant-shaped) staying green + new roster tests.
- **F3** is gated `classification==='entity'` — disjoint from transaction sheets; sheets with short id names never fired the predicates.
- **F1/F6** are display-only.

## 5. Proof strategy

No Robles tenant exists in the DB (confirmed) → **PG-1/PG-2 (Robles reimport) are architect-channel**. CC proves F5/F2/F3 via **structural unit tests** (injected candidates/rows/domain — the HF-350 injected-caller pattern), the **live MIR probe** (PG-3: value-overlap selects `DNI_Vendedor`), and **neutrality** (expression-classifier tests green; F5 single-candidate byte-identical; calc untouched). PG-5/PG-6 are code+UI evidence. PG-7 is grep.

## 6. ARTIFACT SYNC

- Live Robles reimport (PG-1 `RM_Ventas`, PG-2 `RM_Organigrama`) against the architect-channel files (SR-44).
- If the architect wants F3 to still *refuse* (vs warn) on a true value-degenerate column, that threshold is an architect call (the directive says "validate that the column carries identifier-functioning values" — implies validation, not a hard name-reject).
