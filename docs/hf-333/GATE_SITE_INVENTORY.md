# HF-333 — Phase 0: Gate Site Inventory

**Date:** 2026-06-22 · Branch `hf-333-vocabulary-gate-removal`

## Grep caveat (resolved)
`convergence-service.ts` contains the `␟` (U+241F) partition separator → `grep` treats it as **binary** and silently finds nothing. All searches on it require **`grep -a`** (per the OB-223 diagnostic note). The directive's grep anchors returned empty until `-a` was used.

## Root cause (one defect, three symptoms)
`field-identities.ts:15` — *"OB-231: the structuralType slot now carries a free-form data_nature string (the fixed role enum was retired)."* So `FieldIdentity.structuralType` now holds the LLM's free-form characterization (`"computed measure"`, `"categorical (boolean-like status flag)"`). Three consumers still compare that free-form string against the **retired canonical vocabulary** (`'measure'`, `'attribute'`).

## Sites

| Reg | Site | Mechanism | Symptom |
|---|---|---|---|
| **R1** | `web/src/lib/intelligence/convergence-service.ts:2918-2927` (§2-S5) | `acceptableStructuralTypes(needed).has(colFi.structuralType)` — `needed` from `deriveNeededType` (Korean-clean, AST-derived `numeric`/`categorical`/…); `acceptableStructuralTypes('numeric')` = `{measure,count}`. Free-form `"computed measure"` ∉ set → `match_pass:'failed'` → `role-inconsistent, needs ${needed} → gap`. | All component bindings incomplete → HF-281 abort (`run/route.ts`) → all 5 MIR plans aborted. |
| **R2** | `web/src/lib/intelligence/convergence-service.ts:2800` (§2-S3) | `labeledCandidates.filter(c => c.structuralType === 'attribute')` — free-form `"categorical (…flag)"` ≠ `'attribute'`. | `attributes admitted=[none]`; attribute requirements can't surface real categorical columns. |
| **R3** | `web/src/lib/sci/commit-content-unit.ts:150 findHcEntityIdColumn` + `:370 sanity` | Reads the LLM's `identifies` scope via `ENTITY_SCOPE`/`TXN_SCOPE`/`IDENTIFIER_NATURE` regexes (OB-231). When the LLM doesn't clearly tag entity-vs-transaction in `identifies`, falls back to the `entity_identifier` binding → can pick the 1:1 transaction id (Folio). The `:378` sanity check **only warned** and proceeded. | `entity_id_field="Folio"` on Ventas (~1:1, 4680/4689 distinct) — transaction-shaped, mis-attributes. |

`deriveNeededType` + `acceptableStructuralTypes` (convergence-service `1729`/`1749`) are exported + Korean-clean; only consumer was the R1 gate (now removed) and the binding-completeness test. Left exported (harmless).

## Fix class
SUBTRACTION (Decision 158 / 111 / AUD-009): R1 gate removed (LLM proposal authoritative; column-existence guarantee kept). R2 log reads the free-form `data_nature` via a categorical predicate (Korean-clean regex over the LLM's words). R3 structural disambiguation: when the resolved id is ~1:1, prefer a repeating IDENTIFIER-nature column (the entity shape) — construction verifies the LLM's recognition (directive §4.3).
