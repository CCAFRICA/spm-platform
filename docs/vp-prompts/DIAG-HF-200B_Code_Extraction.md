# DIAG-HF-200B — Comprehensive Code Extraction (CC PROMPT)

**Type:** Read-only diagnostic. Code extraction only. No fix proposals; no synthesis; no verdicts.
**Purpose:** Provide architect with verbatim code from every surface in the entity-attribute → variant-discrimination → convergence-binding flow so HF-200 fix shape can be dispositioned against actual code, not memory.
**Predecessor:** DIAG-HF-200 (verdict synthesis: H1 NEGATIVE, H2 CONFIRMED, H3 CONFIRMED).
**Branch:** `diag-hf-200b-code-extraction` from main HEAD.
**Final step:** Single committed extraction document at `docs/diagnostics/DIAG-HF-200B_Code_Extraction.md`.

## Surfaces extracted

- **Section A** — HF-190 construction layer (`web/src/app/api/import/sci/execute-bulk/route.ts:338-610`, `processEntityUnit`)
- **Section B** — HF-199 adjacent surface (`web/src/lib/sci/entity-resolution.ts:27-415`, `resolveEntitiesFromCommittedData`)
- **Section C** — OB-177 bridge (`web/src/app/api/calculation/run/route.ts:1280-1352`, materialization + filter + fallback + write)
- **Section D** — Convergence HF-114 (`web/src/lib/intelligence/convergence-service.ts:1681-1777` + boundary fallback at :1899)
- **Section E** — Empirical state (Silvia Pérez Rodríguez record + Hub samples + `period_entity_state` rows for January 2025 period)

## Architect disposition options

- **A** — Mirror HF-190 pattern at HF-199 site
- **B** — Generalize OB-177 bridge to surface metadata structurally (line 1320-1322)
- **C** — Align `effective_from` semantic across HF-190 + HF-199
- **D** — Combined A + B + C
- **E** — Defer D2 convergence binding to HF-201
- **F** — Other shape architect identifies from extracted code

## Source

Architect-issued directive 2026-05-04 (this session). Full extraction at
`docs/diagnostics/DIAG-HF-200B_Code_Extraction.md`.
