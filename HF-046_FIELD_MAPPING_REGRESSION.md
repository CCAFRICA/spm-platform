# HF-046: FIX AI FIELD MAPPING REGRESSION — ENHANCED IMPORT

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## WHY THIS HOTFIX EXISTS

CLT-64 browser testing: Enhanced Import Sheet Analysis (Step 2) shows full AI intelligence — narrative, 7 sheets detected, entity roster identified, 6 relationships, component-to-plan mapping. But when the user clicks "Next" to Field Mapping (Step 3), ALL fields show as **"Unresolved"** with empty dropdowns. Zero AI mappings carry forward.

**This is a regression.** CLT-63 confirmed the same Enhanced Import path showed AI field mappings with 70-100% confidence scores, three-tier color coding (green/yellow/orange), and semantic understanding (num_empleado → Entity ID, Mes → Month, Año → Year, Cumplimiento → Achievement %).

**The AI intelligence exists** — it runs during Sheet Analysis. The results are NOT being handed off to the Field Mapping component.

**Console errors observed:**
- `GET profiles → 400` 
- `[DataService] Entity resolution failed: TypeError: NetworkError when attempting to fetch resource`

**50% confidence is hardcoded** — the Sheet Analysis page shows "50% confidence" as a placeholder instead of the real AI confidence score. This is a separate known issue but should be fixed in this HF if encountered.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Final step: `gh pr create --base main --head dev`
4. **SUPABASE MIGRATIONS: Must execute live via `supabase db push` or SQL Editor AND verify with DB query. File existence ≠ applied.**

---

## PHASE 0: DIAGNOSTIC — TRACE THE DATA FLOW

The AI analysis runs in Step 2 (Sheet Analysis). The results must flow to Step 3 (Field Mapping). Find exactly where the handoff breaks.

```bash
echo "============================================"
echo "HF-046 PHASE 0: FIELD MAPPING REGRESSION"
echo "============================================"

echo ""
echo "=== 0A: ENHANCED IMPORT PAGE — STATE MANAGEMENT ==="
# How does state flow between steps?
grep -n "useState\|useReducer\|useContext\|setStep\|currentStep\|activeStep\|step.*=" web/src/app/data/import/enhanced/page.tsx | head -30
grep -n "useState\|useReducer\|useContext\|setStep\|currentStep\|activeStep\|step.*=" web/src/app/operate/import/enhanced/page.tsx 2>/dev/null | head -30

echo ""
echo "=== 0B: WHERE AI ANALYSIS RESULTS ARE STORED ==="
# What variable/state holds the AI field mapping results?
grep -n "fieldMapping\|aiMapping\|mappedFields\|aiContext\|analysisResult\|importContext\|sheetAnalysis\|confidence" web/src/app/data/import/enhanced/page.tsx | head -30
grep -n "fieldMapping\|aiMapping\|mappedFields\|aiContext\|analysisResult\|importContext\|sheetAnalysis\|confidence" web/src/app/operate/import/enhanced/page.tsx 2>/dev/null | head -30

echo ""
echo "=== 0C: STEP TRANSITION — WHAT HAPPENS ON 'NEXT' FROM STEP 2 ==="
# Find the handler for moving from Sheet Analysis to Field Mapping
grep -n "handleNext\|goToStep\|nextStep\|onNext\|step.*3\|FIELD_MAPPING\|setActiveStep" web/src/app/data/import/enhanced/page.tsx | head -20

echo ""
echo "=== 0D: FIELD MAPPING COMPONENT — WHERE DOES IT READ MAPPINGS? ==="
# Find the field mapping rendering logic
grep -n "Unresolved\|unresolved\|Select Field\|fieldMapping\|mapping.*prop\|mappedField" web/src/app/data/import/enhanced/page.tsx | head -20

echo ""
echo "=== 0E: AI INTERPRETATION SERVICE — WHAT DOES IT RETURN? ==="
grep -rn "analyzeSheet\|interpretSheet\|classifyFields\|mapFields\|fieldConfidence\|aiFieldMapping" web/src/lib/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== 0F: RECENT CHANGES TO ENHANCED IMPORT ==="
# Check git log for recent changes to this file
cd web
git log --oneline -10 -- src/app/data/import/enhanced/page.tsx src/app/operate/import/enhanced/page.tsx 2>/dev/null
cd ..

echo ""
echo "=== 0G: HF-045 CHANGES TO ENHANCED IMPORT ==="
# Did HF-045 modify the field mapping flow?
cd web
git diff HEAD~3..HEAD -- src/app/data/import/enhanced/page.tsx src/app/operate/import/enhanced/page.tsx 2>/dev/null | head -100
cd ..

echo ""
echo "=== 0H: CHECK IF AI CONTEXT IS STORED IN STATE ==="
# Look for the specific state variable that holds AI analysis
grep -n "aiImportContext\|setAiImportContext\|importAnalysis\|setImportAnalysis\|aiContext\|setAiContext" web/src/app/data/import/enhanced/page.tsx web/src/app/operate/import/enhanced/page.tsx 2>/dev/null | head -20

echo ""
echo "=== 0I: CHECK HOW FIELD MAPPING STEP INITIALIZES ==="
# When step 3 renders, where does it look for pre-populated mappings?
grep -B5 -A10 "Unresolved\|unresolved\|unmapped" web/src/app/data/import/enhanced/page.tsx | head -60

echo ""
echo "=== 0J: 50% CONFIDENCE HARDCODE ==="
# Find and document the hardcoded 50% confidence
grep -n "50%\|0\.5\|50.*confidence\|confidence.*50\|hardcode\|placeholder.*confidence" web/src/app/data/import/enhanced/page.tsx web/src/app/operate/import/enhanced/page.tsx 2>/dev/null | head -10
```

**Document findings:**
1. What state variable holds the AI field mapping results from Step 2?
2. Is that state being read by Step 3's rendering logic?
3. Did HF-045 accidentally break the handoff?
4. Is the AI interpretation service returning results but they're not being stored?
5. Where is the 50% confidence hardcoded?

**Commit:** `HF-046 Phase 0: Field mapping regression diagnostic`

---

## PHASE 1: FIX THE STATE HANDOFF

Based on Phase 0 findings, fix the handoff so AI field mappings from Sheet Analysis appear pre-populated in Field Mapping.

**Expected behavior after fix:**
- Sheet Analysis runs AI interpretation → stores field mappings with confidence scores
- User clicks "Next" → Field Mapping step renders
- Each field shows the AI-suggested mapping (e.g., "num_empleado → Entity ID") with confidence badge
- Fields with >85% confidence: auto-confirmed (green)
- Fields with 60-85%: "Review" badge (yellow) — user can confirm or change
- Fields with <60%: "Unresolved" (red) — user must select manually
- Three-tier system matches what CLT-63 observed working

**Common causes of this regression:**
1. State variable renamed or restructured in HF-045
2. AI analysis results stored in a different format than Field Mapping expects
3. Step transition resets the state
4. Component re-renders and loses context
5. AI analysis function call removed or bypassed during refactor

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1 | AI field mappings appear on Field Mapping step | Visual verification on localhost | Fields show mapped values with confidence |
| PG-2 | num_empleado maps to Entity ID | Field Mapping step | Green or yellow badge, not "Unresolved" |
| PG-3 | Mes maps to Month/Period | Field Mapping step | Confidence badge visible |
| PG-4 | Año maps to Year/Period | Field Mapping step | Confidence badge visible |
| PG-5 | Three-tier confidence display works | Field Mapping step | Green (>85%), Yellow (60-85%), Red (<60%) |

**Commit:** `HF-046 Phase 1: Fix AI field mapping state handoff`

---

## PHASE 2: FIX 50% CONFIDENCE HARDCODE

Find and replace the hardcoded "50% confidence" on the Sheet Analysis page with the actual AI confidence score from the analysis results.

The AI analysis already calculates confidence (the narrative mentions accuracy, the component mapping shows confidence in the GPV wizard at 90-95%). The Sheet Analysis page just isn't reading it.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-6 | No hardcoded "50%" in Sheet Analysis | grep for "50%" in file | Zero matches for hardcoded confidence |
| PG-7 | Real confidence score displayed | Visual verification | Score reflects AI analysis (expect 70-95%) |

**Commit:** `HF-046 Phase 2: Replace hardcoded 50% confidence with real AI score`

---

## PHASE 3: FIX CONSOLE ERRORS

Two console errors observed:
1. `GET profiles → 400` — Profile query failing, likely missing parameter or wrong query
2. `[DataService] Entity resolution failed: TypeError: NetworkError` — Network call failing during import

Investigate and fix both. These may be related to the field mapping regression or may be independent issues.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-8 | Zero 400 errors on profiles query | Console check on localhost | No red errors on page load |
| PG-9 | Zero NetworkError on entity resolution | Console check during import flow | No TypeError |

**Commit:** `HF-046 Phase 3: Fix console errors on Enhanced Import`

---

## PHASE 4: END-TO-END VERIFICATION ON LOCALHOST

Test the complete Enhanced Import flow on localhost:

1. Navigate to /operate/import/enhanced (or /data/import/enhanced)
2. Upload the RetailCDMX Excel file
3. **Sheet Analysis:** Verify 7 sheets, entity roster, relationships, REAL confidence score (not 50%)
4. Click Next → **Field Mapping:** Verify AI pre-populated mappings with confidence badges
5. Navigate through all 7 sheets — each should show mapped fields
6. Click Next → **Validate & Preview:** Verify quality score, period detection
7. Click Next → **Approve Import:** Verify approval page loads

**DO NOT click "Approve & Import" on localhost** — that would write to production Supabase. Just verify the UI flow is correct through Step 4.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-10 | Sheet Analysis shows real confidence | Visual on localhost | Not "50%" |
| PG-11 | Field Mapping shows AI mappings | Visual on localhost | At least 4 fields auto-mapped per sheet |
| PG-12 | Confidence badges render correctly | Visual on localhost | Color-coded green/yellow/red |
| PG-13 | All 7 sheets navigable with mappings | Click through sheets | Each sheet has pre-populated mappings |
| PG-14 | Zero console errors through entire flow | Console tab | No red errors |

**Commit:** `HF-046 Phase 4: End-to-end Enhanced Import verification`

---

## PHASE 5: BUILD + COMPLETION REPORT + PR

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-15 | TypeScript: zero errors | exit code 0 | |
| PG-16 | Build: clean | exit code 0 | |

### Completion report

Create `HF-046_COMPLETION_REPORT.md` at PROJECT ROOT with:
- Root cause of the regression (what broke the handoff)
- State flow diagram: AI Analysis → State Variable → Field Mapping Component
- Before/After for the 50% confidence fix
- All 16 proof gates with evidence
- Screenshots or console output showing working field mappings on localhost

### Create PR

```bash
gh pr create --base main --head dev \
  --title "HF-046: Fix AI Field Mapping Regression — Enhanced Import" \
  --body "## Root Cause
AI field mapping results from Sheet Analysis (Step 2) not carrying forward to
Field Mapping (Step 3). All fields show as 'Unresolved' despite AI intelligence
running successfully during analysis.

## Fix
- Fixed state handoff between Sheet Analysis and Field Mapping steps
- Replaced hardcoded 50% confidence with real AI confidence score
- Fixed profiles 400 error and NetworkError on entity resolution
- Verified end-to-end: 7 sheets with AI-populated field mappings

## Proof Gates: 16 — see HF-046_COMPLETION_REPORT.md"
```

**Commit:** `HF-046 Phase 5: Build verification, completion report, PR`

---

## CONTEXT FOR DIAGNOSIS

The Enhanced Import page is a multi-step wizard. The steps are:
1. Upload Package — user drops Excel file
2. Sheet Analysis — AI analyzes sheets, detects entities, relationships, components
3. Field Mapping — AI suggests column-to-field mappings with confidence scores
4. Validate & Preview — quality score, period detection, calculation preview
5. Approve Import — approval workflow, commit to database

The regression is between steps 2 and 3. The AI intelligence is present (Step 2 proves it) but not flowing to the mapping UI (Step 3 shows "Unresolved").

**CLT-63 confirmed this worked** — the same file on the same page showed AI mappings with confidence scores. Something changed between then and now. Check HF-045 changes to the enhanced import page as the most likely cause.

**The file being tested:** RetailCDMX Excel workbook with 7 sheets:
- Datos Colaborador (entity roster: num_empleado, No_Tienda, Puesto)
- Base_Venta_Individual (individual sales: 12 columns, 2618 rows)
- Base_Venta_Tienda (store sales: 4 columns, 12446 rows)
- Base_Clientes_Nuevos (new customers: 4 columns, 5346 rows)
- Base_Cobranza (collections: 5 columns, 5371 rows)
- Base_Club_Proteccion (club protection: 6 columns, 56237 rows)
- Base_Garantia_Extendida (extended warranty: 3 columns, 34952 rows)

---

*HF-046 — February 19, 2026*
*"The AI knows the answer. The UI just isn't listening."*
