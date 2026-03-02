# OB-141 COMPLETION REPORT: PLATFORM RESTORATION

**Date:** 2026-03-02
**Status:** INCOMPLETE — Phases 1-5 executed, Phase 6 NOT started
**Branch:** dev
**Verdict:** Data cleanup was TOO CONSERVATIVE. Entity count, committed_data count, and period count are all far above expected baselines. Benchmark cannot be restored until deeper cleanup is performed.

---

## RAW TERMINAL OUTPUT

### Phase 1: Rule Set Swap

```
$ cd web && set -a && source .env.local && set +a && npx tsx scripts/ob141-phase1-ruleset-swap.ts 2>&1

=== PRE-SWAP STATE ===
┌─────────┬────────────────────────────────────────┬──────────────────────────────────────────┬────────────┐
│ (index) │ id                                     │ name                                     │ status     │
├─────────┼────────────────────────────────────────┼──────────────────────────────────────────┼────────────┤
│ 0       │ 'b1b2c3d4-e5f6-7890-abcd-ef1234567890' │ 'Plan de Comisiones Optica Luminar 2026' │ 'active'   │
│ 1       │ '7657fc95-6dcf-4340-8745-d0ba71ffe88e' │ 'Imported Plan'                          │ 'archived' │
└─────────┴────────────────────────────────────────┴──────────────────────────────────────────┴────────────┘

=== POST-SWAP STATE ===
┌─────────┬────────────────────────────────────────┬──────────────────────────────────────────┬────────────┐
│ (index) │ id                                     │ name                                     │ status     │
├─────────┼────────────────────────────────────────┼──────────────────────────────────────────┼────────────┤
│ 0       │ 'b1b2c3d4-e5f6-7890-abcd-ef1234567890' │ 'Plan de Comisiones Optica Luminar 2026' │ 'active'   │
│ 1       │ '7657fc95-6dcf-4340-8745-d0ba71ffe88e' │ 'Imported Plan'                          │ 'archived' │
└─────────┴────────────────────────────────────────┴──────────────────────────────────────────┴────────────┘

Original "Plan de Comisiones Optica Luminar 2026": active PASS
Imported "Imported Plan": archived PASS
```

**Phase 1 assessment:** PASS. Original plan active, imported plan archived. Already in correct state from initial Phase 1 run.

---

### Phase 2: Clean Entities

```
$ cd web && set -a && source .env.local && set +a && npx tsx scripts/ob141-phase2-clean-entities.ts 2>&1

Entities BEFORE cleanup: 22233
Entities WITH committed_data: 22215
Total entity IDs: 22233
Orphaned entities (no committed_data): 18
Entities to KEEP: 22215
  Deleted 18 of 18 orphaned entities

Entities AFTER cleanup: 22215
Deleted: 18

Current assignments to original plan: 22215
Already assigned to original: 22215
Need new assignments: 0
Created 0 new assignments

Final assignments to original plan: 22215
```

**Phase 2 assessment:** FAIL — TOO CONSERVATIVE.
- Script only deleted entities with ZERO committed_data rows (18 orphaned entities).
- 22,215 SCI-imported entities remain because they DO have committed_data rows linked to them.
- The original Alpha benchmark used 719 entities. The current 22,215 is 30x over target.
- The script's logic ("only delete orphans") was wrong for this restoration goal.

---

### Phase 3: Clean Committed Data

```
$ cd web && set -a && source .env.local && set +a && npx tsx scripts/ob141-phase3-clean-committed-data.ts 2>&1

Committed data BEFORE cleanup: 238276

=== BATCH ANALYSIS ===
  05c3de88-647b-4767-a752-9b8b62df8440: 156145 rows (100% with period, 80% with entity)
    data_types: Datos Colaborador, Base_Venta_Tienda, Base_Clientes_Nuevos, Base_Club_Proteccion, Base_Garantia_Extendida, Base_Cobranza, Base_Venta_Individual
  46837ff1-04a6-4387-bf8d-1d9595ce5691: 82131 rows (100% with period, 91% with entity)
    data_types: Base_Club_Proteccion, Base_Garantia_Extendida, Base_Venta_Tienda, Base_Cobranza, Base_Venta_Individual, Datos Colaborador

Batches to KEEP: 2
  KEEP 05c3de88-647b-4767-a752-9b8b62df8440: 156145 rows
  KEEP 46837ff1-04a6-4387-bf8d-1d9595ce5691: 82131 rows
  Total KEEP rows: 238276

Batches to DELETE: 0
  Total DELETE rows: 0

Committed data AFTER cleanup: 238276
Deleted: 0
Expected remaining: 238276

Remaining data by type:
┌─────────┬───────────────────────────────────────┬────────┐
│ (index) │ data_type                             │ count  │
├─────────┼───────────────────────────────────────┼────────┤
│ 0       │ 'Base_Club_Proteccion'                │ 112474 │
│ 1       │ 'Base_Garantia_Extendida'             │ 69904  │
│ 2       │ 'Base_Venta_Tienda'                   │ 24892  │
│ 3       │ 'Base_Cobranza'                       │ 10742  │
│ 4       │ 'Base_Clientes_Nuevos'                │ 10696  │
│ 5       │ 'Base_Venta_Individual'               │ 5236   │
│ 6       │ 'Datos Colaborador'                   │ 4314   │
│ 7       │ 'individual_metrics'                  │ 12     │
│ 8       │ 'store_metrics'                       │ 6      │
└─────────┴───────────────────────────────────────┴────────┘
```

**Phase 3 assessment:** NO-OP on re-run. The 34 duplicate batches were already deleted in the first run. However, the 2 remaining batches (238,276 rows) are likely bloated — they contain data for all 22,215 SCI entities across 7 periods, not just the 719 entities that the Alpha benchmark needs.

---

### Phase 4: Clean Periods

```
$ cd web && set -a && source .env.local && set +a && npx tsx scripts/ob141-phase4-clean-periods.ts 2>&1

=== ALL PERIODS ===
┌─────────┬────────────────────────────────────────┬───────────────┬─────────────────┬──────────────┬──────────────┬────────┬────────────────────────────────────┐
│ (index) │ id                                     │ canonical_key │ label           │ start_date   │ end_date     │ status │ created_at                         │
├─────────┼────────────────────────────────────────┼───────────────┼─────────────────┼──────────────┼──────────────┼────────┼────────────────────────────────────┤
│ 0       │ '76f31af2-5d64-4d19-b4fd-e15ded420d14' │ '2024-01'     │ 'January 2024'  │ '2024-01-01' │ '2024-01-31' │ 'open' │ '2026-02-23T13:59:38.267708+00:00' │
│ 1       │ 'ad4d0399-5c3f-4bce-867a-16e33193414b' │ '2024-02'     │ 'February 2024' │ '2024-02-01' │ '2024-02-29' │ 'open' │ '2026-02-23T13:59:38.267708+00:00' │
│ 2       │ '16d124d1-f86d-441f-8928-e12846fcab5a' │ '2024-03'     │ 'March 2024'    │ '2024-03-01' │ '2024-03-31' │ 'open' │ '2026-02-23T13:59:38.267708+00:00' │
│ 3       │ '4f6a54ee-2222-4229-8e47-ef5b52d369da' │ '2024-04'     │ 'April 2024'    │ '2024-04-01' │ '2024-04-30' │ 'open' │ '2026-02-23T13:59:38.267708+00:00' │
│ 4       │ '59ecd095-b8b7-4e6f-aecc-8eb3528cbd31' │ '2024-05'     │ 'May 2024'      │ '2024-05-01' │ '2024-05-31' │ 'open' │ '2026-02-23T13:59:38.267708+00:00' │
│ 5       │ 'c7ab8d34-8c46-44a7-8434-9b942f59a5d4' │ '2024-06'     │ 'June 2024'     │ '2024-06-01' │ '2024-06-30' │ 'open' │ '2026-02-23T13:59:38.267708+00:00' │
│ 6       │ '6e629744-d454-4da1-91ee-4d6c348e398e' │ '2024-07'     │ 'July 2024'     │ '2024-07-01' │ '2024-07-31' │ 'open' │ '2026-02-23T13:59:38.267708+00:00' │
│ 7       │ 'c1b2c3d4-e5f6-7890-abcd-ef1234567890' │ '2026-02'     │ 'Febrero 2026'  │ '2026-02-01' │ '2026-02-28' │ 'open' │ '2026-02-15T21:58:51.268442+00:00' │
└─────────┴────────────────────────────────────────┴───────────────┴─────────────────┴──────────────┴──────────────┴────────┴────────────────────────────────────┘
  January 2024 (2024-01): 74018 cd rows, 719 calc results -> KEEP
  February 2024 (2024-02): 74862 cd rows, 719 calc results -> KEEP
  March 2024 (2024-03): 75154 cd rows, 0 calc results -> KEEP
  April 2024 (2024-04): 3556 cd rows, 0 calc results -> KEEP
  May 2024 (2024-05): 3556 cd rows, 0 calc results -> KEEP
  June 2024 (2024-06): 3556 cd rows, 0 calc results -> KEEP
  July 2024 (2024-07): 3556 cd rows, 0 calc results -> KEEP
  Febrero 2026 (2026-02): 18 cd rows, 22215 calc results -> KEEP

Periods to KEEP: 8
Periods to DELETE: 0

=== REMAINING PERIODS ===
┌─────────┬────────────────────────────────────────┬───────────────┬─────────────────┬──────────────┬──────────────┐
│ (index) │ id                                     │ canonical_key │ label           │ start_date   │ end_date     │
├─────────┼────────────────────────────────────────┼───────────────┼─────────────────┼──────────────┼──────────────┤
│ 0       │ '76f31af2-5d64-4d19-b4fd-e15ded420d14' │ '2024-01'     │ 'January 2024'  │ '2024-01-01' │ '2024-01-31' │
│ 1       │ 'ad4d0399-5c3f-4bce-867a-16e33193414b' │ '2024-02'     │ 'February 2024' │ '2024-02-01' │ '2024-02-29' │
│ 2       │ '16d124d1-f86d-441f-8928-e12846fcab5a' │ '2024-03'     │ 'March 2024'    │ '2024-03-01' │ '2024-03-31' │
│ 3       │ '4f6a54ee-2222-4229-8e47-ef5b52d369da' │ '2024-04'     │ 'April 2024'    │ '2024-04-01' │ '2024-04-30' │
│ 4       │ '59ecd095-b8b7-4e6f-aecc-8eb3528cbd31' │ '2024-05'     │ 'May 2024'      │ '2024-05-01' │ '2024-05-31' │
│ 5       │ 'c7ab8d34-8c46-44a7-8434-9b942f59a5d4' │ '2024-06'     │ 'June 2024'     │ '2024-06-01' │ '2024-06-30' │
│ 6       │ '6e629744-d454-4da1-91ee-4d6c348e398e' │ '2024-07'     │ 'July 2024'     │ '2024-07-01' │ '2024-07-31' │
│ 7       │ 'c1b2c3d4-e5f6-7890-abcd-ef1234567890' │ '2026-02'     │ 'Febrero 2026'  │ '2026-02-01' │ '2026-02-28' │
└─────────┴────────────────────────────────────────┴───────────────┴─────────────────┴──────────────┴──────────────┘
```

**Phase 4 assessment:** NO-OP. Every period has committed_data rows, so the script's "delete only empty periods" logic deleted nothing. The 5 extra periods (Apr-Jul 2024 + Feb 2026 seed) remain because they have SCI-imported data linked to them.

---

### Phase 5: Benchmark Verification

```
$ cd web && set -a && source .env.local && set +a && npx tsx scripts/ob141-phase5-verify-benchmark.ts 2>&1

============================================================
OB-141 PHASE 5: ALPHA BENCHMARK VERIFICATION
============================================================

=== PRE-CONDITIONS ===
Entities: 22233
Active rule set: Plan de Comisiones Optica Luminar 2026 (b1b2c3d4-e5f6-7890-abcd-ef1234567890)
Is original: YES
Assignments to original plan: 22233
Committed data rows: 238276
Periods: 8
  January 2024 (2024-01)
  February 2024 (2024-02)
  March 2024 (2024-03)
  April 2024 (2024-04)
  May 2024 (2024-05)
  June 2024 (2024-06)
  July 2024 (2024-07)
  Febrero 2026 (2026-02)

=== ALL CALCULATION BATCHES ===
  aa6efcec-... | January 2024  | IMPORTED | 719 entities  | MX$524,500           | PREVIEW
  582041b6-... | Febrero 2026  | IMPORTED | 22215 entities| MX$NaN               | PREVIEW
  e733a98b-... | February 2024 | IMPORTED | 719 entities  | MX$525,000           | DRAFT
  ab0a7141-... | February 2024 | IMPORTED | 719 entities  | MX$525,000           | DRAFT
  6e9f15ce-... | February 2024 | IMPORTED | 719 entities  | MX$4,191,451,846.96  | DRAFT
  ea514d43-... | February 2024 | IMPORTED | 719 entities  | MX$NaN               | DRAFT
  1d4baeb1-... | January 2024  | IMPORTED | 719 entities  | MX$NaN               | PREVIEW
  e1b2c3d4-... | Febrero 2026  | ORIGINAL | 12 entities   | MX$42,850            | PUBLISHED

Batches with ORIGINAL rule set: 1 (seed batch only — 12 entities, MX$20,662)

============================================================
ALPHA BENCHMARK VERIFICATION
============================================================
Entities:  12 (expected 719)
Total:     MX$20,662 (expected MX$1,253,832, delta: MX$1,233,170)
Components: 1 (expected 6)
Verdict:   BENCHMARK NOT YET RESTORED
============================================================
```

---

## EVIDENCE-BACKED ANSWERS

### Q1: How many entities exist RIGHT NOW?

**Answer: 22,215**

Phase 2 re-run shows: "Entities BEFORE cleanup: 22233" → deleted 18 orphans → "Entities AFTER cleanup: 22215".

**Why not ~22 seed entities?** The Phase 2 script was designed WRONG. It only deleted entities with zero committed_data rows (18 orphaned entities). The other 22,215 entities are SCI-imported entities that DO have committed_data rows linked to them, so the script's "orphan-only" logic kept them all.

The original approach should have been: identify the ~719 entities that participated in the Alpha benchmark (from the seed batch calculation_results), keep those, and delete the rest. Instead, the script preserved every entity that had any committed_data — which is virtually all of them.

### Q2: How many committed_data rows exist RIGHT NOW?

**Answer: 238,276**

Phase 3 re-run shows: "Committed data BEFORE cleanup: 238276", "Batches to DELETE: 0", "Committed data AFTER cleanup: 238276". Zero deletions on re-run because the 34 duplicate batches were already deleted in the first run.

**Why not ~65K-120K?** Two batches remain:
- `05c3de88`: 156,145 rows (7 data_types, 80% with entity linkage)
- `46837ff1`: 82,131 rows (6 data_types, 91% with entity linkage)

These batches contain data for ALL 22,215 SCI entities across ALL 7 SCI-created periods. The script's logic was "keep batches with period_id linkages" — both batches have 100% period linkage, so both were kept in full. The script did not filter rows within batches to only keep data for the ~719 benchmark entities.

### Q3: How many periods exist RIGHT NOW?

**Answer: 8**

Phase 4 re-run shows all 8 periods with data:
- Jan 2024: 74,018 cd rows, 719 calc results
- Feb 2024: 74,862 cd rows, 719 calc results
- Mar 2024: 75,154 cd rows, 0 calc results
- Apr 2024: 3,556 cd rows, 0 calc results
- May 2024: 3,556 cd rows, 0 calc results
- Jun 2024: 3,556 cd rows, 0 calc results
- Jul 2024: 3,556 cd rows, 0 calc results
- Feb 2026 (seed): 18 cd rows, 22,215 calc results

**Why not ~3?** The Alpha benchmark only used Jan 2024. The 7 SCI-created periods (Jan-Jul 2024) all have committed_data because the SCI import created data across all those months. The script's logic was "delete periods with zero data" — every period has data, so nothing was deleted.

The Feb 2026 seed period has 22,215 calc results from a previous (wrong) calculation using the imported plan against all SCI entities. Those stale calculation_results are keeping the period alive.

### Q4: Did any Phase 2/3/4 deletions fail?

**Phase 2:** No errors. Deleted 18 of 18 orphaned entities successfully. But the deletion scope was wrong — should have been ~21,500 entities, not 18.

**Phase 3:** No errors. Deleted 0 rows on re-run (34 batches / 182,021 rows were already deleted in the first run). No failures.

**Phase 4:** No errors. Deleted 0 periods. No failures — but should have deleted periods with only stale SCI data.

---

## SUMMARY OF WHAT WENT WRONG

The cleanup scripts were all too conservative. Each script used a "safe minimum" deletion strategy:

| Phase | Strategy Used | Should Have Been |
|-------|--------------|-----------------|
| Phase 2 | Delete entities with 0 committed_data | Delete entities NOT in the Alpha benchmark (~719 entity set) |
| Phase 3 | Delete batches with 0 period linkage | Delete rows for entities NOT in the ~719 set, or delete entire excess batches |
| Phase 4 | Delete periods with 0 data | Delete periods not used by the Alpha benchmark (keep Jan 2024 + Feb 2026 seed) |

The root problem: I incorrectly assumed that ALL SCI entities and their committed_data were needed for the benchmark. In reality, the Alpha benchmark used exactly 719 entities. The other ~21,500 entities are SCI import bloat that should be removed.

## CURRENT DATABASE STATE

| Metric | Current | Alpha Benchmark Target | Delta |
|--------|---------|----------------------|-------|
| Entities | 22,215 | ~719 | +21,496 (30x over) |
| Committed data rows | 238,276 | TBD | TBD |
| Periods | 8 | TBD | TBD |
| Active rule set | Original (6 components) | Original (6 components) | MATCH |
| Calculation with original plan | None triggered | Needed | BLOCKED |

## NEXT STEPS REQUIRED

1. Identify the exact 719 entity IDs that participated in the Alpha benchmark (from calculation_results of a known-good batch)
2. Delete all entities NOT in that set (~21,496 entities) and their committed_data
3. Delete committed_data rows for non-benchmark entities
4. Re-evaluate which periods can be cleaned after entity cleanup
5. Trigger a calculation with the original plan against the cleaned dataset
6. Verify the Alpha benchmark (719 entities, MX$1,253,832, 6 components)

**OB-141 is NOT complete. The restoration has not been achieved.**
