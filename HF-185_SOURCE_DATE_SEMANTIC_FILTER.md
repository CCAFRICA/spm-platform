# HF-185: Source Date Semantic Filter + Period Detection Transaction Filter

## CONTEXT

HF-184 (PR #331) unified committed_data writes so all SCI pipelines write `source_date` and `entity_id_field`. This was correct architecturally — "Carry Everything, Express Contextually." However, it introduced a regression: the entity pipeline now calls `extractSourceDate` on roster rows, which picks up `hire_date` (an entity attribute) as `source_date`. This is the EXACT same class of bug fixed by OB-107 (CLT102-F10: "Period detection on roster HireDate created 22 erroneous periods"). The regression manifests when the calculate page's "Detect Periods" scans `committed_data.source_date` and finds dates from 2018-2024 from roster `hire_date` values, suggesting 96 phantom periods.

Two separate fixes, both required.

## ROOT CAUSE EVIDENCE

Production query on CRP tenant (`e44bbcb1-2710-4880-8c7d-a1bd902720b7`):

```sql
SELECT source_date, metadata->>'informational_label' AS label, COUNT(*)
FROM committed_data
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
GROUP BY 1, 2
ORDER BY 1;
```

Results:
- 32 entity/roster rows with `source_date` from 2018-03-05 to 2024-12-17 — these are `hire_date` values misused as `source_date`
- 24 entity/quota rows with `source_date = 2026-01-01` — these are `effective_date` values, CORRECT
- ~400 transaction rows (label null) with daily dates Jan–Feb 2026 — CORRECT

Sample row proving `hire_date` is the source:
```json
{"region": "NE", "status": "Active", "district": "NE-MA", "_rowIndex": 16, "full_name": "Jason Wu", "hire_date": 43164, "job_title": "Rep", "_sheetName": "01_CRP_Employee_Roster_20260101", "department": "Sales", "reports_to": "Sarah Okonkwo", "employee_id": "CRP-6017"}
```
Excel serial 43164 = 2018-03-05. The Entity Agent correctly classified `hire_date` with semantic role `entity_attribute`. But `extractSourceDate` ignored that classification and used it anyway via Strategy 1 (dateColumnHint) or Strategy 4 (structural scan).

## ARCHITECTURAL PRINCIPLES

1. **OB-107 (LOCKED):** "Roster dates (HireDate, StartDate) are entity attributes, not performance boundaries." Period detection must skip roster/entity-classified content.
2. **"LLM intelligence must not be discarded":** The SCI LLM already classified `hire_date` as `entity_attribute`. The `extractSourceDate` function has the semantic roles available but doesn't use them as a negative filter.
3. **Decision 92 (LOCKED):** source_date represents the business date of a transaction or event. Entity attributes that happen to be dates are NOT business event dates.
4. **Korean Test (AP-25):** The fix must use STRUCTURAL and SEMANTIC signals, not field-name matching. We do NOT check if field name contains "hire" — we check if the semantic role is non-temporal.

## FIX A: `extractSourceDate` Semantic Negative Filter

**File:** `web/src/lib/sci/extractors.ts`

**Function:** `extractSourceDate(rowData, dateColumnHint, semanticRoles, periodMarkerHint)`

**Current behavior:** Strategy 1 uses `dateColumnHint` unconditionally. Strategy 2 checks for temporal roles. Strategy 4 scans all non-numeric values. None of them check whether a date column has been classified as a NON-temporal entity attribute.

**Required change:**

Before Strategy 1, add a negative filter. If `semanticRoles` exists and the `dateColumnHint` field has a semantic role that is explicitly non-temporal, skip it.

Non-temporal roles (negative list):
```typescript
const NON_TEMPORAL_ROLES = new Set([
  'entity_attribute',
  'entity_identifier', 
  'entity_name',
  'transaction_identifier',
  'categorical_attribute',
  'descriptive_label',
]);
```

Logic change in Strategy 1:
```typescript
// Strategy 1: Content Profile identified date column
if (dateColumnHint && rowData[dateColumnHint] != null) {
  // HF-185: Check if semantic roles classify this field as non-temporal
  // Entity attributes that happen to be dates (hire_date, birth_date) are NOT source_dates
  if (semanticRoles && semanticRoles[dateColumnHint]) {
    const role = semanticRoles[dateColumnHint];
    if (NON_TEMPORAL_ROLES.has(role)) {
      // Skip — this date column is an entity attribute, not a temporal event date
      // Fall through to Strategy 2+ to find an actual temporal column
    } else {
      const parsed = parseAnyDateValue(rowData[dateColumnHint]);
      if (parsed) return parsed;
    }
  } else {
    // No semantic role info — trust the dateColumnHint
    const parsed = parseAnyDateValue(rowData[dateColumnHint]);
    if (parsed) return parsed;
  }
}
```

Also add the same guard to Strategy 4 (structural scan). If a field has a non-temporal semantic role, skip it even if the value parses as a date:

```typescript
// Strategy 4: Structural scan
for (const [key, value] of Object.entries(rowData)) {
  if (value == null) continue;
  if (typeof value === 'number') continue;
  if (typeof value === 'object' && !(value instanceof Date)) continue;
  // HF-185: Skip fields with non-temporal semantic roles
  if (semanticRoles && semanticRoles[key] && NON_TEMPORAL_ROLES.has(semanticRoles[key])) continue;
  const parsed = parseAnyDateValue(value);
  if (parsed) {
    const y = new Date(parsed).getFullYear();
    if (y >= 2000 && y <= 2030) return parsed;
  }
}
```

**IMPORTANT:** Strategy 4 currently iterates `Object.values(rowData)`. Change to `Object.entries(rowData)` so we have the key to check against semantic roles.

**Result:** Roster rows with `hire_date` classified as `entity_attribute` → `extractSourceDate` returns null → `source_date` is null on committed_data → period detection ignores these rows. Quota rows with `effective_date` classified as a temporal role (or without a non-temporal role) → `extractSourceDate` works as before → `source_date = 2026-01-01` → correct.

## FIX B: Period Detection — Transaction Data Only

**File:** Find the calculate page's "Detect Periods" functionality. This is the code that queries `committed_data` and suggests periods on the `/operate/calculate` page. It may be in:
- `web/src/app/operate/calculate/page.tsx` (client-side)
- `web/src/app/api/periods/detect/route.ts` or similar API route
- Or inline in the calculate page component

**Read the code first** (SR-A). Find where the period detection query runs.

**Current behavior:** Queries all `committed_data` rows for the tenant, scans `source_date` values, and groups them into period suggestions. Does NOT filter by `informational_label`.

**Required change:** Filter to transaction-classified data only. Entity/roster rows and their source_dates must not drive period detection.

The filter should use `metadata->>'informational_label'`. Transaction rows have `informational_label: 'transaction'` or null (legacy). Entity rows have `informational_label: 'entity'`. Target/reference rows have `informational_label: 'target'` or `'reference'`.

Period detection query should add:
```sql
-- Only detect periods from transactional data
-- OB-107 principle: roster dates are entity attributes, not performance boundaries
AND (
  metadata->>'informational_label' IS NULL 
  OR metadata->>'informational_label' NOT IN ('entity', 'reference')
)
```

Or equivalently in Supabase client:
```typescript
// HF-185: Period detection from transactional data only (OB-107 principle)
// Entity/roster dates (hire_date) and reference dates are not performance boundaries
.not('metadata->>informational_label', 'in', '("entity","reference")')
```

**Note:** Include `'target'` rows in period detection IF they have valid source_dates (like quota `effective_date`), because targets with `effective_date` represent legitimate temporal boundaries. However, if the source_date negative filter (Fix A) already prevents non-temporal dates from being stored, this becomes less critical. Use judgment: if target/quota files should drive period suggestions, include them. If only transaction data should drive periods, exclude everything except `'transaction'` and null.

**Andrew's directive is clear: periods should ONLY be detected from transactional data.** Therefore filter to:
```sql
AND (
  metadata->>'informational_label' IS NULL 
  OR metadata->>'informational_label' = 'transaction'
)
```

## FIX C: Clean Up Existing Bad Data

After deploying Fixes A and B, the existing 32 roster rows in CRP committed_data have incorrect `source_date` values. These need to be nulled out:

```sql
UPDATE committed_data
SET source_date = NULL
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
  AND metadata->>'informational_label' = 'entity'
  AND source_date < '2025-01-01';
```

**Do NOT delete the rows.** The row_data is correct — only `source_date` is wrong. Null it out so these rows are treated as period-agnostic entity data (which is what they are).

This cleanup is CRP-specific. For a universal cleanup, null out source_date on ALL entity-classified rows where the source_date came from a non-temporal field. But the code fix (A) prevents recurrence, so cleanup is only needed for already-imported data.

## SCOPE BOUNDARIES

- DO NOT modify entity creation behavior — entities should still be created from roster files
- DO NOT modify the `findDateColumnFromBindings` function — it correctly identifies date columns. The issue is that not all date columns should become source_date
- DO NOT modify classification logic — the Entity Agent correctly classified `hire_date` as `entity_attribute`
- DO NOT add field-name checks (no checking for "hire" or "birth" strings — Korean Test violation)
- DO NOT modify the calculation engine — this is purely pipeline and UX

## VERIFICATION

### Gate 1: extractSourceDate negative filter
```bash
# Find the NON_TEMPORAL_ROLES set
grep -n "NON_TEMPORAL_ROLES" web/src/lib/sci/extractors.ts

# Verify Strategy 1 checks semantic role before using dateColumnHint
grep -A 10 "Strategy 1" web/src/lib/sci/extractors.ts

# Verify Strategy 4 uses Object.entries (not Object.values) and checks roles
grep -A 10 "Strategy 4" web/src/lib/sci/extractors.ts
```

### Gate 2: Period detection filter
```bash
# Find the period detection query and verify informational_label filter
grep -rn "informational_label" web/src/app/operate/calculate/ web/src/app/api/periods/
```

### Gate 3: Build
```bash
git stash
npx tsc --noEmit
npx next lint
git stash pop
```

### Gate 4: Production verification (after deploy)

Re-import the CRP roster file. Check committed_data:
```sql
SELECT source_date, metadata->>'informational_label' AS label, COUNT(*)
FROM committed_data
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
  AND metadata->>'informational_label' = 'entity'
GROUP BY 1, 2;
```

Expected: roster rows have `source_date = NULL`. Quota rows have `source_date = 2026-01-01`.

Then click "Detect Periods" on calculate page. Expected: only Jan 2026 and Feb 2026 periods suggested (from transaction data), NOT 96 months going back to 2018.

## CC STANDING RULES APPLY

Include CC_STANDING_ARCHITECTURE_RULES.md at top of prompt.
- Commit + push after every change
- Kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000
- Git from repo root (spm-platform) NOT web/
- Architecture Decision Gate before implementation
- Read actual code before modifying (SR-A)
- `git stash && npx tsc --noEmit && npx next lint` on committed code only (Rule 51v2)
- Final step: `gh pr create --base main --head dev`

## PR TEMPLATE

Title: `HF-185: Source date semantic filter + period detection transaction filter`

Body:
```
## What
Fixes HF-184 regression where extractSourceDate picks up entity attributes
(hire_date) as source_date on roster rows, causing period detection to suggest
96 phantom periods going back to 2018.

## Changes
- extractSourceDate: Added NON_TEMPORAL_ROLES negative filter. Date columns
  classified as entity_attribute, entity_identifier, etc. are skipped.
  Strategy 4 changed from Object.values to Object.entries for role checking.
- Period detection (calculate page): Filtered to transactional data only.
  Entity/reference classified rows excluded from period suggestions.
  OB-107 principle enforced at committed_data level.
- CRP data cleanup: Nulled source_date on 32 roster rows with hire_date values.

## Regression
HF-184 (PR #331) correctly unified committed_data writes but extractSourceDate
lacked semantic awareness. OB-107 fixed this at import-time period detection
(skip roster sheets). This fix applies the same principle at the committed_data
level.

## Decisions
- OB-107 (LOCKED): Roster dates are entity attributes, not performance boundaries
- Decision 92 (LOCKED): source_date = business event date, engine binds at calc time
- Korean Test (AP-25): No field-name matching — uses semantic roles from SCI classification
```
