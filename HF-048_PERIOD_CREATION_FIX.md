# HF-048: FIX PERIOD CREATION IN IMPORT PIPELINE

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## CC STANDING ARCHITECTURE RULES

Read CC_STANDING_ARCHITECTURE_RULES.md at project root before starting. Every decision must pass the Architecture Decision Gate and Anti-Pattern Registry check.

---

## WHY THIS HOTFIX EXISTS

CLT-64 browser testing: Import completed successfully (119,129 records, status='completed'), but ZERO periods were created. All committed_data rows have `period_id = NULL`. The server-side import pipeline (HF-047) stores `Mes` and `Año` in `row_data` JSONB but never extracts unique periods, creates period records, or links them to committed_data rows.

**Evidence from Supabase:**
```
committed_data: 119,129 rows — ALL with period_id = NULL
entities: 24,833 rows — created correctly
periods: 0 rows — NONE created
```

**The data IS present** — every row contains period information:
```json
{
  "Mes": 1,
  "Año": 2024,
  "entityId": 96138106,
  "storeId": 1268,
  ...
}
```

Three unique periods exist in the data: Jan 2024, Feb 2024, Mar 2024. Some rows have null Mes/Año (sheets without period columns).

**The periods table schema:**
```
id            uuid
tenant_id     uuid
label         text
period_type   text
status        text
start_date    date
end_date      date
canonical_key text
metadata      jsonb
created_at    timestamp with time zone
updated_at    timestamp with time zone
```

Note: There are NO `year` or `month` columns. Period year/month must be derived from `start_date`/`end_date` or stored in `metadata` JSONB.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Final step: `gh pr create --base main --head dev`
4. **SUPABASE MIGRATIONS: Must execute live AND verify with DB query. File existence ≠ applied.**
5. **FIX LOGIC, NOT DATA.** Do not insert periods manually. Fix the pipeline so it creates them during import.

---

## ARCHITECTURE DECISION GATE (MANDATORY)

Before writing any code, document the decision:

```
ARCHITECTURE DECISION RECORD
============================
Problem: Server-side import pipeline does not create period records
or link committed_data rows to periods.

Option A: Fix /api/import/commit to extract periods from parsed data,
          create period records, and set period_id during committed_data insert.
  - Scale test: Works at 10x? Yes — period extraction is O(unique periods), not O(rows)
  - AI-first: Any hardcoding? Must use field mappings to find period columns, not hardcoded "Mes"/"Año"
  - Transport: N/A — server-side processing
  - Atomicity: Periods created before committed_data insert, period_id set inline

Option B: Create a separate post-import job that scans committed_data and creates periods.
  - Scale test: Works at 10x? Yes but doubles the work (scan all rows twice)
  - AI-first: Same requirement
  - Transport: N/A
  - Atomicity: Worse — committed_data exists without period_id until job runs

CHOSEN: Option A — period creation is part of the commit pipeline, not a separate job.
Period_id is set on each committed_data row during insertion, not backfilled.
```

**Commit this decision before proceeding.**

---

## PHASE 0: DIAGNOSTIC

```bash
echo "============================================"
echo "HF-048 PHASE 0: PERIOD CREATION DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: CURRENT COMMIT ROUTE — PERIOD HANDLING ==="
# How does the commit route currently handle periods?
grep -n "period\|Period\|PERIOD" web/src/app/api/import/commit/route.ts | head -30

echo ""
echo "=== 0B: FIELD MAPPING — HOW ARE PERIOD FIELDS IDENTIFIED? ==="
# What field mapping keys indicate period data?
grep -n "period\|month\|year\|fecha\|mes\|año" web/src/app/api/import/commit/route.ts | head -20

echo ""
echo "=== 0C: SHEET MAPPINGS PAYLOAD — WHAT ARRIVES FROM CLIENT? ==="
# What does the sheetMappings object look like?
grep -n "sheetMappings\|SheetMapping\|fieldMappings\|FieldMapping" web/src/app/api/import/commit/route.ts | head -20

echo ""
echo "=== 0D: ENTITY CREATION — HOW ARE ENTITIES HANDLED (WORKING)? ==="
# Entity creation works — period creation should follow similar pattern
grep -B2 -A10 "entity\|Entity\|INSERT.*entities" web/src/app/api/import/commit/route.ts | head -40

echo ""
echo "=== 0E: COMMITTED_DATA INSERT — WHERE IS period_id SET? ==="
# How is period_id populated during insert?
grep -B5 -A10 "period_id\|committed_data" web/src/app/api/import/commit/route.ts | head -40

echo ""
echo "=== 0F: PERIODS TABLE EXACT SCHEMA ==="
# Confirm schema from information_schema
echo "Run in Supabase: SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'periods'"
echo "Known schema: id, tenant_id, label, period_type, status, start_date, end_date, canonical_key, metadata, created_at, updated_at"
echo "NOTE: NO year or month columns exist"

echo ""
echo "=== 0G: HOW DOES CLIENT DETECT PERIODS IN THE DATA? ==="
grep -n "period\|detectPeriod\|periodKey\|extractPeriod" web/src/app/data/import/enhanced/page.tsx | head -20

echo ""
echo "=== 0H: WHAT FIELD MAPPING TYPES INDICATE PERIOD? ==="
grep -n "'period'\|'month'\|'year'\|'date'" web/src/app/data/import/enhanced/page.tsx | head -20
```

**Key questions to answer:**
1. Does the commit route have ANY period creation logic?
2. How does it know which columns are period fields? (Should come from field mappings)
3. Are entity creation and period creation following the same pattern?
4. What sheetMappings structure arrives from the client?

**Commit:** `HF-048 Phase 0: Period creation pipeline diagnostic`

---

## PHASE 1: FIX PERIOD CREATION IN COMMIT ROUTE

The commit route must:

### 1A: Extract unique periods from parsed data

Using the field mappings from the client, identify which columns contain period data (mapped to 'period', 'month', 'year', 'date' target fields). Scan all rows across all sheets to find unique (year, month) combinations.

```typescript
// Extract unique periods from all rows using field mappings
const periodSet = new Map<string, { year: number, month: number }>();

for (const sheet of sheets) {
  for (const row of sheet.rows) {
    // Use field mappings to find period columns — NOT hardcoded "Mes"/"Año"
    const yearField = sheet.mappings.find(m => m.targetField === 'year' || m.targetField === 'period_year');
    const monthField = sheet.mappings.find(m => m.targetField === 'month' || m.targetField === 'period_month' || m.targetField === 'period');
    
    // Also check row_data for mapped period values
    const year = row[yearField?.sourceColumn] || row['period_year'];
    const month = row[monthField?.sourceColumn] || row['period_month'];
    
    if (year && month) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      if (!periodSet.has(key)) {
        periodSet.set(key, { year: Number(year), month: Number(month) });
      }
    }
  }
}
```

### 1B: Create period records

```typescript
// Check existing periods for this tenant
const { data: existingPeriods } = await supabase
  .from('periods')
  .select('id, canonical_key')
  .eq('tenant_id', tenantId);

const existingKeys = new Set(existingPeriods?.map(p => p.canonical_key) || []);
const periodKeyToId = new Map(existingPeriods?.map(p => [p.canonical_key, p.id]) || []);

// Create missing periods
const newPeriods = [];
for (const [key, { year, month }] of periodSet) {
  if (!existingKeys.has(key)) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of month
    const id = crypto.randomUUID();
    
    newPeriods.push({
      id,
      tenant_id: tenantId,
      canonical_key: key,
      label: `${startDate.toLocaleString('en', { month: 'long' })} ${year}`,
      period_type: 'monthly',
      status: 'open',
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      metadata: { year, month },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    
    periodKeyToId.set(key, id);
  }
}

if (newPeriods.length > 0) {
  const { error } = await supabase.from('periods').insert(newPeriods);
  if (error) throw new Error(`Period creation failed: ${error.message}`);
}
```

### 1C: Set period_id on committed_data rows during insert

When building committed_data rows, look up the period_id:

```typescript
// For each row, resolve period_id
const year = row[yearFieldName];
const month = row[monthFieldName];
const periodKey = year && month ? `${year}-${String(month).padStart(2, '0')}` : null;
const periodId = periodKey ? periodKeyToId.get(periodKey) : null;

committedRow.period_id = periodId;
```

### 1D: Handle rows without period data

Some rows (e.g., entity roster) may not have period columns. These get `period_id = NULL` — that's correct. The entity roster is structural data, not time-series.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1 | Period extraction uses field mappings, not hardcoded column names | Code review | No "Mes", "Año", "month" string literals in period logic |
| PG-2 | Existing periods checked before creation | Code review | SELECT before INSERT |
| PG-3 | Period records use correct schema (no year/month columns) | Code review | Uses canonical_key, label, start_date, end_date, metadata |
| PG-4 | period_id set during committed_data insert, not backfilled | Code review | period_id in the row object before INSERT |
| PG-5 | Rows without period fields get period_id = NULL | Code review | Null check present |

**Commit:** `HF-048 Phase 1: Period creation in server-side import pipeline`

---

## PHASE 2: BACKFILL EXISTING RETAILCDMX DATA

The current 119,129 rows have period_id = NULL but contain period data in row_data JSONB. Rather than re-importing, create a one-time backfill that:

1. Reads unique periods from committed_data.row_data
2. Creates period records
3. Updates period_id on committed_data

This runs as part of the HF verification, not as permanent code. Create a script or SQL migration that runs once.

**Important:** The backfill uses JSONB fields from row_data (which were populated by the field mapping). This is accessing data the AI already mapped — not hardcoding field names. The field mapper already decided that "Mes" maps to month and "Año" maps to year, and stored the values in row_data under mapped keys.

Check what keys the import used:

```bash
echo "=== What keys exist in row_data for period info? ==="
echo "Run in Supabase:"
echo "SELECT DISTINCT jsonb_object_keys(row_data) FROM committed_data WHERE tenant_id = '9b2bb4e3-...' LIMIT 1;"
```

Then build the backfill using the actual key names from row_data.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-6 | 3 periods created for RetailCDMX | Supabase query | SELECT COUNT(*) FROM periods = 3 |
| PG-7 | period_id populated on rows with period data | Supabase query | Majority of rows have non-null period_id |
| PG-8 | Rows without period data retain period_id = NULL | Supabase query | Some rows with NULL is expected (entity roster) |

**Commit:** `HF-048 Phase 2: RetailCDMX period backfill`

---

## PHASE 3: VERIFY ON LOCALHOST

1. Clean test: Create a test import on localhost (can use a small subset of RetailCDMX or any test file)
2. Verify periods are created during import (not backfilled)
3. Verify period_id is set on committed_data rows
4. Verify console has no errors related to periods

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-9 | Periods created during import | Supabase query after localhost test | periods COUNT > 0 |
| PG-10 | period_id on committed_data rows | Supabase query | Non-null for rows with period fields |
| PG-11 | No period-related console errors | Browser console | Zero errors |

**Commit:** `HF-048 Phase 3: Localhost period creation verification`

---

## PHASE 4: BUILD + COMPLETION REPORT + PR

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-12 | TypeScript: zero errors | exit code 0 | |
| PG-13 | Build: clean | exit code 0 | |

### Completion report

Create `HF-048_COMPLETION_REPORT.md` at PROJECT ROOT with:
- Architecture Decision Record (from mandatory gate)
- Root cause: why periods weren't created
- Period creation flow diagram
- Backfill results for RetailCDMX
- All 13 proof gates with evidence

### Create PR

```bash
gh pr create --base main --head dev \
  --title "HF-048: Fix Period Creation in Import Pipeline" \
  --body "## Root Cause
Server-side import commit (HF-047) creates entities but never creates periods
or sets period_id on committed_data rows.

## Fix
- Period extraction from parsed data using field mappings (not hardcoded)
- Period records created with correct schema (canonical_key, start_date, end_date)
- period_id set on committed_data rows during insert
- Backfill for existing RetailCDMX import (119,129 rows)

## Proof Gates: 13 — see HF-048_COMPLETION_REPORT.md"
```

**Commit:** `HF-048 Phase 4: Build verification, completion report, PR`

---

## CONTEXT

**Periods table schema** (verified from information_schema):
- `id` uuid
- `tenant_id` uuid
- `label` text (e.g., "January 2024")
- `period_type` text (e.g., "monthly")
- `status` text (e.g., "open")
- `start_date` date
- `end_date` date
- `canonical_key` text (e.g., "2024-01")
- `metadata` jsonb (store year/month here)
- `created_at` / `updated_at` timestamps

**NO `year` or `month` columns exist.** Any code referencing `periods.year` or `periods.month` will fail with a 400 error.

**RetailCDMX data has 3 periods:** Jan 2024, Feb 2024, Mar 2024. Plus some rows with null period data (entity roster, sheets without Mes/Año columns).

---

*HF-048 — February 19, 2026*
*"Data without time is a snapshot. Data with periods is a story."*
