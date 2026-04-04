# OB-195: Reference Data Pipeline — End-to-End
## "All data reaches the engine. All data is bound at calc time."
## Priority: P0 — Blocks CRP Plans 2-4 and any plan requiring non-transaction data (quotas, targets, rate cards)

---

## INCLUDE AT TOP OF PROMPT
- CC_STANDING_ARCHITECTURE_RULES.md v2.0
- CC_DIAGNOSTIC_PROTOCOL.md
- COMPREHENSIVE_PLATFORM_GAP_AUDIT_20260330.md (Section 3)

---

## CONTEXT

### The Platform Promise
Any data file the user imports reaches the engine at calc time. Import is pure storage. The engine binds at calc time. Data arrives in any order. The platform figures it out.

### The Reality
Transaction data works end-to-end (proven: CRP Plan 1 $73,142.72 + $109,139.46 exact match). But quota/target/reference data does NOT work end-to-end:

1. SCI classifies quota files as "entity" → enriches entities instead of committed_data → engine can't read it
2. SCI Bulk reference pipeline writes to reference_data/reference_items (violates Decision 111 — all data → committed_data)
3. Source date extraction doesn't recognize `effective_date` as temporal → no source_date → engine can't period-bind
4. Convergence caches input_bindings after first calculation → new data types (quota) imported later don't trigger re-derivation
5. Engine metric resolution reads ONLY from committed_data via aggregateMetrics → no path for reference/quota data

### What This OB Delivers
A complete vertical slice: quota/target/reference file imported → committed_data with source_date and entity_id_field → convergence discovers new metric → engine resolves it at calc time → piecewise_linear executor gets correct ratio → correct tier → correct payout.

### Architectural Decisions That Govern This OB
- **Decision 92:** committed_data gets source_date. Engine binds at calc time. 5th SCI agent = Reference.
- **Decision 111:** ALL data → committed_data. reference_data/reference_items deprecated for new writes.
- **Decision 112:** Convergence is AI-Primary. Deterministic fallback.
- **Decision 113:** Periods are user business decisions. Engine binds source_date to periods.
- **OB-182:** Import is pure storage. Entity binding deferred to calc time.
- **OB-183:** Calc-time entity resolution from row_data.
- **Korean Test:** ALL changes structural. No domain vocabulary.
- **Carry Everything, Express Contextually:** Import ALL columns. Engine activates at calc time.

---

## ARCHITECTURE DECISION GATE

Before writing any code, answer:

1. Does this OB modify any table schema? **NO** — uses existing committed_data structure.
2. Does this OB affect BCL or Meridian? **NO** — BCL has no quota/reference data. Meridian uses bounded_lookup_2d, not piecewise_linear. Backward compatible.
3. Does this OB violate any locked decisions? **NO** — it ENFORCES Decision 111 (all data → committed_data) by fixing the SCI Bulk reference pipeline that currently violates it.
4. Korean Test? **PASS** — all classification, extraction, and resolution is structural.

---

## THE VERTICAL SLICE — 6 LAYERS

### Layer 1: SCI Bulk Reference Pipeline → committed_data (Decision 111 compliance)

**File:** `web/src/app/api/import/sci/execute-bulk/route.ts`, function `processReferenceUnit`

**Current behavior:** Writes to `reference_data` + `reference_items` tables. These tables are deprecated per Decision 111.

**Required behavior:** Write to `committed_data` with the same structure as `processDataUnit` (the transaction/target pipeline). Specifically:

1. Read `processDataUnit` in the same file — this is the template
2. Rewrite `processReferenceUnit` to follow the SAME pattern:
   - `entity_id: null` (deferred to calc time per OB-182)
   - `period_id: null` (Decision 92)
   - `source_date:` extracted from temporal column (Decision 92)
   - `data_type:` normalized from file/tab name
   - `row_data:` full row (Carry Everything)
   - `metadata:` includes `source`, `proposalId`, `semantic_roles`, `resolved_data_type`, `entity_id_field`, `informational_label: 'reference'`
3. Entity resolution at calc time via `entity_id_field` in metadata (OB-183)
4. Source date extraction via `extractSourceDate` (Decision 92)

**What NOT to do:**
- DO NOT delete the reference_data/reference_items tables or drop any schema
- DO NOT modify the SCI Execute reference pipeline (it already writes to committed_data per OB-162)
- DO NOT write to BOTH committed_data AND reference_items — committed_data only

**Verification:**
```bash
grep -n "reference_data\|reference_items" web/src/app/api/import/sci/execute-bulk/route.ts
# After fix: should return 0 matches in processReferenceUnit function
```

**Commit:** `OB-195 Layer 1: Reference pipeline → committed_data (Decision 111)`

---

### Layer 2: SCI Classification — Target Agent scoring for quota/target files

**Files:** `web/src/lib/sci/agents.ts`, specifically the Target Agent scoring logic

**Current behavior:** The Target Agent has low confidence for files like the quota CSV. The Entity Agent wins because the file has entity IDs, names, and roles (entity-like structure). The file gets classified as "entity" and enriched instead of stored as data.

**The structural distinction between entity data and target/reference data:**
- **Entity data:** Each row IS an entity definition (external_id, name, role). Rows are unique per entity. No temporal dimension. No measure beyond attributes.
- **Target/reference data:** Each row ASSOCIATES a value WITH an entity (entity_id, quota, effective_date). Rows have a temporal dimension. Rows have a numeric measure that isn't an attribute.

**Required behavior:** The Target Agent should score higher when:
- The file has an identifier column that matches existing entity external_ids (it references entities, doesn't define them)
- The file has a numeric column that is NOT an attribute (quota, target, rate — a measure)
- The file has a temporal column (effective_date, start_date — period binding)

**Implementation approach:**
1. Read the Target Agent's current scoring signals in `agents.ts`
2. Add a signal: if the file has an identifier column whose values match existing entity external_ids AND has at least one numeric non-attribute column, boost Target Agent confidence
3. Add a counter-signal to Entity Agent: if ALL entities already exist (0 new), this file is referencing entities, not defining them → reduce Entity confidence

**Korean Test:** This scoring is structural — identifier cardinality, value matching, column type ratios. No field name matching.

**Critical: Do NOT hardcode field names.** The Target Agent scores based on structure: "this file has an identifier that matches known entities + a temporal column + a numeric value" — not "this file has a column called monthly_quota."

**Verification:**
- Import the CRP quota CSV file (05_CRP_Quotas_20260101.csv)
- Vercel logs should show Target Agent scoring higher than Entity Agent
- File should be classified as "target" (not "entity")
- Execute should route through `processDataUnit` with classification "target"

**Commit:** `OB-195 Layer 2: Target Agent scoring for reference/quota files`

---

### Layer 3: Source date extraction for non-standard temporal columns

**File:** `web/src/lib/sci/source-date-extraction.ts` (or wherever `extractSourceDate` and `findDateColumnFromBindings` live)

**Current behavior:** `source_dates: []` on the quota file despite having an `effective_date` column. The temporal extraction recognizes `date`-type columns from transaction data but misses `effective_date`.

**Root cause investigation required:** Read the actual code in `extractSourceDate` and `findDateColumnFromBindings`. Determine WHY `effective_date` wasn't recognized. Possible causes:
- The SCI Header Comprehension didn't classify `effective_date` as temporal
- The `findDateColumnFromBindings` function looks for specific semantic roles that `effective_date` doesn't match
- The date format in the CSV isn't parseable by the extraction logic

**Fix:** Whatever the root cause, the fix must be structural:
- If HC doesn't classify `effective_date` as temporal: the HC prompt already handles temporal columns structurally — investigate why it missed this one
- If `findDateColumnFromBindings` has a limited set of temporal roles: expand it to include all temporal semantic roles from the HC vocabulary
- If the date format is wrong: the extraction should handle ISO dates (2026-01-01) which is what the quota file uses

**Verification:**
```sql
-- After reimport of quota file:
SELECT source_date, COUNT(*)
FROM committed_data
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
  AND row_data::text ILIKE '%monthly_quota%'
GROUP BY 1;
-- Must show source_date = '2026-01-01', NOT null
```

**Commit:** `OB-195 Layer 3: Source date extraction for reference data temporal columns`

---

### Layer 4: Convergence cache invalidation on new imports

**File:** `web/src/app/api/import/sci/execute-bulk/route.ts` (post-commit section) AND/OR `web/src/app/api/import/sci/execute/route.ts`

**Current behavior:** HF-165 caches convergence results in `rule_sets.input_bindings`. Once populated, convergence never re-runs for that plan. If a quota file is imported AFTER the first calculation, the cached bindings don't include the new data type, and convergence doesn't re-derive.

**Required behavior:** After ANY new data is committed to committed_data for a tenant, invalidate the cached input_bindings on ALL rule_sets for that tenant. This forces convergence to re-run on the next calculation, discovering the new data type and generating additional derivation rules.

**Implementation:**
1. After successful committed_data insert in `processDataUnit` (transaction/target) and the fixed `processReferenceUnit`:
2. Clear `input_bindings` on all rule_sets for this tenant:
   ```typescript
   await supabase
     .from('rule_sets')
     .update({ input_bindings: {} })
     .eq('tenant_id', tenantId)
     .in('status', ['active', 'draft']);
   ```
3. Log: `[SCI Bulk] Cleared input_bindings on N rule_sets (new data imported — convergence will re-derive)`

**Why this is correct:**
- Convergence is designed to run at calc time (HF-165)
- Convergence is designed to discover ALL available data types and derive ALL required metrics
- Stale bindings prevent discovery of new data types
- Clearing bindings is safe — convergence re-derives everything on next calculation
- This aligns with the import-sequence-independence principle: data arrives in any order, the engine figures it out

**What NOT to do:**
- DO NOT selectively invalidate specific derivation rules — clear the whole thing and let convergence rebuild
- DO NOT run convergence at import time — Decision 92 says binding happens at calc time
- DO NOT invalidate bindings for other tenants — scope to the importing tenant only

**Verification:**
```sql
-- Before import: input_bindings populated
SELECT name, LEFT(input_bindings::text, 100) FROM rule_sets
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
-- After import: input_bindings cleared
-- Same query: should show {} or null
```

**Commit:** `OB-195 Layer 4: Convergence cache invalidation on new imports`

---

### Layer 5: Convergence Pass 4 — reference data metric discovery

**File:** `web/src/lib/intelligence/convergence-service.ts`, Pass 4 (AI semantic derivation — OB-185)

**Current behavior:** Pass 4 AI receives plan metric requirements and data column inventory. It generates derivation rules like `consumable_revenue → sum(total_amount) WHERE product_category = 'Consumables'`. But it only looks at transaction data columns. It doesn't know about quota/reference data columns from a different import batch.

**Required behavior:** Pass 4 must see ALL data types available for this tenant, including reference/quota data. The data column inventory passed to the AI must include columns from ALL committed_data rows, not just the primary transaction data type.

**Implementation:**
1. Read the convergence service's data capability discovery (where it builds the column inventory)
2. Ensure it queries committed_data across ALL data_types for this tenant, not just one
3. The AI then sees: transaction data has `total_amount`, `product_category`, etc. Reference data has `monthly_quota`, `effective_date`, etc.
4. The AI can now produce: `monthly_quota → sum(monthly_quota)` from the reference data type (sum of one value = that value)
5. The engine's `applyMetricDerivations` already filters by data_type if the derivation rule specifies a `source_pattern` — this ensures the quota derivation reads from the quota data, not from transaction data

**Key insight:** `aggregateMetrics` sums ALL numeric fields across ALL rows for an entity. If the quota rows are fetched for the entity (via OB-183 entity resolution + source_date binding), `monthly_quota: 25000` will appear in the metrics map. The derivation rule just needs to ensure the right rows are selected.

**Actually — step back.** Does convergence even need a new derivation rule for `monthly_quota`? If Layer 1-3 are done correctly:
- Quota rows are in committed_data with source_date and entity_id_field ✅
- Engine fetches ALL committed_data rows for the tenant + period (source_date range) ✅
- OB-183 resolves entity_id from row_data ✅
- `aggregateMetrics` sums ALL numeric fields across ALL entity rows ✅
- `monthly_quota: 25000` appears in the metrics map naturally ✅

**The question:** Does `aggregateMetrics` run across ALL data types, or does it filter by data_type? If it sums across all rows regardless of data_type, then no new derivation rule is needed — the quota value flows through automatically.

**Read the actual code** in `aggregateMetrics` and the metric resolution path. If it already sums across all entity rows (which it appears to from AUD-001), then Layer 5 may be unnecessary. If it filters by data_type, then a derivation rule is needed.

**DIAG first, then implement.** CC must read the code and confirm whether `aggregateMetrics` receives quota rows BEFORE writing any convergence changes.

**Commit:** `OB-195 Layer 5: Convergence reference data discovery (if needed — see DIAG)`

---

### Layer 6: Integration test — quota file end-to-end

This is not code — this is verification that Layers 1-5 work together.

**Test sequence:**
1. Clean slate CRP tenant (or clear the quota-related data)
2. Import roster → entities created ✅
3. Import transaction files → committed_data with source_date and entity_id_field ✅
4. Import quota file (05_CRP_Quotas_20260101.csv) → committed_data with source_date and entity_id_field
5. Verify: `source_dates` not empty in Vercel logs
6. Verify: `entity_id_field` set in metadata
7. Verify committed_data has quota rows:
   ```sql
   SELECT source_date, metadata->>'entity_id_field', COUNT(*)
   FROM committed_data
   WHERE tenant_id = '{CRP}' AND row_data::text ILIKE '%monthly_quota%'
   GROUP BY 1, 2;
   ```
8. Create periods (if not existing)
9. Calculate Plan 2 January
10. Vercel logs should show:
    - `HF-165: input_bindings empty — running calc-time convergence` (bindings were invalidated by Layer 4)
    - Convergence discovers `monthly_quota` metric
    - `N committed_data rows (N entity-level, 0 store-level)` — count should be HIGHER than before (includes quota rows)
    - Entity metrics include `monthly_quota: 25000` (or 18000)
    - piecewise_linear ratio ≠ 0
    - Grand total closer to GT $28,159.48

**Write a headless verification script** (Rule 22) that:
- Queries committed_data for CRP tenant
- Counts rows by data_type
- Confirms quota rows exist with source_date and entity_id_field
- Simulates aggregateMetrics for one entity
- Verifies `monthly_quota` appears in the resulting metrics map

**Commit:** `OB-195 Layer 6: Integration test and verification`

---

## PHASE STRUCTURE

| Phase | Layer | What |
|-------|-------|------|
| 0 | — | DIAG: Read processReferenceUnit, processDataUnit, extractSourceDate, aggregateMetrics. Confirm code locations. |
| 1 | Layer 1 | Reference pipeline → committed_data |
| 2 | Layer 2 | Target Agent scoring improvement |
| 3 | Layer 3 | Source date extraction for effective_date |
| 4 | Layer 4 | Convergence cache invalidation |
| 5 | Layer 5 | Convergence reference data discovery (if needed per DIAG) |
| 6 | Layer 6 | Integration test + headless verification |
| 7 | — | Build verification (tsc + lint + git stash on committed code) |
| 8 | — | Completion report |
| 9 | — | PR creation |

One commit per phase. Rule 51v2 for final build.

---

## PROOF GATES — HARD

| # | Gate | How to Verify |
|---|------|---------------|
| 1 | `npm run build` exits 0 | Paste exit code |
| 2 | `tsc --noEmit` exits 0 (committed code, git stash) | Paste output |
| 3 | `npm run lint` exits 0 (committed code, git stash) | Paste output |
| 4 | processReferenceUnit writes to committed_data, NOT reference_data/reference_items | `grep -n "reference_data\|reference_items" web/src/app/api/import/sci/execute-bulk/route.ts` — only in comments, not in INSERT statements |
| 5 | processReferenceUnit includes source_date extraction | `grep -n "extractSourceDate\|source_date" processReferenceUnit` |
| 6 | processReferenceUnit includes entity_id_field in metadata | `grep -n "entity_id_field" processReferenceUnit` |
| 7 | Convergence invalidation on import | `grep -n "input_bindings\|Cleared.*convergence" web/src/app/api/import/sci/execute-bulk/route.ts` |
| 8 | Korean Test: zero hardcoded field names in scoring changes | `grep -n "monthly_quota\|effective_date\|quota\|target" web/src/lib/sci/agents.ts` — 0 matches |
| 9 | One commit per phase (minimum 8 commits) | `git log --oneline -10` |
| 10 | Headless verification script runs and passes | Paste script output |

## PROOF GATES — SOFT

| # | Gate |
|---|------|
| 1 | No modifications to SCI Execute reference pipeline (already compliant per OB-162) |
| 2 | No modifications to reference_data/reference_items table schema |
| 3 | No modifications to intent-executor.ts (piecewise_linear executor is correct) |
| 4 | No modifications to intent-transform.ts (transform is correct) |
| 5 | BCL regression: BCL calculation unaffected (verify with existing GT) |

---

## WHAT NOT TO DO

1. **DO NOT create new tables or columns.** Use existing committed_data structure.
2. **DO NOT hardcode field names** (monthly_quota, effective_date, quota). Korean Test.
3. **DO NOT modify the intent executor.** The piecewise_linear executor is correct — it's the inputs that are missing.
4. **DO NOT modify the intent transform.** The transform passes through correctly.
5. **DO NOT write to BOTH committed_data AND reference_items.** committed_data only per Decision 111.
6. **DO NOT run convergence at import time.** Decision 92 — binding at calc time only.
7. **DO NOT add console.log inside per-row loops.** Rule 20.
8. **DO NOT skip the DIAG phase** (Phase 0). Read the actual code before writing any fix. SR-A.

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-195_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE.

---

## POST-MERGE PRODUCTION VERIFICATION (Andrew)

1. **Clean slate CRP tenant** (or clear quota data + fingerprints)
2. **Import roster** → 32 entities
3. **Import transaction files** → committed_data with source_date ✅
4. **Import quota file** (05_CRP_Quotas_20260101.csv):
   - Vercel logs: classification should be "target" (not "entity")
   - Vercel logs: `source_dates` NOT empty
   - Vercel logs: rows committed to committed_data
5. **Verify quota data in committed_data:**
   ```sql
   SELECT source_date, metadata->>'entity_id_field', row_data->>'monthly_quota', COUNT(*)
   FROM committed_data
   WHERE tenant_id = '{CRP}' AND row_data::text ILIKE '%monthly_quota%'
   GROUP BY 1, 2, 3;
   ```
6. **Calculate Plan 2 January:**
   - Vercel logs: `input_bindings empty — running calc-time convergence` (bindings invalidated)
   - Vercel logs: convergence discovers `monthly_quota`
   - Grand total should be closer to $28,159.48 (GT)
7. **Calculate Plan 1 January (regression):**
   - Must still produce $73,142.72 (Jan 1-15) and $109,139.46 (Jan 16-31)

---

## PR CREATION

```bash
cd ~/spm-platform
gh pr create --base main --head dev \
  --title "OB-195: Reference data pipeline — end-to-end vertical slice" \
  --body "Completes the reference data pipeline from Decision 92 and Decision 111.

  Layer 1: SCI Bulk reference pipeline writes to committed_data (was writing to deprecated reference_items)
  Layer 2: Target Agent scoring for quota/reference files (structural — no hardcoded field names)
  Layer 3: Source date extraction for non-standard temporal columns
  Layer 4: Convergence cache invalidation when new data is imported
  Layer 5: Convergence discovers reference data metrics (if needed)
  Layer 6: Integration test with headless verification

  Impact: Unblocks any plan requiring non-transaction data (quotas, targets, rate cards).
  Proves: CRP Plan 2 (piecewise_linear with quota-based attainment tiers).
  
  Decisions enforced: 92 (source_date + 5th agent), 111 (all data → committed_data), 112 (AI-Primary convergence)."
```

---

*"Every answer was in our own decisions. Decision 92 defined reference data. Decision 111 said all data goes to committed_data. The architecture is right. This OB completes the wiring."*
