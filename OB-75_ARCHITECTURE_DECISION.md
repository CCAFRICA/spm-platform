# OB-75 Architecture Decision Record

## PROBLEM 1: AI Import Context lost — storeImportContext is NO-OP

Option A: Add metadata JSONB column to import_batches via SQL migration
  - Scale: Yes (one JSON blob per batch, ~10KB max)
  - AI-first: Yes (stores AI decisions)
  - Atomicity: Stored with batch update in same transaction
  - Migration: Simple ALTER TABLE ADD COLUMN

Option B: Use classification_signals table (already exists)
  - Scale: Yes (one row per sheet, ~7 rows per import)
  - AI-first: Yes
  - Atomicity: Separate inserts, could orphan on partial failure
  - Issue: entity_id FK designed for entity-level signals, not import-level

Option C: Store in committed_data.metadata JSONB (per-row)
  - Scale: Duplicated across all rows — 119K copies of same mapping
  - AI-first: Yes
  - Atomicity: Already in commit flow
  - Issue: Massive duplication, wrong granularity

CHOSEN: Option A — import_batches.metadata JSONB column
  - Clean granularity: one AI context per import batch
  - Natural home: the batch record that represents this import
  - Simple query: engine reads one row to get all sheet mappings
  - Migration: ALTER TABLE import_batches ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;

## PROBLEM 2: SHEET_COMPONENT_PATTERNS hardcodes sheet→component mapping

Option A: Read from import_batches.metadata.ai_context.sheets
  - Korean Test: PASSES (AI determined mapping at import time)
  - Scale: One DB read per calculation run
  - Dependency: Requires Problem 1 fix (metadata column)

Option B: Re-run AI classification at calculation time
  - Korean Test: PASSES
  - Scale: Expensive — AI call for every calculation
  - Unnecessary: AI already classified at import time

CHOSEN: Option A — read from import_batches.metadata
  - AI context persisted once, read many times
  - Zero language-specific patterns in calculation path
  - One additional Supabase query (import_batches by batch_id)

## PROBLEM 3: Only 1,000 entities calculated (Supabase default row limit)

Option A: Set explicit .limit(100000) on all queries
  - Scale: Works up to 100K but hard-coded upper bound
  - Simple: One-line fix per query

Option B: Paginated fetch with .range() loops
  - Scale: Works at ANY volume — fetch in chunks of 10,000
  - Robust: No upper bound, handles 2M+ records
  - More code: Pagination loop per query

CHOSEN: Option B — paginated fetch
  - Enterprise scale (Section E: must work at 5M+)
  - Fetch in pages of 10,000 rows until exhausted
  - Applied to: assignments, entities, committed_data queries

## PROBLEM 4: Periods lack start_date/end_date

Finding: The period creation code ALREADY sets start_date and end_date correctly.
The issue is stale data from earlier OBs that created periods without dates.

Fix: Verify and repair existing periods, not change creation logic.
If existing periods have NULL dates, UPDATE them with correct boundaries.
No code change needed for period creation — only data verification.
