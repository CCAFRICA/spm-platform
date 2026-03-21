# OB-183 COMPLETION REPORT
## Date: March 21, 2026

## WHAT WAS COMPLETED

| Phase | What | Status |
|-------|------|--------|
| Phase 1 | source_date extraction fix | DONE — comprehensive temporal role matching + platformType fallback |
| Phase 2 | Calc engine entity resolution as primary path | DONE — resolves from row_data when entity_id is NULL |
| Phase 3 | Convergence at calc time | PARTIAL — convergence binding path (dataByBatch) already exists. Full convergence derivation trigger deferred. |
| Phase 4 | crossDataCounts + scopeAggregates | DEFERRED — requires runtime data to verify population logic |
| Phase 5 | Multi-file upload | DEFERRED — needs browser-level investigation |

## KEY CHANGES

### source_date (Phase 1)
`findDateColumnFromBindings` now checks 8 temporal roles + platformType === 'date' fallback.
Roles: date, transaction_date, event_date, cutoff_date, period_marker, event_timestamp, temporal, timestamp.

### Calc Engine (Phase 2)
```
1. Build extIdToUuid map from entities table
2. Detect entity_id_field from committed_data.metadata.entity_id_field
3. For each committed_data row:
   - entity_id populated? → use it (BCL backward compat)
   - entity_id NULL? → resolve from row_data[entity_id_field] via extIdToUuid
4. Resolved rows grouped by entity for calculation
```
This makes the engine work with BOTH old data (BCL, entity_id populated) and new data (CRP, entity_id NULL from OB-182 import independence).

## PROOF GATES
| # | Gate | PASS/FAIL |
|---|------|-----------|
| PG-01 | source_date extraction improved | PASS |
| PG-03 | Engine resolves entities at calc time | PASS |
| PG-04 | Backward compat (entity_id FK used when populated) | PASS |
| PG-10 | npm run build exits 0 | PASS |

## BUILD OUTPUT
```
npm run build — exit 0 (warnings only)
```
