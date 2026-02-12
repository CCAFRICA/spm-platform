# OB-30 STEP 3: Pre-Fix Reconciliation Baseline

## Status

| Step | Description | Status |
|------|-------------|--------|
| 1 | Fix calculation result persistence | ✅ DONE (commit 0b7f168) |
| 2 | Build reconciliation script | ✅ DONE (commit 00bc056) |
| 3 | Run pre-fix reconciliation | ⏳ IN PROGRESS |
| 4 | Fix variant selection | ⏳ PENDING |
| 5 | Run post-fix reconciliation | ⏳ PENDING |
| 6 | Document warranty data gap | ⏳ PENDING |
| 7 | Module-aware tenant routing | ⏳ PENDING |

## Instructions for STEP 3

### 1. Run Fresh Calculation

```bash
# Dev server is already running at localhost:3000
```

1. Open browser at `http://localhost:3000/operate/calculate`
2. Select period: **2025-01** (or current period)
3. Click **Calculate**
4. Wait for completion

### 2. Run Reconciliation Script

Open browser DevTools (F12) and paste this in Console:

```javascript
// Paste contents of: scripts/reconcile-browser.js
```

Or copy from:
```
/Users/AndrewAfrica/spm-platform/web/scripts/reconcile-browser.js
```

### 3. Expected Output

The script will output:
- **Total calculated vs Ground Truth** ($1,263,831 vs $1,253,832)
- **Variant selection issues** (employees with wrong variant)
- **By component breakdown**

### 4. Save Results

After running the browser script, run in console:
```javascript
copy(JSON.stringify(localStorage))
```

Then save to:
```
/Users/AndrewAfrica/spm-platform/web/scripts/localStorage-export.json
```

### 5. Generate Full Report

```bash
cd /Users/AndrewAfrica/spm-platform/web
npx tsx scripts/reconcile.ts --pre-fix
```

This creates: `CLT-16_PRE_FIX_RECONCILIATION.md`

---

## What to Look For

### HF-020 Variant Selection Bug

Look for employees where:
- **Role** contains "NO CERTIFICADO"
- **Calculated variant** = "certified" (WRONG)
- **Expected variant** = "non-certified" (CORRECT)

Example from previous investigation:
- Employee 90198149: "OPTOMETRISTA NO CERTIFICADO"
- Was getting "Certified" variant
- Should get "Non-Certified" variant

### Root Cause Candidates

Based on code analysis, the bug is likely in ONE of these:

1. **Aggregated data role field is empty/wrong**
   - Check: `targetEmp.role` in diagnostic output
   - If empty: Bug is in data aggregation

2. **PRIORITY 2 code path bypassing deriveIsCertified()**
   - The `buildEmployeeMetrics()` function uses `employee.isCertified` directly
   - If EmployeeContext.isCertified is wrong, variant selection fails

3. **Calculation context has stale employee data**
   - Old localStorage data might have incorrect isCertified

### Key Variables to Check

From browser diagnostic:
```javascript
// The actual role string for employee 90198149
targetEmp.role  // Should be "OPTOMETRISTA NO CERTIFICADO"

// Character codes (to detect encoding issues)
Array.from(targetEmp.role).map(c => c.charCodeAt(0))
// Normal: 79,80,84,79,77,69,84,82,73,83,84,65,32,78,79,32,67,69,82,84,...
// Bug: If 160 (non-breaking space) instead of 32 (space), matching will fail

// The derived isCertified value
// FALSE = correct for "NO CERTIFICADO"
// TRUE = incorrect, root cause of bug
```

### AI Import Context Check

Run this to see what field is mapped to 'role' for the roster sheet:
```javascript
const tenantId = 'vialuce';
const aiContext = JSON.parse(localStorage.getItem(`ai_import_context_${tenantId}`));
const rosterSheet = aiContext.sheets.find(s => s.classification === 'roster');
console.log('Roster sheet:', rosterSheet.sheetName);
console.log('Field mappings:', rosterSheet.fieldMappings);
const roleMapping = rosterSheet.fieldMappings.find(f => f.semanticType === 'role');
console.log('Role mapped to:', roleMapping ? roleMapping.sourceColumn : 'NOT MAPPED');
```

If role is NOT MAPPED or mapped to wrong column, employees may have empty/incorrect role strings.

---

## After STEP 3

Once you have the reconciliation data:

1. **Variant issues list** → Confirms which employees are affected
2. **Role field values** → Confirms if data is correct
3. **isCertified derivation** → Confirms if logic is working

This data-driven approach will identify the EXACT fix needed (STEP 4).
