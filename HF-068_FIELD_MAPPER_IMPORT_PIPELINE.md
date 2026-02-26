# HF-068: FIELD MAPPER + IMPORT PIPELINE — UNBLOCK CARIBE FINANCIAL
## AI analysis works. Mappings don't populate. Fix the bridge.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST — MANDATORY

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply (v2.0+)
2. `PERSISTENT_DEFECT_REGISTRY.md` — verify all in-scope items before completion report
3. `SCHEMA_REFERENCE.md` — authoritative column reference for every Supabase query
4. `AUTH_FLOW_REFERENCE.md` — DO NOT MODIFY ANY AUTH FILE

**If you have not read all four files, STOP and read them now.**

---

## WHY THIS HF EXISTS

Caribe Financial (Mexican Bank Co) is the co-founder demo tenant for ICM banking use cases. The tenant is created with 4 plans and 25 employees. **The onboarding pipeline is blocked at field mapping.**

CLT-100 (Feb 26) discovered during the Caribe onboarding attempt:

1. **F45 — Field Mapper Not Populating:** When uploading data files for Caribe Financial, the AI sheet analysis step runs successfully (sheets are classified, columns are detected), but the field mapping step renders with an empty content area. The mapping dropdowns that should show AI-suggested column-to-field mappings do not appear. The "Next" button is non-functional.

2. **The break is between AI output and UI consumption.** The AI correctly analyzes the uploaded file. The field mapping component doesn't receive or doesn't render the AI suggestions. This is a data bridge problem, not an AI problem.

3. **This blocks ALL new tenant data imports.** Not just Caribe — any tenant attempting to import data hits the same wall. Pipeline Test Co and Óptica work because their data was imported before this regression occurred.

### What Works
- File upload (file reaches the server)
- AI sheet classification (sheets are recognized)
- AI column analysis (columns are detected, suggestions generated)

### What's Broken
- Field mapping dropdowns don't populate with AI suggestions
- "Next" button stays disabled (validation never passes)
- The user is stuck in a dead-end step

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **DO NOT MODIFY ANY FILE IN THE AUTH CHAIN** (auth-service.ts, session-context.tsx, auth-shell.tsx, middleware.ts).
6. **Supabase .in() ≤ 200 items per call.**

---

## SCHEMA REFERENCE (From SCHEMA_REFERENCE.md — verify against actual file)

### import_batches
| Column | Type | Use |
|--------|------|-----|
| id | uuid PK | Batch identifier |
| tenant_id | uuid FK → tenants.id | Filter by tenant |
| file_name | text | Uploaded file name |
| file_type | text | File MIME type |
| row_count | integer | Detected row count |
| status | text | received/classified/validated/committed |
| error_summary | jsonb | Any errors |
| uploaded_by | uuid FK → profiles.id | Who uploaded |
| created_at | timestamptz | When created |
| completed_at | timestamptz | When completed |

### committed_data
| Column | Type | Use |
|--------|------|-----|
| id | uuid PK | — |
| tenant_id | uuid FK → tenants.id | Filter by tenant |
| import_batch_id | uuid FK → import_batches.id | Links to import |
| entity_id | uuid FK → entities.id | Links to entity |
| period_id | uuid FK → periods.id | Links to period |
| data_type | text | Data classification |
| row_data | jsonb | **The actual data — all columns preserved** |
| metadata | jsonb | Import metadata |
| created_at | timestamptz | When committed |

### classification_signals
| Column | Type | Use |
|--------|------|-----|
| id | uuid PK | — |
| tenant_id | uuid FK → tenants.id | Filter by tenant |
| signal_type | text | field_mapping / sheet_classification |
| signal_value | jsonb | The prediction + outcome |
| confidence | numeric | AI confidence score |
| source | text | Which AI model/service |
| context | jsonb | Additional context |
| created_at | timestamptz | When captured |

---

## SCOPE BOUNDARIES

### IN SCOPE
- Import pipeline: file upload → sheet analysis → field mapping → data commit
- Field mapping component (the step with mapping dropdowns)
- Data bridge between AI analysis output and field mapping UI
- AI suggestion → dropdown population logic
- "Next" button validation logic on field mapping step
- Classification signal capture during mapping (accept/override/reject)
- Multi-file upload support (file picker + drag-and-drop accepts multiple files)

### OUT OF SCOPE — DO NOT TOUCH
- **Auth files** (middleware.ts, auth-service.ts, session-context.tsx, auth-shell.tsx) — NEVER
- Calculation engine
- Observatory (that's HF-067)
- Landing pages (/operate, /perform)
- Financial module pages (/financial/*)
- Sidebar / navigation
- AI model prompts (the AI analysis works — the problem is downstream)
- New Supabase tables or migrations

---

## PHASE 0: DIAGNOSTIC — TRACE THE FULL IMPORT PIPELINE

Before changing ANY code, trace the entire import flow from file upload to data commit. Find the EXACT point where the pipeline breaks.

### 0A: Find the Import Page and Its Steps

```bash
echo "============================================"
echo "HF-068 PHASE 0: IMPORT PIPELINE DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: IMPORT PAGE STRUCTURE ==="
echo "--- Import page location ---"
find web/src/app -path "*import*" -name "*.tsx" 2>/dev/null | head -10
find web/src/app -path "*operate*import*" -name "*.tsx" 2>/dev/null | head -10
echo ""
echo "--- Import page content ---"
cat web/src/app/operate/import/page.tsx 2>/dev/null | head -80
echo ""
echo "--- Step components ---"
find web/src -name "*Step*" -o -name "*step*" -o -name "*Wizard*" -o -name "*wizard*" 2>/dev/null | grep -i "import\|upload\|mapping\|field\|sheet" | grep -v node_modules | grep -v ".next"
```

### 0B: Find the Field Mapping Component

```bash
echo ""
echo "=== 0B: FIELD MAPPING COMPONENT ==="
echo "--- Field mapping files ---"
find web/src -name "*FieldMap*" -o -name "*field-map*" -o -name "*fieldMap*" -o -name "*mapping*" 2>/dev/null | grep -v node_modules | grep -v ".next" | head -15
echo ""
echo "--- Field mapping component content (first 100 lines) ---"
for f in $(find web/src -name "*FieldMap*" -o -name "*field-map*" 2>/dev/null | grep -v node_modules | grep -v ".next" | head -3); do
  echo "--- $f ---"
  head -100 "$f"
  echo ""
done
```

### 0C: Find the AI Analysis Service

```bash
echo ""
echo "=== 0C: AI ANALYSIS SERVICE ==="
echo "--- AI analysis / sheet classification ---"
find web/src -name "*classify*" -o -name "*analysis*" -o -name "*smart-map*" -o -name "*ai-map*" 2>/dev/null | grep -v node_modules | grep -v ".next" | head -15
echo ""
echo "--- AI API routes for import ---"
find web/src/app/api -path "*import*" -o -path "*classify*" -o -path "*map*" -o -path "*analyz*" 2>/dev/null | grep -v node_modules | head -15
echo ""
echo "--- What does AI analysis return? ---"
grep -rn "classification\|suggestion\|mapping.*result\|columnMap\|fieldMap\|sheetAnalysis" web/src/lib/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -20
```

### 0D: Trace the Data Flow Between Steps

```bash
echo ""
echo "=== 0D: DATA FLOW BETWEEN STEPS ==="
echo "--- How does sheet analysis pass data to field mapping? ---"
grep -rn "onNext\|setStep\|stepData\|wizardState\|importState\|setMappings\|setFields\|setColumns" web/src/ --include="*.tsx" --include="*.ts" | grep -i "import\|map\|step\|wizard" | grep -v node_modules | grep -v ".next" | head -25
echo ""
echo "--- What state does the field mapping step expect as input? ---"
grep -rn "props\|interface.*Map\|type.*Map\|columns\|headers\|fields\|suggestions" web/src/ --include="*.tsx" | grep -i "field.*map\|mapping" | grep -v node_modules | grep -v ".next" | head -20
echo ""
echo "--- What does the Next button check? ---"
grep -rn "disabled\|canProceed\|isValid\|handleNext\|onNext" web/src/ --include="*.tsx" | grep -i "field.*map\|mapping" | grep -v node_modules | grep -v ".next" | head -15
```

### 0E: Check for Recent Changes That Broke It

```bash
echo ""
echo "=== 0E: RECENT GIT CHANGES TO IMPORT PIPELINE ==="
cd /Users/AndrewAfrica/spm-platform
git log --oneline -20 -- web/src/app/operate/import/ web/src/components/*import* web/src/components/*map* web/src/lib/*map* web/src/lib/*import* 2>/dev/null
echo ""
echo "--- Diff of most recent change to import-related files ---"
git log --oneline -5 -- web/src/app/operate/import/ | head -1
# If a commit hash appears, diff it:
# git diff HEAD~1..HEAD -- web/src/app/operate/import/
```

### Phase 0 Output — MANDATORY FORMAT

```
// PHASE 0 FINDINGS — HF-068
//
// IMPORT PIPELINE STEPS:
// Step 1: [name] — [file path] — WORKS/BROKEN
// Step 2: [name] — [file path] — WORKS/BROKEN
// Step 3: [name] — [file path] — WORKS/BROKEN
// Step 4: [name] — [file path] — WORKS/BROKEN
//
// AI ANALYSIS OUTPUT FORMAT:
// The AI returns: [describe the shape — e.g., { sheets: [...], columns: [...], suggestions: [...] }]
//
// FIELD MAPPING INPUT FORMAT:
// The component expects: [describe the shape it reads from props/state]
//
// THE BREAK POINT:
// AI outputs [shape A]. Field mapping expects [shape B].
// The specific mismatch: [what field/property is missing or renamed]
//
// OR:
// AI output is stored in [state variable]. Field mapping reads from [different state variable].
// The bridge between them: [missing/broken/never wired]
//
// NEXT BUTTON CONDITION:
// Disabled when: [exact condition]
// This never becomes true because: [reason]
//
// ROOT CAUSE:
// [One specific thing that broke the bridge — ideally traced to a specific commit or OB]
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-068 Phase 0: Import pipeline diagnostic — field mapper break point" && git push origin dev`

**Do NOT write fix code until Phase 0 is committed.**

---

## PHASE 1: ARCHITECTURE DECISION

Based on Phase 0 findings, document the fix approach:

```
ARCHITECTURE DECISION RECORD — HF-068
============================
Problem: AI sheet analysis produces field mapping suggestions, but the field mapping
step doesn't receive or render them. The data bridge between AI output and mapping UI is broken.

Option A: Fix the data bridge (wire AI output state to mapping component props)
  - Scale test: Works at 10x? YES — same bridge regardless of file size
  - AI-first: Any hardcoding? NO — AI suggestions flow through unchanged
  - Transport: Data through HTTP bodies? AI results already in client state
  - Atomicity: No DB changes until commit step

Option B: Rewrite the import wizard with new step architecture
  - Scale test: Works at 10x? YES
  - AI-first: Any hardcoding? NO
  - Transport: Same
  - Atomicity: Same
  - RISK: Scope creep — much larger than a hotfix

CHOSEN: Option ___ because ___
REJECTED: Option ___ because ___
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-068 Phase 1: Architecture decision — field mapper bridge fix" && git push origin dev`

---

## PHASE 2: FIX THE FIELD MAPPING DATA BRIDGE

Based on Phase 0 diagnosis, fix the specific break point.

### 2A: The Bridge Contract

The field mapping step needs these inputs from the AI analysis step:

```typescript
interface FieldMappingInput {
  // The detected columns from the uploaded file
  sourceColumns: Array<{
    name: string;           // Original column name from file (e.g., "Año", "employee_id", "num_empleado")
    sampleValues: any[];    // First 3-5 sample values for preview
    dataType: string;       // detected: string, number, date, etc.
  }>;
  
  // AI-suggested mappings for each column
  suggestions: Array<{
    sourceColumn: string;   // Matches sourceColumns[n].name
    suggestedTarget: string; // Platform target field (e.g., "year", "entity_id", "amount")
    confidence: number;     // 0-1 confidence score
    alternativeTargets?: string[]; // Other possible mappings
  }>;
  
  // Available target fields the user can map to
  targetFields: Array<{
    name: string;           // Target field identifier
    label: string;          // Human-readable label
    required: boolean;      // Must be mapped?
    description?: string;   // Tooltip text
  }>;
  
  // Sheet context
  sheetName: string;
  sheetClassification: string; // roster, transaction_data, balance_snapshot, etc.
  rowCount: number;
}
```

### 2B: Fix the Specific Break

Based on Phase 0 findings, apply the fix. Common causes and their fixes:

**If the AI output is in a different state variable than the mapping component reads:**
```typescript
// Wire the correct state:
// If AI stores results in `analysisResult` but mapping reads `mappingData`:
// → Pass analysisResult to the mapping step as props or update shared state
```

**If the AI output shape doesn't match the component's expected shape:**
```typescript
// Transform AI output to match component expectations:
const mappingInput: FieldMappingInput = {
  sourceColumns: analysisResult.columns.map(col => ({
    name: col.originalName,
    sampleValues: col.samples,
    dataType: col.detectedType
  })),
  suggestions: analysisResult.fieldMappings.map(m => ({
    sourceColumn: m.column,
    suggestedTarget: m.targetField,
    confidence: m.score
  })),
  // ... etc
};
```

**If the step transition doesn't carry data forward:**
```typescript
// Ensure onNext passes data to the next step:
const handleAnalysisComplete = (result: AnalysisResult) => {
  setAnalysisData(result);  // Store for the mapping step
  setCurrentStep(nextStep); // Advance to mapping
};
```

### 2C: Fix the "Next" Button

The Next button on the field mapping step must enable when:
```typescript
const canProceed = mappings.every(m => {
  // Every required target field has a source column mapped to it
  if (m.required) return m.sourceColumn !== null && m.sourceColumn !== '';
  return true; // Optional fields can be unmapped
});
```

AI suggestions should PRE-POPULATE the mappings. When AI confidence is high (>0.8), the mapping is pre-selected. The user can override any mapping. Once all required fields are mapped, "Next" enables.

### 2D: Classification Signal Capture

When the user confirms, overrides, or rejects an AI suggestion, capture a classification signal:

```typescript
// For each mapping decision:
const signal = {
  signal_type: 'field_mapping',
  signal_value: {
    source_column: mapping.sourceColumn,
    ai_suggestion: mapping.aiSuggestedTarget,
    user_selection: mapping.finalTarget,
    action: mapping.aiSuggestedTarget === mapping.finalTarget ? 'accepted' : 'overridden'
  },
  confidence: mapping.aiConfidence,
  source: 'smart-mapper',
  context: {
    sheet_name: sheetName,
    file_name: fileName,
    tenant_id: tenantId
  }
};
// Save to classification_signals table
```

This feeds the ML flywheel — future imports for similar data will have boosted confidence.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-068 Phase 2: Field mapping bridge fix — AI suggestions populate dropdowns" && git push origin dev`

---

## PHASE 3: MULTI-FILE UPLOAD SUPPORT

### 3A: File Input Accepts Multiple Files

```bash
echo "=== Find file input element ==="
grep -rn "type=\"file\"\|type='file'\|accept=\|input.*file\|dropzone\|drop.*zone" web/src/ --include="*.tsx" | grep -i "import\|upload" | grep -v node_modules | grep -v ".next" | head -10
```

Fix the file input to accept multiple files:
```html
<!-- Ensure multiple attribute is present -->
<input type="file" multiple accept=".xlsx,.xls,.csv,.tsv,.pdf,.docx,.pptx" />
```

If using a drag-and-drop zone, ensure it handles `event.dataTransfer.files` (plural) not just `files[0]`.

### 3B: Per-File Processing

When multiple files are uploaded:
1. Create ONE `import_batch` for the upload session
2. Each file gets its own AI classification pass
3. Show a batch summary with per-file status:

```
Import Batch — 3 files
✓ employees_q1.xlsx — Roster (25 entities detected) — Confidence: 94%
✓ loans_jan.csv — Transaction Data (89 records) — Confidence: 91%
⚠ insurance_refs.csv — Unknown (needs review) — Confidence: 52%

[Review Mappings]  [Commit All Ready Files]
```

4. Files with high confidence can auto-proceed. Low confidence files get flagged for field mapping review.

### 3C: Preserve "Carry Everything" Principle

When committing data to `committed_data`:
- `row_data` JSONB must contain ALL columns from the source file
- Both mapped AND unmapped columns are preserved
- Mapped columns get platform-standard field names as keys
- Unmapped columns retain their original names
- Nothing is silently dropped

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-068 Phase 3: Multi-file upload + Carry Everything preservation" && git push origin dev`

---

## PHASE 4: VERIFY WITH CARIBE FINANCIAL

### 4A: Test the Fixed Pipeline

Using the Caribe Financial tenant, attempt a complete data import:

1. Login as Caribe Financial admin
2. Navigate to Import Data
3. Select/drag one of the Caribe data files (if test files exist) or any .xlsx/.csv file
4. Verify: sheet analysis completes, columns detected
5. Verify: field mapping step shows dropdowns with AI suggestions
6. Verify: AI suggestions pre-populate high-confidence mappings
7. Verify: user can override any mapping
8. Verify: "Next" button enables after required fields mapped
9. Verify: data commits to committed_data with correct tenant_id

### 4B: Regression Check — Pipeline Test Co

Verify that the fix doesn't break existing import functionality:

1. If there's a way to test import on Pipeline Test Co or Óptica, do so
2. At minimum: verify the import page renders without errors for existing tenants
3. Check browser console for errors on the import page

```bash
echo "=== REGRESSION: Import page renders for all tenants ==="
echo "Navigate to /operate/import for:"
echo "1. Pipeline Test Co — does import page load?"
echo "2. Óptica Luminar — does import page load?"
echo "3. Sabor Grupo — does import page load?"
echo "4. Caribe Financial — does import page load + field mapping works?"
echo ""
echo "Browser console: zero errors on import page for all tenants"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-068 Phase 4: Pipeline verification — Caribe + regression check" && git push origin dev`

---

## PHASE 5: BUILD + COMPLETION REPORT + PR

### 5A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
npm run dev &
sleep 10
curl -s -o /dev/null -w "localhost:3000 status: %{http_code}\n" http://localhost:3000
```

### 5B: Persistent Defect Registry — Verification

| PDR # | Description | In Scope? | Status | Evidence |
|-------|-------------|-----------|--------|----------|
| PDR-01 | Currency no cents ≥ MX$10K | NO | — | Not in scope |
| PDR-02 | Module-aware landing | NO | — | Not in scope |
| PDR-03 | Bloodwork Financial landing | NO | — | Not in scope |
| PDR-04 | N+1 platform overhead | NOTE | PASS/FAIL | [Request count on import pages] |
| PDR-05 | effectivePersona | NO | — | Not in scope |
| PDR-06 | Brand cards as headers | NO | — | Not in scope |
| PDR-07 | Amber threshold ±5% | NO | — | Not in scope |

### 5C: Completion Report

Create `HF-068_COMPLETION_REPORT.md` at PROJECT ROOT:

1. **Phase 0 diagnostic** — what the import pipeline steps are, where the break occurred
2. **Root cause** — the specific data bridge failure between AI analysis and field mapping
3. **Architecture decision** — chosen fix approach
4. **Fix description** — files changed, what was broken, what was fixed
5. **Field mapping now works:**
   - AI suggestions populate dropdowns: YES/NO
   - User can override: YES/NO
   - Next button enables: YES/NO
   - Data commits to committed_data: YES/NO
6. **Multi-file upload:**
   - File input accepts multiple files: YES/NO
   - Per-file AI classification: YES/NO
   - Batch summary visible: YES/NO
7. **Classification signals:**
   - Accept/override logged to classification_signals: YES/NO
8. **Caribe Financial test:**
   - Import page loads: YES/NO
   - Field mapping works: YES/NO
   - Data committed: YES/NO (or BLOCKED if no test file available)
9. **Regression check:**
   - Pipeline Test Co import page: loads/errors
   - Óptica import page: loads/errors
10. **All proof gates** PASS/FAIL with evidence

### 5D: Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Phase 0 committed | Diagnostic with break point identified before any fix code |
| PG-02 | AI suggestions visible | Field mapping step shows dropdowns with AI-suggested mappings |
| PG-03 | Dropdowns populated | Each source column has a dropdown with target field options |
| PG-04 | AI pre-population | High-confidence mappings (>0.8) are pre-selected |
| PG-05 | User override | User can change any pre-selected mapping |
| PG-06 | Next button enables | After all required fields mapped, Next is clickable |
| PG-07 | Data commits | committed_data receives rows with correct tenant_id |
| PG-08 | row_data preserves all columns | Both mapped and unmapped columns in row_data JSONB |
| PG-09 | Multiple files accepted | File input allows selecting 2+ files |
| PG-10 | Classification signal logged | At least 1 signal in classification_signals after confirming mappings |
| PG-11 | Caribe import page loads | No errors on /operate/import for Caribe tenant |
| PG-12 | Regression — Pipeline Test Co | Import page loads without errors |
| PG-13 | `npm run build` | Exits 0 |
| PG-14 | localhost:3000 | Responds with 200 |
| PG-15 | Browser console | Zero errors on import page |

### 5E: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "HF-068: Field Mapper Fix — Unblock Data Import Pipeline" \
  --body "## Problem
Field mapping step renders empty — AI suggestions not populating dropdowns.
Next button permanently disabled. All new tenant data imports blocked.

## Root Cause
[From Phase 0 — the specific data bridge failure]

## Fix
- AI analysis output now correctly flows to field mapping component
- Mapping dropdowns populated with source columns and AI-suggested targets
- High-confidence suggestions pre-selected, user can override any mapping
- Next button enables when all required fields mapped
- Multi-file upload supported (multiple attribute on file input)
- Classification signals captured on accept/override for ML flywheel
- Carry Everything: all columns preserved in row_data (mapped + unmapped)

## Finding Addressed: F45 (Field mapper not populating for new tenants)
## Proof Gates: 15 — see HF-068_COMPLETION_REPORT.md"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-068 Complete: Field mapper bridge fix — import pipeline unblocked" && git push origin dev`

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Hardcode field name dictionaries | AI provides suggestions — no static lookup tables |
| AP-2 | Drop unmapped columns during import | Carry Everything — row_data preserves ALL columns |
| AP-3 | Build a second import pipeline | Fix the existing pipeline — single code path |
| AP-4 | Mock/hardcode AI suggestions | Real AI analysis output drives the dropdowns |
| AP-5 | Skip classification signal capture | Every accept/override/reject logged to classification_signals |
| AP-6 | Fix the AI prompt instead of the data bridge | The AI works — the problem is between AI output and UI |
| AP-7 | Modify auth files | DO NOT TOUCH |
| AP-8 | Touch Observatory (HF-067 scope) | Only import pipeline is in scope |
| AP-9 | Touch landing pages (OB-105 scope) | Only import pipeline is in scope |
| AP-10 | Sequential per-row commits | Bulk insert to committed_data — batch all rows |

---

## CRITICAL CONSTRAINTS

1. **The AI analysis step WORKS.** Do not modify AI prompts, classification logic, or the Anthropic API call. The problem is downstream of the AI — in the UI data bridge.

2. **Carry Everything.** When data commits to committed_data, the `row_data` JSONB must contain EVERY column from the source file. Mapped columns get platform field names. Unmapped columns keep original names. Nothing is silently dropped. This is a standing architectural principle.

3. **Korean Test.** The field mapping UI must work for columns named in any language. The dropdowns show the original column name (whatever it is) with the AI's suggested target field. No language-specific logic in the UI.

4. **Single code path.** There is ONE import pipeline. Fix it. Do not create a "new enhanced import" alongside the existing one. AP-17 from standing rules: no parallel code paths.

5. **Classification signals are part of the fix.** When a user confirms or overrides a mapping, log it. This is not optional — it feeds the ML flywheel (Principle 5: Closed-Loop Learning).

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*HF-068: "The AI knows what the columns mean. The UI doesn't show it. Fix the bridge."*
