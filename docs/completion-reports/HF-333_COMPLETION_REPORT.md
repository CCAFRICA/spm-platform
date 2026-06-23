# HF-333 — Completion Report: Remove Consumer-Side Vocabulary Gates (OB-231 Regression)

**Date:** 2026-06-22 · **Branch:** `hf-333-vocabulary-gate-removal` · **Directive:** `docs/vp-prompts/HF-333_DIRECTIVE_20260622.md` · **Parent:** OB-231 (#583)
**HALT-SEQ:** clear — HF-333 uniquely this objective. **Phase 2 (MIR proof):** architect-executed post-merge (SR-44; clean-slate SQL + reimport + calc + reconcile).

## Defect (one root, three symptoms)
`field-identities.ts:15` — *OB-231 made `FieldIdentity.structuralType` carry the LLM's FREE-FORM `data_nature`* (`"computed measure"`, `"categorical (boolean-like status flag)"`). Three consumers still compared that free-form string to the **retired canonical vocabulary** (`'measure'`/`'attribute'`). The gates are the surviving half of the registry OB-231 removed. Fix = SUBTRACTION (Decision 158/111/AUD-009). Full inventory: `docs/hf-333/GATE_SITE_INVENTORY.md`. (Note: `convergence-service.ts` needs `grep -a` — `␟` U+241F makes grep see binary; this is why the directive's anchors first returned empty.)

## Per-gate evidence

### R1 — §2-S5 type-consistency gate — REMOVED
`convergence-service.ts:2918-2927` deleted. Was: `acceptableStructuralTypes(needed).has(colFi.structuralType)` → `match_pass:'failed'` → `role-inconsistent, needs ${needed} → gap`. `acceptableStructuralTypes('numeric')={measure,count}` never contained `"computed measure"` → every binding incomplete → HF-281 aborted all 5 MIR plans. The column-existence check (a real structural guarantee, not vocabulary) is retained. The LLM's binding proposal is now authoritative for type compatibility; a genuinely wrong binding surfaces in reconciliation.
```
$ grep -arn "role-inconsistent" web/src/lib/ --include="*.ts" | wc -l
0
```

### R2 — §2-S3 attribute admission — fixed to read free-form data_nature
`convergence-service.ts:2800`: the attribute filter changed from `c.structuralType === 'attribute'` to a Korean-clean free-form predicate `isAttributeNature(c.structuralType)` (`/\b(attribute|categor|property|tag|flag|status|class|grouping|descript|label|atributo)\b/i`). `attributes admitted=` will now list the real categorical columns (Verificado, Categoria, Zona, Cargo, …) instead of `[none]`. (Functionally, removing R1 already lets attribute requirements bind to LLM-proposed columns; R2 restores the diagnostic's accuracy + the proof gate "attributes admitted > 0".)

### R3 — entity_id_field selection — structural disambiguation (directive §4.3)
**Branch diagnosis: Branch A** — `findHcEntityIdColumn` (`commit-content-unit.ts:150`) reads `identifies` via sound `ENTITY_SCOPE`/`TXN_SCOPE`/`IDENTIFIER_NATURE` regexes, but per directive §1.3 the LLM's `identifies` did not distinguish Folio (transaction) from DNI_Vendedor (entity) — both surfaced `data_nature:"identifier"`, so the resolver fell back and picked the 1:1 Folio. Rather than alter the HC prompt (broad, untested blast radius across all tenants), I made the fix **branch-agnostic at the construction layer** (Decision 158: LLM recognizes, construction verifies): the `:370` 1:1 sanity check no longer merely warns — when the resolved id is ~1:1 (transaction-shaped) it now **prefers a repeating IDENTIFIER-nature column** (`<0.5` distinct ratio — the entity shape). DNI_Vendedor (~30 sellers / 4689 rows, `data_nature:"identifier"`) is preferred over Folio deterministically, whether or not the LLM tagged `identifies` clearly. Korean-clean (candidates from the LLM's HC interpretations + the `IDENTIFIER_NATURE` predicate, never a field name).

## Build + tests (§6.2)
```
grep -a role-inconsistent (web/src/lib) : 0
npx tsc --noEmit                        : 0 errors
npm run build                           : exit 0, ✓ Compiled successfully, 208/208 static pages
binding-completeness + convergence-authoritative tests : 18/18 pass
calculation + intelligence + sci suites               : 225/225 pass
```
No regressions — the gate removal lets *more* bindings complete; HF-281 completeness logic is unchanged (tested).

## Class closure (DD-2)
All three regressions are the one defect (consumer reads free-form structuralType against retired canonical labels). No additional vocabulary gates found checking `structuralType === '<canonical>'` beyond these (grep -a swept convergence-service + lib/sci). §6A.5 fingerprint `'unknown'` gate: not touched (out of scope; cosmetic per directive — note for a separate HF if it blocks flywheel learning).

## Phase 2 — architect (SR-44)
Clean-slate tenant 972c8eb0 → reimport 5 plans + data → calculate January 2025. Expected: 5/5 plans calculated (no HF-281 abort), `entity_id_field=DNI_Vendedor` on Ventas/Cobranza, `attributes admitted > 0`, Plan 2 grand total S/210,000. Reconcile against GT.

## PR
`gh pr create --base main --head hf-333-vocabulary-gate-removal`. Architect merges (SR-44).
