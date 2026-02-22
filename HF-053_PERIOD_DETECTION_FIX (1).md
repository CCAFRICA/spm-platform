# HF-053: PERIOD DETECTION — THE CRITICAL PIPELINE BLOCKER

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

**MANDATORY:** Read CC_STANDING_ARCHITECTURE_RULES.md FIRST. Evaluate every change against anti-pattern registry.

**CRITICAL RULE: Build EXACTLY what this prompt specifies. Do NOT substitute simpler alternatives. Do NOT skip deliverables. If you disagree with the approach, implement it as specified AND document your concern in the completion report. (Standing Rule 15)**

---

## THE PROBLEM

**P0 — Pipeline Blocker. No periods detected = no calculations = platform is non-functional.**

### CLT-65 Evidence (February 19, 2026)

The Enhanced Import page at `vialuce.ai/operate/import/enhanced` shows:

1. **AI Sheet Analysis (working):** The AI correctly analyzes the data — "This workbook contains a comprehensive compensation data structure with a clear employee roster and 6 component data sheets... All sheets can be linked through employee IDs and store IDs with date/period information for temporal alignment." It identifies 7 sheets, 5 relationships.

2. **Period Detection (BROKEN):** The Validate & Preview step shows:
   - Start: **"Not detected"**
   - End: **"Not detected"**
   - Frequency: "Monthly" (appears hardcoded)

3. **The data contains 3 distinct periods:** January 2024, February 2024, March 2024. The columns `Mes` (month) and `Año` (year) exist in multiple sheets. The AI even describes "date/period information for temporal alignment" — it KNOWS the data has temporal structure but the period resolver fails to extract it.

### Cascading Impact

Without period detection, EVERYTHING downstream breaks:
- Operate page: "Loading periods..." → infinite spinner (fixed to empty state by HF-051, but still no periods)
- Calculation: Cannot run without a period selected
- Calculation Preview: Shows MX$0.00 for all entities
- Cross-sheet validation: Shows "5 in roster, 10 in data" instead of real counts
- The entire platform appears non-functional

### History of Period Detection Fixes

This is NOT a new issue. It has been addressed in multiple prompts and keeps regressing:

| Prompt | What It Did | Why It Didn't Stick |
|--------|-------------|---------------------|
| OB-13 Phase 3 | First attempt at period detection from mapped fields | CC built client-side detection, didn't wire to server |
| OB-13A Phase 3 | Second attempt, combined with field mapping fix | Same issue — client-side only |
| HF-048 | Server-side period creation in /api/import/commit | Created periods during data commit, but client-side Validate & Preview still shows "Not detected" because detection runs BEFORE commit |
| OB-65 Mission 1 | Verify HF-048 period fix | Focused on server-side commit, didn't fix client-side detection display |

**The core disconnect:** HF-048 added period creation during the server-side commit (which happens AFTER the user clicks Approve). But the Validate & Preview screen runs BEFORE commit — it needs to detect periods from the parsed data in the browser, not from the database.

There are TWO period detection moments:
1. **Client-side (Validate & Preview):** Detect periods from parsed Excel data to SHOW the user what will be created. This is a DISPLAY function.
2. **Server-side (Commit):** Create period records in Supabase from the uploaded file. This is a DATA function.

Both must work. Currently, #1 is broken (shows "Not detected") and #2 may or may not work (HF-048 addressed it but hasn't been verified post-OB-65).

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev`
4. Architecture Decision Gate before implementation
5. Anti-Pattern Registry check (AP-1 through AP-20)
6. **Supabase migrations MUST be executed live AND verified with DB query**
7. **Build EXACTLY what the prompt specifies (Standing Rule 15)**

---

## PHASE 0-PRE: FIX HF-052 PROFILE COLUMN BUG (PREREQUISITE)

HF-052 deployed with the wrong column name for profile role checks. The `profiles` table has NO `scope_level` column. The correct column is `role` and the platform admin value is `'vl_admin'`.

### 0-PRE-A: Fix /api/platform/settings/route.ts

```bash
echo "=== FIND scope_level REFERENCES ==="
grep -rn "scope_level" web/src/app/api/platform/ --include="*.ts"
```

Replace ALL instances of:
- `scope_level` → `role`  
- `= 'platform'` → `= 'vl_admin'`

This applies to both the GET and PATCH handlers. The profile query should be:
```typescript
const { data: profile } = await serviceClient
  .from('profiles')
  .select('role')
  .eq('auth_user_id', user.id)  // NOTE: auth_user_id, NOT id
  .single();

if (profile?.role !== 'vl_admin') {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

**CRITICAL:** The `profiles` table uses `auth_user_id` to match `auth.uid()`, NOT the `id` column. The `id` column is the profile's own UUID. The `auth_user_id` column links to the Supabase auth user.

### 0-PRE-B: Fix /api/platform/flags/route.ts (if affected)

```bash
grep -rn "scope_level\|\.eq.*'id'" web/src/app/api/platform/flags/route.ts
```

If the flags route also queries profiles, apply the same fix. If it uses service role only (no profile check), it should be fine.

### 0-PRE-C: Check ALL API routes for the same bug

```bash
echo "=== ALL scope_level REFERENCES IN CODEBASE ==="
grep -rn "scope_level" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== ALL PROFILE QUERIES USING .eq('id', user.id) ==="
grep -rn "\.eq('id'.*user\|\.eq(\"id\".*user" web/src/app/api/ --include="*.ts" | grep -v node_modules
echo "(these should use auth_user_id, not id)"
```

Fix any other occurrences found.

### 0-PRE-D: Verify the fix

```bash
cd web && npm run build
curl -s http://localhost:3000/api/platform/flags
echo "(should return JSON with 3 flags)"
```

**Commit:** `HF-053 Phase 0-PRE: Fix HF-052 profile column bug — scope_level→role, id→auth_user_id`

---

## PHASE 0: COMPREHENSIVE DIAGNOSTIC

### 0A: Map the Enhanced Import page — all steps

```bash
echo "=== ENHANCED IMPORT PAGE — FULL FILE ==="
wc -l web/src/app/operate/import/enhanced/page.tsx
echo ""
echo "=== STEP DEFINITIONS ==="
grep -n "step\|Step\|STEP\|currentStep\|setStep\|wizard" web/src/app/operate/import/enhanced/page.tsx | head -30

echo ""
echo "=== PERIOD DETECTION — CLIENT SIDE ==="
grep -n "period\|Period\|PERIOD\|detectPeriod\|extractPeriod\|Not detected\|detected.*period\|temporal" web/src/app/operate/import/enhanced/page.tsx | head -30

echo ""
echo "=== WHAT RENDERS 'Not detected' ==="
grep -B5 -A5 "Not detected" web/src/app/operate/import/enhanced/page.tsx

echo ""
echo "=== FIELD MAPPING TARGET FIELDS — PERIOD RELATED ==="
grep -n "'period'\|'month'\|'year'\|'date'\|targetField.*period\|targetField.*date" web/src/app/operate/import/enhanced/page.tsx | head -20
```

### 0B: Trace what data is available at Validate step

```bash
echo "=== PARSED SHEET DATA — WHERE IS IT STORED? ==="
grep -n "parsedData\|sheetData\|excelData\|workbookData\|uploadedData\|sheets\[" web/src/app/operate/import/enhanced/page.tsx | head -20

echo ""
echo "=== FIELD MAPPINGS — WHERE ARE THEY STORED? ==="
grep -n "fieldMappings\|fieldMapping\|sheetMappings\|mappedFields\|columnMapping" web/src/app/operate/import/enhanced/page.tsx | head -20

echo ""
echo "=== WHAT DATA IS PASSED TO VALIDATE STEP? ==="
grep -B5 -A15 "Validate\|validate\|preview\|Preview\|step.*3\|step.*4" web/src/app/operate/import/enhanced/page.tsx | head -60
```

### 0C: Check server-side period creation (HF-048)

```bash
echo "=== SERVER COMMIT ROUTE — PERIOD HANDLING ==="
grep -n "period\|Period\|canonical_key\|start_date\|end_date" web/src/app/api/import/commit/route.ts | head -30

echo ""
echo "=== HOW DOES COMMIT ROUTE FIND PERIOD COLUMNS? ==="
grep -B3 -A10 "period\|month\|year\|mes\|año\|ano" web/src/app/api/import/commit/route.ts | head -50

echo ""
echo "=== DOES COMMIT ROUTE USE FIELD MAPPINGS OR HARDCODED NAMES? ==="
grep -n "'Mes'\|'Año'\|'mes'\|'año'\|'month'\|'year'\|'Month'\|'Year'" web/src/app/api/import/commit/route.ts
echo "(should return 0 — must use field mappings, not hardcoded names)"
```

### 0D: Check what field mapping targets exist for period data

```bash
echo "=== ALL TARGET FIELD DEFINITIONS ==="
grep -n "targetFields\|TARGET_FIELDS\|AVAILABLE_FIELDS\|fieldOptions\|mapTo\|targetField" web/src/app/operate/import/enhanced/page.tsx | head -20

echo ""
echo "=== ARE 'period' / 'month' / 'year' / 'date' IN TARGET FIELDS? ==="
grep -n "period\|month\|year\|date\|temporal" web/src/app/operate/import/enhanced/page.tsx | grep -i "target\|field\|option\|select\|dropdown\|mapping" | head -20
```

### 0E: Check cross-sheet validation

```bash
echo "=== CROSS-SHEET VALIDATION ==="
grep -n "crossSheet\|cross.*sheet\|validation\|entity.*match\|roster.*count\|In roster\|In data\|Matched" web/src/app/operate/import/enhanced/page.tsx | head -20

echo ""
echo "=== WHERE DOES '50% match' COME FROM? ==="
grep -B5 -A5 "match\|Match\|50%" web/src/app/operate/import/enhanced/page.tsx | head -30

echo ""
echo "=== ENTITY COUNT — IS IT SAMPLING? ==="
grep -n "sample\|Sample\|slice\|\.slice\|subset\|limit.*5\|\.take\|head.*5" web/src/app/operate/import/enhanced/page.tsx | head -10
```

### 0F: Check confidence score

```bash
echo "=== WHERE DOES 50% CONFIDENCE COME FROM? ==="
grep -n "50%\|confidence\|Confidence\|50\b" web/src/app/operate/import/enhanced/page.tsx | head -20
grep -n "confidence" web/src/app/operate/import/enhanced/page.tsx | head -20
```

### 0G: Document ALL findings

Create `HF-053_DIAGNOSTIC.md` at project root with:
1. The exact code that renders "Not detected" for periods
2. What data is available at the Validate step (parsed sheets, field mappings)
3. Whether period-related target fields exist in the mapping dropdown
4. Whether the server-side commit route creates periods (HF-048 status)
5. What generates the "50% match" and "50% confidence" values
6. Whether cross-sheet validation is sampling or scanning full data

**Commit:** `HF-053 Phase 0: Period detection comprehensive diagnostic`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD
============================
Problem: Period detection shows "Not detected" despite data containing 
         Mes/Año columns across multiple sheets. Two detection moments
         need to work: client-side preview AND server-side commit.

Option A: Client-side period detection from parsed Excel data
  - After field mapping step, scan mapped period/month/year columns
  - Extract unique (year, month) combinations from ALL sheets
  - Display detected periods on Validate & Preview screen
  - Pass detected periods to server on commit
  - Scale: O(unique periods) scan of already-parsed data. Fast.
  - AI-first: Uses field mappings to find period columns, not hardcoded names
  - Atomicity: Display only — no state mutation until commit

Option B: Server-side pre-scan endpoint
  - Upload file, server scans for periods, returns them for display
  - Commit uses same scan results
  - Scale: Extra API call before commit
  - REJECTED: Unnecessary round-trip. Data is already parsed client-side.

CHOSEN: Option A — client-side detection from field-mapped data.
Server-side commit (HF-048) also creates periods from the file during 
actual import. Client-side detection is for DISPLAY to the user.

ADDITIONAL: Fix confidence score (AP-7 violation), fix cross-sheet 
validation entity counts, fix calculation preview to use matched entities.
```

**Commit:** `HF-053 Phase 1: Architecture decision — client-side period detection`

---

## PHASE 2: FIX CLIENT-SIDE PERIOD DETECTION

### 2A: Create period detection utility

Create `web/src/lib/import/period-detector.ts`:

```typescript
/**
 * Detects periods from parsed sheet data using field mappings.
 * 
 * Scans ALL sheets for columns mapped to period-related target fields
 * (period, month, year, date) and extracts unique time periods.
 * 
 * DOES NOT hardcode any column names — uses field mappings exclusively.
 * Works for ANY language, ANY column naming convention.
 */

export interface DetectedPeriod {
  year: number;
  month: number;
  label: string;          // e.g., "January 2024"
  canonicalKey: string;   // e.g., "2024-01"
  startDate: string;      // e.g., "2024-01-01"
  endDate: string;        // e.g., "2024-01-31"
  recordCount: number;    // how many rows belong to this period
  sheetsPresent: string[]; // which sheets contain data for this period
}

export interface PeriodDetectionResult {
  periods: DetectedPeriod[];
  frequency: 'monthly' | 'quarterly' | 'annual' | 'unknown';
  confidence: number;     // 0-100, based on coverage and consistency
  method: string;         // how periods were detected
}

/**
 * Detect periods from parsed sheet data and field mappings.
 * 
 * @param sheets - Array of parsed sheets with rows
 * @param fieldMappings - Field mappings from the AI + user confirmation step
 */
export function detectPeriods(
  sheets: Array<{
    name: string;
    rows: Record<string, any>[];
    mappings: Record<string, { targetField: string; sourceColumn: string }>;
  }>
): PeriodDetectionResult {
  const periodMap = new Map<string, DetectedPeriod>();
  let method = '';
  
  for (const sheet of sheets) {
    // Find columns mapped to period-related targets
    const yearMapping = Object.values(sheet.mappings || {}).find(
      m => m.targetField === 'year' || m.targetField === 'period_year'
    );
    const monthMapping = Object.values(sheet.mappings || {}).find(
      m => m.targetField === 'month' || m.targetField === 'period_month'
    );
    const dateMapping = Object.values(sheet.mappings || {}).find(
      m => m.targetField === 'date' || m.targetField === 'period' || m.targetField === 'period_date'
    );
    
    if (yearMapping && monthMapping) {
      // Strategy 1: Separate year + month columns
      method = 'year_month_columns';
      for (const row of sheet.rows) {
        const year = parseInt(String(row[yearMapping.sourceColumn]));
        const month = parseInt(String(row[monthMapping.sourceColumn]));
        if (year && month && month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
          const key = `${year}-${String(month).padStart(2, '0')}`;
          if (!periodMap.has(key)) {
            periodMap.set(key, {
              year,
              month,
              label: `${getMonthName(month)} ${year}`,
              canonicalKey: key,
              startDate: `${year}-${String(month).padStart(2, '0')}-01`,
              endDate: getLastDayOfMonth(year, month),
              recordCount: 0,
              sheetsPresent: [],
            });
          }
          const period = periodMap.get(key)!;
          period.recordCount++;
          if (!period.sheetsPresent.includes(sheet.name)) {
            period.sheetsPresent.push(sheet.name);
          }
        }
      }
    } else if (dateMapping) {
      // Strategy 2: Single date column — extract year/month
      method = 'date_column';
      for (const row of sheet.rows) {
        const dateVal = row[dateMapping.sourceColumn];
        const parsed = parseDate(dateVal);
        if (parsed) {
          const key = `${parsed.year}-${String(parsed.month).padStart(2, '0')}`;
          if (!periodMap.has(key)) {
            periodMap.set(key, {
              year: parsed.year,
              month: parsed.month,
              label: `${getMonthName(parsed.month)} ${parsed.year}`,
              canonicalKey: key,
              startDate: `${parsed.year}-${String(parsed.month).padStart(2, '0')}-01`,
              endDate: getLastDayOfMonth(parsed.year, parsed.month),
              recordCount: 0,
              sheetsPresent: [],
            });
          }
          const period = periodMap.get(key)!;
          period.recordCount++;
          if (!period.sheetsPresent.includes(sheet.name)) {
            period.sheetsPresent.push(sheet.name);
          }
        }
      }
    }
    // If no period mappings exist for this sheet, skip it (roster sheets, etc.)
  }
  
  const periods = Array.from(periodMap.values()).sort(
    (a, b) => a.canonicalKey.localeCompare(b.canonicalKey)
  );
  
  // Calculate confidence based on coverage
  const totalRows = sheets.reduce((sum, s) => sum + s.rows.length, 0);
  const periodRows = periods.reduce((sum, p) => sum + p.recordCount, 0);
  const coverage = totalRows > 0 ? (periodRows / totalRows) * 100 : 0;
  
  // Determine frequency
  let frequency: 'monthly' | 'quarterly' | 'annual' | 'unknown' = 'unknown';
  if (periods.length >= 2) {
    const gaps = [];
    for (let i = 1; i < periods.length; i++) {
      const monthDiff = (periods[i].year - periods[i-1].year) * 12 + 
                         (periods[i].month - periods[i-1].month);
      gaps.push(monthDiff);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (avgGap <= 1.5) frequency = 'monthly';
    else if (avgGap <= 4) frequency = 'quarterly';
    else if (avgGap <= 13) frequency = 'annual';
  } else if (periods.length === 1) {
    frequency = 'monthly'; // assume monthly for single period
  }
  
  return {
    periods,
    frequency,
    confidence: Math.round(Math.min(coverage, 100)),
    method: method || 'none',
  };
}

function getMonthName(month: number): string {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return names[month - 1] || 'Unknown';
}

function getLastDayOfMonth(year: number, month: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function parseDate(value: any): { year: number; month: number } | null {
  if (!value) return null;
  
  // Handle Excel serial dates
  if (typeof value === 'number' && value > 40000 && value < 60000) {
    const date = new Date((value - 25569) * 86400 * 1000);
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  }
  
  // Handle string dates
  const str = String(value);
  const dateObj = new Date(str);
  if (!isNaN(dateObj.getTime())) {
    return { year: dateObj.getFullYear(), month: dateObj.getMonth() + 1 };
  }
  
  return null;
}
```

**IMPORTANT:** This utility uses ZERO hardcoded column names. It reads from field mappings (`targetField`) which the AI populated during Sheet Analysis. It works for any language, any column naming convention.

### 2B: Wire period detection into the Enhanced Import page

In `web/src/app/operate/import/enhanced/page.tsx`, find the Validate & Preview step and:

1. Import the `detectPeriods` function
2. Call it with the parsed sheet data and field mappings
3. Replace the hardcoded "Not detected" with actual detected periods

```typescript
import { detectPeriods, PeriodDetectionResult } from '@/lib/import/period-detector';

// In the Validate step rendering:
const [periodDetection, setPeriodDetection] = useState<PeriodDetectionResult | null>(null);

useEffect(() => {
  if (currentStep === VALIDATE_STEP && parsedSheets && fieldMappings) {
    const sheetsForDetection = parsedSheets.map(sheet => ({
      name: sheet.name,
      rows: sheet.rows || sheet.data || [],
      mappings: fieldMappings[sheet.name] || {},
    }));
    const result = detectPeriods(sheetsForDetection);
    setPeriodDetection(result);
  }
}, [currentStep, parsedSheets, fieldMappings]);
```

3. Update the Detected Period UI:

```typescript
// Replace the hardcoded "Not detected" section with:
{periodDetection && periodDetection.periods.length > 0 ? (
  <div>
    <h3>📅 Detected Periods ({periodDetection.periods.length})</h3>
    <div className="grid grid-cols-3 gap-3">
      {periodDetection.periods.map(p => (
        <div key={p.canonicalKey} className="bg-slate-800 rounded-lg p-3 border border-slate-700">
          <p className="text-sm font-medium text-slate-200">{p.label}</p>
          <p className="text-xs text-slate-400">{p.recordCount.toLocaleString()} records</p>
          <p className="text-xs text-slate-500">{p.sheetsPresent.length} sheets</p>
        </div>
      ))}
    </div>
    <p className="text-xs text-slate-400 mt-2">
      Frequency: {periodDetection.frequency} · 
      Detection confidence: {periodDetection.confidence}% · 
      Method: {periodDetection.method}
    </p>
  </div>
) : (
  <div>
    <h3>📅 Detected Periods</h3>
    <p className="text-amber-400">
      No periods detected. Check that month/year or date columns are mapped in the Field Mapping step.
    </p>
  </div>
)}
```

### 2C: Pass detected periods to the commit payload

When the user clicks Approve & Import, include the detected periods in the metadata sent to the server:

```typescript
// In the commit handler
const commitPayload = {
  tenantId,
  importBatchId,
  storagePath,
  fieldMappings,
  sheetConfig,
  planConfig,
  detectedPeriods: periodDetection?.periods || [], // NEW — pass to server
};
```

The server-side commit route should use these detected periods if available, falling back to its own detection from the file if not.

**Commit:** `HF-053 Phase 2: Client-side period detection — utility + UI + commit payload`

---

## PHASE 3: FIX ADDITIONAL PERSISTENT ISSUES

### 3A: Fix confidence score (AP-7 violation)

The "50% confidence" displayed on the Sheet Analysis step must be a REAL confidence score derived from the AI analysis, not a hardcoded placeholder.

```bash
echo "=== FIND 50% CONFIDENCE SOURCE ==="
grep -n "50%\|50\b.*confidence\|confidence.*50\|\.5\b.*confidence\|confidence.*\.5" web/src/app/operate/import/enhanced/page.tsx | head -10
```

Fix: If the AI returns a confidence score, use it. If not, calculate one based on:
- Number of fields successfully mapped / total fields
- Sheet relationship detection strength
- Entity roster identification confidence

If no meaningful confidence can be calculated, DO NOT show a number. Show "Analysis complete" or remove the confidence badge entirely. A fake 50% is worse than no number.

### 3B: Fix cross-sheet validation entity counts

The validation shows "In roster: 5, In data: 10, Matched: 5" but the actual roster has 2,157 rows. This is sampling the first 5 rows instead of scanning the full dataset.

```bash
echo "=== CROSS-SHEET VALIDATION ENTITY COUNT ==="
grep -B10 -A10 "In roster\|In data\|Matched\|crossSheet\|entityIds\|matchCount" web/src/app/operate/import/enhanced/page.tsx | head -40

echo ""
echo "=== IS IT SAMPLING? ==="
grep -n "slice\|\.slice\|\.take\|head\|limit.*5\|\.splice\|sample\|first.*5" web/src/app/operate/import/enhanced/page.tsx | head -10
```

Fix: Scan ALL rows in the roster sheet and ALL rows in data sheets. Count UNIQUE entity IDs, not sample size. The validation should show:
- In roster: 2,157 (total unique entities in roster)
- In data: X (unique entity IDs across all component sheets)
- Matched: Y (IDs present in both)
- Unmatched: Z (IDs in data but not in roster — flag these in orange)

### 3C: Fix calculation preview using wrong entities

The Calculation Preview shows entities that are NOT in the roster (the "IDs not in roster" list). It should preview calculations for MATCHED entities, not unmatched ones.

```bash
echo "=== CALCULATION PREVIEW ENTITY SELECTION ==="
grep -B5 -A15 "preview\|Preview\|calcPreview\|previewCalc\|previewEntities" web/src/app/operate/import/enhanced/page.tsx | head -40
```

Fix: Preview calculation should use a sample of MATCHED entities (e.g., first 5 matched entities), not unmatched ones. Show entity names from the roster, not just IDs.

### 3D: Fix missing components in preview

The Sheet Analysis shows 6 component data sheets, but the Calculation Preview only shows 3 columns. All 6 components should appear in the preview.

```bash
echo "=== PREVIEW COLUMNS ==="
grep -B5 -A15 "previewColumns\|componentColumns\|incentive\|Incentive\|header.*component" web/src/app/operate/import/enhanced/page.tsx | head -30
```

### 3E: Fix "2/10 required fields mapped" 

This badge appears on the Validate step and may be showing incorrect numbers.

```bash
echo "=== REQUIRED FIELDS MAPPED ==="
grep -B5 -A5 "required.*field\|fields.*mapped\|2/10\|mapped.*required" web/src/app/operate/import/enhanced/page.tsx | head -20
```

Fix: The count should reflect actual mapped vs total mappable fields, not a hardcoded ratio.

**Commit:** `HF-053 Phase 3: Fix confidence, entity counts, preview entities, component columns`

---

## PHASE 4: VERIFY SERVER-SIDE PERIOD CREATION

### 4A: Confirm HF-048 period creation still works

```bash
echo "=== SERVER-SIDE PERIOD CREATION ==="
grep -n "period\|canonical_key\|start_date" web/src/app/api/import/commit/route.ts | head -20

echo ""
echo "=== USES FIELD MAPPINGS (NOT HARDCODED)? ==="
grep -n "'Mes'\|'Año'\|'mes'\|'año'\|'month'\|'year'\|'Month'\|'Year'" web/src/app/api/import/commit/route.ts
echo "(must return 0 results)"
```

### 4B: Verify period creation uses detectedPeriods from client

If the commit route receives `detectedPeriods` in the payload, it should use them instead of re-detecting:

```typescript
// In commit route:
const { detectedPeriods, ...rest } = body;

// Use client-detected periods if available
const periodsToCreate = detectedPeriods?.length > 0 
  ? detectedPeriods 
  : detectPeriodsFromFile(parsedData, fieldMappings);
```

### 4C: Verify periods exist in database after import

After running a test import on localhost:

```sql
SELECT id, label, canonical_key, start_date, end_date, status 
FROM periods 
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
ORDER BY canonical_key;
-- Must return 3 rows: 2024-01, 2024-02, 2024-03
```

**Commit:** `HF-053 Phase 4: Server-side period creation verification`

---

## PHASE 5: BUILD + VERIFY + PR

### 5A: Build

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
```

### 5B: Proof gates

| # | Gate | Pass Criteria | Method |
|---|------|--------------|--------|
| PG-1 | period-detector.ts exists | File created, exported | grep |
| PG-2 | detectPeriods uses field mappings only | Zero hardcoded column names in period-detector.ts | grep for 'Mes'/'Año'/'month'/'year' |
| PG-3 | Enhanced Import Validate step calls detectPeriods | Import present in page.tsx | grep |
| PG-4 | "Not detected" replaced with actual period display | "Not detected" only in else branch | grep |
| PG-5 | Detected periods passed in commit payload | detectedPeriods in fetch body | grep |
| PG-6 | Confidence score is real (not hardcoded 50%) | No literal "50%" in confidence display | grep |
| PG-7 | Cross-sheet entity count scans all rows (not sample) | No .slice(0,5) or limit 5 on entity scan | grep |
| PG-8 | Calculation preview uses matched entities | Preview entities come from matched set | Code review |
| PG-9 | All 6 components shown in preview | Column count matches detected components | Code review |
| PG-10 | Required fields mapped count is dynamic | No hardcoded "2/10" | grep |
| PG-11 | Server-side commit creates period records | SQL query after test import | DB query |
| PG-12 | committed_data rows have period_id set | SQL query after test import | DB query |
| PG-13 | Build clean | npm run build exit 0 | Terminal |
| PG-14 | Zero AP-1 through AP-20 violations | Audit | Review |
| PG-15 | Zero hardcoded field names in any new code | grep for common field names | grep |

### 5C: Completion report

Create `HF-053_COMPLETION_REPORT.md` at PROJECT ROOT with all proof gate evidence.

### 5D: PR

```bash
git add -A && git commit -m "HF-053 Phase 5: Build + completion report"
git push origin dev
gh pr create --base main --head dev \
  --title "HF-053: Fix period detection + confidence + entity validation" \
  --body "## Problem (P0)
Period detection shows 'Not detected' despite data containing 3 distinct periods 
(Jan/Feb/Mar 2024) with Mes/Año columns across multiple sheets. Cascades into: 
no calculations, $0 payouts, empty Operate page.

## Root Cause
Client-side Validate & Preview step had no period detection logic. It displayed 
hardcoded 'Not detected' regardless of data content. Server-side commit (HF-048) 
creates periods during import, but the user never sees them before approving.

## Fixes
1. Period detector utility — uses field mappings, zero hardcoded column names
2. Validate step shows detected periods with record counts and confidence
3. Detected periods passed to server in commit payload
4. Confidence score derived from real data (not hardcoded 50%)
5. Cross-sheet validation scans all rows (not sample of 5)
6. Calculation preview uses matched entities and all components

## Proof Gates: 15 — see HF-053_COMPLETION_REPORT.md"
```

---

## ANTI-PATTERNS TO AVOID

| # | Don't | Do Instead |
|---|-------|-----------|
| 1 | Hardcode column names ('Mes', 'Año', 'month', 'year') | Use field mappings from AI analysis |
| 2 | Show hardcoded "50% confidence" | Calculate real confidence or remove the badge |
| 3 | Sample first 5 rows for entity matching | Scan ALL rows for unique entity IDs |
| 4 | Preview calculations for unmatched entities | Use matched entities from cross-sheet validation |
| 5 | Show "Not detected" when data has period fields | Run period detection from mapped columns |
| 6 | Skip client-side detection because server does it | Both must work — client for preview, server for commit |
| 7 | Create a simpler solution than what's specified | Build EXACTLY what the prompt describes (Rule 15) |

---

## STANDING CLT REGRESSION ITEMS

**Every OB/HF that touches the import pipeline or import UI must verify these items do not regress:**

| # | Item | Expected | How to Check |
|---|------|----------|-------------|
| R-1 | Period detection shows real periods | "January 2024", "February 2024", "March 2024" | Validate step visual |
| R-2 | Confidence score is not hardcoded 50% | Real percentage or no badge | Validate step visual |
| R-3 | Cross-sheet entity count matches roster | ~2,157 entities, not 5 | Validate step visual |
| R-4 | Calculation preview shows non-zero payouts | At least some entities with >MX$0 | Preview visual |
| R-5 | All detected components shown in preview | 6 columns, not 3 | Preview visual |
| R-6 | Component toggle pills have correct state | ON for included components | Sheet Analysis visual |
| R-7 | Required fields mapped count is dynamic | Reflects actual mapping state | Badge visual |

These should be added to CC_STANDING_ARCHITECTURE_RULES.md Section C as a new subsection.

---

*HF-053 — February 19, 2026*
*"The AI knows there are three periods. It said so in its own analysis. The platform just never asked."*
