# HF-351 — Completion Report: Import Identity Resolution

**Branch:** `hf-351-import-identity-resolution` (from main `daa30c64`) · **Directive:** `e04e27f7` · **ADR:** `docs/adr/HF-351_ADR.md` (`00179368`)
**Date:** 2026-06-27 · **Mode:** ULTRACODE `/effort` (autonomous)

## 1. Summary

Five CLT-248 findings fixed as a **class** correction (F4 held out of scope per the directive). The defect class — entity_id_field mis-selection on transaction sheets with ≥2 identifiers — recurred across CRP/MIR/Robles as instance fixes; HF-351 fixes the **construction layer** (Decision 158: recognition is sound, selection was wrong).

| Metric | Value |
|---|---|
| Production code | 4 files (`commit-content-unit.ts`, `expression-classifier.ts`, `VialuceTopbar.tsx`, `ImportReadyState.tsx`) — import-layer + UI only, **zero calc-engine surface** |
| Tests | 2 files (+10 tests): `hf351-entity-id-selection.test.ts` (7), `expression-classifier.test.ts` (+3) — 149 sci tests pass |
| Build | `next build` exits 0; tsc + eslint clean |
| HALT-CALC | held — BCL **$312,033**, Meridian **$556,985** unchanged (import-layer fix; existing data untouched) |

## 2. Investigation evidence (§3.0)

4-stage parallel evidence gate + a live MIR DB probe. **Two premise corrections:**
1. **F2** — the structural classifier the directive describes (`signatures.ts`/idRepeatRatio) was **deleted by HF-341 R6**; the live classifier (`deriveClassificationFromExpression`) reads only the LLM expression. The named `__EMPTY` name-downgrade path does not exist in live code; the live downgrade is Branch 3.
2. **F5** — no cardinality guard remains on the multi-identifier selection (`findHcEntityIdColumn` did deterministic **first-match in `Object.entries` order**); R7 D1's value-overlap runs post-commit on roster batches only, and is poisoned if F5 picks wrong upstream.

**Live MIR probe** (`_hf351_probe.ts`) — per-column `[distinct, repeat, domainOverlap]`: `DNI_Vendedor` 8/125×/**100%**, `Almacen`(branch) 2/**500×**/0%, `Folio` 1000/1.0×/0%. Almacen **out-repeats** DNI, so cardinality alone picks the branch — **value-domain overlap is the discriminator**.

## 3. Per-property evidence

- **P-F5 (`commit-content-unit.ts`)** — `findHcEntityIdColumn` → `findHcEntityIdCandidates` (all entity-scope ids) + pure `selectEntityIdFieldByOverlap`: 1 candidate → unchanged (BCL/Meridian byte-identical); ≥2 → value-domain overlap vs the tenant entity domain (read at the `:378` call site), cold-start → finest repeating identifier, ambiguous → C2 first-match. Korean Test: ranks by VALUES.
- **P-F2 (`expression-classifier.ts`)** — new Branch 2.5: entity-scope identifier + name + **no** transaction-scope event id → `entity` (not `transaction`), even with a measure + reference-key. Neutral: a transaction (has a folio event id) and a target/quota sheet (no name) both skip it.
- **P-F3 (`commit-content-unit.ts`)** — removed the 5 column-NAME predicates (`length>40` / `C1:` / em/en-dash / colon+caps) that hard-failed a valid long merged-header id column; replaced with a value-functioning **warn** (does the column carry per-row identifier values), per the `:393-398` precedent.
- **P-F1 (`ImportReadyState.tsx`)** — `CompletionRow.fileName` from `UnitStateView.sourceFileName` (else `deriveFileLabel(unitId)`), rendered at all 4 sites.
- **P-F6 (`VialuceTopbar.tsx`)** — removed the `.btn-calc` gold CTA from the persistent header + its `calcAccessible` memo + orphaned imports.

## 4. Proof gate results

| Gate | Result |
|---|---|
| **PG-1** Robles Ventas → `vendedor_id` | **architect-channel** (no Robles tenant in DB). F5 proven by PG-3 (live MIR) + 7 unit tests. |
| **PG-2** Robles Organigrama (Personal=entity, Jerarquia commits) | **architect-channel**. F2 proven by classifier tests; F3 by the value-functioning replacement (no name-shape refusal). |
| **PG-3** MIR `DNI_Vendedor` | **PASS (live)** — `selectEntityIdFieldByOverlap` on MIR's 68-entity domain + 1000 rows, candidates `[Almacen, DNI_Vendedor]` (branch-first): value-overlap → **DNI_Vendedor (100% vs 0%)**; cold-start → DNI_Vendedor (distinct 8 vs 2). Old first-match would pick Almacen. |
| **PG-4** BCL/Meridian neutrality (HALT-CALC) | **PASS** — changed files are import-layer/UI only; BCL $312,033 / Meridian $556,985 unchanged. BCL/Meridian carry a single entity-scope identifier → byte-identical even on re-import. |
| **PG-5** file name in summary | code evidence — `CompletionRow.fileName` populated + rendered (Vialuce table + Dark/Bliss). |
| **PG-6** header Calculate removed | code evidence — `VialuceTopbar.tsx` no longer renders `.btn-calc`. |
| **PG-7** Korean Test | **PASS** — zero column-name literals in selection code (only rationale comments); the name-length/punctuation guard is gone; selection ranks by `ENTITY_SCOPE`/`TXN_SCOPE` predicates + `entityDomain.has` + overlap/repeat ratios. |

## 5. HALT conditions

None encountered. HALT-CALC held (§4). HALT-COLLISION: OB-249 (#612, merged) modified `commit-content-unit.ts`; HF-351 branched from `daa30c64` (post-OB-249) and read the current code — no conflict.

## 6. ARTIFACT SYNC

- Live Robles reimport (PG-1 `RM_Ventas`, PG-2 `RM_Organigrama`) against the architect-channel files (SR-44) — the F2→F5 chain end-to-end (Personal→entity creates the seller domain → Ventas selects `vendedor_id` → Jerarquia commits).
- F3: the directive specifies a value-functioning **validation**; this warns rather than hard-refuses. If the architect prefers a value-degenerate refusal, that threshold is an architect call.
- F4 (client re-submission during long ops) remains held for a separate HF.
