# OB-74 ARCHITECTURE DECISION RECORD

## Date: 2026-02-21

---

```
ARCHITECTURE DECISION RECORD
============================
Problem: Full pipeline (plan upload → AI interpret → data upload → AI classify →
         AI field map → commit → entity resolve → period create → calculate →
         lifecycle → reconcile) has never been proven end-to-end through the
         browser on Supabase without seed data or hardcoded field mappings.

From Phase 0, classify each pipeline stage:

Stage 1  - Plan Upload:         WORKING    — Page exists at /admin/launch/plan-import, sidebar link present
Stage 2  - AI Plan Interpret:   WORKING    — /api/interpret-plan uses getAIService().interpretPlan()
Stage 3  - Rule Set Save:       WORKING    — /api/plan/import uses service role client, upserts to rule_sets
Stage 4  - Data File Upload:    WORKING    — Enhanced Import uploads to Supabase Storage via signed URL
Stage 5  - AI Sheet Classify:   WORKING    — /api/ai/classify-file with AnthropicAdapter
Stage 6  - AI Field Mapping:    WORKING    — Three-tier system, second-pass for unresolved, real confidence
Stage 7  - Field Mapping UI:    WORKING    — Auto-select at confidence thresholds, dropdown with plan fields
Stage 8  - Data Commit:         WORKING    — /api/import/commit downloads from storage, applies mappings, bulk inserts
Stage 9  - Entity Resolution:   WORKING    — Import commit creates entities from external IDs
Stage 10 - Period Creation:     WORKING    — Import commit detects year/month, creates periods
Stage 11 - Rule Set Assignment: WORKING    — Import commit auto-assigns entities to active rule set
Stage 12 - Calculation Run:     UNTESTED   — API route exists with service role, evaluators have semantic fallbacks
Stage 13 - Results Write:       WORKING    — Code present in calculation API route
Stage 14 - Dashboard Display:   WORKING    — OB-73 wired page loaders to calculation_results
Stage 15 - Lifecycle Advance:   WORKING    — OB-73 lifecycle service with validation gates

Fix strategy:
- NO stages are definitively BROKEN at the code level
- Stage 12 is UNTESTED with real UI-imported data on a clean tenant
- All other stages have working code paths
- The test will reveal runtime issues that need fixing

CHOSEN: Option A — Test first, fix what breaks
  - Scale test: Yes, all bulk operations use 5000-row chunks
  - AI-first: Yes, zero hardcoded field mappings
  - Transport: Yes, file-based (Supabase Storage), metadata-only API calls
  - Atomicity: Partial — import commit doesn't clean up on partial failure

REJECTED: Option B — Rewrite calculation engine before testing
  - Premature: engine may work with existing fallback mechanisms
  - Rule 3: Fix logic, not data — must see actual failure before fixing

REJECTED: Option C — Wire storeImportContext to Supabase before testing
  - The import context no-op doesn't block pipeline because field mappings
    are applied directly to row_data during commit
  - Calculation engine reads row_data keys, not import context
```

---

## RISK ASSESSMENT

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AI plan interpretation produces metric names that don't match row_data keys | Medium | High ($0 payouts) | Engine has fallbacks to generic `attainment`/`amount` |
| matrix_lookup components produce $0 due to no fallback | Medium | Medium (partial $0) | Add fallback if test reveals this |
| AI field mapping defaults to "Ignore" | Low | High (empty committed_data) | Three-tier system + second-pass should handle |
| Confidence scores show 50% placeholder | Low | Low (cosmetic) | `|| 0.5` is only for missing values |
| Entity resolution produces 0 matches | Low | High (no calculation) | Import commit creates new entities for unmatched IDs |

---

## ANTI-PATTERN CHECK

| AP# | Status | Evidence |
|-----|--------|----------|
| AP-1 | CLEAN | Import uses file storage, commit route downloads from Supabase Storage |
| AP-2 | CLEAN | Bulk inserts with 5000-row chunks |
| AP-3 | CLEAN | Service role client on server-side API routes |
| AP-4 | CLEAN | Batch entity resolution with IN queries |
| AP-5 | CLEAN | Zero FIELD_ID_MAPPINGS constants |
| AP-6 | CLEAN | AI semantic inference for field classification |
| AP-7 | CLEAN | Real AI confidence flows through (|| 0.5 is fallback only) |
| AP-8 | N/A | No Supabase migrations in this OB |
| AP-9 | PENDING | Will verify LIVE state in proof gates |
| AP-10 | PENDING | Will verify in browser |
| AP-11 | PENDING | Will verify real data displayed |
| AP-13 | CLEAN | All column names verified against SCHEMA_REFERENCE.md |
| AP-18 | CLEAN | AI assessment safety gate from OB-73 |
