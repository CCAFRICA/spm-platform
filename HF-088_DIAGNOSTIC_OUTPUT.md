# HF-088 Diagnostic Output — March 4, 2026

## 1. VL Admin Profile State
```
Total VL Admin profiles: 1
  Platform-level (tenant_id IS NULL) — KEEP: 1
  Tenant-scoped (tenant_id IS NOT NULL) — HF-086 DAMAGE: 0
```
**Finding**: HF-086 damage already cleaned in a previous session. No tenant-scoped VL Admin profiles exist. Phase 1 is a verification pass.

## 2. Óptica Engine Contract
```
Rule sets: 2 (14 components)
  - 05c30b36... name="Optometrist Incentive Plan" status=draft created=2026-03-04T04:52:56
  - 7eaa30b0... name="Optometrist Incentive Plan" status=draft created=2026-03-04T05:12:40
Entities: 19,578
Periods: 7
Committed data: 140,510 total, 93,112 entity-bound, 140,510 with source_date
Assignments: 39,156
Calculation results: 2,513
Calculation batches: 8
Entity period outcomes: 2,513
```

## 3. Unique Entity Identifiers
```
Total entity rows: 19,578
Distinct external_id values: 19,578
Inflation factor: 1.0x
```
**Finding**: Each entity row has a unique external_id. The inflation is from creating one entity per data row instead of per unique employee identifier. Expected: 719 unique employees.

## 4. Import Batches
```
Import batches: 32
All from same SCI execution (sci-execute-b70d0c81-7dd3-4c30-8e2b-ef6e9c6bbf27)
Row counts: mix of 5,000-row chunks and smaller trailing batches
Total across all batches: ~140,510 rows
```
**Finding**: 32 import batches from chunked SCI execution. Data was imported in 5K-row batches.

## 5. LAB Baseline
```
Results: 719
Total payout: $1,262,864.66
Expected (per prompt): 268 results, $8,498,311.77
```
**Finding**: LAB baseline diverges from prompt expectation. This was documented in OB-153 completion report as "pre-existing divergence (719 results, $1.26M — predates OB-153)". The actual LAB baseline for regression checking is **719 results, $1,262,864.66**.

## 6. Óptica Persona Profiles (PRESERVE)
```
Laura Mendez (admin@opticaluminar.mx) role=admin
Roberto Castillo (gerente@opticaluminar.mx) role=manager
Sofia Navarro (vendedor@opticaluminar.mx) role=viewer
```
These 3 profiles will NOT be touched during nuclear clear.
