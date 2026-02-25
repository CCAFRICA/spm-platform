# OB-96 Architecture Decision Record

## Problem
Financial module has critical bugs (field name mismatches, wrong entity_type filter, broken persona navigation), missing product data dimension, no intelligence layer, poor UX, and query performance issues (47K rows fetched client-side).

## Option A: Incremental patches
Fix each finding individually — field name corrections, entity_type fix, breadcrumb removal.
- Scale test: NO — still fetches 47K rows client-side
- AI-first: N/A
- Transport: NO — raw data through browser
- Atomicity: YES

## Option B: Fix field mappings + refactor data service + add product data + UX fixes
1. Fix field name mismatches in financial-data-service (numero_de_personas, total_descuentos, etc.)
2. Fix entity_type filter from 'person' to 'individual'
3. Add period-aware queries (filter by period_id, not fetch-all)
4. Add pos_line_item data for product reporting
5. Build new pages (Location Detail, Server Detail, Product Mix, Financial Landing)
6. Fix persona switcher to be workspace-aware
7. Remove dual breadcrumbs, add sorting, intelligence indicators
- Scale test: YES — period-filtered queries reduce data volume; RPCs can be added later
- AI-first: YES — product normalization, benchmarks from entity metadata
- Transport: NO HTTP bodies — Supabase client queries
- Atomicity: YES

## Option C: Supabase RPC functions for all aggregation
Create PostgreSQL functions that do all aggregation server-side. Zero raw rows to browser.
- Scale test: YES — SQL aggregation handles millions
- AI-first: YES
- Transport: YES — only aggregated results returned
- Atomicity: YES
- Problem: Requires executing DDL in Supabase SQL Editor for each function. Adds operational complexity. The current 47K volume doesn't require this yet — period-filtered queries with client aggregation are sufficient.

## CHOSEN: Option B — Fix field mappings + refactor + product data + UX
REASON: The root causes are field name mismatches and wrong entity_type filter — not architectural. Period-aware filtering reduces the data fetch from 47K to ~1,500 rows per page (one month of one location). Client-side aggregation at this volume is fast. Product data fits existing committed_data model. New pages follow established patterns.

## REJECTED: Option A — Doesn't address product data, intelligence layer, or new pages.
## REJECTED: Option C — Premature. RPC functions add operational complexity for no measurable benefit at 47K rows. Revisit at 500K+. Note: we CAN add period_id filtering to existing queries for immediate 30x reduction.

## Key Architectural Decisions
1. **Field mapping fix, not data fix** — Update financial-data-service to read actual field names from cheque row_data
2. **Period-aware queries** — All data fetches filter by period_id (reduces 47K → ~1,500 per period per location)
3. **Entity metadata for benchmarks** — Brand benchmarks stored in brand entity metadata, not hardcoded
4. **Workspace-aware persona switcher** — Stay in current workspace when switching personas
5. **Product line items** — data_type='pos_line_item' in committed_data, linked by folio
