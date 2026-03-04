# OB-152 Completion Report
## Decision 92 — Temporal Binding and Reference Agent Foundation

**Date:** 2026-03-04
**Branch:** dev
**Status:** COMPLETE

---

## Phase Summary

| Phase | Description | Status | Proof Gate |
|-------|-------------|--------|------------|
| 0A | Read mandatory files + commit prompt | PASS | OB-152_READ_CONFIRMATION.md committed |
| 0 | Consumer map + LAB baseline | PASS | 13 consumers mapped, LAB: 268 results / $8,498,311.77 |
| 1 | Schema migration (source_date + 3 tables) | PASS | Live DB verified: source_date exists, 3 tables created |
| 2 | Engine hybrid path | PASS | Hybrid fetch in route.ts + run-calculation.ts, LAB regression PASS |
| 3 | SCI source_date extraction | PASS | Korean Test PASS, LAB regression PASS |
| 4 | Reference Agent (5th SCI agent) | PASS | 5/5 agent tests pass, build clean, LAB regression PASS |
| 5 | Documentation updates | PASS | SCHEMA_REFERENCE + CC_STANDING_ARCHITECTURE_RULES updated |
| 6 | Completion report + PR | THIS PHASE |

---

## Architecture Decision: Option C — Hybrid Data-Fetch

**Problem:** committed_data is FK-bound to period_id at import time. Temporal binding should happen at calculation time using business dates.

**Chosen:** Option C — Hybrid. Engine tries source_date date-range first; if 0 rows returned, falls back to period_id. This protects all existing data (LAB has period_id but no source_date) while enabling temporal binding for new imports.

**Rejected:**
- Option A (backfill all source_date) — risky data mutation, no rollback
- Option B (source_date only) — breaks all existing tenants immediately

---

## Deliverables

### 1. Schema Changes (Migration 018)
- `committed_data.source_date` — DATE column, nullable
- `reference_data` — catalog/lookup dataset headers
- `reference_items` — individual rows within reference datasets
- `alias_registry` — canonical value ↔ alias mappings
- Indexes: `idx_committed_data_tenant_source_date`, `idx_committed_data_tenant_entity_source_date`
- RLS policies + service role bypass on all 3 new tables

### 2. Engine Hybrid Path
- **route.ts**: Main data fetch + prior period fetch use source_date range first, period_id fallback
- **run-calculation.ts**: Identical hybrid pattern applied
- OB-128 null-period fetch updated to also check null source_date
- Period fetch includes end_date for range windowing

### 3. SCI Source Date Extraction
- **source-date-extraction.ts** (NEW): 3 strategies — Content Profile hint → semantic role → structural scan
- Korean Test: zero field-name matching, all structural detection
- Target + Transaction pipelines populate source_date per row at commit time
- Period detection kept for backward compatibility

### 4. Reference Agent
- **AgentType** expanded: `'plan' | 'entity' | 'target' | 'transaction' | 'reference'`
- **REFERENCE_WEIGHTS**: 11 signals (high_key_uniqueness +0.25, descriptive_columns +0.20, low_row_count +0.15, etc.)
- **executeReferencePipeline**: Creates reference_data + reference_items records
- All Record<AgentType> usages updated across 10 files
- Agent regression: 5/5 tests pass

### 5. Documentation
- **SCHEMA_REFERENCE.md**: source_date column + 3 new table schemas
- **CC_STANDING_ARCHITECTURE_RULES.md**: AP-23, AP-24, AP-25

---

## LAB Regression

| Checkpoint | Results | Total Payout | Status |
|------------|---------|-------------|--------|
| Phase 0 baseline | 268 | $8,498,311.77 | PASS |
| Phase 2 (engine) | 268 | $8,498,311.77 | PASS |
| Phase 3 (SCI) | 268 | $8,498,311.77 | PASS |
| Phase 4 (reference) | 268 | $8,498,311.77 | PASS |

**Committed data:** 1,625 total rows, 1,563 with period_id, 0 with source_date (expected — no new imports since migration)

---

## Anti-Pattern Compliance

| AP | Check | Status |
|----|-------|--------|
| AP-1 | No row data in HTTP bodies | PASS |
| AP-5 | No hardcoded field dictionaries | PASS |
| AP-6 | No language-specific pattern matching | PASS (Korean Test) |
| AP-8 | Migration executed + verified live | PASS |
| AP-23 | Temporal binding via source_date | PASS (new) |
| AP-24 | Structural date detection | PASS (new) |
| AP-25 | Reference Agent for catalogs | PASS (new) |

---

## Files Changed

### New Files
- `web/supabase/migrations/018_decision92_temporal_binding.sql`
- `web/src/lib/sci/source-date-extraction.ts`
- `web/scripts/ob152-test-agents.ts`
- `web/scripts/ob152-lab-baseline.ts`
- `OB-152_DECISION_92_IMPLEMENTATION.md`
- `OB-152_READ_CONFIRMATION.md`
- `OB-152_PHASE0_CONSUMER_MAP.md`
- `OB-152_COMPLETION_REPORT.md`

### Modified Files
- `web/src/app/api/calculation/run/route.ts` — hybrid data-fetch
- `web/src/lib/calculation/run-calculation.ts` — hybrid data-fetch
- `web/src/app/api/import/sci/execute/route.ts` — source_date extraction + reference pipeline
- `web/src/app/api/import/sci/analyze/route.ts` — reference in PROCESSING_ORDER + ACTION_DESCRIPTIONS
- `web/src/lib/sci/agents.ts` — REFERENCE_WEIGHTS + assignReferenceRole
- `web/src/lib/sci/sci-types.ts` — AgentType union expanded
- `web/src/lib/sci/negotiation.ts` — reference affinities + inferRoleForAgent
- `web/src/lib/sci/proposal-intelligence.ts` — reference label
- `web/src/lib/sci/weight-evolution.ts` — reference weights
- `web/src/lib/supabase/database.types.ts` — source_date + 3 table types
- `web/src/components/sci/SCIExecution.tsx` — reference order
- `web/src/components/sci/ExecutionProgress.tsx` — reference label
- `web/src/components/sci/ImportReadyState.tsx` — reference label
- `SCHEMA_REFERENCE.md` — source_date + 3 new tables
- `CC_STANDING_ARCHITECTURE_RULES.md` — AP-23, AP-24, AP-25

---

## Commits

1. `OB-152 Phase 0A: Read confirmation + prompt committed`
2. `OB-152 Phase 0: Consumer map + LAB baseline`
3. `OB-152 Phase 1: Schema migration — source_date + reference tables`
4. `OB-152 Phase 2: Engine hybrid data-fetch (source_date → period_id fallback)`
5. `OB-152 Phase 3: SCI source_date extraction (Korean Test pass)`
6. `OB-152 Phase 4: Reference Agent — fifth SCI classification agent`
7. `OB-152 Phase 5: Documentation — schema reference + architecture rules`
8. `OB-152 Phase 6: Completion report`
