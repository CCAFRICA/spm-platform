# DIAG-004 COMPLETION REPORT
## Date: 2026-03-16

## QUERY RESULTS

### Query 1.1: committed_data by source_date month
```
Total committed_data rows: 595
month    | row_count | entities | batches
---------|-----------|----------|--------
2025-10  | 85        | 85       | 1
2025-11  | 85        | 85       | 1
2025-12  | 85        | 85       | 1
2026-01  | 255       | 85       | 3
NULL     | 85        | 85       | 1
```

**CRITICAL FINDING:** 255 rows at source_date 2026-01-01. Expected: 85 Jan + 85 Feb + 85 Mar = 255, but ALL 255 have January source_date. Zero rows exist for 2026-02 or 2026-03.

Also notable: October shows source_date 2025-10 but the original data has `Periodo: 2025-10-01`. The first month maps to 2025-09 due to Date constructor month offset — this is a display artifact, the actual dates are 2025-10-01.

### Query 1.2: committed_data by import_batch_id
```
batch_id (first 8) | file_name                    | rows | source_dates           | data_types
-------------------|------------------------------|------|------------------------|----------
d3c63265           | sci-execute-5fd1fc74...      | 85   | 2025-10-01 → 2025-10-01| datos
14a82287           | sci-execute-d7b1bf89...      | 85   | NULL       → NULL      | personal
fc33db5a           | sci-bulk-c33c717d...         | 85   | 2025-11-01 → 2025-11-01| datos
0eed5646           | sci-bulk-251207ea...         | 85   | 2025-12-01 → 2025-12-01| datos_dic
f3581470           | sci-bulk-e6c28629...         | 85   | 2026-01-01 → 2026-01-01| datos_ene
ddb8cd9a           | sci-bulk-e6c28629...         | 85   | 2026-01-01 → 2026-01-01| datos_ene
f0b7b125           | sci-bulk-e6c28629...         | 85   | 2026-01-01 → 2026-01-01| datos_ene
```

**CRITICAL FINDING:** The last 3 batches share the same SCI execution ID (`e6c28629`) — these are the multi-file import (Jan/Feb/Mar uploaded together). All three have:
- source_date: `2026-01-01` (same date for all 3)
- data_type: `datos_ene` (all labeled as January)

### Query 1.3: NULL source_date rows
```
NULL source_date rows: 85
  data_type=personal: 85 rows

source_date/period_id matrix:
  source_date + period_id: 0
  source_date + NULL pid:  510
  NULL sd + period_id:     0
  NULL sd + NULL pid:      85
```

No period_id is set on any row. Engine relies entirely on source_date matching.

### Query 2.1: Valentina Salazar (BCL-5012)
```
Entity: Valentina Salazar Mendieta (62850d63-2801-47d3-9a05-92560c08fca5)
Rows by entity_id match: 7
  sd=2025-10-01 pid=NULL batch=d3c63265 type=datos
  sd=2025-11-01 pid=NULL batch=fc33db5a type=datos
  sd=2025-12-01 pid=NULL batch=0eed5646 type=datos_dic
  sd=NULL       pid=NULL batch=14a82287 type=personal
  sd=2026-01-01 pid=NULL batch=f3581470 type=datos_ene
  sd=2026-01-01 pid=NULL batch=ddb8cd9a type=datos_ene
  sd=2026-01-01 pid=NULL batch=f0b7b125 type=datos_ene
```

**FINDING:** Valentina has 7 rows. 4 months of datos (Oct, Nov, Dec, Jan×3) + 1 personal. February and March datos DO NOT EXIST as separate rows — they are duplicates of January's data.

### Query 2.2: Row data samples across multi-file batches
```
Batch: f3581470 (multi-file 1):
  BCL-5001: Monto_Colocacion: 140387.13, Pct_Meta_Depositos: 0.7697, Periodo: 2026-01-01

Batch: ddb8cd9a (multi-file 2):
  BCL-5001: Monto_Colocacion: 140387.13, Pct_Meta_Depositos: 0.7697, Periodo: 2026-01-01

Batch: f0b7b125 (multi-file 3):
  BCL-5001: Monto_Colocacion: 140387.13, Pct_Meta_Depositos: 0.7697, Periodo: 2026-01-01
```

**CRITICAL FINDING:** All three multi-file batches have IDENTICAL row_data values AND the same `Periodo: 2026-01-01`. The multi-file import committed the first file's content to all 3 import batches. The February and March data was never committed — only January's data was committed 3 times.

### Query 3.1: Period definitions
```
id                                   | label           | start_date | end_date   | status
-------------------------------------|-----------------|------------|------------|-------
d64f4488-444f-4211-9115-bdd67b253c50 | October 2025    | 2025-10-01 | 2025-10-31 | open
af12de01-7d05-4777-9222-a20b7a2e7f8e | November 2025   | 2025-11-01 | 2025-11-30 | open
c9c7774f-4409-430e-b144-2a0284746969 | December 2025   | 2025-12-01 | 2025-12-31 | open
c5e1648b-794d-49c0-9318-c8ac75b9d0d6 | January 2026    | 2026-01-01 | 2026-01-31 | open
ac2fe76d-53f2-497e-8ba3-5802b1db57f5 | February 2026   | 2026-02-01 | 2026-02-28 | open
6e2235ac-dbda-49cc-8135-d1de094933d9 | March 2026      | 2026-03-01 | 2026-03-31 | open
```

Period boundaries are correct. February is 2026-02-01 to 2026-02-28.

### Query 3.2: Rows matching February 2026 date range
```
By source_date (Feb range): 0
By period_id (Feb period): 0
```

Zero rows exist for February via either path.

### Query 3.3: All distinct source_dates
```
  2025-10-01: 85 rows
  2025-11-01: 85 rows
  2025-12-01: 85 rows
  2026-01-01: 255 rows
  NULL: 85 rows
```

Only 4 distinct non-null source_dates exist. No 2026-02 or 2026-03 dates.

### Query 4.1: Engine simulation for February
```
Period: February 2026 (2026-02-01 to 2026-02-28)
Source_date path (2026-02-01..2026-02-28): 0 rows
Period_id fallback: 0 rows
NULL path (personal): 85 rows
Total engine would fetch: 85 (personal only, no datos)
```

For comparison — January:
```
Source_date path (2026-01-01..2026-01-31): 255 rows
NULL path (personal): 85 rows
```

January gets 255 datos rows (3× duplicates) + 85 personal = 340 total. The convergence binding fallback (DIAG-003) picks the first batch with entity data, so duplicates don't affect results.

### Query 4.2: Convergence bindings
```
Plan: Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026
Location: rule_sets.input_bindings.convergence_bindings

component_0: source_batch_id = d3c63265 (October datos batch)
component_1: source_batch_id = d3c63265 (October datos batch)
component_2: source_batch_id = d3c63265 (October datos batch)
component_3: source_batch_id = d3c63265 (October datos batch)
```

All 4 component bindings point to the original October import batch. The engine's DIAG-003 fallback searches ALL loaded batches when the binding's batch isn't in the cache, so this is not directly the cause — the cause is that no datos rows exist for February's source_date range.

## ROOT CAUSE DETERMINATION

**Root Cause: B — February and March datos rows committed with wrong source_date AND wrong data.**

The multi-file import pipeline (HF-139) committed the **first file's content** (January datos) to **all three import batches**. Evidence:

1. **255 rows at source_date 2026-01-01** instead of 85 Jan + 85 Feb + 85 Mar at different dates (Query 1.1)
2. **All 3 multi-file batches have identical row_data** — same Periodo (2026-01-01), same metric values (Monto_Colocacion: 140387.13), same data_type (datos_ene) (Queries 1.2, 2.2)
3. **Zero rows with source_date in Feb or Mar range** (Query 3.2, 3.3)
4. **Engine correctly finds 0 datos rows for February**, producing $9,150 from personal-data-only C4 component (Query 4.1)

**The bug is in the multi-file import pipeline, not the calculation engine.** The engine is correct — it sees no February data because no February data was committed.

### Why January still calculates correctly despite 3× duplicate data:
The convergence binding resolver (DIAG-003 fallback) finds the FIRST loaded batch with matching entity data. Since all 3 copies are identical, picking any one produces the correct January result ($47,545).

### Why only C4 produces output for February ($9,150):
C4 (Regulatory Compliance / conditional_percentage) uses `Infracciones_Regulatorias` which likely has a base amount or default behavior that operates on personal data alone, producing $150/$100 per entity × 85 = $9,150.

## RECOMMENDED FIX

**Two actions required:**

### 1. Data fix (immediate): Re-import February and March data
- Delete the 3 duplicate import batches (f3581470, ddb8cd9a, f0b7b125) and their committed_data
- Re-import the February and March Excel files individually (not via multi-file upload)
- Verify each file's committed_data has correct source_date and distinct data values
- Recalculate February and March

### 2. Code fix (HF): Fix multi-file import pipeline
The bug is in the SCI bulk import path that handles multi-file uploads. When 3 files are selected simultaneously, the pipeline creates 3 separate import_batches but reads the first file's content for all 3. The fix must ensure each import batch receives its own file's content.

Likely location: the file reading/parsing step in the SCI execution pipeline (`sci-bulk-*` batches). The shared execution ID (`e6c28629`) suggests a single SCI execution processes all 3 files but fails to iterate to separate file contents.

## KNOWN ISSUES
- January's calculation result ($47,545) is coincidentally correct despite having 3× duplicate data, because the DIAG-003 fallback deduplicates by entity when resolving from any single batch
- The convergence bindings still point to October's batch (`d3c63265`) — not a blocking issue due to the DIAG-003 fallback, but should be updated when new data is imported
- October source_date displays as 2025-09 in aggregation due to JavaScript Date month-offset artifact; actual stored date is 2025-10-01
