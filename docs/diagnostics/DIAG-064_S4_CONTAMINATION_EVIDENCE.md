# DIAG-064 Disposition §4 — Flywheel Contamination Check: **CONTAMINATED — HALT**

**Date:** 2026-06-12 · **Read-only** (`web/scripts/diag/diag064-flywheel-contamination-check.ts`, `diag064-morning-truth.ts`)
**Tenant:** `3d354bfa…` · **Verdict:** the voided main-vintage run did NOT touch only match statistics — it **overwrote stored classifications and fieldBindings on all 16 sheet-level fingerprints** (updated_at 22:07:40–41Z, inside the voided witness window). Per §4: HALT; repair follows the 1a fingerprint-correction precedent under a fresh architect go. No re-arm (§5 not entered).

## Scope of contamination

- **16 sheet-level fingerprint rows**: match_count 3→4, confidence 0.75→0.8000, `classification_result.classification` AND `classification_result.fieldBindings` (claimedBy) rewritten to the voided run's wrong outcomes.
- **Atom-granularity rows (56): UNTOUCHED** — all carry morning timestamps (15:18–15:19Z = 08:18 -0700). The atom store is clean.
- The morning run's separate Portada fingerprint `9aa35481eb9c` (plan@0.5, match 1, 15:21Z) is a morning-created row, untouched by the voided run.

## The delta (stored NOW vs morning truth from session d8085364's durable signals)

| Sheet | hash | stored NOW | bindings claimedBy NOW | morning truth | verdict |
|---|---|---|---|---|---|
| Empleados | 7707e8553823 | **transaction** | transaction:9 | **entity** | **CONTAMINATED** (1a MUST-be-entity violated) |
| Sucursales | 690ade75ed05 | **target** | target:8 | **entity** | CONTAMINATED |
| Menus | afb789d55ae5 | **target** | target:10 | **entity** | CONTAMINATED |
| Resumen_Sucursal | 78966ee2ad81 | **target** | target:13 | **entity** | CONTAMINATED |
| Resumen_Menu | d984b141a017 | **target** | target:12 | **entity** | CONTAMINATED |
| Resumen_Empleado | bc3da24d0055 | **target** | target:14 | **entity** | CONTAMINATED |
| Resumen_Producto | fc69dad00e10 | **transaction** | transaction:14 | **entity** | CONTAMINATED |
| Resumen_Diario | 4e920093ddd7 | **transaction** | transaction:13 | **reference** | CONTAMINATED |
| Productos_SKU | a989a5e0517c | **entity** | entity:4, unset:2 | **reference** | CONTAMINATED |
| Portada | b42ee218cb37 | **plan** | plan:2 | **reference** | CONTAMINATED |
| Menu_Componentes | ffb69592f7b7 | transaction | transaction:6 | transaction | classification matches (stats+bindings still from voided run) |
| Resumen_Mensual | 19e90c26c9d8 | transaction | transaction:13 | transaction | classification matches (") |
| Ventas_Transaccional | 97c615dedbf2 | transaction | transaction:30 | transaction | classification matches (") |
| Resumen_Categoria | 2ac20a402576 | reference | reference:11 | reference | classification matches (") |
| Resumen_DiaSemana | 9ed65e0e2326 | reference | reference:11 | reference | classification matches (") |
| Resumen_Turno | 21743cb83fc7 | reference | reference:12 | reference | classification matches (") |

**10 of 16 classifications contaminated**; all 16 rows carry the voided run's bindings/claimedBy and
inflated statistics (match_count 4 / confidence 0.8000 each include one invalid match). FP-49: jsonb
key shape pasted live before extraction — `classification_result` keys = `[tabName, confidence,
fieldBindings, classification]` (three rows verified).

Morning truth source (read from the durable spine, session `d8085364`, latest classified/bound
signal per sheet): Empleados/Sucursales/Menus/Resumen_Sucursal/Resumen_Menu/Resumen_Empleado/
Resumen_Producto = entity; Ventas_Transaccional/Menu_Componentes/Resumen_Mensual = transaction;
Portada/Productos_SKU/Resumen_Categoria/Resumen_DiaSemana/Resumen_Diario/Resumen_Turno = reference.

## Repair inputs for the architect's fresh go (no repair performed)

The 1a precedent restores per-row `classification_result.classification` (and fieldBindings, which
the 1a episode did not need to touch — here they MUST be restored or invalidated, since warm-path
Tier-1 injects them). Open question for the ruling: restore bindings from the last clean
generation (pre-22:07Z values are not retained on the row — `updated_at` overwrite, no history) vs
**reset the 16 rows' fieldBindings + demote confidence/match_count** so the next clean run re-learns
them through the normal flywheel write (self-healing, no fabricated provenance). The atom store
being intact favors re-learning: Tier-1/atom recall does not depend on the sheet rows' bindings
alone. Statistics: match_count −1 / confidence re-derived per the Bayesian update's inverse, or
reset alongside bindings.

**HALT per disposition §4.** Witness re-arm (§5) does not proceed until the repair is ruled and
applied under a fresh architect go.
