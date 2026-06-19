# OB-216 Phase 4 — EPG-4 Evidence (per-sheet entity key + route.ts threshold fold-ins)

**Branch:** `ob-216-convergence-unified-path` · `npm run build` exit 0 · `tsc` exit 0 · **BOTH scans GREEN** ("NO-DEV-NUMBERS GATE: clean").
One touch of `run/route.ts`, three things (Rule 34).

## §4.1 Per-sheet entity key (general-by-construction)
Replaced the global `entityCol = knownEntityCols[0]` (one column for ALL batches) with a **per-batch** key: each batch is keyed by the column whose VALUES most overlap the assigned-entity external_ids (argmax membership — HF-303 relative selection; the only bare number is the structural floor 0). Generalises the prior primary+secondary keying into one per-sheet mechanism.
```
OB-216 Phase 4: per-sheet entity key — 5/5 batch(es) keyed by their own value-overlap column;
  the rest fall back to the binding entity_identifier (DNI_Vendedor)
```
- **Heterogeneous-identifier tenant served BY CONSTRUCTION:** each sheet resolves to its own entity column (value-overlap), so a tenant whose sheets carry different identifiers keys each correctly — MIR cannot demonstrate this (uniform `DNI_Vendedor`), but the code keys per-batch, not globally.
- **MIR keying preserved (no regression):** all 5 January batches keyed by `DNI_Vendedor` (the value-overlap winner on every sheet). Plan 3 = 34 entities, **30 non-zero** — identical to EPG-3′.

## §B carry-forward — scope override confirmed (the `activeRows` default does NOT break scoped plans)
- **Plan 3 (UNSCOPED aggregate):** `activeRows` defaults to the entity's own rows → `sum(Monto_Cobrado)` works → 30/34 non-zero.
- **Plan 4 (SCOPED — `scope(boundary: DNI_Vendedor, downstream: count(Verificado))`):** HTTP 200, **34/34 non-zero** — the `scope` prime still OVERRIDES `activeRows` to its scoped rows and the count fires. Both behaviors coexist: unscoped → own rows; scoped → scope's rows.

## §4.2 Fold-in `run/route.ts:730` (`matchRate >= 0.8`) → argmax + structural floor 0
Entity-id-field discovery now picks the field by **argmax value-overlap** with the entity external_ids over the sample (the field whose values most match), accepting any field with overlap > 0 (the structural floor), instead of the FIRST field to clear a developer cutoff. Decision 110; Korean Test (value-overlap, not field name).

## §4.3 Fold-in `run/route.ts:2734` (payout-equality epsilon) → RATIFIED
```ts
... Math.abs(componentResults[ci].payout - (priorResults[ci] ?? 0)) < 0.01; // RATIFIED: numerical-precision epsilon for payout equality, not an authority threshold (Decision 110)
```
Classified as a numerical-precision TOLERANCE (dual-path payout concordance within a cent), retained with annotation — not an authority value.

## Scan closure (Rule-34)
```
$ bash scripts/no-developer-numbers-scan.sh
NO-DEV-NUMBERS GATE: clean.
```
**Both** `convergence-service.ts` and `run/route.ts` are threshold-free (every developer threshold eliminated or explicitly ratified). This is the Rule-34 closure for the files OB-216 touched.

## §GC generality
- **(a) Class:** any tenant with heterogeneous sheet identifiers (per-sheet key) + any data distribution (argmax discovery). **(b) Keyed on:** per-batch value-overlap argmax (structural, relative), not a global column or a cutoff. **(c) Anti-patterns absent:** no column-name literal; no developer threshold (floor 0 only); MIR not special-cased (it falls out as the uniform-key instance).

**Architect reconciles per-entity values vs ground truth (SR-44); BCL no-regression is architect-verified at SR-44, not CC-verified (headless BCL harness hit a stale period id).**

*OB-216 Phase 4 / EPG-4 · 2026-06-18 · vialuce.ai*
