# HF-351 — Import Identity Resolution: Entity-ID Selection, Classification Guard, Import UX

**Directive file (VP):** `docs/vp-prompts/HF-351_IMPORT_IDENTITY_RESOLUTION_DIRECTIVE_20260627.md`
**Date:** 2026-06-27 · **Category:** HF (structural-class correction) · **Mode:** ULTRACODE `/effort` (autonomous)
**Repo:** VP `CCAFRICA/spm-platform` · **Branch:** `hf-351-import-identity-resolution` (NEW branch from main HEAD `bf77d56b`)
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md` — the file IS the prompt (DD-11).

---

## §0 — CC STANDING RULES HEADER

`CC_STANDING_ARCHITECTURE_RULES.md` binds throughout. Load-bearing:

- **AP-25 / Korean Test (Decision 154, LOCKED)** — no column-name heuristics for entity_id_field selection. No `vendedor` / `sucursal` / `DNI` string literals. Selection uses structural properties (cardinality, value-domain overlap), never field names.
- **Decision 158 (LOCKED)** — LLM recognizes (roles, identifies); deterministic code constructs and guarantees (selects the correct entity_id_field, validates commit eligibility). The LLM's recognition of `vendedor_id:identifier@0.99` is correct. The code's selection of `sucursal` instead is the construction failure.
- **The Validation Premise Law (HF-339, LOCKED)** — checks against carried reality. Value-domain overlap is carried reality. Column-name-pattern matching is developer expectation.
- **C2 — Fail Loud** — when entity_id_field cannot be determined, report the ambiguity, not silently pick the first one.
- **SR-2 — Scale by Design** — the fix works for any tenant, any sheet, any column count.
- **SR-34 — No Bypass** — fix at the class layer. This defect has surfaced across CRP (HF-169), MIR (HF-333, R6, R7), and now Robles. Instance fixes each time. Class fix now.

**First action:** write this directive to `docs/vp-prompts/HF-351_IMPORT_IDENTITY_RESOLUTION_DIRECTIVE_20260627.md` and commit.

**Channel boundary / execution authority:** CC owns the entire execution path (ULTRACODE). CC halts only on premise failures (§4).

---

### §0.1 — ANTI-SCOPE-NARROWING ENFORCEMENT (binding)

1. **No partial fixes.** All 6 CLT findings are in scope. CC does not defer any finding.
2. **Subtraction over addition.** The HF-247 guard that refuses sheets is REMOVED or NARROWED to structural-only checks (not column-name-length heuristics). The entity_id_field selection logic that picks by confidence/position is REPLACED with value-domain overlap.
3. **Tests assert structural properties, not specific column names.**

---

## §1 — PROBLEM STATEMENT

### §1.1 — The defect class (SR-34 — recurring across 3 tenants)

When a transaction sheet has multiple columns with `identifier` role, the entity_id_field selection picks the wrong one. This has manifested as:

- **CRP (HF-169):** `transaction_id` picked over `entity_id` — cardinality check added as instance fix
- **MIR (HF-333/R6):** `Folio` picked over `DNI_Vendedor` — `initializeTrace` widening incidentally fixed it
- **Robles (now):** `sucursal` picked over `vendedor_id` — the cardinality fix from CRP doesn't help because sucursal also repeats

Each instance fix addressed the symptom without fixing the selection logic itself. R7 D1 (`reconcileEntityKeysByValueOverlap`) fixed entity sheets but not transaction sheets. The class-level fix: entity_id_field selection on transaction sheets must use value-domain overlap with the entity domain, not confidence ranking.

### §1.2 — The six CLT-248 findings

| Finding | Description | Root cause |
|---|---|---|
| **F1** | Import results missing file name per content unit — user sees worksheet name only | Import summary UI doesn't carry file name |
| **F2** | Personal (employee roster) classified as Transaction Data — should be Team Roster (entity) | Classification heuristic misfire: 6 columns, no temporal signal, merged header cells produce `__EMPTY` column names |
| **F3** | Jerarquia sheet REFUSED by HF-247 Phase 4 guard — resolved entity_id_field matches "plan-component-title pattern" | Merged header cell rendered as long descriptive column name → guard's length/punctuation heuristic triggers on valid data |
| **F4** | Client re-submits during long-running plan interpretation (~60s timeout) | **HELD — separate HF with additional information** |
| **F5** | Ventas entity_id_field="sucursal" instead of "vendedor_id" despite LLM recognizing vendedor_id@0.99 | entity_id_field selection picks by confidence/position; no value-domain overlap with entity domain |
| **F6** | "Calculate" button in persistent header — not appropriate on all surfaces | UI: hardcoded header element |

### §1.3 — The upstream/downstream chain (spatial assessment)

F2 → F5 → F3 form a chain:

1. **F2 (upstream):** Personal misclassifies as transaction → no entity domain created for vendedores
2. **F5 (core):** Without an entity domain, the value-domain overlap mechanism has nothing to compare against → entity_id_field selection falls back to confidence/position → picks sucursal
3. **F3 (parallel):** Jerarquia refused → no hierarchy edges → distribution fan-out has no graph
4. **Downstream:** Entities keyed by sucursal → rule_set_assignments bind branches not sellers → convergence resolves wrong scope → distribution fan-out starts from wrong entity → calculation produces wrong results

Fix F2 + F5 + F3 together and the entire chain resolves.

---

## §2 — CONSTRAINTS

- **Korean Test.** The entity_id_field selection NEVER matches on column names. It uses: (a) value-domain overlap with the entity domain, (b) cardinality ratio (repeat rate), (c) the LLM's `identifies` signal. All are structural properties of the data, not the names.
- **D158.** The LLM's recognition of identifier roles is correct. The code's selection logic is the construction failure. The fix is in the construction layer.
- **Validation Premise Law.** The HF-247 guard's "plan-component-title pattern" check (length, punctuation, structural-prefix) is a developer-expectation heuristic. Replace it with a carried-reality check (does this column actually function as an identifier in the data — i.e., does it have values that repeat or overlap with known entities?).
- **Progressive Performance.** The atom cache, fingerprint cache, and convergence cache are not touched. Entity_id_field selection is per-import, not cached.

---

## §3 — PHASES (ULTRACODE `/effort` — autonomous)

CC determines the implementation strategy. Properties must hold at completion:

### §3.0 — EVIDENCE GATE (mandatory before any fix)

| Area | Required evidence | Question |
|---|---|---|
| **F5** | Paste the entity_id_field selection code path in `commitContentUnit` or its caller. Show exactly how it picks among multiple identifier columns. | **What is the current selection logic?** |
| **F2** | Paste the classification path for Personal — what signals led to `transaction` instead of `entity`. | **Why did a roster sheet classify as transaction?** |
| **F3** | Paste the HF-247 Phase 4 guard code. Show the "plan-component-title pattern" check. | **What heuristic triggers the refusal?** |
| **F6** | Paste the persistent header component showing the Calculate button. | **Where is it rendered?** |

ADR commitment before implementation: `docs/adr/HF-351_ADR.md`.

### §3.1 — PROPERTY ESTABLISHMENT

**PROPERTY P-F5: Entity_id_field selection by value-domain overlap.**
When a sheet has multiple columns with `identifier` role, the selection logic:
(a) Checks each identifier column's values against the entity domain (existing entities for this tenant). The column with the highest overlap is the entity identifier.
(b) If no entity domain exists yet (cold start, or the entity sheet hasn't been imported), falls back to cardinality ratio: the identifier with the highest repeat rate (rows / distinct values) is the entity key. A unique identifier (ratio ≈ 1.0) is a transaction key, not an entity key. A repeating identifier (ratio >> 1.0) is an entity key.
(c) If cardinality is ambiguous (multiple repeating identifiers — the Robles case where both sucursal and vendedor_id repeat), uses the LLM's `identifies` signal scope if available, or the column paired with a `name`-role column (structural heuristic: an identifier paired with a name column is an entity identifier, since entities have names).
(d) Fails loud (C2) if the selection remains ambiguous after all three layers. Reports which columns competed and why none was definitively selected. Does NOT silently pick the first one.
**Subtraction target:** the confidence-ranking / position-based selection that picks the first or highest-confidence identifier regardless of whether it's the entity or transaction key.

**PROPERTY P-F2: Roster classification resilience to merged headers.**
A sheet with `idRepeatRatio ≈ 1.0`, `volumePattern=single`, `hasName=true`, `hasEntityId=true`, no temporal signal, and low row count (roster-shaped profile) classifies as entity regardless of whether column names are proper headers or `__EMPTY` placeholders from merged cells. The classification uses the structural profile, not the column names.
**Subtraction target:** whatever classification path downgrades a roster-profile sheet to transaction when column names are `__EMPTY`.

**PROPERTY P-F3: Commit guard uses structural validation, not column-name heuristics.**
The HF-247 Phase 4 type-validation guard does NOT refuse a sheet based on entity_id_field column name length, punctuation, or "looks like a plan title" pattern. Instead, it validates structurally: does the entity_id_field column contain values that function as identifiers (non-null, non-empty, reasonable cardinality)? A merged header cell producing a long descriptive column name is not a reason to refuse commitment.
**Subtraction target:** the `plan-component-title pattern` check (length / structural-prefix / descriptive-punctuation) in the commit guard.

**PROPERTY P-F1: Import results show file name per content unit.**
The import summary UI displays the source file name alongside each worksheet name. The file name is carried through the import pipeline from upload to the session summary. When a session contains units from multiple files, the user can identify which file each unit came from.

**PROPERTY P-F6: Calculate button removed from persistent header.**
The "Calculate" gold icon/button in the persistent top navigation bar is removed. Calculation is accessed through the Lifecycle Cockpit and Calculate & Results section, not from a persistent header element that appears on every surface.

### §3.2 — PROOF GATES

**PG-1 — Robles Ventas reimport.** After the fix, reimport one Robles Ventas CSV (RM_Ventas_2025_01.csv). entity_id_field must be `vendedor_id`, not `sucursal`. Paste the commit log showing `entity_id_field="vendedor_id"`.

**PG-2 — Robles Organigrama reimport.** Reimport RM_Organigrama_Q1_2025.xlsx. (a) Personal classifies as entity, not transaction. (b) Jerarquia commits successfully (not refused by the guard). (c) Sucursales and Factores unchanged. Paste logs for all four sheets.

**PG-3 — MIR neutrality.** MIR Ventas sheets must still select `DNI_Vendedor` as entity_id_field (not Folio). If MIR data is available in the DB, verify via grep/query. If not, verify structurally: the value-domain overlap mechanism would select DNI_Vendedor because it overlaps with the entity domain (30 sellers) while Folio is unique per row.

**PG-4 — BCL/Meridian neutrality (HALT-CALC).** BCL $312,033, Meridian $556,985 unchanged. The entity_id_field selection change does not affect committed data already in the DB — it affects new imports only. But verify calc results are unchanged.

**PG-5 — F1 file name.** The import summary response includes the source file name per content unit. Paste the response structure showing file name alongside worksheet name.

**PG-6 — F6 Calculate button.** The persistent header no longer contains the Calculate button/icon. Paste the header component code showing it's removed.

**PG-7 — Korean Test.** Zero column-name string literals in the entity_id_field selection code. Zero column-name-length heuristics in the commit guard. Paste grep results.

---

## §4 — HALT CONDITIONS

- **HALT-CALC.** BCL $312,033 or Meridian $556,985 moves. Stop.
- **HALT-COLLISION.** In-flight work on main modifies the same code surfaces. Stop.

---

## §5 — REPORTING DISCIPLINE

**Completion report:** `docs/completion-reports/HF-351_COMPLETION_REPORT.md`

Per Rules 25–28: summary, investigation evidence (§3.0), ADR, per-property evidence, proof gate results (PG-1 through PG-7), HALT conditions, ARTIFACT SYNC.

---

## §6 — OUT OF SCOPE

- F4 (client re-submission during long-running operations) — held for separate HF with additional information.
- OB-248 distribution fan-out engine — the engine is correct; this HF fixes the import layer that feeds it.
- MIR Plans 3/4 divergence — convergence-binding interpretation gap, not entity resolution.
- Theme regression (OB-234 R3) — CSS tokens.

---

## §6A — RESIDUALS

- **Progressive Performance on second Robles import:** After HF-351, the second import of the same Robles files should be Tier 1 for all cached atoms. The entity_id_field selection runs at commit time (not cached), so it will fire again — but the selection will be faster (value-domain overlap is a set comparison, not an LLM call).
- **The `__EMPTY` column naming from merged headers** is a SheetJS rendering behavior, not a platform defect. The platform must handle it gracefully (P-F2 and P-F3 address the consequences). A future enhancement could attempt to resolve actual column names from merged cells, but that is not in scope for this HF.

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*HF-351 — Import Identity Resolution: Entity-ID Selection, Classification Guard, Import UX*
*File IS the prompt. No §7. No tail summary. CC reads end-to-end and executes.*
