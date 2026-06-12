# DIAG-064 §4 — Flywheel Contamination REPAIR Output (architect-ruled)

**Date:** 2026-06-12 · **Ruling:** `docs/vp-prompts/OB-203_PHASE-6B_CONTAMINATION_REPAIR_RULING_20260612.md` (ea3275d2)
**Script:** `web/scripts/diag/diag064-flywheel-repair.ts` (committed beside this file) — run from the witness worktree, service-role.
**Scope guard held:** exactly 16 voided-window sheet rows selected (`updated_at >= 2026-06-12T22:00Z` AND `classification_result.tabName` present); truth map derived live from session `d8085364`'s durable signals (the cited provenance — never hardcoded); any mismatch would have aborted with zero writes.

## Repair output (verbatim)

```
morning truth map (session d8085364): 16 sheets
d984b141a017 Resumen_Menu           cls target      -> entity      [RESTORE] bindings -> [] stats 4/0.8000 -> 3/0.75
afb789d55ae5 Menus                  cls target      -> entity      [RESTORE] ...
2ac20a402576 Resumen_Categoria      cls reference   -> reference   [kept   ] ...
4e920093ddd7 Resumen_Diario         cls transaction -> reference   [RESTORE] ...
97c615dedbf2 Ventas_Transaccional   cls transaction -> transaction [kept   ] ...
b42ee218cb37 Portada                cls plan        -> reference   [RESTORE] ...
78966ee2ad81 Resumen_Sucursal       cls target      -> entity      [RESTORE] ...
bc3da24d0055 Resumen_Empleado       cls target      -> entity      [RESTORE] ...
a989a5e0517c Productos_SKU          cls entity      -> reference   [RESTORE] ...
21743cb83fc7 Resumen_Turno          cls reference   -> reference   [kept   ] ...
19e90c26c9d8 Resumen_Mensual        cls transaction -> transaction [kept   ] ...
ffb69592f7b7 Menu_Componentes       cls transaction -> transaction [kept   ] ...
9ed65e0e2326 Resumen_DiaSemana      cls reference   -> reference   [kept   ] ...
7707e8553823 Empleados              cls transaction -> entity      [RESTORE] ...
fc69dad00e10 Resumen_Producto       cls transaction -> entity      [RESTORE] ...
690ade75ed05 Sucursales             cls target      -> entity      [RESTORE] ...
repair complete: 10 restored, 6 kept (classification already true), 16/16 bindings reset, 16/16 stats demoted.
```
(every row: bindings -> [], stats 4/0.8000 -> 3/0.75; elided above for width only)

## Verification gate — verbatim §4 re-read, ALL 16 rows (PASS)

```
hash         | match | conf   | classification | sheet                  | claimedBy summary
9ed65e0e2326 |     3 | 0.7500 | reference      | Resumen_DiaSemana      | 0 bindings []
78966ee2ad81 |     3 | 0.7500 | entity         | Resumen_Sucursal       | 0 bindings []
7707e8553823 |     3 | 0.7500 | entity         | Empleados              | 0 bindings []
b42ee218cb37 |     3 | 0.7500 | reference      | Portada                | 0 bindings []
4e920093ddd7 |     3 | 0.7500 | reference      | Resumen_Diario         | 0 bindings []
97c615dedbf2 |     3 | 0.7500 | transaction    | Ventas_Transaccional   | 0 bindings []
2ac20a402576 |     3 | 0.7500 | reference      | Resumen_Categoria      | 0 bindings []
19e90c26c9d8 |     3 | 0.7500 | transaction    | Resumen_Mensual        | 0 bindings []
d984b141a017 |     3 | 0.7500 | entity         | Resumen_Menu           | 0 bindings []
ffb69592f7b7 |     3 | 0.7500 | transaction    | Menu_Componentes       | 0 bindings []
21743cb83fc7 |     3 | 0.7500 | reference      | Resumen_Turno          | 0 bindings []
bc3da24d0055 |     3 | 0.7500 | entity         | Resumen_Empleado       | 0 bindings []
fc69dad00e10 |     3 | 0.7500 | entity         | Resumen_Producto       | 0 bindings []
afb789d55ae5 |     3 | 0.7500 | entity         | Menus                  | 0 bindings []
a989a5e0517c |     3 | 0.7500 | reference      | Productos_SKU          | 0 bindings []
690ade75ed05 |     3 | 0.7500 | entity         | Sucursales             | 0 bindings []
--- §4 decisive checks ---
Empleados 7707e8553823: classification=entity match_count=3 confidence=0.75
PASS  Empleados stored classification remains entity (1a correction intact)
```
Every row matches the morning truth map; bindings reset; statistics 3 / 0.75. The morning-created
Portada row `9aa35481eb9c` (plan@0.5, match 1) and the 56 atom rows are untouched (morning
timestamps). No other fingerprint, atom, signal, or committed_data row was written.

## Residue (named, not touched)

`classification_result.confidence` (the INNER jsonb key, e.g. 85) retains the voided run's value on
all 16 rows — the ruling names classifications, bindings, and the statistics COLUMNS; the inner key
was not named and was not touched (no manual nudging beyond the mandate). It is display provenance
only; no read path adjudicates on it. Flagged for the architect's awareness.

## §3 witness criterion note

Bindings were reset by design — the re-armed witness expects bindings RE-LEARNED through the normal
flywheel write during the run, visible in telemetry; injection counts may be partial/zero,
attributable to this documented reset and nothing else.

---

# ADDENDUM — Inner `classification_result.confidence` restored (architect addendum ruling, 9341ce73)

**Script:** `web/scripts/diag/diag064-flywheel-repair-addendum.ts` · same scope guard (exactly 16
voided-window rows or abort), same provenance (session `d8085364` durable signals, per-sheet
confidence derived live). Only the inner `confidence` key written; no other key, row, or surface.

## Pre-write paste (FP-49): the voided values, all 16

The contamination is legible in the values themselves — the flat `0.85`s are the voided run's
HC-pattern @85 outcomes; e.g. Empleados inner was `0.7809` (voided transaction@78) → morning `0.95`:

```
d984b141a017 Resumen_Menu      0.85   -> 0.6066 | afb789d55ae5 Menus            0.85   -> 0.6096
2ac20a402576 Resumen_Categoria 0.8123 -> 0.95   | 4e920093ddd7 Resumen_Diario   0.3554 -> 0.6903
b42ee218cb37 Portada           0.8104 -> 0.5812 | 78966ee2ad81 Resumen_Sucursal 0.85   -> 0.6332
bc3da24d0055 Resumen_Empleado  0.85   -> 0.644  | a989a5e0517c Productos_SKU    0.2745 -> 0.557
21743cb83fc7 Resumen_Turno     0.7656 -> 0.95   | 19e90c26c9d8 Resumen_Mensual  0.85   -> 0.7295
ffb69592f7b7 Menu_Componentes  0.85   -> 0.7615 | 9ed65e0e2326 Resumen_DiaSemana 0.7712 -> 0.95
7707e8553823 Empleados         0.7809 -> 0.95   | fc69dad00e10 Resumen_Producto 0.3026 -> 0.6202
690ade75ed05 Sucursales        0.7412 -> 0.5998 | 97c615dedbf2 Ventas_Transacc. 0.8200 -> 0.95
```

## Verification re-read — ALL 16 rows, every verified field (GATE PASS)

```
hash         | stats    | inner  | classification | bindings | sheet
d984b141a017 | 3/0.7500 | 0.6066 | entity         | 0        | Resumen_Menu          OK
afb789d55ae5 | 3/0.7500 | 0.6096 | entity         | 0        | Menus                 OK
2ac20a402576 | 3/0.7500 | 0.95   | reference      | 0        | Resumen_Categoria     OK
4e920093ddd7 | 3/0.7500 | 0.6903 | reference      | 0        | Resumen_Diario        OK
b42ee218cb37 | 3/0.7500 | 0.5812 | reference      | 0        | Portada               OK
78966ee2ad81 | 3/0.7500 | 0.6332 | entity         | 0        | Resumen_Sucursal      OK
bc3da24d0055 | 3/0.7500 | 0.644  | entity         | 0        | Resumen_Empleado      OK
a989a5e0517c | 3/0.7500 | 0.557  | reference      | 0        | Productos_SKU         OK
21743cb83fc7 | 3/0.7500 | 0.95   | reference      | 0        | Resumen_Turno         OK
19e90c26c9d8 | 3/0.7500 | 0.7295 | transaction    | 0        | Resumen_Mensual       OK
ffb69592f7b7 | 3/0.7500 | 0.7615 | transaction    | 0        | Menu_Componentes      OK
9ed65e0e2326 | 3/0.7500 | 0.95   | reference      | 0        | Resumen_DiaSemana     OK
7707e8553823 | 3/0.7500 | 0.95   | entity         | 0        | Empleados             OK
fc69dad00e10 | 3/0.7500 | 0.6202 | entity         | 0        | Resumen_Producto      OK
690ade75ed05 | 3/0.7500 | 0.5998 | entity         | 0        | Sucursales            OK
97c615dedbf2 | 3/0.7500 | 0.95   | transaction    | 0        | Ventas_Transaccional  OK
GATE PASS: all 16 rows match the morning truth map on every verified field.
```

No residue remains on the 16 rows. Atom store and morning Portada row untouched throughout.
