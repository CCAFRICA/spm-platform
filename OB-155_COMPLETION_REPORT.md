# OB-155: Browser Pipeline Proof — COMPLETION REPORT

## Summary

Prove the SPM platform works through the browser API, not via scripts. Import plan, import data, calculate, view results — all through the same HTTP endpoints the browser uses.

**Result: PARTIAL PASS — plan import + component bridge proven, large-file import is P0 blocker**

## What Passed

### Plan Import Through Browser API (PG-1, PG-2, PG-3)
- PPTX analyzed via `POST /api/import/sci/analyze-document` — 200 OK
- Plan executed via `POST /api/import/sci/execute` — AI interpreted 6 components
- **Component format bridge works**: `bridgeAIToEngineFormat()` converts AI output (`calculationType`/`calculationMethod`) to engine format (`componentType`/`matrixConfig`/`tierConfig`/etc.)
- Rule set saved with 2 variants (certified + non_certified), 6 components each
- First component: `componentType=matrix_lookup` (engine-compatible)
- Anthropic API fetch retry (3 attempts with backoff) fixed transient "fetch failed" in Next.js dev server

### Entity Dedup (PG-12)
- 12,646 entities created, 0 duplicate external_ids
- Dedup logic in `executeEntityPipeline()` and `postCommitConstruction()` works correctly

### Calculate Page Loads (PG-13)
- `/operate/calculate` returns 200, no error patterns detected

### Data Analyze (PG-4)
- 7-sheet XLSX analyzed via `POST /api/import/sci/analyze` — 8 content units returned
- Classification and field binding produced for all sheets

## What Failed

### P0: Large-File Import Performance

**119K rows cannot import through the browser in a reasonable time.**

The E2E proof timed out after 65+ minutes importing the Óptica dataset (119,129 rows across 7 sheets). Only 47,783 rows (40%) were committed before the process failed on the Club_Proteccion sheet (56,237 rows).

| Sheet | Rows | Status |
|-------|------|--------|
| Datos Colaborador | 2,157 | Imported (entity) |
| Base_Venta_Individual | 2,618 | Imported (target) |
| Base_Venta_Tienda | 12,446 | Imported (target) |
| Base_Clientes_Nuevos | 5,348 | Imported (retry after timeout) |
| Base_Cobranza | 5,371 | Imported (target) |
| Base_Club_Proteccion | 56,237 | PARTIAL (~20K of 56K) |
| Base_Garantia_Extendida | 34,952 | NOT IMPORTED |

**Root cause**: Chunked HTTP import sends 2,000-row JSON payloads to `/api/import/sci/execute` sequentially. Each chunk triggers:
1. Committed_data insert (fast)
2. `postCommitConstruction()` — entity creation, entity_id binding, assignment creation, store metadata (slow, O(n) per chunk)

Node.js undici throws `UND_ERR_HEADERS_TIMEOUT` after 300s when the route takes too long to respond.

**Architectural violations**:
- **AP-1**: Row data in HTTP request bodies — 2,000 rows of JSONB per request
- **AP-2**: Sequential chunk inserts from browser — each chunk waits for previous completion

**Required fix**: File storage transport pattern:
1. Client uploads file to Supabase Storage (already exists: `ingestion-raw` bucket)
2. Client sends storage path to API (not row data)
3. Server processes file asynchronously with progress tracking
4. No row data in HTTP bodies, no sequential browser-driven chunks

### $0 Payout from Browser-Imported Plan

The AI-generated components produce $0 total payout even with data present. Two root causes:

1. **Component names don't match sheet patterns**: The engine's `findMatchingSheet()` needs component names to substring-match `data_type` values (e.g., "Venta Individual" matches `base_venta_individual`). The AI produced names like "Optical Sales Incentive - Certified" which match nothing.

2. **Metric names don't match data fields**: AI components reference metrics like `optical_attainment` and `store_optical_sales`. The data has fields like `Cumplimiento`, `Venta_Individual`, `Meta_Individual`. No semantic mapping bridges the gap.

**OB-154's workaround** was `ob154-fix-components.ts` — hardcoded component names (`Venta Individual`, `Venta Tienda`) and metric derivation rules (`store_sales_attainment = Real/Meta × 100`). This is tenant-specific and not scalable.

**Required fix**: The `bridgeAIToEngineFormat()` function needs to:
- Rename components to match expected sheet data_type patterns
- Generate `metric_derivation` rules from AI-detected `requiredInputs`
- Or: the engine's metric resolution needs to match by semantic type, not by name substring

### Source Date Extraction Broken

Source dates scattered across 2000–2024 (should be clustered in 2024-01/02/03). Only 727 of ~37,000 expected January rows had correct 2024-01 dates.

**Root cause**: The source_date extractor picked hire dates (from Datos Colaborador's "Fecha Corte" field, which contains employee start dates) instead of the period date columns. The Mes/Año (Month/Year) columns in data sheets were not used as source_date.

### Entity Inflation

12,646 entities created instead of 719. Store IDs (`No_Tienda`, `Tienda`) were created as entities alongside employee IDs (`num_empleado`).

**Root cause**: `postCommitConstruction()` creates entities from whatever field is classified as `entity_identifier`. Store-level sheets had `No_Tienda` as entity_identifier, creating store-number entities. The entity pipeline's dedup works (0 duplicates), but the classification produces the wrong entity_identifier for store-level sheets.

## Phase Execution

### Phase 0: Diagnostic
- Anthropic API fetch works from Node.js (200, 1.2s)
- "Fetch failed" from OB-154 was transient
- Component format gap documented (5 field mismatches)
- Entity dedup code verified correct
- Nuclear clear executed

### Phase 1+2: Component Format Bridge (PASS)
- Added `bridgeAIToEngineFormat()` to `ai-plan-interpreter.ts`
- Routes raw AI output through `validateAndNormalize()` → `interpretationToPlanConfig()` → `convertComponent()`
- Updated SCI execute route to use bridge instead of saving raw AI components
- Added retry logic (3 attempts, 2s/4s backoff) to Anthropic API fetch in `anthropic-adapter.ts`
- **Result**: Plan saved with proper `componentType`/`matrixConfig`/`tierConfig` format

### Phase 3: Entity Dedup (VERIFIED)
- Code review confirmed dedup logic is correct in both `executeEntityPipeline()` and `postCommitConstruction()`
- OB-153's 19K entity issue was AI classification (wrong entity_identifier field), not missing dedup

### Phase 4: Browser E2E Proof (PARTIAL)
- Plan import: PASS (2 variants, 12 components, engine-compatible)
- Data import: 47,783 of 119,129 rows imported before timeout
- Periods: Created (3)
- Calculation: Ran successfully but $0 payout (component name mismatch)
- Page load: PASS

### Phase 5: CC-UAT-08 Forensic Verification
- Component format verified: `componentType=matrix_lookup`, `tier_lookup`, `conditional_percentage`, `percentage`
- Entity dedup verified: 12,646 unique, 0 duplicates
- Source date distribution: scattered (data quality issue in pipeline, not engine)
- $0 payout diagnosed: component names don't match data_type patterns

## Code Changes

### New Code (Permanent)

| File | Change |
|------|--------|
| `web/src/lib/compensation/ai-plan-interpreter.ts` | `bridgeAIToEngineFormat()` — converts raw AI response to engine-compatible variants format |
| `web/src/lib/compensation/ai-plan-interpreter.ts` | `validateAndNormalizePublic()` — public wrapper for private normalization |
| `web/src/app/api/import/sci/execute/route.ts` | SCI execute now uses `bridgeAIToEngineFormat()` instead of saving raw AI components |
| `web/src/lib/ai/providers/anthropic-adapter.ts` | Retry logic (3 attempts, exponential backoff) for Anthropic API fetch |

### Scripts Created

| Script | Purpose |
|--------|---------|
| `ob155-test-ai-call.ts` | Phase 0: Anthropic API connectivity test |
| `ob155-engine-contract.ts` | Engine Contract state verification |
| `ob155-browser-e2e.ts` | Phase 4: Full E2E proof (plan + data + calculate) |
| `ob155-phase5-forensic.ts` | Phase 5: CC-UAT-08 forensic verification |

## Engine Contract (Final State — Partial Import)

| Table | Count | Notes |
|-------|-------|-------|
| rule_sets | 1 | 2 variants, 6 components each |
| entities | 12,646 | Inflated by store IDs |
| periods | 3 | January, February, March 2024 |
| committed_data | 47,783 | 40% of 119,129 target |
| rule_set_assignments | 12,646 | 1:1 with entities |
| calculation_results | 12,646 | All $0 (name mismatch) |
| calculation_batches | 1 | |
| import_batches | 26 | 2K-row chunks |

## P0 Findings Summary

| # | Finding | Severity | Fix |
|---|---------|----------|-----|
| 1 | 119K rows cannot import via chunked HTTP in reasonable time | P0 | File storage transport pattern |
| 2 | AI component names don't match engine's sheet-matching logic | P1 | Name aliasing or semantic metric resolution |
| 3 | Source date extraction picks wrong date columns | P1 | Explicit date column classification in SCI analyze |
| 4 | Store IDs classified as entity_identifier create phantom entities | P2 | Scope entity creation to entity-classified sheets only |

## Proof Gate Summary

| Gate | Description | Status |
|------|-------------|--------|
| PG-1 | Plan analyze via API | PASS |
| PG-2 | Plan saved with variants (bridge) | PASS |
| PG-3 | Components have engine format | PASS |
| PG-4 | Data analyze via API | PASS |
| PG-5 | Entities created (deduped) | PARTIAL (12,646 — inflated) |
| PG-6 | Committed data imported | PARTIAL (47,783 of 119,129) |
| PG-7 | Source_date populated | PARTIAL (scattered dates) |
| PG-8 | Assignments created | PASS |
| PG-9 | Calculation executes | PASS |
| PG-10 | Result count | 12,646 (inflated) |
| PG-11 | Total payout vs ground truth | FAIL ($0 — component name mismatch) |
| PG-12 | Entity dedup | PASS (0 duplicates) |
| PG-13 | Page loads | PASS |
