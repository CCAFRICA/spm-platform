# OB-188: Intelligent Period Setup — Data-Driven Detection, Plan Cadence Editing, Commentary Engine

## CC STANDING ARCHITECTURE RULES
Reference: `CC_STANDING_ARCHITECTURE_RULES.md` v3.0 — all rules apply. Rules 1-39 active.

---

## PREAMBLE — THE EXPERIENCE WE ARE BUILDING

### The User Tomorrow

The admin is on the Calculate page. They click "Set Up Periods." A panel appears.

**Section 1 — Data Intelligence (no plan dependency):**

The panel header reads: *"Your data spans January 1 – January 31, 2026 (389 transactions)"*

This comes from committed_data.source_date alone. No plans are required. Even if zero plans exist, the platform knows the time boundaries of the data.

**Section 2 — Plan Cadence Context (optional enrichment):**

If plans exist, a cadence summary appears: *"Plan cadences: Capital Equipment (biweekly), Consumables (monthly), Cross-Sell (monthly), District Override (monthly)"*

Each plan cadence is displayed as an inline editable chip/badge. If the AI got the cadence wrong during import, the admin clicks the cadence badge next to the plan name and changes it — right here, right now. No navigate to a plan editing page. The platform updates the rule_set's cadence_config immediately.

**Section 3 — Suggested Periods:**

Based on the data range and (optionally) plan cadences, the platform suggests periods:

- If no plans or all plans are monthly: suggest monthly periods covering the data range
- If any plan is biweekly: also suggest biweekly periods covering the data range
- If any plan is quarterly: also suggest quarterly periods

Each suggested period shows:
- Name, type, date range
- Transaction count: *"389 transactions"* or *"214 transactions"*
- Plan alignment: *"Matches: Consumables, Cross-Sell, District Override"*
- Status: "Already exists" (green, disabled) or "New" (checked, selectable)

**Section 4 — Commentary Engine (the intelligence layer):**

As the user reviews or creates periods, the platform provides live commentary:

- *"✓ All 389 transactions are covered by defined periods"* — full coverage
- *"⚠ 47 transactions (Feb 1-14) fall outside all defined periods"* — orphaned data
- *"⚠ This period covers Jan 1-31 but your data only has transactions through Jan 15"* — partial coverage
- *"⚠ No plan uses quarterly cadence — this period won't match any plan"* — unused period

**Section 5 — Action:**

"Create N New Periods" button. Creates all selected periods. Panel closes. Period selector on the Calculate page populates. Cadence filtering activates: selecting a biweekly plan shows only biweekly periods.

**The entire flow happens on the Calculate page. Zero navigation away. Zero SQL.**

---

## ARCHITECTURAL PRINCIPLE — DEPENDENCY INDEPENDENCE

**Periods depend on NOTHING.** They are independent business objects. The platform INFORMS period creation with:

1. **Data range** (committed_data.source_date) — what time does the data cover?
2. **Plan cadence** (rule_sets.cadence_config) — how often do plans evaluate?

Neither is required. The user can create periods before importing data, after importing data, before importing plans, after importing plans — in any order. The detection API works in degraded mode when either input is missing:

| Data exists? | Plans exist? | Detection behavior |
|---|---|---|
| Yes | Yes with cadence | Full suggestions: monthly + biweekly + whatever cadences exist |
| Yes | Yes without cadence | Suggest monthly periods from data range. Note: "Plan cadences not specified — defaulting to monthly" |
| Yes | No | Suggest monthly periods from data range. Note: "No plans imported yet — suggested periods based on data range only" |
| No | Yes | Show plan cadences. Note: "No transaction data imported yet — create periods manually or import data first" |
| No | No | "Import data or create periods manually to get started" |

In ALL cases, the user can manually add custom periods with any dates and any cadence.

---

## SCHEMA REFERENCE (VERIFIED against SCHEMA_REFERENCE_LIVE.md)

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

Unique constraint: `periods_tenant_id_canonical_key_key` on (tenant_id, canonical_key)

### rule_sets — relevant columns
| Column | Type | Updatable |
|--------|------|-----------|
| id | uuid | NO |
| name | text | YES |
| cadence_config | jsonb | YES |

TypeScript Update type confirms: `cadence_config?: Json` is updatable.

### committed_data — relevant columns
| Column | Type |
|--------|------|
| source_date | date (nullable) |
| tenant_id | uuid |

---

## PHASE 1: MODIFY DETECTION API — DATA-INDEPENDENT

**File:** `web/src/app/api/periods/detect/route.ts` (modify OB-187 delivery)

### Changes from OB-187:

**1a. Data range is the PRIMARY input, not plan cadence.**

```
Query 1 (ALWAYS runs):
  SELECT MIN(source_date), MAX(source_date), COUNT(*)
  FROM committed_data 
  WHERE tenant_id = $1 AND source_date IS NOT NULL

Query 2 (runs if data exists — transaction counts per suggested period):
  SELECT COUNT(*) 
  FROM committed_data 
  WHERE tenant_id = $1 
    AND source_date >= $period_start 
    AND source_date <= $period_end

Query 3 (runs independently — plan cadence enrichment):
  SELECT id, name, cadence_config->>'period_type' as cadence 
  FROM rule_sets 
  WHERE tenant_id = $1

Query 4 (runs independently — existing periods):
  SELECT id, label, canonical_key, start_date, end_date, period_type, status
  FROM periods 
  WHERE tenant_id = $1
```

**1b. Period suggestion logic:**

1. Start with the data range (min_date to max_date)
2. Always suggest monthly periods covering the data range
3. Scan plan cadences. For each UNIQUE cadence that is NOT monthly, also suggest periods of that cadence type covering the same data range
4. If no plans exist or all are monthly, only monthly is suggested
5. If no data exists, return empty suggestions with a message

**1c. Transaction count per period:**

For each suggested period (existing or new), query committed_data to get the count of rows where `source_date BETWEEN period.start_date AND period.end_date`. Return this count in the response.

**1d. Orphaned data detection:**

After computing all suggested periods, query for transactions that fall OUTSIDE all existing + suggested periods:

```
SELECT COUNT(*), MIN(source_date), MAX(source_date)
FROM committed_data 
WHERE tenant_id = $1 
  AND source_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM periods p 
    WHERE p.tenant_id = $1 
      AND source_date >= p.start_date 
      AND source_date <= p.end_date
  )
```

Note: this query checks against EXISTING periods only (already in the database). The UI will also check against suggested-but-not-yet-created periods client-side.

**1e. Response format:**

```json
{
  "data_range": {
    "min_date": "2026-01-01",
    "max_date": "2026-01-31",
    "total_transactions": 389,
    "has_data": true
  },
  "plan_cadences": [
    { "plan_id": "...", "plan_name": "Capital Equipment Commission Plan", "cadence": "biweekly" },
    { "plan_id": "...", "plan_name": "Consumables Commission Plan", "cadence": "monthly" }
  ],
  "has_plans": true,
  "suggested_periods": [
    {
      "label": "January 2026",
      "period_type": "monthly",
      "start_date": "2026-01-01",
      "end_date": "2026-01-31",
      "canonical_key": "monthly_2026-01-01_2026-01-31",
      "exists": false,
      "transaction_count": 389,
      "matching_plans": ["Consumables Commission Plan", "Cross-Sell Bonus Plan", "District Override Plan"]
    },
    {
      "label": "January 1-15, 2026",
      "period_type": "biweekly",
      "start_date": "2026-01-01",
      "end_date": "2026-01-15",
      "canonical_key": "biweekly_2026-01-01_2026-01-15",
      "exists": false,
      "transaction_count": 214,
      "matching_plans": ["Capital Equipment Commission Plan"]
    }
  ],
  "orphaned_data": {
    "count": 0,
    "min_date": null,
    "max_date": null
  },
  "commentary": [
    "Data spans January 1-31, 2026",
    "2 cadence types detected: monthly (3 plans), biweekly (1 plan)",
    "3 periods suggested to cover all plans and data"
  ]
}
```

---

## PHASE 2: PLAN CADENCE EDITING — INLINE ON THE PANEL

**File:** `web/src/app/operate/calculate/page.tsx` (modify detection panel)

**New API route:** `web/src/app/api/rule-sets/update-cadence/route.ts`

### 2a. Cadence Edit API

Simple PATCH endpoint:

```
PATCH /api/rule-sets/update-cadence
Body: { ruleSetId: string, tenantId: string, cadence: string }
```

Logic:
1. Authenticate user (standard auth pattern)
2. Verify the rule_set belongs to the tenant
3. Update: `UPDATE rule_sets SET cadence_config = jsonb_set(cadence_config, '{period_type}', '"biweekly"') WHERE id = $1 AND tenant_id = $2`
4. Return updated cadence_config

### 2b. Inline Cadence Display in Panel

In the detection panel's "Plan Cadences" section, each plan shows:

```
Capital Equipment Plan  [monthly ▾]
Consumables Plan        [monthly ▾]
Cross-Sell Bonus        [monthly ▾]
District Override       [monthly ▾]
```

The `[monthly ▾]` is a dropdown/select with options: monthly, biweekly, weekly, quarterly.

When the user changes a cadence:
1. Call PATCH `/api/rule-sets/update-cadence` 
2. On success, re-run the detection (`/api/periods/detect`) 
3. The suggested periods update to include the new cadence type
4. The commentary updates: *"Cadence updated. 2 biweekly periods now suggested."*

This is the Thermostat: the user changes the cadence, the platform immediately recalculates what periods are needed. No save button. No navigate away. Immediate response.

### 2c. Cadence Edit is NOT a Plan Editor

This is intentionally scoped to cadence ONLY. Full plan editing (components, rates, tiers) is a separate P1 backlog item (per Gap Analysis). This OB adds the minimum surface needed for the period setup flow: the ability to correct or set the evaluation cadence on a plan.

---

## PHASE 3: COMMENTARY ENGINE — LIVE VALIDATION

**Location:** Client-side in the detection panel, using data from the detect API response.

### 3a. Commentary Logic (computed client-side from API response):

**Data coverage commentary:**
- If `data_range.has_data` and all suggested periods have `transaction_count > 0`: *"✓ All {total} transactions are covered by defined periods"*
- If any suggested period has `transaction_count === 0`: *"⚠ {period.label} has no transactions — your data may not cover this period"*
- If `orphaned_data.count > 0`: *"⚠ {count} transactions ({min_date} to {max_date}) fall outside all defined periods"*

**Plan alignment commentary:**
- If a suggested period has `matching_plans.length === 0`: *"⚠ No plan uses {period_type} cadence — this period won't be used in any calculation"*
- If a plan's cadence has no matching period suggested: *"⚠ {plan_name} uses {cadence} cadence but no {cadence} periods are defined"*

**State commentary:**
- If `!data_range.has_data`: *"No transaction data imported yet — import data or create periods manually"*
- If `!has_plans`: *"No plans imported yet — periods suggested based on data range only"*
- If all plan cadences are the same: *"All plans use {cadence} cadence"*

### 3b. Commentary Display

Commentary items appear at the bottom of the panel, below the period list but above the "Create" button. Each item is color-coded:
- ✓ Green — everything aligned
- ⚠ Amber — attention needed but not blocking
- ✗ Red — critical gap (e.g., no data, no periods)

---

## PHASE 4: PERIOD SELECTOR CADENCE FILTERING ON CALCULATE PAGE

**File:** `web/src/app/operate/calculate/page.tsx`

When a user selects a plan from the plan dropdown on the Calculate page:

1. Read the selected plan's `cadence_config.period_type`
2. Filter the period dropdown to show ONLY periods where `period_type` matches
3. If the plan has no cadence set (null/undefined), show all periods (no filtering)

This prevents the user from selecting a monthly period for a biweekly plan or vice versa. The cadence match is structural — not a suggestion, a gate.

---

## PHASE 5: CANONICAL KEY FIX — VERIFY OB-187 DELIVERY

Verify that OB-187's canonical_key format `{period_type}_{start_date}_{end_date}` is working. The fix should already be in the codebase from OB-187. Verify:

```bash
grep -n "canonical_key" web/src/app/api/periods/detect/route.ts
```

If the key format is still `{year}-{month}`, fix it. If OB-187 already fixed it, confirm and move on.

Also verify existing periods with old format (`2026-01`) are matched by `start_date + end_date + period_type`, not by canonical_key.

---

## ANTI-PATTERNS TO AVOID

| Anti-Pattern | Rule | What To Do Instead |
|---|---|---|
| Require plans for period detection | Dependency Independence | Data range is primary. Plans are enrichment. |
| Navigate to another page for cadence editing | IAP — Acceleration | Inline dropdown in detection panel |
| Create periods silently without showing transactions | Thermostat | Show transaction count per period |
| Ignore orphaned data | Five Elements — Comparison | Show count of transactions outside all periods |
| `canonical_key` from year-month only | Bug fix | Use `{period_type}_{start_date}_{end_date}` |
| Leave old functions after refactor | FP-114 Orphan Prevention | Remove all unused code. Run `npx next lint`. |

---

## PROOF GATES — HARD

| # | Criterion | How to Verify |
|---|-----------|---------------|
| 1 | Detection API works with data only (no plans) — returns data range + monthly suggestions | Delete all rule_sets for test tenant, call API, verify response |
| 2 | Detection API works with data + plans — returns suggestions for each unique cadence | Restore plans, call API, verify biweekly suggestions appear when a plan has biweekly cadence |
| 3 | Detection API returns transaction count per suggested period | Verify `transaction_count` field in each suggested period |
| 4 | Orphaned data detection works | Create period covering only Jan 1-15, verify orphaned count for Jan 16-31 transactions |
| 5 | Plan cadence is editable inline in the detection panel | Screenshot: dropdown visible next to plan name, changed from monthly to biweekly |
| 6 | Changing cadence re-runs detection and updates suggestions | Screenshot: after changing Capital Equipment to biweekly, 2 biweekly periods appear in suggestions |
| 7 | Commentary shows data coverage status | Screenshot: green checkmark when all data covered, amber warning for orphaned data |
| 8 | Commentary shows plan-period alignment | Screenshot: warning when a plan cadence has no matching period |
| 9 | Period selector filters by plan cadence | Screenshot: selecting biweekly plan shows only biweekly periods in dropdown |
| 10 | Period selector shows all periods when plan has no cadence | Verify fallback behavior |
| 11 | Canonical key uses `{period_type}_{start_date}_{end_date}` format | Query periods table after creation |
| 12 | No orphaned/unused code after refactor | `npx next lint` shows 0 errors on all modified files |

## PROOF GATES — SOFT

| # | Criterion |
|---|-----------|
| 1 | Panel has loading state while detection runs |
| 2 | Cadence change shows success feedback |
| 3 | "Dismiss" closes panel without creating periods |
| 4 | Panel is usable on mobile viewport |

---

## BUILD VERIFICATION GATE — Rule 51v2

```bash
cd web
rm -rf .next
git stash
npx tsc --noEmit
echo "tsc exit code: $?"
npx next lint 2>&1 | grep -c "Error:"
echo "lint error count: (must be 0)"
git stash pop
```

**Both** must pass with zero errors on committed code. Paste COMPLETE terminal output.

Also verify committed code for all new/modified files:
```bash
git show HEAD:web/src/app/api/periods/detect/route.ts | head -10
git show HEAD:web/src/app/api/rule-sets/update-cadence/route.ts | head -10
git show HEAD:web/src/app/operate/calculate/page.tsx | grep -c "cadence"
```

---

## COMPLETION REPORT STRUCTURE

```markdown
# OB-188 COMPLETION REPORT
## Date: [DATE]

## COMMITS
| Hash | Phase | Description |

## FILES CREATED
| File | Purpose |

## FILES MODIFIED  
| File | Change |

## PROOF GATES — HARD
| # | Criterion (VERBATIM) | PASS/FAIL | Evidence |

## PROOF GATES — SOFT
| # | Criterion (VERBATIM) | PASS/FAIL | Evidence |

## BUILD VERIFICATION EVIDENCE
```
[PASTE: git stash, rm -rf .next, npx tsc --noEmit, npx next lint, git stash pop]
[PASTE: git show HEAD: for new/modified files]
```

## FIVE ELEMENTS VERIFICATION
1. VALUE: [what and where]
2. CONTEXT: [what and where]  
3. COMPARISON: [what and where]
4. ACTION: [what and where]
5. IMPACT: [what and where]

## ORPHAN SCAN
Files modified in this OB:
- [file]: npx next lint result: [0 errors / N errors — list each]
Removed unused items:
- [list each removed function/variable/import with reason]

## KNOWN ISSUES
```

---

## WHAT SUCCESS LOOKS LIKE

1. Admin opens Calculate page. Clicks "Set Up Periods."
2. Panel shows: "Your data spans January 1-31, 2026 (389 transactions)"
3. Panel shows plan cadences with editable dropdowns. Admin sees Capital Equipment is "monthly" — that's wrong.
4. Admin clicks the dropdown next to Capital Equipment, changes to "biweekly."
5. Panel refreshes: now shows 3 suggested periods (1 monthly, 2 biweekly) with transaction counts and plan alignment.
6. Commentary: "✓ All 389 transactions covered by defined periods. 2 cadence types: monthly (3 plans), biweekly (1 plan)."
7. Admin clicks "Create 3 New Periods."
8. Panel closes. Period selector populates.
9. Admin selects Capital Equipment Plan → period dropdown shows only Jan 1-15 and Jan 16-31 (biweekly).
10. Admin selects Consumables Plan → period dropdown shows only January 2026 (monthly).
11. Admin calculates. No SQL. No navigation away. The platform did the thinking.
