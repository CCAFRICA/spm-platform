# HF-329 — Reference-Sheet Resolution via Classified Join Path — Completion Report

**Branch:** `hf-329-reference-sheet-resolution` · **Date:** 2026-06-21
**Class:** Third Decision-158 subtraction — engine (HF-325), SCI commit (HF-328), **resolver (HF-329)**.
**Build:** `tsc --noEmit` exit 0 · `next build` exit 0 · existing calc suite 61/61 · new unit suite 6/6.

---

## 1 — Summary

The convergence resolver (`resolveColumnFromBatch`) hard-stopped (`column_in_no_batch → null`) when a
convergence-bound column lived in **no entity-keyed batch** — because it sits on a dimensional
**reference sheet** keyed by its own dimensional value (Meridian `Datos_Flota_Hub`, keyed by `Hub`).
The binding is valid, the data exists, and the join is classified: the entity's own rows carry the
dimensional key (`Hub`) that the reference sheet is keyed by. HF-329 **subtracts the hard-stop**: when
the entity has rows but none carry the column, the resolver follows the classified join by
**value-overlap** (Korean Test — no column names), and the matched reference row(s) flow through the
**existing reduction** path unchanged.

**Defect → fixed.** Meridian c4 (Utilización de Flota) was `$0` all periods; now resolves the GT values.

**Scope:** resolver only. New pure module `web/src/lib/calculation/reference-join.ts`; two small wirings
in `run/route.ts` (retain reference rows; call the join in the existing `!entityRows` branch). No engine
aggregate / HF-325 gate / `activeRowsScoped` / SCI commit / plan-interpretation / binding changes.

---

## 2 — Proof Gates

**PG-1 — CODE EVIDENCE.** `web/src/app/api/calculation/run/route.ts`, `resolveColumnFromBatch`.

BEFORE (hard-stop):
```ts
if (!entityRows) {
  // Structured failure ... distinguish "entity has rows but none carry this column" from "no rows".
  if (shouldEmitTrace(entityExternalId)) { bufferTrace(`... reason=${anyRowsForEntity ? 'column_in_no_batch' : 'no_rows'} | returned=null`); }
  return null;
}
```

AFTER (follow the classified reference-join, then the same graceful null):
```ts
if (!entityRows) {
  // HF-329 (SUBTRACTION of the hard-stop): the column lives in a dimensional REFERENCE sheet reachable
  // by a classified join — the entity's own rows carry the dimensional key it is keyed by. Follow it via
  // value-overlap (Korean Test). The matched reference row(s) become the entity's rows for the reduction.
  if (anyRowsForEntity && firstNonEmptyRows) {
    const joined = resolveReferenceJoinRows(column, firstNonEmptyRows, referenceRows);
    if (joined && joined.length > 0) {
      entityRows = joined;
      if (shouldEmitTrace(entityExternalId)) { bufferTrace(`... HF-329 reference-join ... path=entity→value-overlap-key→reference-row`); }
    }
  }
}
if (!entityRows) {
  // Graceful fallback (C6): no entity-keyed batch AND no classified join → the same null as before.
  ...
  return null;
}
```

The join discovery (`reference-join.ts`) is **value-overlap, not column names**: it builds the set of
the entity's own values, then among the reference columns whose values overlap an entity value picks the
**most specific** (fewest matched rows, then highest cardinality) — a one-row-per-hub key beats a
coarse region key. `reference_key` columns are never matched by name; only by value membership. The
retained reference rows are populated where dimensional rows fail to key into `dataByBatch`:
```ts
} else {
  // HF-329: no entity-key value on this row — a dimensional reference-sheet row. Retain for the join.
  referenceRows.push(rd);
}
```

**PG-2 — SPATIAL AUDIT.** Every "column not found in entity batches" termination in the resolver:

| Site | Role | HF-329 |
|---|---|---|
| `resolveColumnFromBatch` `column_in_no_batch` (route.ts:1744) | **THE value-resolution hard-stop** | **Now preceded by the reference-join fallback (route.ts:1722); the null at 1746 is C6 graceful fallback** |
| `collectAttribRowsForColumn` `if (!entityRows) return null` (route.ts:1846) | per-row **attribution** counterpart (OB-217), used **only** for `reduction='sum'` SR-38 self-validation traces | **Unchanged** — not the value path; unreachable for the reference-join components (c4 is `snapshot`, not `sum`). A dimensional snapshot value is not additively decomposed per-row, so attribution does not apply. Modifying it would risk the SR-38 gate (C4). |
| `resolveMetricsFromConvergenceBindings` via-join unresolved (route.ts:1514), gate/empty returns (1566/1569/1633) | binding-shape gates, not "column in no batch" | Unrelated; unchanged. |

Single value-resolution termination; it now follows the classified join. No orphaned heuristic paths.

**PG-3 — MERIDIAN CLEAN-SLATE RECALC JAN 2025** (real calc via `POST /api/calculation/run`):

```
##### January 2025 | grandTotal=$185,063 | entities=67 #####
  c0 "Rendimiento de Ingreso" = $44,000
  c1 "Entrega a Tiempo"       = $15,550
  c2 "Cuentas Nuevas"         = $69,900
  c3 "Registro de Seguridad"  = $20,700
  c4 "Utilización de Flota"   = $34,913      ← was $0
```

**c4 is non-zero.** Forensic trace (one entity, the classified reference-sheet path):
```
[CalcTrace] HF-329 reference-join entity=70024 | column=Cargas_Totales | refRowsMatched=1 | path=entity→value-overlap-key→reference-row
[CalcTrace] resolveColumnFromBatch:exit entity=70024 | column=Cargas_Totales | reduction=snapshot | rowCount=1 | perRowValues=[1083] | result=1083 | found=true | returned=1083
[CalcTrace] resolveMetricsFromConvergenceBindings:prime_dag_field entity=70024 componentIdx=4 | field=cargas_totales_hub | column=Cargas_Totales | raw=1083
[CalcTrace] HF-329 reference-join entity=70024 | column=Capacidad_Total | refRowsMatched=1 | ... | result=1306
```
Entity `70024` carries `Hub="Monterrey Hub"`; the join matches the single `Datos_Flota_Hub` row for that
hub (period already source_date-scoped) and reads `Cargas_Totales=1083`, `Capacidad_Total=1306` via the
existing `snapshot` reduction. Log also confirms `HF-329 Reference rows retained for cross-sheet join: 12`.

**PG-4 — c0-c3 NON-REGRESSION (all three periods, exact):**

| Period | c0 | c1 | c2 | c3 | c4 | grand |
|---|---|---|---|---|---|---|
| Jan | 44,000 | 15,550 | 69,900 | 20,700 | **34,913** | **185,063** |
| Feb | 40,950 | 14,100 | 64,700 | 20,700 | **35,135** | **175,585** |
| Mar | 48,900 | 18,450 | 68,500 | 24,200 | **36,287** | **196,337** |

c0-c3 byte-identical to the baseline (HALT-4 clear). c4 Q1 = $106,335; grand Q1 = $556,985.

**PG-5 — BCL NON-REGRESSION.** BCL has no reference sheets — `HF-329 Reference rows retained: 0`, the
join never fires. Two periods verified unchanged (Oct grand=$44,590 c0-c3=17990/10170/8480/7950; Nov
grand=$46,291). No c4 exists for BCL. (C6/PG-5.)

**PG-6 — GRACEFUL FALLBACK (unit, `reference-join.test.ts`, 6/6 pass):** bound column in the reference
batch but the entity carries no value-overlapping key → `null` (identical to pre-HF-329). Plus: no
reference data → null; reference rows lacking the column → null; most-specific join wins (Hub over
Region); and a Korean-Test case where the entity's and reference's key columns have **different opaque
names** but the same value — the join resolves by value, not name.

**PG-7 — BUILD.** `tsc --noEmit` exit 0 · `next build` exit 0 · existing `src/lib/calculation/__tests__`
suite **61/61** · new `reference-join.test.ts` **6/6**.

---

## 3 — HALT conditions

| ID | Status |
|---|---|
| HALT-1 (column-name matching for join key) | **Clear.** Join key discovered by value-overlap only; unit test proves it across differently-named columns. |
| HALT-2 (engine aggregate / HF-325 gate / activeRowsScoped) | **Clear.** None touched; filters/reduction path reused unchanged; HF-325 suite green. |
| HALT-3 (SCI commit / entity_id_field) | **Clear.** Untouched. |
| HALT-4 (Meridian c0-c3 change) | **Clear.** c0-c3 exact across all three periods. |
| HALT-5 (LLM candidate filtering / binding restriction) | **Clear.** No LLM/binding change; the construction layer follows what comprehension already classified. |

---

## 4 — Notes / residuals (§6A)

- **Period scoping** is applied upstream: `committedData` is fetched `source_date`-scoped to the calc
  period, so the retained reference rows are the period's rows by construction (Meridian `Datos_Flota_Hub`
  carries `source_date`). The join needs no extra temporal filter for this shape. A period-**agnostic**
  reference sheet (no `source_date`, all months in `committedData`) would need explicit temporal matching
  — documented as the §6A residual; not the Meridian shape.
- **Many-to-one assumption** (each entity → one dimensional row per period) holds for Meridian
  (one hub per coordinator). Many-to-many (an entity across multiple hubs) is out of scope (§6A).
- **Architect channel (§6A):** the post-merge clean-slate Meridian 3-period recalc reconciliation against
  Q1 GT $556,985 is the architect's step; CC's in-repo recalc above already lands every component on GT.
