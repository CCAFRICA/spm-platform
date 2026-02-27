# OB-107: IMPORT PIPELINE ARCHITECTURE FIX
## Classification propagation. Multi-plan routing. Enrichment not gating. Signal loop closure.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST — MANDATORY

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `PERSISTENT_DEFECT_REGISTRY.md` — verify in-scope items
3. `SCHEMA_REFERENCE.md` — authoritative column reference
4. `AUTH_FLOW_REFERENCE.md` — DO NOT MODIFY ANY AUTH FILE
5. `CLT-102_FINDINGS.md` — the 52 findings that define this OB's scope (ADD TO PROJECT KNOWLEDGE)

**If you have not read all five files, STOP and read them now.**

---

## WHY THIS OB EXISTS

CLT-102 tested the Caribe Financial walkthrough (banking, 4 plans, 13 files). The calculation engine is proven (Pipeline Proof Co: MX$1,253,832, 100% exact match). But the import pipeline broke at every step for a multi-plan, multi-file, different-domain tenant.

**52 findings. 22 P0. Three systemic root causes:**

### Root Cause 1: Classification Doesn't Propagate
The AI correctly identifies files ("Personnel Data", "Component Data") but downstream steps ignore it. Period detection runs on roster HireDates (creating 22 erroneous periods). Validation checks plan-specific metrics on roster files. Plan association doesn't change per file.

### Root Cause 2: Single-Plan Context Model
The import pipeline locks to one plan at the start and applies it across all files in a batch. Deposit data goes to Mortgage plan. Insurance referrals go to Mortgage plan. Every file feeds the wrong calculation.

### Root Cause 3: Field Mapper as Gate, Not Enrichment
The TMR describes an enrichment layer where ALL columns are preserved and the AI adds semantic tags. The implementation forces columns into a narrow fixed taxonomy (Entity ID, Amount, Quantity, etc.) or marks them "Unresolved" — effectively lost. The taxonomy doesn't cover banking, insurance, or any domain beyond Óptica's optical retail.

**These three failures compound:** Wrong classification → wrong plan → wrong field mappings → wrong periods → wrong data committed → calculation produces $0 or garbage → reconciliation fails.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **DO NOT MODIFY ANY FILE IN THE AUTH CHAIN.**
6. **Supabase .in() ≤ 200 items per call.**

---

## SCOPE BOUNDARIES

### IN SCOPE
- Import pipeline: file processing, sheet analysis, field mapping, validation, period detection, plan association
- Classification signal reading (close the feedback loop)
- committed_data: ensure ALL columns are preserved regardless of mapping status
- Multi-file processing: each file analyzed independently
- Confidence score computation (replace hardcoded values)

### OUT OF SCOPE — DO NOT TOUCH
- Auth files — NEVER
- Calculation engine (run-calculation.ts) — works, don't touch
- Metric resolver / semantic resolution hierarchy — works
- Observatory — already fixed (HF-067)
- Financial module pages
- Landing page redesign (OB-108)
- Customer Launch Dashboard cleanup (separate HF)
- Sidebar / navigation

---

## CC FAILURE PATTERN WARNING

| # | Pattern | What Happened | Prevention |
|---|---------|---------------|------------|
| 1 | Broad refactoring | Previous OBs rewrote entire files when one function was broken | Identify exact functions. Minimal changes. |
| 2 | Overcorrection | OB-85 R4 fixed inflation but killed 3 components | Touch only the broken path. Óptica must still work. |
| 3 | Theory before data | Guessing at root cause without reading code | Phase 0 reads every relevant file first. |
| 4 | Building UI before logic | Pretty interface with broken data flow | Fix data flow first. UI polish is separate. |
| 5 | Ignoring existing patterns | Rebuilding what already works | The import pipeline WORKS for single-file XLSX (Óptica). Extend, don't replace. |
| 6 | PDR substitution | "Fixing" something different from what was reported | Use EXACT CLT-102 finding numbers. |

---

## LOCKED DECISIONS (From CLT-102)

These are non-negotiable architectural rules for this OB:

| # | Decision |
|---|----------|
| 51 | Field mapper is an enrichment layer, not a gate. ALL columns preserved in committed_data. AI adds semantic tags. Unmapped columns are carried, not lost. |
| 52 | Period auto-detection suppressed for files classified as roster/personnel. Only transaction/performance data triggers period creation. |
| 53 | Import pipeline supports multi-plan routing. No single-plan lock across file batches. AI determines plan association per file, or user selects per file. |
| 54 | Classification signals are READ during subsequent imports for the same tenant. Prior corrections inform AI suggestions. |
| 55 | Confidence scores computed from actual analysis, not hardcoded. Display shows actual numeric values. |
| 56 | Validation logic respects file classification. Roster files don't require plan-specific metrics. |

---

# ═══════════════════════════════════════════════════
# PHASE 0: DIAGNOSTIC — READ BEFORE WRITING
# ═══════════════════════════════════════════════════

**Read every file listed below. Do not skip. Do not summarize. Actually read them.**

```bash
echo "============================================"
echo "OB-107 PHASE 0: IMPORT PIPELINE DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: ENHANCED IMPORT PAGE — THE MAIN ENTRY POINT ==="
cat web/src/app/operate/import/enhanced/page.tsx | head -150
echo "... (read the ENTIRE file, not just first 150 lines)"

echo ""
echo "=== 0B: HOW FILES ARE PROCESSED ==="
echo "--- Find analyzeWorkbook / classifyFile / handleFileSelect ---"
grep -rn "analyzeWorkbook\|classifyFile\|handleFileSelect\|handleFile\|processFile" \
  web/src/app/operate/import/ web/src/lib/ --include="*.tsx" --include="*.ts" | head -30

echo ""
echo "=== 0C: AI ANALYSIS — WHAT DOES THE AI CALL LOOK LIKE? ==="
echo "--- Find the Anthropic API call for sheet analysis ---"
grep -rn "anthropic\|claude\|ai.*analy\|interpret\|classify.*sheet\|analyze.*workbook" \
  web/src/lib/ web/src/app/api/ --include="*.ts" --include="*.tsx" | head -20
echo "--- Read the actual AI service/API route ---"
find web/src/app/api -name "*.ts" -path "*analy*" -o -name "*.ts" -path "*classify*" 2>/dev/null | head -5
find web/src/lib -name "*.ts" -path "*ai*" -o -name "*.ts" -path "*analy*workbook*" 2>/dev/null | head -5

echo ""
echo "=== 0D: FIELD MAPPING STATE — HOW ARE MAPPINGS STORED? ==="
grep -rn "fieldMappings\|setFieldMappings\|suggestedFieldMappings\|targetField\|sourceColumn" \
  web/src/app/operate/import/ --include="*.tsx" | head -30

echo ""
echo "=== 0E: TARGET FIELD TAXONOMY — WHAT OPTIONS EXIST? ==="
grep -rn "targetField\|target.*fields\|field.*options\|Entity ID\|Amount\|Quantity\|Achievement\|Store ID" \
  web/src/lib/ web/src/app/operate/import/ --include="*.ts" --include="*.tsx" | head -30
echo "--- Find the actual dropdown options list ---"
grep -rn "options\|choices\|select.*field\|dropdown.*field" \
  web/src/app/operate/import/ --include="*.tsx" | head -20

echo ""
echo "=== 0F: PERIOD DETECTION — WHERE AND HOW? ==="
grep -rn "period.*detect\|detect.*period\|createPeriod\|period.*create\|date.*range\|temporal" \
  web/src/app/operate/import/ web/src/lib/ --include="*.ts" --include="*.tsx" | head -20
echo "--- Is there a condition that checks file type before creating periods? ---"
grep -rn "roster\|personnel\|file.*type\|sheet.*type\|classification.*type" \
  web/src/app/operate/import/ --include="*.tsx" | head -20

echo ""
echo "=== 0G: PLAN ASSOCIATION — HOW IS PLAN CONTEXT SET? ==="
grep -rn "rule_set\|ruleSet\|planId\|plan.*select\|active.*plan\|selected.*plan" \
  web/src/app/operate/import/ --include="*.tsx" | head -30
echo "--- Is plan set once or per file? ---"
grep -rn "plan\|rule.*set" web/src/app/operate/import/enhanced/page.tsx | head -20

echo ""
echo "=== 0H: COMMITTED DATA — HOW IS DATA WRITTEN? ==="
grep -rn "committed_data\|commitData\|commit.*import\|approved\|approve.*import" \
  web/src/app/operate/import/ web/src/app/api/ web/src/lib/ --include="*.ts" --include="*.tsx" | head -20
echo "--- What gets stored in row_data? ---"
grep -rn "row_data\|rawData\|raw_data\|mapped.*only\|unmapped\|all.*columns\|carry.*every" \
  web/src/lib/ web/src/app/api/ --include="*.ts" | head -20

echo ""
echo "=== 0I: MULTI-FILE HANDLING — HOW IS THE QUEUE MANAGED? ==="
grep -rn "queue\|fileQueue\|nextFile\|processNext\|remaining\|fileList\|selectedFiles" \
  web/src/app/operate/import/ --include="*.tsx" | head -20

echo ""
echo "=== 0J: CLASSIFICATION SIGNALS — READ AND WRITE ==="
grep -rn "classification_signal\|classificationSignal\|signal.*capture\|capture.*signal" \
  web/src/lib/ web/src/app/api/ --include="*.ts" | head -20
echo "--- Is there a READ path (not just WRITE)? ---"
grep -rn "getSignal\|readSignal\|fetchSignal\|prior.*signal\|previous.*signal\|history.*signal" \
  web/src/lib/ web/src/app/api/ --include="*.ts" | head -10

echo ""
echo "=== 0K: CONFIDENCE SCORE — COMPUTED OR HARDCODED? ==="
grep -rn "confidence\|quality.*score\|74\|50.*confidence\|data.*quality" \
  web/src/app/operate/import/ --include="*.tsx" | head -20
grep -rn "0\.5\|0\.74\|74\|50" web/src/app/operate/import/ --include="*.tsx" | grep -i "confid\|quality" | head -10

echo ""
echo "=== 0L: VALIDATION LOGIC — WHAT DOES IT CHECK? ==="
grep -rn "validat\|warning\|required.*field\|missing.*field\|component.*will.*be.*0" \
  web/src/app/operate/import/ --include="*.tsx" | head -20

echo ""
echo "=== 0M: FILE INVENTORY ==="
find web/src/app/operate/import -name "*.tsx" -o -name "*.ts" | sort
find web/src/lib -name "*.ts" -path "*import*" -o -name "*.ts" -path "*ingest*" | sort
find web/src/app/api -name "*.ts" -path "*import*" -o -name "*.ts" -path "*analy*" -o -name "*.ts" -path "*classify*" -o -name "*.ts" -path "*signal*" | sort
```

### Phase 0 Output — MANDATORY FORMAT

After reading ALL files, document:

```
// OB-107 PHASE 0 FINDINGS
//
// FILE INVENTORY:
// [list every file in the import pipeline with one-line purpose]
//
// CURRENT DATA FLOW:
// 1. User selects file(s) → [function] in [file]
// 2. File parsed by → [function] in [file]  
// 3. AI analysis called → [API route] → [AI function]
// 4. Field mappings populated → [state variable] in [file]
// 5. Validation runs → [function] in [file]
// 6. Period detection → [function] in [file]
// 7. Data committed → [API route] → [table]
//
// ROOT CAUSE 1 — CLASSIFICATION PROPAGATION:
// File type classification is set at: [file:line]
// It is read by validation at: [file:line] or NEVER
// It is read by period detection at: [file:line] or NEVER
// It is read by plan association at: [file:line] or NEVER
//
// ROOT CAUSE 2 — SINGLE PLAN CONTEXT:
// Plan is set at: [file:line]
// Plan is used at: [file:line, file:line, ...]
// Plan changes per file: YES/NO
//
// ROOT CAUSE 3 — FIELD MAPPER AS GATE:
// Target field options defined at: [file:line]
// Options list: [enumerate all current options]
// Unmapped columns handled at: [file:line]
// Unmapped columns in committed_data: PRESERVED/LOST
//
// CONFIDENCE SCORES:
// Computed at: [file:line] or HARDCODED at [file:line]
// Quality score: computed at [file:line] or HARDCODED
//
// SIGNAL LOOP:
// Signals WRITTEN at: [file:line]
// Signals READ at: [file:line] or NEVER
//
// MULTI-FILE:
// File queue managed at: [file:line]
// Each file gets independent analysis: YES/NO
// Plan context resets per file: YES/NO
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-107 Phase 0: Import pipeline diagnostic — every file read and traced" && git push origin dev`

---

# ═══════════════════════════════════════════════════
# PHASE 1: ARCHITECTURE DECISION
# ═══════════════════════════════════════════════════

Based on Phase 0 diagnosis, decide the fix approach for each root cause.

```
ARCHITECTURE DECISION RECORD — OB-107
============================

ROOT CAUSE 1: Classification Propagation
Problem: File type classification doesn't influence downstream behavior.
Fix approach: [from Phase 0 — where to add classification checks]
Files to modify: [list]
Risk to Óptica: [none/low/high]

ROOT CAUSE 2: Single Plan Context
Problem: Plan locked across all files in batch.
Fix approach: [from Phase 0 — where plan is set, how to make it per-file]
Files to modify: [list]
Risk to Óptica: [none/low/high]

ROOT CAUSE 3: Field Mapper as Gate
Problem: Unmapped columns lost. Taxonomy too narrow.
Fix approach: [from Phase 0 — how committed_data is written]
Files to modify: [list]
Risk to Óptica: [none/low/high]

APPROACH CONSTRAINTS:
- Óptica import/calculation MUST still work after these changes
- Pipeline Proof Co = MX$1,253,832 (zero tolerance)
- Single-file XLSX path (Óptica pattern) must not regress
- Extend the pipeline, don't replace it
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-107 Phase 1: Architecture decision — three root causes" && git push origin dev`

---

# ═══════════════════════════════════════════════════
# PHASE 2: CARRY EVERYTHING — FIELD MAPPER FIX
# ═══════════════════════════════════════════════════

**Decision 51: ALL columns preserved. AI adds semantic tags. Unmapped columns carried.**

### 2A: Ensure committed_data Preserves All Columns

When data is committed to `committed_data`, the `row_data` JSONB must contain EVERY column from the source file — not just the mapped ones.

Find where committed_data is written:
- The commit/approve handler
- The row_data construction

**If row_data only includes mapped fields:** Change it to include ALL fields from the parsed row. Mapped fields get their semantic tag as a parallel structure (e.g., in `field_mappings` on the import_batch, or in a `_mappings` key within row_data).

**Pattern:**
```typescript
// WRONG — only mapped fields
const row_data = {
  entity_id: row['EmployeeID'],
  amount: row['TotalDepositBalance'],
  // ...unmapped columns LOST
};

// CORRECT — all columns preserved, mappings as metadata
const row_data = {
  ...originalRow,  // ALL columns from source file
  _sheetName: sheet.name,
  _rowIndex: index,
};
// Mappings stored separately on import_batch or classification_signals
```

### 2B: Handle "Unresolved" Fields

Fields marked "Unresolved" in the UI must NOT be blocked from import. They are carried in row_data like every other field. The UI should show:

- Mapped fields: green badge with target field name
- Unresolved fields: grey badge "Will be preserved" (not red "Unresolved" which implies problem)

**Minimal UI change:** Find the "Unresolved" badge render and change its label and color.

### 2C: Verify Óptica Still Works

After this change, Óptica's import path must still produce the same committed_data. Since we're ADDING columns (preserving unmapped ones), not removing columns, existing mapped fields are unaffected.

```bash
echo "=== VERIFY: Óptica committed_data sample ==="
cat <<'SQL'
SELECT row_data
FROM committed_data
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
LIMIT 3;
SQL
echo "Check: row_data already includes all columns (HF-068 may have fixed this)"
echo "If yes, Phase 2 may be partially done. Document what exists."
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-107 Phase 2: Carry Everything — all columns preserved in committed_data" && git push origin dev`

---

# ═══════════════════════════════════════════════════
# PHASE 3: CLASSIFICATION PROPAGATION
# ═══════════════════════════════════════════════════

**Decisions 52 + 56: File classification influences downstream behavior.**

### 3A: Period Detection Context

Find the period detection function. Add a guard:

```typescript
// BEFORE: period detection runs on ALL date columns
// AFTER: period detection checks file classification
function detectPeriods(rows, columns, fileClassification) {
  // If file is roster/personnel, do NOT create periods from date columns
  if (fileClassification === 'roster' || fileClassification === 'personnel') {
    return []; // Roster dates are entity attributes, not performance boundaries
  }
  // ... existing period detection logic for transaction/performance data
}
```

**Where to add this guard:** The function that calls period creation during import validation or commit. From Phase 0, this will be identified.

### 3B: Validation Context

Find the validation function that checks "Required fields not mapped." Add classification awareness:

```typescript
// BEFORE: validation checks plan-required metrics for ALL files
// AFTER: validation respects file type
function validateImport(fileClassification, mappings, activePlan) {
  if (fileClassification === 'roster' || fileClassification === 'personnel') {
    // Roster validation: check for entity_id, and optionally name/role
    // Do NOT check for plan-specific metrics (amount, goal, attainment)
    return validateRoster(mappings);
  }
  // Transaction data: existing validation logic
  return validateTransactionData(mappings, activePlan);
}
```

### 3C: Pass Classification Through the Pipeline

Ensure the file classification determined at Sheet Analysis step is available at:
1. Field Mapping step (already available — it's displayed in the UI)
2. Validation step (may not be passed — check Phase 0)
3. Period Detection step (may not be passed)
4. Commit/Approve step (may not be passed)

If classification is stored in component state, verify it's threaded through to all downstream functions.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-107 Phase 3: Classification propagation — roster vs transaction distinction" && git push origin dev`

---

# ═══════════════════════════════════════════════════
# PHASE 4: MULTI-PLAN ROUTING
# ═══════════════════════════════════════════════════

**Decision 53: No single-plan lock across file batches.**

### 4A: Identify Where Plan Context Is Set

From Phase 0, identify where the plan/rule_set is selected and how it persists across the import session.

### 4B: Per-File Plan Association

The import pipeline should determine plan association per file, not per batch. Two approaches:

**Approach A (AI-determined):** During Sheet Analysis, the AI examines the file's columns and content to suggest which plan it feeds. "This file has loan amounts and origination dates — likely feeds Consumer Lending Commission." The suggestion appears as a dropdown that the user can override.

**Approach B (User-selected per file):** After Sheet Analysis, before Field Mapping, show a plan selector per file. Default to the AI suggestion if available. Allow "No plan association" for roster files.

**Preferred: Approach A with Approach B as override.**

### 4C: Implementation

Find where plan context is set (Phase 0 identified this). Change it from a batch-level setting to a per-file property:

```typescript
// BEFORE: single plan for entire import session
const [selectedPlan, setSelectedPlan] = useState(activePlan);

// AFTER: plan association per file
interface FileContext {
  file: File;
  classification: string;  // 'roster' | 'transaction' | 'balance' | etc.
  suggestedPlan: RuleSet | null;  // AI suggestion
  selectedPlan: RuleSet | null;   // User override or AI suggestion
  mappings: FieldMapping[];
}
const [fileContexts, setFileContexts] = useState<FileContext[]>([]);
```

### 4D: Roster Files Get No Plan

When a file is classified as roster/personnel, plan association is set to null. The roster creates/updates entities. Plan assignment happens separately (via ProductLicenses or rule_set_assignments, not import-time plan context).

### 4E: Verify Óptica Path

Óptica uses a single XLSX with 7 sheets. The current flow processes all sheets under one plan context. This must still work:
- 7 sheets in one file → same plan for all sheets (existing behavior)
- Multiple separate files → AI suggests plan per file (new behavior)

The single-file path is unchanged. The multi-file path adds per-file plan routing.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-107 Phase 4: Multi-plan routing — per-file plan association" && git push origin dev`

---

# ═══════════════════════════════════════════════════
# PHASE 5: SIGNAL LOOP CLOSURE
# ═══════════════════════════════════════════════════

**Decision 54: Classification signals READ during subsequent imports.**

### 5A: Query Prior Signals

Before calling the AI for field mapping, query `classification_signals` for this tenant:

```typescript
// Fetch prior mapping decisions for this tenant
const priorSignals = await supabase
  .from('classification_signals')
  .select('signal_value, confidence, context')
  .eq('tenant_id', tenantId)
  .eq('signal_type', 'field_mapping')
  .order('created_at', { ascending: false })
  .limit(100);
```

### 5B: Include Signals in AI Prompt

Add prior signals to the AI prompt context:

```typescript
const prompt = `
Analyze this data file and suggest field mappings.

${priorSignals.length > 0 ? `
PRIOR MAPPING DECISIONS FOR THIS CUSTOMER:
${priorSignals.map(s => 
  `- Column "${s.context.source_column}" was mapped to "${s.signal_value.target_field}" ` +
  `(${s.signal_value.action === 'overridden' ? 'user corrected from AI suggestion' : 'user accepted AI suggestion'})`
).join('\n')}

Use these prior decisions to improve your suggestions. If a column name matches a prior decision, use the confirmed mapping.
` : ''}

File columns: ${columns.join(', ')}
Sample data: ${JSON.stringify(sampleRows.slice(0, 3))}
`;
```

### 5C: Verify Signal Write Path

HF-068 added signal capture on commit. Verify it's still working:

```bash
echo "=== SIGNAL WRITE VERIFICATION ==="
cat <<'SQL'
SELECT signal_type, COUNT(*) as count, MAX(created_at) as latest
FROM classification_signals
WHERE tenant_id = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251'  -- Caribe
GROUP BY signal_type;
SQL
```

If signals exist from prior Caribe imports, the read path will have data to work with.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-107 Phase 5: Signal loop closure — read prior signals into AI prompt" && git push origin dev`

---

# ═══════════════════════════════════════════════════
# PHASE 6: CONFIDENCE SCORE FIX
# ═══════════════════════════════════════════════════

**Decision 55: Confidence scores computed, not hardcoded.**

### 6A: Find Hardcoded Values

From Phase 0, identify where 50%, 74%, and "% confidence" (literal text) originate.

### 6B: Compute Real Confidence

**Sheet Analysis confidence:** Based on AI's actual confidence in the classification. The Anthropic API response includes reasoning — parse it for confidence indicators.

**Field Mapping confidence:** Per-field confidence from the AI response. If the AI says "95% sure OfficerID is Entity ID", display 95%.

**Overall Quality Score:** Compute from actual metrics:
```typescript
function computeQualityScore(mappings: FieldMapping[]): number {
  const totalFields = mappings.length;
  const mappedFields = mappings.filter(m => m.targetField).length;
  const avgConfidence = mappings.reduce((sum, m) => sum + (m.confidence || 0), 0) / totalFields;
  const completeness = mappedFields / totalFields;
  return Math.round((completeness * 0.5 + avgConfidence * 0.5) * 100);
}
```

### 6C: Fix "% confidence" Literal Text

Find where "% confidence" is rendered as a string instead of a formatted number. Replace with:
```typescript
// WRONG: `${confidence} confidence` where confidence = "%"
// RIGHT: `${Math.round(confidence * 100)}% confidence` where confidence = 0.85
```

### 6D: Fix Matched Component Confidence Display

The "Matched Component: mortgage_origination_bonus, % confidence" from CLT-102 F-47. Find this render and fix it to show the actual numeric confidence.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-107 Phase 6: Confidence scores — computed not hardcoded" && git push origin dev`

---

# ═══════════════════════════════════════════════════
# PHASE 7: ERRONEOUS PERIOD CLEANUP
# ═══════════════════════════════════════════════════

### 7A: Delete Hire-Date Periods from Caribe

```sql
-- Delete the 22 erroneous periods created from HireDate
-- These span February 2015 to May 2023 — clearly not performance periods
DELETE FROM periods
WHERE tenant_id = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251'
AND start_date < '2024-01-01';
-- Verify
SELECT COUNT(*) FROM periods WHERE tenant_id = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';
```

### 7B: Reactivate Archived Plans (if needed for demo)

OB-106 found 14 rule_set records with only Mortgage active. The 4 plan designs should all be active:

```sql
-- Check current state
SELECT id, name, status FROM rule_sets
WHERE tenant_id = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251'
ORDER BY name, created_at DESC;

-- Activate latest version of each plan (if safe)
-- Be careful: only activate the LATEST version of each distinct plan name
-- Leave duplicates/older versions archived
```

**Only execute this if it's safe.** If there are multiple versions of the same plan, activate only the most recent. Document what was changed.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-107 Phase 7: Caribe data cleanup — erroneous periods + plan reactivation" && git push origin dev`

---

# ═══════════════════════════════════════════════════
# PHASE 8: INTEGRATION VERIFICATION
# ═══════════════════════════════════════════════════

### 8A: Óptica Regression Check

Re-run Óptica calculation. Verify:
- Total payout unchanged (~MX$1,296,515 from OB-106)
- All 6 components still producing results
- Pipeline Proof Co still MX$1,253,832

```bash
cat <<'SQL'
-- Óptica latest calculation
SELECT SUM(total_payout) FROM calculation_results
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND batch_id = (SELECT id FROM calculation_batches 
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f' 
  ORDER BY created_at DESC LIMIT 1);

-- Pipeline Proof Co
SELECT SUM(total_payout) FROM calculation_results
WHERE tenant_id = 'dfc1041e-7c39-4657-81e5-40b1cea5680c'
AND batch_id = (SELECT id FROM calculation_batches 
  WHERE tenant_id = 'dfc1041e-7c39-4657-81e5-40b1cea5680c' 
  ORDER BY created_at DESC LIMIT 1);
SQL
```

**If either total changed: STOP. REVERT. The import pipeline change broke the calculation path.**

### 8B: Fresh Caribe Import Test

After Phase 7 cleanup, test a fresh single-file import for Caribe:

1. Navigate to Caribe Financial → Import Data
2. Upload one CSV file (e.g., CFG_Loan_Disbursements_Jan2024.csv or a test CSV)
3. Verify:
   - Sheet Analysis shows correct classification (transaction data, not roster)
   - Field mapping shows actual confidence scores (not 50%)
   - If prior signals exist, AI suggestions should be better than first attempt
   - Validation does NOT warn about "Quarterly Mortgage Origination Volume" (wrong plan metric)
   - Period detection creates only transaction-relevant periods
   - On commit, row_data contains ALL columns from the source file

### 8C: Roster Import Test (if time allows)

Upload the Personnel roster again:
1. Verify: classified as "Personnel Data"
2. Verify: NO periods created from HireDate
3. Verify: validation does NOT require plan-specific metrics
4. Verify: ALL columns preserved in committed_data

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-107 Phase 8: Integration verification — Óptica regression + Caribe fresh import" && git push origin dev`

---

# ═══════════════════════════════════════════════════
# PHASE 9: COMPLETION
# ═══════════════════════════════════════════════════

### 9A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build 2>&1 | tail -20
npm run dev &
sleep 10
curl -s -o /dev/null -w "localhost:3000 status: %{http_code}\n" http://localhost:3000
```

### 9B: PDR Verification

| PDR # | Definition | In Scope | Status | Evidence |
|-------|-----------|----------|--------|----------|
| PDR-01 | Currency ≥ MX$10K no cents | VERIFY | PASS/FAIL | [Any import completion amounts] |
| PDR-04 | N+1 overhead | NOTE | PASS/FAIL | [Request count on import page] |

### 9C: Completion Report

Create `OB-107_COMPLETION_REPORT.md` at project root with:

1. **Phase 0 findings** — file inventory, data flow, root cause locations
2. **Phase 1 decisions** — fix approach per root cause
3. **Phase 2 Carry Everything** — what changed in committed_data writing, before/after
4. **Phase 3 Classification** — where guards were added, what they check
5. **Phase 4 Multi-plan** — how plan context works per-file now
6. **Phase 5 Signal loop** — how signals are read, what's in the AI prompt
7. **Phase 6 Confidence** — what was hardcoded, what's computed now
8. **Phase 7 Cleanup** — periods deleted, plans reactivated
9. **Phase 8 Verification** — Óptica numbers, Pipeline Proof Co numbers, Caribe import test
10. **CLT-102 findings addressed** — map each P0 finding to what was fixed

### 9D: CLT-102 Finding Resolution Map

| CLT-102 Finding | Status | How Addressed |
|----------------|--------|---------------|
| F-10 Period detection on roster HireDate | FIXED | Phase 3: roster classification suppresses period creation |
| F-12 Validation requires plan metrics on roster | FIXED | Phase 3: roster validation different from transaction validation |
| F-17 No multi-plan selection | FIXED | Phase 4: per-file plan association |
| F-21 22 erroneous periods | FIXED | Phase 7: deleted from database |
| F-26 7 files → 1 sheet | INVESTIGATE | Phase 0 should reveal root cause |
| F-29 50% confidence hardcoded | FIXED | Phase 6: computed from actual analysis |
| F-47 "% confidence" literal text | FIXED | Phase 6: numeric display |
| F-51 Target taxonomy too narrow | MITIGATED | Phase 2: unmapped columns preserved (not lost) |
| F-52 Field mapper as gate | FIXED | Phase 2: all columns in committed_data regardless of mapping |
| F-54 Signals not read | FIXED | Phase 5: prior signals in AI prompt |
| ... | ... | ... |

### 9E: Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | Phase 0 committed | Full diagnostic before code |
| PG-02 | Carry Everything | committed_data includes ALL source columns (verify with SQL) |
| PG-03 | Roster no periods | Roster import does NOT create periods from HireDate |
| PG-04 | Roster no plan validation | Roster import does NOT warn about plan-specific metrics |
| PG-05 | Per-file plan routing | Different files can associate with different plans |
| PG-06 | Signals read | AI prompt includes prior classification signals for tenant |
| PG-07 | Confidence computed | No hardcoded 50% or 74% in import pipeline |
| PG-08 | "% confidence" fixed | Shows numeric value, not literal text |
| PG-09 | Erroneous periods deleted | Caribe has 0 pre-2024 periods |
| PG-10 | Óptica unchanged | ~MX$1,296,515 (±1%) |
| PG-11 | Pipeline Proof Co intact | MX$1,253,832 exactly |
| PG-12 | Fresh Caribe import works | Single CSV imports with correct classification + mapping |
| PG-13 | No hardcoded field names | Korean Test passes |
| PG-14 | Supabase .in() ≤ 200 | All batch queries verified |
| PG-15 | `npm run build` exits 0 | Clean build |
| PG-16 | localhost:3000 responds | HTTP 200 |

### 9F: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-107: Import Pipeline Architecture Fix — Classification, Multi-Plan, Enrichment" \
  --body "## Three Systemic Root Causes Fixed

### 1. Classification Propagation
File type (roster vs transaction) now influences validation, period detection, and plan association.
Roster files no longer create periods from HireDate or require plan-specific metrics.

### 2. Multi-Plan Routing
Plan association is per-file, not per-batch. AI suggests plan based on file content.
User can override. Roster files have no plan association.

### 3. Field Mapper as Enrichment Layer
ALL columns preserved in committed_data regardless of mapping status.
Unmapped columns show 'Will be preserved' instead of 'Unresolved'.
Target taxonomy extended. Korean Test passes.

### Also Fixed
- Classification signals read into AI prompt for subsequent imports
- Confidence scores computed, not hardcoded
- 22 erroneous hire-date periods deleted from Caribe

### Regression Check
- Óptica: MX\$_____ (unchanged from OB-106)
- Pipeline Proof Co: MX\$1,253,832 (zero tolerance)

### CLT-102 Findings Addressed: [count]/22 P0s

## Proof Gates: 16 — see OB-107_COMPLETION_REPORT.md"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-107 Complete: Import pipeline architecture fix" && git push origin dev`

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Rewrite the entire import page | Surgical changes to specific functions. The page structure works. |
| AP-2 | Break Óptica's import path | Single-XLSX path is the EXISTING code. Multi-file is NEW code alongside it. |
| AP-3 | Create new tables | Use existing schema. committed_data, classification_signals, periods all exist. |
| AP-4 | Build new UI components | Fix data flow. Minimal UI changes (badge labels, confidence display). |
| AP-5 | Skip Phase 0 | The diagnostic is what makes this OB succeed. Previous OBs that skipped it failed. |
| AP-6 | Touch the calculation engine | run-calculation.ts is OUT OF SCOPE. It works. |
| AP-7 | Touch auth files | NEVER. |
| AP-8 | Fabricate test results | Report actual SQL output. If something doesn't work, document it. |

---

## EXECUTION ORDER — NON-NEGOTIABLE

```
Phase 0: Diagnostic (read every file)              → commit
Phase 1: Architecture decision                      → commit
Phase 2: Carry Everything (committed_data fix)      → commit
Phase 3: Classification propagation (guards)        → commit
Phase 4: Multi-plan routing (per-file)              → commit
Phase 5: Signal loop closure (read into prompt)     → commit
Phase 6: Confidence score fix                       → commit
Phase 7: Caribe data cleanup                        → commit
Phase 8: Integration verification                   → commit
           ↓
    IF Óptica or Pipeline Proof Co changed: STOP. REVERT.
           ↓
Phase 9: Completion + PR                            → commit
```

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*OB-107: "The engine is proven. The import pipeline is the critical path. Fix the front door."*
*"Carry everything. Classify correctly. Route per file. Close the loop."*
