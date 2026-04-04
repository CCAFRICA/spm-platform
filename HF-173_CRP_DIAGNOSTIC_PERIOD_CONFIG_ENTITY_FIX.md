# HF-173: CRP Diagnostic + Period Configuration + Entity Metadata Fix

## MANDATORY — READ FIRST
Include CC_STANDING_ARCHITECTURE_RULES.md at the top of your working context.

## Classification
- **Type:** HF (Hot Fix)
- **Priority:** P0
- **Scope:** Database queries + inserts ONLY. **ZERO engine code changes.**
- **Addresses:** CLT-187 F16 (unresolved rows), F17 (entities at $0), William Drake variant mismatch, bi-weekly period gap
- **Does NOT touch:** Any source code. No .ts, .tsx, .js files. This HF is entirely Supabase SQL Editor operations + browser verification.

---

## CONTEXT

CRP tenant (e44bbcb1-2710-4880-8c7d-a1bd902720b7) has 4 plans. After HF-172 fixed metric derivation filters, Plans 1-3 produce real calculations but with known gaps:

| Plan | Engine | GT (Jan) | Gap Cause |
|------|--------|----------|-----------|
| Plan 1 (Capital Equipment) | $173,358 | $182,282 | Monthly period (1 intercept) vs GT bi-weekly (2 intercepts) + William Drake wrong variant |
| Plan 2 (Consumables) | $15,466 | $28,159 | Quota not available — separate HF |
| Plan 3 (Cross-Sell) | $2,300 | $2,400 | Hidden entities gap only — 17/17 visible match |
| Plan 4 (District Override) | $0 | $66,757 (Jan) | scope_aggregate architecture — separate HF |

This HF fixes the issues that require NO code changes: period configuration, entity metadata, and diagnostics.

---

## PHASE 1: DIAGNOSTICS (Read-Only Queries)

Run these in Supabase SQL Editor. **Paste the full results into the completion report.**

### Query 1: William Drake's entity metadata and temporal_attributes

```sql
SELECT
  e.id,
  e.external_id,
  e.display_name,
  e.entity_type,
  e.metadata::text,
  e.temporal_attributes::text
FROM entities e
WHERE e.tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
  AND e.display_name = 'William Drake'
```

**What to look for:** Does `metadata` or `temporal_attributes` contain a field with the value "Senior Rep" or "Senior"? If not, the variant discriminant tokenizer can't find the "senior" token, and Drake defaults to the Rep variant (wrong rates).

### Query 2: Compare ALL entity metadata — who has role info and who doesn't

```sql
SELECT
  e.display_name,
  e.external_id,
  e.metadata::text,
  e.temporal_attributes::text
FROM entities e
WHERE e.tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
ORDER BY e.display_name
```

**What to look for:** Compare entities that the engine correctly identifies as Senior Rep (Tyler Morrison, Kevin O'Brien, Brian Foster, Patrick Sullivan, Thomas Grant) vs William Drake. What field contains their role? Is Drake missing it?

### Query 3: The 16 unresolved committed_data rows

```sql
SELECT
  cd.row_data::text,
  cd.source_date,
  cd.data_type
FROM committed_data cd
WHERE cd.tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
  AND cd.entity_id IS NULL
ORDER BY cd.source_date
```

**What to look for:** Are these manager/RVP entries (CRP-6001 through CRP-6006)? Or are they rep entries with mismatched sales_rep_id? The 16 unresolved rows explain 16 of the 389 total rows that the engine fetches but can't attribute to entities.

### Query 4: Current period configuration

```sql
SELECT
  p.id,
  p.label,
  p.period_type,
  p.start_date,
  p.end_date,
  p.canonical_key,
  p.status
FROM periods p
WHERE p.tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
ORDER BY p.start_date
```

**What to look for:** Currently there should be ONE period: "January 2026" (monthly). We need to verify its exact dates and then create bi-weekly periods.

---

## PHASE 2: FIX WILLIAM DRAKE'S ENTITY METADATA

**This phase depends on Query 1 and Query 2 results.**

### Scenario A: Drake is missing role metadata entirely

If Query 1 shows Drake's `metadata` and `temporal_attributes` have no role field, but other Senior Reps (e.g., Patrick Sullivan) DO have role info, then Drake's roster import didn't populate his role.

**Fix:** Update Drake's metadata to include his role. Use the SAME field name and structure that the working Senior Reps use (discovered from Query 2).

For example, if Patrick Sullivan's metadata contains `{"role": "Senior Rep", ...}`, update Drake:

```sql
UPDATE entities
SET metadata = jsonb_set(
  metadata,
  '{role}',
  '"Senior Rep"'
),
updated_at = now()
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
  AND display_name = 'William Drake'
```

**IMPORTANT:** Do NOT hardcode the field name. Check Query 2 results first. Use whatever field name the WORKING Senior Reps use. If the field is in `temporal_attributes` instead of `metadata`, update that column instead.

### Scenario B: Drake HAS role metadata but it's not being tokenized

If Query 1 shows Drake's metadata DOES contain "Senior Rep" and other Seniors have the same structure, then the issue is in the materialization layer (OB-177), not the data. **Do NOT fix in this HF** — document for HF-174 or HF-175.

### Scenario C: NO entities have role metadata — variant matching uses committed_data

If Query 2 shows that NO entities have role in metadata (including the ones that work), then the variant matching is getting the "senior" token from committed_data row_data, and Drake's rows happen not to contain it. This is possible if some reps have a role field in their transaction rows and Drake doesn't.

**In this case:** Check if there's a roster import_batch in committed_data that contains role information. The roster rows would have `data_type` containing "roster" and row_data with role fields. If Drake's roster row exists but has a different format, update it.

**PASTE QUERY 1 AND QUERY 2 RESULTS INTO THE COMPLETION REPORT BEFORE PROCEEDING.**

---

## PHASE 3: CREATE BI-WEEKLY PERIODS FOR JANUARY

CRP Plan 1 (Capital Equipment) is a bi-weekly plan (Decision 144). The GT expects two calculation periods per month:
- Jan 1-15, 2026
- Jan 16-31, 2026

Currently the engine has only one monthly period (January 2026). The engine computes `y = mx + b` once per month, applying one intercept. The GT computes it twice (one intercept per bi-weekly period), producing $4,000 more ($200 or $150 intercept × 2 periods vs × 1).

### Step 3a: Verify the existing monthly period (from Query 4)

Note the existing period's `id`, `start_date`, `end_date`, and `status`.

### Step 3b: Create bi-weekly periods

```sql
INSERT INTO periods (tenant_id, label, period_type, status, start_date, end_date, canonical_key, metadata)
VALUES
  ('e44bbcb1-2710-4880-8c7d-a1bd902720b7', 'Jan 1-15 2026', 'bi-weekly', 'open', '2026-01-01', '2026-01-15', '2026-BW01', '{}'),
  ('e44bbcb1-2710-4880-8c7d-a1bd902720b7', 'Jan 16-31 2026', 'bi-weekly', 'open', '2026-01-16', '2026-01-31', '2026-BW02', '{}')
```

### Step 3c: Verify creation

```sql
SELECT id, label, period_type, start_date, end_date, canonical_key, status
FROM periods
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
ORDER BY start_date
```

**Paste the result showing all 3 periods (1 monthly + 2 bi-weekly).**

### Step 3d: Do NOT delete the monthly period

Plan 2 (Consumables), Plan 3 (Cross-Sell), and Plan 4 (District Override) are monthly plans. They need the monthly period. Only Plan 1 will be calculated against the bi-weekly periods.

---

## PHASE 4: BROWSER VERIFICATION

### Test 1: Calculate Plan 1 for bi-weekly period "Jan 1-15 2026"

1. Navigate to CRP tenant → Calculate page (via URL if Stream navigation is broken)
2. Select Plan 1 (Capital Equipment Commission Plan)
3. Select period "Jan 1-15 2026"
4. Calculate
5. **Capture the Vercel Runtime Log**

**Expected:** Tyler Morrison should show ~$10,971.62 (GT for Jan 1-15). William Drake should show ~$5,916.98 (if metadata fix worked) or ~$3,961.32 (if still on Rep variant). Grand total should be approximately half of $182,282.

### Test 2: Calculate Plan 1 for bi-weekly period "Jan 16-31 2026"

1. Same as above but select "Jan 16-31 2026"
2. Calculate
3. **Capture the Vercel Runtime Log**

**Expected:** The sum of Test 1 + Test 2 grand totals should equal approximately $182,282.18 (the GT bi-weekly total) if Drake's variant is fixed, or ~$177,882 if Drake is still wrong.

### Test 3: Regression — Calculate Plans 2, 3, 4 for monthly January 2026

1. Calculate Plan 2 for "January 2026" → expect $15,466.47 (unchanged from HF-172)
2. Calculate Plan 3 for "January 2026" → expect $2,300 (unchanged from HF-172)
3. Calculate Plan 4 for "January 2026" → expect $0 (still broken — separate HF)

**CRITICAL: Plans 2, 3, 4 must produce IDENTICAL results to pre-HF-173 values.** This HF makes zero code changes, so the monthly period calculations must not be affected.

### Test 4: Verify William Drake's variant assignment

In the Plan 1 Vercel logs, look for the `[VARIANT]` line for William Drake:
- **PASS:** `William Drake: disc=[V0:1,...] → variant_0 (discriminant_token)` — Senior variant
- **FAIL:** `William Drake: disc=[V0:0,...] → variant_1 (default_last)` — still Rep variant

---

## COMPLETION REPORT REQUIREMENTS

The completion report MUST include:

1. **Query 1 result:** Drake's entity metadata (full JSONB)
2. **Query 2 result:** All entities' metadata (identify role field pattern)
3. **Query 3 result:** The 16 unresolved rows (identify what they are)
4. **Query 4 result:** Period configuration before changes
5. **Drake fix:** What was changed and why (or Scenario B/C documentation)
6. **Period creation:** SQL executed + verification query result showing 3 periods
7. **Test 1 Vercel log:** Plan 1, Jan 1-15 (entity-level results + grand total)
8. **Test 2 Vercel log:** Plan 1, Jan 16-31 (entity-level results + grand total)
9. **Test 3 results:** Plans 2, 3, 4 monthly — confirm identical to pre-HF-173
10. **Test 4 result:** Drake variant assignment line from Vercel log

---

## GROUND TRUTH TARGETS

### Plan 1 — Bi-Weekly (if Drake variant is fixed)

| Period | GT Total |
|--------|----------|
| Jan 1-15 2026 | $73,142.72 |
| Jan 16-31 2026 | $109,139.46 |
| **January Total** | **$182,282.18** |

### Plans 2-4 — Monthly (regression check, must not change)

| Plan | Expected |
|------|----------|
| Plan 2 | $15,466.47 |
| Plan 3 | $2,300.00 |
| Plan 4 | $0.00 |

---

## GIT

This HF involves NO code changes. No git commit, no PR, no merge.

All changes are Supabase SQL Editor operations (entity metadata update + period inserts).

If the Drake fix requires code changes (Scenario B), document in the completion report and defer to HF-174.

---

## SCOPE BOUNDARY — DO NOT CHANGE

- **Do NOT modify** any source code files
- **Do NOT delete** the existing monthly period
- **Do NOT modify** rule_sets, input_bindings, or components
- **Do NOT modify** committed_data
- **Do NOT clean slate** the CRP tenant
- **Do NOT reimport** any data files
- **Do NOT modify** any entities other than William Drake's metadata (if Scenario A)
- **Do NOT touch** the VL Admin account
