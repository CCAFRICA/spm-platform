# OB-187: Intelligent Period Detection and Creation

## CC STANDING ARCHITECTURE RULES
Reference: `CC_STANDING_ARCHITECTURE_RULES.md` v3.0 — all rules apply. Rules 1-39 active.

---

## PREAMBLE — READ THIS BEFORE ANYTHING ELSE

### What This OB Is About

This OB transforms "Create Periods from Data" from a dumb button that silently creates a single monthly period into an **intelligent surface** that detects all needed periods from the data and plan cadences, presents them to the user for confirmation, and creates them in one action — without leaving the Calculate page.

### Why This Matters — Platform Principles at Stake

**IAP Gate (Intelligence, Acceleration, Performance):**
- **Intelligence:** The platform knows the data date ranges (committed_data.source_date). It knows plan cadences (rule_sets.cadence_config). It can derive what periods are needed. This is intelligence — not making the user manually enter date ranges on a different screen.
- **Acceleration:** One click to create all needed periods. Not: click button → get one monthly period → navigate to Configure → Periods → manually create biweekly periods → navigate back to Calculate.
- **Performance:** With correct periods, calculation can proceed immediately. No dead ends, no "period selector empty" states.

**DS-013 Five Elements Test — every element of the Period Detection surface must contain:**
1. **Value:** "3 periods detected from your data and plan configurations"
2. **Context:** "Plan 1 (Capital Equipment) uses biweekly cadence. Plans 2-4 use monthly."
3. **Comparison:** "1 period already exists (January 2026 Monthly). 2 additional periods needed."
4. **Action:** Checkboxes to select which periods to create. "Create Selected" button.
5. **Impact:** "After creation, all 4 plans will have matching periods for calculation."

**Vertical Slice:** The user flow is: Calculate page → "Create Periods from Data" → modal/panel shows detected periods → user confirms → periods created → period selector populates → user selects plan + period → Calculate. ALL ON THE CALCULATE PAGE. Zero screen changes.

**Thermostat, Not Thermometer:** The platform doesn't just show "you need periods" — it creates them. It doesn't just create one type — it detects what's needed from the actual data.

---

## CURRENT STATE (BROKEN)

### What "Create Periods from Data" Does Now
1. Queries committed_data for year/month columns
2. Generates `canonical_key` as `{year}-{month}` (e.g., `2026-01`)
3. Creates a single monthly period with `period_type: 'monthly'`
4. Ignores plan cadence entirely
5. User must navigate to Configure → Periods to manually create biweekly periods
6. Manual creation fails with `duplicate key value violates unique constraint "periods_tenant_id_canonical_key_key"` because the biweekly canonical_key collides with the monthly one

### What's Wrong
- `canonical_key` is derived from year-month only — biweekly periods for the same month produce the same key
- No awareness of plan cadences (rule_sets.cadence_config)
- No awareness of actual date ranges in committed_data.source_date
- Creates periods silently with no user confirmation
- No Five Elements — just a button that does one thing
- Violates IAP — user must leave the page to complete period setup

---

## WHAT THIS OB DELIVERS

### Phase 1: Period Detection API

**File:** `/api/periods/detect` (new route) or modify existing `/api/periods/create-from-data`

**Input:** `{ tenantId: string }`

**Logic:**
1. Query all rule_sets for the tenant: `SELECT id, name, cadence_config FROM rule_sets WHERE tenant_id = $1`
2. Extract cadence from each: `cadence_config->'period_type'` (will be `'monthly'`, `'biweekly'`, etc.)
3. Query committed_data date ranges: `SELECT MIN(source_date) as min_date, MAX(source_date) as max_date FROM committed_data WHERE tenant_id = $1 AND source_date IS NOT NULL`
4. For each unique cadence found across plans, generate the periods that span the data range:
   - **monthly:** Standard calendar months from min_date to max_date
   - **biweekly:** Split each month into 1st-15th and 16th-last_day
   - Other cadences: weekly, quarterly — implement structurally for future use
5. Query existing periods: `SELECT canonical_key FROM periods WHERE tenant_id = $1`
6. Return detected periods with status (exists / new):

**Output:**
```json
{
  "detected": [
    {
      "label": "January 2026",
      "period_type": "monthly",
      "start_date": "2026-01-01",
      "end_date": "2026-01-31",
      "canonical_key": "monthly_2026-01-01_2026-01-31",
      "exists": true,
      "used_by_plans": ["Consumables Plan", "Cross-Sell Bonus", "District Override"]
    },
    {
      "label": "January 1-15, 2026",
      "period_type": "biweekly",
      "start_date": "2026-01-01",
      "end_date": "2026-01-15",
      "canonical_key": "biweekly_2026-01-01_2026-01-15",
      "exists": false,
      "used_by_plans": ["Capital Equipment Plan"]
    },
    {
      "label": "January 16-31, 2026",
      "period_type": "biweekly",
      "start_date": "2026-01-16",
      "end_date": "2026-01-31",
      "canonical_key": "biweekly_2026-01-16_2026-01-31",
      "exists": false,
      "used_by_plans": ["Capital Equipment Plan"]
    }
  ],
  "summary": {
    "total_detected": 3,
    "already_exist": 1,
    "new_needed": 2,
    "cadences_found": ["monthly", "biweekly"],
    "data_range": { "min": "2026-01-01", "max": "2026-01-31" }
  }
}
```

### Canonical Key Fix

**The canonical_key format changes from `{year}-{month}` to `{period_type}_{start_date}_{end_date}`.**

Examples:
- Monthly January: `monthly_2026-01-01_2026-01-31`
- Biweekly first half: `biweekly_2026-01-01_2026-01-15`
- Biweekly second half: `biweekly_2026-01-16_2026-01-31`
- Quarterly Q1: `quarterly_2026-01-01_2026-03-31`

This format is:
- Unique per period type + date range (no collisions)
- Human-readable in database queries
- Korean Test compliant (structural, no domain terms)
- Sortable (lexicographic sort = chronological within type)

**IMPORTANT:** The existing monthly period for CRP has `canonical_key: '2026-01'`. The old format must still be handled — do NOT break existing periods. The detection query checks for existing periods by matching `start_date` AND `end_date` AND `period_type`, not by canonical_key. New periods use the new format. Existing periods are left as-is.

### Phase 2: Period Detection UI on Calculate Page

**Location:** The Calculate page, triggered by "Create Periods from Data" button.

**UX Flow:**
1. User clicks "Create Periods from Data" on the Calculate page
2. A modal or slide-over panel appears (NOT a navigation to another page)
3. The panel calls `/api/periods/detect` and shows a loading state
4. Results appear as a checklist:

```
╔══════════════════════════════════════════════════════════════╗
║  Detected Periods from Your Data                           ║
╠══════════════════════════════════════════════════════════════╣
║                                                            ║
║  Data range: January 1 – January 31, 2026                  ║
║  Cadences found: Monthly (3 plans), Biweekly (1 plan)      ║
║                                                            ║
║  ✅ January 2026 (Monthly)              Already exists     ║
║     Used by: Consumables, Cross-Sell, District Override     ║
║                                                            ║
║  ☑️ January 1-15, 2026 (Biweekly)       NEW               ║
║     Used by: Capital Equipment Plan                        ║
║                                                            ║
║  ☑️ January 16-31, 2026 (Biweekly)      NEW               ║
║     Used by: Capital Equipment Plan                        ║
║                                                            ║
║  ┌─────────────────────────────────────────────────────┐   ║
║  │  Create 2 New Periods                               │   ║
║  └─────────────────────────────────────────────────────┘   ║
║                                                            ║
╚══════════════════════════════════════════════════════════════╝
```

5. **Five Elements in action:**
   - **Value:** "3 periods detected" — the platform did the work
   - **Context:** "Monthly (3 plans), Biweekly (1 plan)" — cadence-to-plan mapping
   - **Comparison:** "Already exists" vs "NEW" — what's done vs what's needed
   - **Action:** Checkboxes + "Create N New Periods" button — user confirms and acts
   - **Impact:** After creation, the period selector on Calculate populates and plans can be calculated

6. User clicks "Create 2 New Periods"
7. API creates the periods
8. Modal closes
9. Period selector on Calculate page refreshes and shows all 3 periods
10. User can now select a plan + period and calculate

**Existing periods show as checked but disabled (already exist).** New periods are checked by default. User can uncheck if they don't want to create a specific period.

### Phase 3: Period Creation API Fix

**File:** `/api/periods` (POST handler) and `/api/periods/create-from-data`

**Changes:**
1. Accept periods with the new `canonical_key` format
2. `canonical_key` is passed from the detection response (not generated server-side from year-month)
3. `status` defaults to `'open'` (not `'draft'` — HF-174 fix, verify this is in the deployed code)
4. Batch insert all selected periods in one database call

### Phase 4: Cadence-Aware Period Filtering on Calculate Page

**This was designed in OB-186 but needs to be verified working with the new period structure.**

When a user selects a plan on the Calculate page:
1. Read the plan's `cadence_config.period_type`
2. Filter the period dropdown to only show periods matching that cadence
3. If the plan is biweekly, only biweekly periods appear
4. If the plan is monthly, only monthly periods appear

### Phase 5: Cleanup — Remove Navigate-Away Pattern

**Remove or disable** any "Manage Periods" link/button on the Calculate page that navigates to Configure → Periods. The user should not need to leave the Calculate page for period management. The detection panel handles creation. Configure → Periods remains for advanced management but is NOT part of the critical path.

---

## SCHEMA REFERENCE (VERIFIED)

### periods (11 columns)
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO | |
| label | text | NO | |
| period_type | text | NO | monthly |
| status | text | NO | open |
| start_date | date | NO | |
| end_date | date | NO | |
| canonical_key | text | NO | |
| metadata | jsonb | NO | |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**Unique constraint:** `periods_tenant_id_canonical_key_key` on (tenant_id, canonical_key)

### rule_sets — relevant columns
| Column | Type |
|--------|------|
| cadence_config | jsonb |
| name | text |

`cadence_config` contains: `{ "period_type": "monthly" | "biweekly" | ... }`

### committed_data — relevant columns
| Column | Type |
|--------|------|
| source_date | date (nullable) |
| tenant_id | uuid |

---

## ANTI-PATTERNS TO AVOID

| Anti-Pattern | Rule | What To Do Instead |
|---|---|---|
| Navigate away from Calculate page for period creation | IAP — Acceleration | Modal/panel on same page |
| Create periods silently without showing user what's detected | IAP — Intelligence | Show detection results, let user confirm |
| Generate canonical_key from year-month only | Bug — unique constraint violation | Use `{period_type}_{start_date}_{end_date}` |
| Hardcode period_type to 'monthly' | Korean Test | Read cadence from rule_sets.cadence_config |
| Status 'draft' for new periods | HF-174 | Status must be 'open' |
| Separate OB for engine vs UI | Vertical Slice Rule | This OB includes API + UI + integration |

---

## PROOF GATES — HARD

| # | Criterion | How to Verify |
|---|-----------|---------------|
| 1 | `/api/periods/detect` returns detected periods with cadence awareness | curl with CRP tenant_id, verify biweekly + monthly detected |
| 2 | Canonical key uses `{period_type}_{start_date}_{end_date}` format | Query periods table after creation, verify key format |
| 3 | No canonical_key collision between monthly and biweekly periods for same month | Create both types for January, no constraint error |
| 4 | Detection panel shows on Calculate page (no navigation away) | Screenshot: panel visible on /operate/calculate |
| 5 | Five Elements present: value, context, comparison, action, impact | Screenshot: all 5 visible in panel |
| 6 | "Already exists" shown for existing periods | Screenshot: existing monthly shows as already created |
| 7 | "Create N New Periods" creates only new periods | Click button, verify only biweekly periods inserted |
| 8 | Period selector populates after creation (no page reload required) | Screenshot: period dropdown shows all 3 periods |
| 9 | Cadence filtering: selecting biweekly plan shows only biweekly periods | Screenshot: Plan 1 selected, only biweekly periods visible |
| 10 | Cadence filtering: selecting monthly plan shows only monthly periods | Screenshot: Plan 2 selected, only monthly period visible |
| 11 | Existing period with old canonical_key format ('2026-01') still works | Verify old period is found by start_date/end_date match, not key format |

## PROOF GATES — SOFT

| # | Criterion |
|---|-----------|
| 1 | Panel has loading state while detection runs |
| 2 | Error handling if no committed_data exists |
| 3 | Error handling if no rule_sets exist |
| 4 | "Used by" plan names are accurate |
| 5 | Panel can be dismissed without creating periods |

---

## BUILD VERIFICATION GATE

**Rule 51 + Amendment:** All verification must target COMMITTED code.

```bash
# MANDATORY before completion report:
cd web
rm -rf .next
git stash
npx tsc --noEmit
echo "tsc exit code: $?"
git stash pop

# Verify committed code:
git show HEAD:web/src/app/api/periods/detect/route.ts | head -5
# (or wherever the new route is — must exist in committed code)
```

**Paste the COMPLETE terminal output in the completion report.**

`npm run build` alone is NOT accepted. `grep` against working directory is NOT accepted. All verification must use `git show HEAD:` or `git stash` before build.

---

## COMPLETION REPORT STRUCTURE

```markdown
# OB-187 COMPLETION REPORT
## Date: [DATE]
## Execution Time: [TIME]

## COMMITS
| Hash | Phase | Description |
|------|-------|-------------|

## FILES CREATED
| File | Purpose |

## FILES MODIFIED
| File | Change |

## PROOF GATES — HARD
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |
[paste screenshot descriptions, curl outputs, query results]

## PROOF GATES — SOFT
| # | Criterion (VERBATIM from prompt) | PASS/FAIL | Evidence |

## BUILD VERIFICATION EVIDENCE
```
[PASTE complete terminal session: git stash, rm -rf .next, npx tsc --noEmit, exit code, git stash pop]
[PASTE git show HEAD: for new/modified files]
```

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): PASS/FAIL
- Rule 7 (git from repo root): PASS/FAIL
- Rule 51 (npx tsc --noEmit + git show HEAD:): PASS/FAIL
- Rule 51 Amendment (verification against committed code): PASS/FAIL
- Rule 52 (UI PASS requires action execution): PASS/FAIL
- Rule 53 (UX changes before/after): PASS/FAIL

## FIVE ELEMENTS VERIFICATION
For the period detection panel, identify where each element appears:
1. VALUE: [what and where]
2. CONTEXT: [what and where]
3. COMPARISON: [what and where]
4. ACTION: [what and where]
5. IMPACT: [what and where]

## KNOWN ISSUES
```

---

## WHAT SUCCESS LOOKS LIKE

A tenant admin on the Calculate page clicks "Create Periods from Data." A panel appears showing: "3 periods detected — 1 monthly (already exists, used by 3 plans), 2 biweekly (new, used by Capital Equipment Plan)." The admin clicks "Create 2 New Periods." The panel closes. The period selector now shows all 3 periods. The admin selects Plan 1 (biweekly), sees only the 2 biweekly periods. Selects "January 1-15, 2026." Clicks Calculate.

No SQL Editor. No Configure → Periods. No navigation away. No canonical_key errors. Intelligence. Acceleration. Performance.
