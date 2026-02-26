# OB-103: CARIBE PIPELINE READINESS — CO-FOUNDER DEMO WALKTHROUGH
## Every Step from Tenant Creation to Calculation Results Must Work

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `PERSISTENT_DEFECT_REGISTRY.md` — verify all in-scope items before completion report
3. `SCHEMA_REFERENCE.md` — authoritative column reference for every Supabase query
4. `AUTH_FLOW_REFERENCE.md` — DO NOT MODIFY ANY AUTH FILE without reading this first
5. `DS-005_DATA_INGESTION_FACILITY.md` — Data Ingestion Facility specification (file types, batch upload, classification)

**If you have not read all five files, STOP and read them now.**

---

## WHY THIS OB EXISTS

Andrew is running the Caribe Financial Group demo walkthrough to verify the platform works end-to-end before handing it to co-founders. The walkthrough requires:

1. Create tenant → 2. Configure period → 3. Upload 4 plan documents → 4. Upload roster → 5. Upload 8 data files → 6. Run calculation → 7. View results

**Every step has blockers discovered during CLT-101 browser testing:**

| Step | What Should Work | What Actually Happens | Finding |
|------|-----------------|----------------------|---------|
| 2. Configure Period | Create period with start/end dates | Modal shows Year/Month only, no date range. Period created but doesn't appear in list. | F2, F3 |
| 2. (Design) | Import detects dates and proposes periods | Periods are a manual prerequisite — platform doesn't propose from data | F4 |
| 3. Upload Plans | Accept PDF + XLSX, multi-file selection | PDF not in accepted formats. Single file only. | F5, F6 |
| 4. Upload Roster | Upload XLSX with compound fields | Same single-file limitation. Field mapping step frozen (CLT-100 F11). | F6 |
| 5. Upload Data | Upload 8 CSV/XLSX files as batch | Same single-file limitation. 8 individual upload cycles required. | F6 |
| 5. (Design) | AI detects date ranges, proposes periods | Period detection exists but doesn't surface as user-facing confirmation | F4 |
| 6. Calculate | Run across 4 plans simultaneously | Multi-plan calculation untested through UI | — |
| 7. Results | View coordination gate, clawbacks | Results dashboard cognitive fit (OB-102 scope) | — |

**This OB fixes everything between "tenant exists" and "calculation runs."** It is the critical path for the co-founder demo.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev` with descriptive title and body
4. **Git commands from repo root (spm-platform), NOT from web/.**
5. **Commit this prompt to git as first action.**
6. **Fix logic, not data.** Do not insert test data. Do not provide answer values.
7. **Domain-agnostic always.** Korean Test on all code.
8. **Supabase .in() ≤ 200 items.**
9. **DO NOT MODIFY ANY FILE IN THE AUTH CHAIN.** Read AUTH_FLOW_REFERENCE.md.

---

## CRITICAL DESIGN DECISIONS FOR THIS OB

### Decision 47: Import-Driven Period Creation
Periods are proposed by the import pipeline from detected date ranges, confirmed by admin, created with explicit start_date + end_date. Manual period creation remains available in Configure but is NOT the primary path. The import flow does NOT require pre-configured periods.

### Decision 48: Periods Require start_date + end_date
Every period MUST have start_date and end_date as explicit date fields — NOT just a Year/Month label. Not all periods are calendar months (banking uses quarterly, bi-weekly, fiscal periods). The Create Period UI must have date pickers. Year/Month/Type dropdowns auto-populate the date fields as a convenience. **This has been requested 5+ times across sessions and continues to be ignored. It is non-negotiable.**

### Decision 49: Multi-File Upload
Both Plan Import and Data Import accept multiple files in a single upload action. Files are processed independently (each tracked as a separate ingestion event) but presented as a batch. DS-005 Section 2.5 already specifies this: "Batch upload: Multiple files in a single session — each tracked as a separate ingestion_event but grouped under one import_batch."

### Decision 50: PDF Accepted for Plan Import
Plan Import accepts PDF files. DS-005 Section 2.4 explicitly lists `.pdf` in accepted file types under "Documents" category. The Anthropic API can read PDFs directly. The file picker filter must include PDF.

---

## PHASE 0: DIAGNOSTIC — MAP CURRENT IMPORT PIPELINE STATE

```bash
echo "============================================"
echo "OB-103 PHASE 0: IMPORT PIPELINE DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: PLAN IMPORT PAGE ==="
find web/src/app -path "*plan*import*" -o -path "*plan-import*" -o -path "*launch/plan*" | sort
cat web/src/app/admin/launch/plan-import/page.tsx 2>/dev/null | head -80
echo "---"
grep -n "accept\|file.*type\|mime\|\.pdf\|\.xlsx\|\.csv\|\.pptx\|format\|supported" web/src/app/admin/launch/plan-import/ -r --include="*.tsx" --include="*.ts" 2>/dev/null | head -20

echo ""
echo "=== 0B: DATA IMPORT PAGE ==="
find web/src/app -path "*import*" -name "page.tsx" | sort
grep -n "accept\|file.*type\|mime\|multiple\|multi" web/src/app/operate/import/ -r --include="*.tsx" --include="*.ts" 2>/dev/null | head -20

echo ""
echo "=== 0C: FILE UPLOAD COMPONENT ==="
grep -rn "input.*type.*file\|<input\|dropzone\|file.*upload\|FileUpload\|UploadZone\|drag.*drop" web/src/components/ web/src/app/ --include="*.tsx" | head -20
grep -rn "multiple" web/src/components/ web/src/app/ --include="*.tsx" | grep -i "file\|upload\|input\|drop" | head -10

echo ""
echo "=== 0D: PERIOD CREATION ==="
find web/src/app -path "*period*" -name "*.tsx" | sort
grep -rn "start_date\|end_date\|startDate\|endDate\|date.*picker\|DatePicker" web/src/app/configure/periods/ -r --include="*.tsx" --include="*.ts" 2>/dev/null | head -15
grep -rn "createPeriod\|insertPeriod\|period.*insert\|period.*create" web/src/ --include="*.tsx" --include="*.ts" | head -15

echo ""
echo "=== 0E: PERIOD TABLE SCHEMA ==="
grep -rn "periods" web/src/lib/ web/src/types/ --include="*.ts" | grep -i "type\|interface\|schema\|start\|end" | head -15

echo ""
echo "=== 0F: FIELD MAPPING STEP (CLT-100 F11) ==="
grep -rn "FieldMapping\|field.*mapping\|step.*3\|mapping.*step" web/src/app/operate/import/ -r --include="*.tsx" | head -20
grep -rn "handleNext\|setStep\|currentStep\|next.*button\|canProceed\|isValid" web/src/app/operate/import/ -r --include="*.tsx" | head -20

echo ""
echo "=== 0G: AI CLASSIFICATION SERVICE ==="
grep -rn "classify\|classification\|sheet.*analysis\|ai.*interpret\|anthropic\|plan.*interpret" web/src/lib/ web/src/app/api/ --include="*.ts" --include="*.tsx" | head -20

echo ""
echo "=== 0H: PERIOD DETECTION IN IMPORT ==="
grep -rn "period.*detect\|detect.*period\|date.*range\|temporal\|period.*resolv" web/src/lib/ --include="*.ts" | head -15

echo ""
echo "=== 0I: CALCULATION PAGE ==="
cat web/src/app/operate/calculate/page.tsx 2>/dev/null | head -60
grep -rn "runCalculation\|calculate\|calculation.*run\|execute.*calc" web/src/app/operate/calculate/ web/src/lib/ --include="*.tsx" --include="*.ts" | head -15

echo ""
echo "=== 0J: MULTI-PLAN CALCULATION ==="
grep -rn "multi.*plan\|all.*plans\|plan.*select\|rule.*set.*select" web/src/app/operate/calculate/ --include="*.tsx" | head -10

echo ""
echo "=== 0K: RESULTS DISPLAY ==="
find web/src/app/operate/results -name "*.tsx" 2>/dev/null | sort
grep -rn "coordination.*gate\|cross.*plan\|clawback\|reversal\|negative" web/src/app/operate/results/ web/src/lib/ --include="*.tsx" --include="*.ts" | head -10

echo ""
echo "=== 0L: IMPORT BATCH / INGESTION EVENT TABLES ==="
grep -rn "import_batch\|ingestion_event\|import.*batch\|batch.*import" web/src/lib/ web/src/types/ --include="*.ts" | head -15

echo ""
echo "=== 0M: SUPABASE PERIOD TABLE CHECK ==="
echo "(Manual: run in Supabase SQL editor)"
echo "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'periods' ORDER BY ordinal_position;"
```

**PASTE ALL OUTPUT.**

---

## PHASE 1: PERIOD CREATION — START_DATE + END_DATE (Decision 48)

### 1A: Verify Supabase Schema

Check if the `periods` table already has `start_date` and `end_date` columns:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'periods'
ORDER BY ordinal_position;
```

If `start_date` and `end_date` columns do NOT exist:
- Create a Supabase migration to add them:
  ```sql
  ALTER TABLE periods ADD COLUMN IF NOT EXISTS start_date DATE;
  ALTER TABLE periods ADD COLUMN IF NOT EXISTS end_date DATE;
  ```
- Run the migration and verify with a query

If they DO exist, verify they're being populated by the create function.

### 1B: Fix Create Period Modal

The current modal shows Year/Month/Period Type dropdowns. Redesign:

```
┌─────────────────────────────────────────────────┐
│  Create Period                               ✕  │
│  Create a new period with date boundaries.      │
│                                                 │
│  Period Name     [Q1 2024                    ]  │
│                                                 │
│  Start Date      [2024-01-01     📅]           │
│  End Date        [2024-03-31     📅]           │
│                                                 │
│  ── Quick Fill ──────────────────────────────── │
│  Year [2024] Month [January ▼] Type [Monthly ▼]│
│  [Auto-Fill Dates]                              │
│                                                 │
│  [Generate All 2024]        [Create Period]     │
└─────────────────────────────────────────────────┘
```

**Behavior:**
- Start Date and End Date are the PRIMARY inputs — always visible, always required
- Quick Fill is a CONVENIENCE section — selecting Year/Month/Type and clicking "Auto-Fill Dates" populates the date fields and period name
  - Monthly: start = first of month, end = last of month, name = "January 2024"
  - Quarterly: start = first of quarter, end = last of quarter, name = "Q1 2024"
  - Custom: user enters dates manually
- "Generate All 2024" creates 12 monthly periods (or 4 quarterly) each with correct start_date/end_date
- Period Name auto-generates from dates but is editable
- **Validation:** start_date < end_date. No overlapping periods for same tenant (warn, don't block).

### 1C: Fix Period List Refresh

Debug why created periods don't appear in the list:

```bash
# Find the create handler
grep -rn "createPeriod\|insert.*period\|handleCreate\|onSubmit" web/src/app/configure/periods/ -r --include="*.tsx" --include="*.ts" | head -20
```

Likely causes:
1. Insert succeeds but list doesn't re-fetch (missing invalidation/refetch after mutation)
2. Insert fails silently (RLS policy blocking, or missing tenant_id)
3. Insert succeeds but the query that populates the list filters on a field the new record doesn't have

Fix: After successful insert, either refetch the periods list or optimistically add the new period to the UI state. Show success toast. If insert fails, show error with reason.

### 1D: Period List Display — Show Date Range

The periods list/table must show start_date and end_date for every period — not just the label. Format: "January 2024 · Jan 1 – Jan 31, 2024"

### PROOF GATE 1: Period Creation
```
PG-01: Create Period modal has Start Date and End Date input fields (date pickers)
PG-02: Quick Fill auto-populates dates from Year/Month/Type selection
PG-03: Creating a period succeeds AND the period appears in the list immediately
PG-04: Created period has non-null start_date and end_date in Supabase (SQL verification)
PG-05: "Generate All 2024" creates 12 periods each with correct date boundaries
PG-06: Period list shows date range (not just label)
PG-07: Creating period for "Q1 2024" sets start_date=2024-01-01, end_date=2024-03-31
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-103 Phase 1: Period creation with start_date + end_date — Decision 48" && git push origin dev`

---

## PHASE 2: PLAN IMPORT — PDF SUPPORT + MULTI-FILE (Decisions 49, 50)

### 2A: Add PDF to Accepted File Types

Find the file type filter on the Plan Import page:

```bash
grep -rn "accept\|file.*type\|mime\|supported.*format\|allowedTypes\|ACCEPTED" web/src/app/admin/launch/plan-import/ web/src/components/ --include="*.tsx" --include="*.ts" | head -20
```

Add `.pdf` to the accepted file types list. Per DS-005 Section 2.4:
- Spreadsheets: `.xlsx`, `.xls`, `.csv`, `.tsv`
- Documents: `.pdf`, `.pptx`, `.docx`

The file picker `accept` attribute should be:
```
accept=".pdf,.pptx,.docx,.xlsx,.xls,.csv,.tsv,.json"
```

Verify the Anthropic API plan interpretation service handles PDF input. If it sends file contents to the API, PDFs need to be sent as base64 with the correct media type (`application/pdf`). The Anthropic Messages API supports PDF documents natively.

### 2B: Enable Multi-File Selection

Find the file input element:

```bash
grep -rn "<input.*file\|type=\"file\"\|type='file'" web/src/app/admin/launch/plan-import/ web/src/components/ --include="*.tsx" | head -10
```

Add the `multiple` attribute to the file input:
```html
<input type="file" multiple accept=".pdf,.pptx,.docx,.xlsx,.xls,.csv,.tsv,.json" />
```

**Multi-file processing flow:**
1. User selects 1-4 files in one action
2. UI shows list of selected files with status indicators
3. Each file is processed through the 3-step wizard independently:
   - Upload → AI Interpretation → Confirm & Save
4. Files can be processed in parallel or sequentially (sequential is simpler, parallel is faster)
5. Each file produces one rule set
6. After all files are processed, show summary: "4 plans interpreted: Consumer Lending ✓, Mortgage ✓, Insurance ✓, Deposit Growth ✓"

**Minimum viable approach (if full parallel is too complex):**
- Multi-file selection → queue → process one at a time through the 3-step wizard
- Show progress: "Processing file 2 of 4: CFG_Mortgage_Origination_Bonus_2024.pdf"
- Each file completes its full wizard cycle before the next starts
- User reviews/confirms each interpretation individually

### 2C: Plan Import — AI Interpretation for PDF

Verify the plan interpretation service can handle PDF:

```bash
grep -rn "anthropic\|interpret\|plan.*parse\|extract.*plan\|Messages\|claude" web/src/lib/ web/src/app/api/ --include="*.ts" | head -20
```

If the service currently only handles text extraction from XLSX/CSV:
- Add PDF text extraction (use a PDF parsing library or send PDF directly to Anthropic API as a document)
- The Anthropic Messages API accepts PDF as a content block:
  ```typescript
  {
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: base64Data }
  }
  ```
- This is the preferred approach — let Claude read the PDF directly rather than extracting text first

### PROOF GATE 2: Plan Import
```
PG-08: File picker shows PDF files (not greyed out)
PG-09: Can select multiple files in file picker dialog
PG-10: Upload a single XLSX plan → AI interpretation completes → rule set created
PG-11: Upload a single PDF plan → AI interpretation completes → rule set created
PG-12: Upload 4 files (2 PDF + 2 XLSX) → all 4 processed → 4 rule sets created
PG-13: After all plans processed, summary shows all 4 rule sets with names
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-103 Phase 2: Plan Import — PDF support + multi-file selection" && git push origin dev`

---

## PHASE 3: DATA IMPORT — MULTI-FILE + FIELD MAPPING FIX + PERIOD DETECTION

### 3A: Enable Multi-File Selection on Data Import

Same pattern as Plan Import — the Data Import upload zone must accept multiple files:

```bash
grep -rn "<input.*file\|type=\"file\"\|dropzone\|onDrop\|file.*select" web/src/app/operate/import/ --include="*.tsx" | head -15
```

Add `multiple` attribute. The drag-and-drop zone (if present) must also accept multiple files.

**Multi-file data import flow:**
1. User drops/selects 1-8+ files
2. Each file tracked as a separate `ingestion_event` linked to one `import_batch` (per DS-005)
3. AI classifies each file independently (roster, loan disbursements, insurance referrals, etc.)
4. Show batch summary:
   ```
   Import Batch — 9 files
   ✓ CFG_Personnel_Q1_2024.xlsx — Roster (25 entities detected)
   ✓ CFG_Loan_Disbursements_Jan2024.csv — Transaction Data (89 records, Jan 2024)
   ✓ CFG_Loan_Disbursements_Feb2024.csv — Transaction Data (92 records, Feb 2024)
   ✓ CFG_Loan_Disbursements_Mar2024.csv — Transaction Data (87 records, Mar 2024)
   ✓ CFG_Mortgage_Closings_Q1_2024.csv — Transaction Data (15 records, Q1 2024)
   ✓ CFG_Insurance_Referrals_Q1_2024.csv — Transaction Data (47 records, Q1 2024)
   ✓ CFG_Deposit_Balances_Q1_2024.csv — Balance Snapshot (75 records, Q1 2024)
   ✓ CFG_Loan_Defaults_Q1_2024.csv — Adjustment Data (7 records, Q1 2024)
   ⚠ 1 file needs attention: field mapping review for Insurance Referrals
   
   [Review Mappings]  [Commit All]
   ```
5. Admin reviews any low-confidence mappings, then commits the batch

### 3B: Fix Field Mapping Step (CLT-100 F11)

The field mapping step is frozen — empty content area, non-functional Next button. Debug:

```bash
# Find the field mapping component
grep -rn "FieldMapping\|field-mapping\|mapping.*step" web/src/app/operate/import/ -r --include="*.tsx" | head -20

# Check what data it expects
grep -rn "mappings\|fields\|columns\|headers" web/src/app/operate/import/ -r --include="*.tsx" | head -20

# Check the Next button condition
grep -rn "disabled\|canProceed\|isValid\|handleNext" web/src/app/operate/import/ -r --include="*.tsx" | head -20
```

Likely causes:
1. Sheet analysis step doesn't pass column data to field mapping step
2. Field mapping component expects data in a format the upstream step doesn't provide
3. The "Next" button is disabled by a validation check that never passes
4. POS data type (from Financial module) has different field mapping requirements than ICM data type

Fix the data flow between steps. The Field Mapping step must receive the detected columns from Sheet Analysis and render mapping dropdowns for each column.

### 3C: Import-Driven Period Detection (Decision 47)

After file classification and field mapping, the import pipeline should detect date ranges and propose period creation:

**Implementation:**
1. During classification, the AI or period resolver identifies date fields in the data
2. Extract unique date ranges: "Jan 2024", "Feb 2024", "Mar 2024" or "Q1 2024"
3. Check existing periods for this tenant
4. For dates that don't match existing periods, show:
   ```
   📅 Period Detection
   We found data spanning January 1 — March 31, 2024.
   
   Detected periods:
   ✓ January 2024 (Jan 1 – Jan 31) — 89 loan records, 25 deposit records
   ✓ February 2024 (Feb 1 – Feb 29) — 92 loan records, 25 deposit records
   ✓ March 2024 (Mar 1 – Mar 31) — 87 loan records, 25 deposit records, 7 defaults
   
   ○ Create as 3 monthly periods
   ○ Create as 1 quarterly period (Q1 2024: Jan 1 – Mar 31)
   ○ Use existing periods (if any match)
   
   [Create Periods & Continue]  [Skip — I'll configure periods manually]
   ```
5. Created periods have proper start_date and end_date (Decision 48)
6. The import continues to commit data with correct period_id references

**Minimum viable approach:**
If the full UI for period proposal is too complex for this OB, at minimum:
- Import should NOT require pre-configured periods to proceed
- Import should auto-create periods from detected date ranges with proper start_date/end_date
- Show a notification: "3 periods auto-created from your data: Jan 2024, Feb 2024, Mar 2024"

### PROOF GATE 3: Data Import
```
PG-14: Data Import upload zone accepts multiple files (drag-and-drop or file picker)
PG-15: Selecting 8+ files shows all files in upload queue
PG-16: AI classifies each file independently (roster vs transaction vs balance vs adjustment)
PG-17: Field mapping step renders with column dropdowns (not frozen/empty)
PG-18: Next button is functional on field mapping step
PG-19: Batch summary shows all files with classification and record counts
PG-20: Period detection identifies date ranges from imported data
PG-21: Periods auto-created (or proposed) with proper start_date and end_date
PG-22: Data committed to committed_data with correct period_id and tenant_id
PG-23: No pre-configured periods required for import to proceed
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-103 Phase 3: Data Import — multi-file, field mapping fix, import-driven periods" && git push origin dev`

---

## PHASE 4: ROSTER IMPORT — COMPOUND FIELD PARSING

### 4A: Verify Roster Import Path

The Caribe roster (`CFG_Personnel_Q1_2024.xlsx`) has a `ProductLicenses` column with comma-separated values like "ConsumerLending,Insurance,Deposits". The import pipeline must:

1. Recognize this as a roster/personnel file
2. Map the `ProductLicenses` field correctly (preserve as-is in committed_data per Carry Everything principle)
3. Parse compound values during entity resolution or rule set assignment

### 4B: Entity Resolution from Roster

After roster import:
- Each unique officer ID creates an entity in the `entities` table
- Entity metadata includes: name, branch, division, region from roster columns
- ProductLicenses values stored in entity metadata or as relationship edges

### 4C: Rule Set Assignment from Product Licenses

After both plans and roster are imported:
- For each entity, read their ProductLicenses field
- Match license names to rule set names/identifiers
- Create `rule_set_assignments` linking each entity to the appropriate rule sets
- Officer with "ConsumerLending,Insurance,Deposits" gets assigned to 3 of 4 plans
- Officer with "ConsumerLending,Mortgage,Insurance,Deposits" gets all 4

**This may be manual or AI-assisted.** The minimum viable path:
- After plans are created and roster is imported, show a mapping UI:
  ```
  Rule Set Assignment
  Match product licenses to plans:
  
  ConsumerLending  → [Consumer Lending Commission ▼]
  Mortgage         → [Mortgage Origination Bonus ▼]
  Insurance        → [Insurance Referral Program ▼]
  Deposits         → [Deposit Growth Incentive ▼]
  
  [Assign All]
  ```
- Or: AI auto-matches based on name similarity and the admin confirms

### PROOF GATE 4: Roster + Assignment
```
PG-24: Roster file classified as personnel/roster type
PG-25: Entities created in entities table with correct metadata
PG-26: ProductLicenses compound field preserved in committed_data
PG-27: Rule set assignments created linking entities to plans based on licenses
PG-28: Officer with 4 licenses has 4 rule_set_assignments
PG-29: Officer with 2 licenses has 2 rule_set_assignments
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-103 Phase 4: Roster import with compound field parsing and rule set assignment" && git push origin dev`

---

## PHASE 5: CALCULATION — MULTI-PLAN EXECUTION

### 5A: Calculate Page — Multi-Plan Selection

The Caribe demo requires calculating across 4 plans simultaneously. The Calculate page must support:

1. **Period selection** — Choose which period(s) to calculate
2. **Plan selection** — Choose which plans to calculate (default: all active plans for this period)
3. **Run calculation** — Execute calculation engine for selected plans × period

The UI should default to "Calculate all plans for selected period" since this is the most common action.

### 5B: Multi-Plan Calculation Execution

When calculation runs for 4 plans:
1. Create one `calculation_batch` per plan-period combination (or one batch with 4 components)
2. Each plan's calculation is independent (different rules, different data sources)
3. After all 4 complete, show aggregated results:
   - Total payout across all plans per entity
   - Per-plan breakdown per entity
   - Coordination gate results (cross-plan evaluation)

### 5C: Coordination Gate Logic

The Caribe centerpiece: Officer #1015 has strong lending but <80% deposit growth. The coordination gate blocks the quarterly bonus.

This gate requires:
1. Calculate Consumer Lending commission normally
2. Calculate Deposit Growth attainment normally
3. **Cross-plan evaluation:** If Deposit Growth attainment < 80%, block quarterly bonus from Consumer Lending
4. The gate is defined in the plan document — it should be captured during plan interpretation

Verify the calculation engine can:
- Read cross-plan gate conditions from rule set configuration
- Evaluate gates after individual plan calculations complete
- Apply gate results (block/allow bonus components)

If cross-plan gates are not yet implemented in the engine, document what exists and what's needed. This may require an engine enhancement separate from this OB.

### 5D: Clawback Logic

Officer #1008 has 2 loan defaults within 90 days. The system should:
1. Match defaults to original disbursements by loan ID
2. Generate negative commission entries (clawbacks)
3. Apply clawbacks to the period in which the default was detected
4. Show clawback entries with references to original transactions

If clawback logic is not yet implemented, document what exists and what's needed.

### PROOF GATE 5: Calculation
```
PG-30: Calculate page shows period selector and plan selector
PG-31: "Calculate All Plans" option available (default)
PG-32: Calculation runs for at least one plan and produces results
PG-33: Calculation results appear in Results Dashboard
PG-34: Per-entity payout amounts are non-zero (for entities with data)
PG-35: (STRETCH) Coordination gate blocks Officer #1015's quarterly bonus
PG-36: (STRETCH) Clawback entries generated for Officer #1008's defaults
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-103 Phase 5: Multi-plan calculation with coordination gate support" && git push origin dev`

---

## PHASE 6: END-TO-END VERIFICATION — THE CARIBE WALKTHROUGH

Execute the complete Caribe demo walkthrough against Mexican Bank Co (or create a fresh Caribe tenant):

### 6A: Full Pipeline Test

```
Step 1: Tenant exists (Mexican Bank Co / Caribe Financial Group)
Step 2: Navigate to Plan Import
Step 3: Upload CFG_Insurance_Referral_Program_2024.xlsx (single XLSX first — simplest plan)
Step 4: AI interprets → review → confirm → rule set created
Step 5: Upload CFG_Deposit_Growth_Incentive_Q1_2024.xlsx (multi-tab XLSX)
Step 6: AI interprets → review → confirm → rule set created
Step 7: Upload CFG_Consumer_Lending_Commission_2024.pdf (PDF test)
Step 8: AI interprets → review → confirm → rule set created
Step 9: Upload CFG_Mortgage_Origination_Bonus_2024.pdf (PDF test)
Step 10: AI interprets → review → confirm → rule set created
Step 11: Navigate to Data Import
Step 12: Upload CFG_Personnel_Q1_2024.xlsx (roster)
Step 13: AI classifies as roster → field mapping → commit → entities created
Step 14: Upload all 8 data files (batch or sequential)
Step 15: AI classifies each → field mapping → periods detected → commit
Step 16: Navigate to Calculate
Step 17: Select Q1 2024 → Run calculation across all plans
Step 18: View results — verify non-zero payouts
```

Record the outcome of each step: PASS / FAIL / BLOCKED with reason.

### 6B: Document Blockers

If any step fails, document:
1. Which step
2. What happened (error message, empty state, wrong behavior)
3. Screenshot equivalent (console output, network response)
4. Whether it's a code fix or a design gap

### PROOF GATE 6: End-to-End
```
PG-37: At least 1 plan imported through UI (XLSX)
PG-38: At least 1 plan imported as PDF
PG-39: Roster imported with entities created
PG-40: At least 1 data file imported with data committed
PG-41: Periods exist with start_date and end_date
PG-42: Calculation runs and produces non-zero results for at least 1 entity
PG-43: Results visible in Results Dashboard
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-103 Phase 6: End-to-end Caribe pipeline verification" && git push origin dev`

---

## PHASE 7: BUILD + COMPLETION

### 7A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

### 7B: Persistent Defect Registry — Verification

| PDR # | Description | In Scope? | Status | Evidence |
|-------|-------------|-----------|--------|----------|
| PDR-01 | Currency no cents | VERIFY | PASS/FAIL | [Any new currency displays] |
| PDR-04 | N+1 overhead | NOTE | PASS/FAIL | [Request count on import pages] |

### 7C: Completion Report

Create `OB-103_COMPLETION_REPORT.md` at project root:

1. Period creation — start_date/end_date fields, list refresh, Quick Fill
2. Plan Import — PDF support, multi-file selection, AI interpretation
3. Data Import — multi-file, field mapping fix, import-driven period detection
4. Roster import — compound field parsing, entity resolution, rule set assignment
5. Calculation — multi-plan execution
6. End-to-end walkthrough — step-by-step PASS/FAIL
7. Decisions implemented: 47, 48, 49, 50
8. Known gaps remaining (coordination gates, clawbacks if not implemented)
9. All proof gates PASS/FAIL with evidence

### 7D: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-103: Caribe Pipeline Readiness — Co-Founder Demo Walkthrough" \
  --body "## What This OB Delivers

### Period Creation (Decision 48)
- Start Date + End Date fields on Create Period modal (not just Year/Month)
- Quick Fill convenience from Year/Month/Type selection
- Generate All creates periods with proper date boundaries
- Period list shows date range
- List refreshes after creation

### Plan Import (Decisions 49, 50)
- PDF files accepted (was blocked — greyed out in file picker)
- Multi-file selection (was single-file only)
- Anthropic API receives PDF documents directly for interpretation
- 4 plan files → 4 rule sets in one session

### Data Import (Decision 49)
- Multi-file upload (8+ files in single action)
- Field mapping step fixed (was frozen with empty content)
- Batch summary showing all files with classification results
- Import-driven period detection (Decision 47)

### Roster Import
- Compound field parsing (comma-separated ProductLicenses)
- Entity resolution creating entities with metadata
- Rule set assignment from product licenses

### Calculation
- Multi-plan selection and execution
- Results display for calculated entities

### End-to-End Verification
- Complete Caribe walkthrough: plan import → roster → data → calculate → results

## Decisions Implemented: 47, 48, 49, 50
## Proof Gates: 43
## Pipeline Steps Verified: Plan Import, Data Import, Roster, Periods, Calculate, Results"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-103 Complete: Caribe Pipeline Readiness" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- Period creation with start_date + end_date (Decision 48)
- Period list refresh after creation
- Import-driven period detection and proposal (Decision 47)
- Plan Import PDF file acceptance (Decision 50)
- Plan Import multi-file selection (Decision 49)
- Data Import multi-file selection (Decision 49)
- Data Import field mapping fix (CLT-100 F11)
- AI plan interpretation for PDF documents
- Roster import with compound field parsing
- Entity resolution from roster
- Rule set assignment from product licenses
- Multi-plan calculation execution
- End-to-end Caribe walkthrough verification

### OUT OF SCOPE — DO NOT BUILD
- Full coordination gate engine (document status, flag if not implemented)
- Full clawback engine (document status, flag if not implemented)
- Financial module changes (OB-101 scope)
- Operate/Perform landing redesign (OB-102 scope)
- Auth flow changes (DO NOT TOUCH)
- SFTP/API ingestion channels (future)
- Mobile layouts
- N+1 systemic fix (PDR-04 — separate OB)
- New seed data for other tenants

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Periods as labels without date boundaries | Decision 48: start_date + end_date REQUIRED |
| AP-2 | Requiring period configuration before import | Decision 47: Import proposes periods from data |
| AP-3 | Single-file upload on multi-file use cases | Decision 49: multiple attribute on file inputs |
| AP-4 | Blocking PDF in file picker | Decision 50: PDF in accepted formats per DS-005 |
| AP-5 | Silent failure on period/plan creation | Show success/error toast, refresh list |
| AP-6 | Processing files only if format matches old filter | Accept all DS-005 Section 2.4 formats |
| AP-7 | Modifying auth files | Read AUTH_FLOW_REFERENCE.md — DO NOT TOUCH |
| AP-8 | Hardcoding file processing to one format | Format detection from file content, not extension |
| AP-9 | Ignoring unmapped fields in data import | Carry Everything, Express Contextually |
| AP-10 | Creating periods without start_date/end_date | Validation: both fields required, reject if missing |

---

*ViaLuce.ai — The Way of Light*
*OB-103: The co-founder demo is the product. If it doesn't work end-to-end, nothing else matters.*
*"A platform demo that requires the audience to configure periods before they can import data has already lost the room."*
