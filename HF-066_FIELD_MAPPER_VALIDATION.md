# HF-066: FIELD MAPPER VALIDATION FIX + IMPORT PIPELINE CORRECTIONS
## The dropdown onChange doesn't update validation state. Fix the disconnection.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute all tasks sequentially. Commit after each task. Push after each commit.**

---

## READ FIRST — MANDATORY

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply (VERSION 3.0, Section E)
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `AUTH_FLOW_REFERENCE.md` — DO NOT MODIFY ANY AUTH FILE

**Rules 26-32 (Section E) in effect. Max 5 tasks. Every task = file change + commit.**

---

## WHY THIS HF EXISTS

CLT-105 browser testing revealed the **#1 pipeline blocker**: the field mapper's Next button stays disabled even after the user manually maps all fields. The root cause is confirmed via browser console:

**The UI dropdown and the internal validation state are disconnected.**

When the AI classifies a field as Tier 3 (unresolved), the user can select a target from the dropdown — but the `onChange` handler only updates the visual state, NOT the tier/validation state. The `canProceed` gate checks the tier classification, sees 2 fields still in Tier 3, and blocks Next.

Console evidence:
```
[Smart Import] Three-tier summary (AFTER second pass):
  Tier 1 (auto): 3 fields
  Tier 2 (suggested): 6 fields
  Tier 3 (unresolved): 2 fields    ← BranchName, ProductLicenses
```

User maps both in UI → dropdown shows "Branch Name" and "Product Licenses" → Next still disabled.

**Additional items in this HF:**
- Financial module card not rendering on dual-module tenant (F29)
- Financial sidebar Analysis section showing 0 items (F31)

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **DO NOT MODIFY ANY FILE IN THE AUTH CHAIN.**
6. **Supabase .in() ≤ 200 items.**

---

## TASK 1: DIAGNOSE FIELD MAPPER VALIDATION DISCONNECTION

```bash
echo "============================================"
echo "HF-066 TASK 1: FIELD MAPPER DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 1A: FIND THE FIELD MAPPING COMPONENT ==="
echo "--- Enhanced import page ---"
cat web/src/app/operate/import/enhanced/page.tsx 2>/dev/null || echo "Not at this path"
find web/src -path "*import*enhanced*" -name "*.tsx" 2>/dev/null | grep -v node_modules | grep -v .next

echo ""
echo "=== 1B: FIND THE FIELD MAPPING STATE ==="
echo "--- Where is fieldMappings state defined? ---"
grep -rn "fieldMappings\|setFieldMappings\|FieldMapping\|MappingState" web/src/app/operate/import/ web/src/components/import/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -25

echo ""
echo "=== 1C: FIND THE onChange HANDLER FOR DROPDOWN ==="
echo "--- What happens when user changes a field mapping dropdown? ---"
grep -rn "onChange\|handleMapping\|handleFieldChange\|updateMapping\|setMapping" web/src/app/operate/import/ web/src/components/import/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -25

echo ""
echo "=== 1D: FIND THE canProceed / NEXT BUTTON VALIDATION ==="
echo "--- What gates the Next button? ---"
grep -rn "canProceed\|canAdvance\|isValid\|allMapped\|disabled.*Next\|Next.*disabled\|unresolved\|tier.*3\|Tier.*3" web/src/app/operate/import/ web/src/components/import/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -25

echo ""
echo "=== 1E: FIND THE TIER CLASSIFICATION LOGIC ==="
echo "--- Where are fields classified into tiers? ---"
grep -rn "tier\|Tier\|auto.*confirm\|suggested\|unresolved\|confirmed\|status.*resolved\|status.*confirmed" web/src/app/operate/import/ web/src/components/import/ web/src/lib/import-pipeline/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -30

echo ""
echo "=== 1F: FULL FIELD MAPPING COMPONENT ==="
echo "--- Dump the actual component that renders field mapping rows ---"
for f in $(grep -rl "canProceed\|fieldMappings\|FieldMapping" web/src/app/operate/import/ web/src/components/import/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -5); do
  echo "--- FILE: $f ---"
  cat "$f"
  echo ""
done

echo ""
echo "============================================"
echo "DIAGNOSTIC COMPLETE — PASTE ALL OUTPUT"
echo "============================================"
```

Save diagnostic to `HF-066_DIAGNOSTIC.md` at project root.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-066 Task 1: Field mapper validation diagnostic" && git push origin dev`

---

## TASK 2: FIX FIELD MAPPER — DROPDOWN SYNCS WITH VALIDATION STATE

### The Problem (Precise)

The field mapping system has three tiers:
- **Tier 1 (auto-confirmed):** AI confidence ≥ 85% → field is auto-mapped, status = confirmed
- **Tier 2 (suggested):** AI confidence 60-84% or pattern match → field is mapped but needs review
- **Tier 3 (unresolved):** AI confidence < 60% or no match → field is unmapped

The `canProceed` validation checks that **no Tier 3 (unresolved) fields remain** — OR some variant that blocks when unresolved fields exist.

When the user manually selects a target field from the dropdown for a Tier 3 field, the dropdown updates visually BUT the field's tier/status stays as "unresolved" in the internal state. The validation gate still sees it as unresolved and blocks Next.

### The Fix

Find the `onChange` handler for the field mapping dropdown. When the user selects a target field:

```typescript
// CURRENT (broken): Only updates the visual mapping
const handleFieldChange = (sourceColumn: string, targetField: string) => {
  setFieldMappings(prev => prev.map(m => 
    m.sourceColumn === sourceColumn 
      ? { ...m, targetField } 
      : m
  ));
};

// FIXED: Also updates the tier/status to confirmed
const handleFieldChange = (sourceColumn: string, targetField: string) => {
  setFieldMappings(prev => prev.map(m => 
    m.sourceColumn === sourceColumn 
      ? { 
          ...m, 
          targetField,
          status: targetField ? 'confirmed' : 'unresolved',  // KEY FIX
          tier: targetField ? 1 : 3,                           // KEY FIX
          confidence: targetField ? Math.max(m.confidence, 100) : m.confidence,
          source: 'user'                                        // Mark as user-confirmed
        } 
      : m
  ));
};
```

The exact field names (`status`, `tier`, `confidence`, `source`) depend on the actual interface. Adapt to match.

### Also Fix: canProceed Should Check Mapping, Not Tier

Even after fixing onChange, harden the validation:

```typescript
// WRONG: Check tier classification
const canProceed = fieldMappings.every(m => m.tier !== 3);

// ALSO WRONG: Require ALL fields mapped
const canProceed = fieldMappings.every(m => m.targetField !== null);

// CORRECT: Only REQUIRED fields must be mapped. Others can be unresolved.
const canProceed = requiredFields.every(rf => 
  fieldMappings.some(m => m.targetField === rf && m.sourceColumn)
) && fieldMappings.filter(m => m.targetField).length > 0;

// OR SIMPLEST CORRECT: Any field that HAS a dropdown selection counts as mapped
const unmappedRequired = fieldMappings.filter(m => 
  m.required && (!m.targetField || m.targetField === '')
);
const canProceed = unmappedRequired.length === 0;
```

### Also Fix: "Review" Confirmation

Fields with "Review" badges (Tier 2) that the user clicks to confirm should also update to confirmed status. If there's a separate "confirm" button or click handler for Review items, ensure it sets `status: 'confirmed'`.

### Proof Gates — Task 2

```
PG-01: User maps BranchName to "Branch Name" from dropdown → field status changes from unresolved to confirmed
PG-02: User maps ProductLicenses to "Product Licenses" → field status changes from unresolved to confirmed
PG-03: After mapping all fields (including former Tier 3), Next button is ENABLED
PG-04: Clicking Next proceeds to next import step (Validate & Preview)
PG-05: Fields left as "— Select Field —" (truly unmapped, non-required) do NOT block Next
PG-06: npm run build exits 0
```

**PG-03 and PG-04 are ACCEPTANCE GATES. If Next is still disabled after manual mapping, this task failed.**

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-066 Task 2: Field mapper — dropdown onChange syncs with validation state" && git push origin dev`

---

## TASK 3: FIX FINANCIAL MODULE DETECTION ON OPERATE LANDING (F29)

OB-105 delivered the Bloodwork Operate landing with conditional module cards. But Sabor Grupo — which has 46,700 POS records and shows a FIN badge in Recent Activity — only renders the ICM card. The Financial card is missing.

### 3A: Diagnose Financial Detection

```bash
echo "============================================"
echo "TASK 3: FINANCIAL MODULE DETECTION"
echo "============================================"

echo ""
echo "=== 3A: HOW DOES OPERATE PAGE DETECT FINANCIAL MODULE? ==="
grep -n "financial\|Financial\|hasFinancial\|financialData\|posData\|pos_data" web/src/app/operate/page.tsx | head -20

echo ""
echo "=== 3B: WHAT DATA DOES SABOR GRUPO HAVE? ==="
echo "Run in Supabase SQL Editor:"
echo ""
echo "-- Check for Financial module indicators"
echo "SELECT "
echo "  (SELECT count(*) FROM committed_data WHERE tenant_id = t.id) as committed_rows,"
echo "  (SELECT count(DISTINCT committed_data->>'location' ) FROM committed_data WHERE tenant_id = t.id) as locations,"
echo "  (SELECT count(*) FROM import_batches WHERE tenant_id = t.id) as import_batches,"
echo "  t.settings->>'modules' as module_settings"
echo "FROM tenants t WHERE t.name ILIKE '%sabor%';"

echo ""
echo "=== 3C: WHAT DOES SESSION CONTEXT PROVIDE FOR FINANCIAL? ==="
grep -n "financial\|Financial\|posData\|pos_data\|committedData\|committed_data\|hasFinancial" web/src/contexts/session-context.tsx | head -15

echo ""
echo "=== 3D: WHAT IS computeFinancialHealth CHECKING? ==="
grep -A 20 "computeFinancialHealth\|financialHealth\|Financial.*Health" web/src/app/operate/page.tsx | head -30
```

### 3B: Fix Financial Detection

The Financial module detection is likely checking for data that SessionContext doesn't provide. Common patterns:

**If checking SessionContext for a `hasFinancial` flag that doesn't exist:**
```typescript
// Add to the operate page's data loading
const { data: financialData } = await supabase
  .from('committed_data')
  .select('id', { count: 'exact', head: true })
  .eq('tenant_id', tenantId)
  .or('source_type.eq.pos,source_type.eq.financial,classification.eq.financial');
  
const hasFinancial = (financialData?.count ?? 0) > 0;
```

**If checking `import_batches` for financial imports:**
```typescript
const { data: finImports } = await supabase
  .from('import_batches')
  .select('id', { count: 'exact', head: true })
  .eq('tenant_id', tenantId)
  .or('type.eq.pos,type.eq.financial,source_file.ilike.%pos%');

const hasFinancial = (finImports?.count ?? 0) > 0;
```

**If checking tenant settings:**
```typescript
const modules = tenant?.settings?.modules as string[] | undefined;
const hasFinancial = modules?.includes('financial') ?? false;
```

The detection must find ONE of:
- POS data in `committed_data` (Sabor has 46,700 records)
- Financial import batches
- `financial` in tenant `settings.modules`
- Any of the financial page routes having data

Whichever method OB-105 used — trace it, find why it returns false for Sabor, and fix it.

### 3C: Financial Stats

Once detected, the Financial card needs real stats. Query:

```typescript
// For the Financial module card stats
const { data: finStats } = await supabase
  .from('committed_data')
  .select('committed_data')
  .eq('tenant_id', tenantId)
  .or('source_type.eq.pos,classification.eq.financial')
  .limit(1);

// Or aggregate from the financial views if they exist
const locationCount = /* distinct locations */;
const chequeCount = /* total POS records */;
const revenue = /* sum of revenue field */;
```

### Proof Gates — Task 3

```
PG-07: Sabor Grupo /operate shows BOTH ICM and Financial module cards
PG-08: Financial card shows real stats (locations, cheques/records, revenue)
PG-09: Financial card has health dot (emerald/amber based on data)
PG-10: Financial card action links navigate to /financial routes
PG-11: Pipeline Test Co (no financial data) still shows ICM card only — no empty Financial card
PG-12: npm run build exits 0
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-066 Task 3: Financial module detection — query committed_data for POS records" && git push origin dev`

---

## TASK 4: FIX FINANCIAL SIDEBAR — ANALYSIS SECTION COUNT (F31)

The Financial sidebar shows "ANALYSIS 0 ›" but the Analysis section has 6 pages (Revenue Timeline, Location Benchmarks, Staff Performance, Operational Patterns, Monthly Summary, Product Mix). The report cards on the Financial landing link to these pages — but the sidebar section shows 0 items.

### 4A: Diagnose

```bash
echo "============================================"
echo "TASK 4: FINANCIAL SIDEBAR DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 4A: SIDEBAR NAVIGATION CONFIG ==="
echo "--- Find where Financial sidebar sections are defined ---"
grep -rn "ANALYSIS\|Analysis\|analysis" web/src/components/sidebar/ web/src/components/navigation/ web/src/components/layout/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -20

echo ""
echo "=== 4B: SIDEBAR ITEM COUNT LOGIC ==="
echo "--- How is the count next to section headers calculated? ---"
grep -rn "count\|length\|children.*length\|items.*length\|\.length" web/src/components/sidebar/ web/src/components/layout/ --include="*.tsx" 2>/dev/null | head -15

echo ""
echo "=== 4C: FINANCIAL ROUTES ==="
echo "--- What routes exist under /financial? ---"
find web/src/app/financial -name "page.tsx" 2>/dev/null | sort

echo ""
echo "=== 4D: SIDEBAR SECTION DEFINITION ==="
echo "--- Full sidebar component ---"
find web/src/components -name "*sidebar*" -o -name "*Sidebar*" -o -name "*side-bar*" | grep -v node_modules | grep -v .next
```

### 4B: Fix

The section count is likely filtering items by some condition that excludes Analysis pages — possibly a module flag, a data-existence check, or a persona filter. The pages exist (the Financial landing links to them and they render), so the sidebar config is wrong.

Fix the sidebar config so Analysis shows its actual children: Revenue Timeline, Staff Performance, Operational Patterns, Monthly Summary, Product Mix. (Location Benchmarks may be the same as Network Pulse.)

Also verify: the "Controls" section should show Leakage Monitor (and any other control pages).

### Proof Gates — Task 4

```
PG-13: Financial sidebar shows "ANALYSIS" with correct item count (5-6)
PG-14: Clicking Analysis expands to show child pages
PG-15: Each Analysis child page navigates correctly
PG-16: npm run build exits 0
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-066 Task 4: Financial sidebar — Analysis section items visible" && git push origin dev`

---

## TASK 5: BUILD + COMPLETION + PR

### 5A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -30
# MUST exit 0
```

### 5B: Completion Report

Create `HF-066_COMPLETION_REPORT.md` at project root:

1. Task 1: Diagnostic — field mapper validation disconnection confirmed
2. Task 2: Field mapper fix — dropdown onChange syncs with validation, Next button unblocked
3. Task 3: Financial module detection — query committed_data for POS records, dual-module card rendering
4. Task 4: Financial sidebar — Analysis section items visible
5. All proof gates PG-01 through PG-16 with PASS/FAIL

**RULE 31:** If any task NOT executed, report "Task X: NOT EXECUTED — [reason]".

### 5C: PR (COMPOUND COMMAND — Rule 3)

```bash
cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-066 Complete: Field mapper validation + Financial detection + sidebar" && git push origin dev && gh pr create --base main --head dev --title "HF-066: Field Mapper Validation Fix + Financial Module Detection + Sidebar" --body "## The #1 Pipeline Blocker — Fixed

### Root Cause (confirmed via browser console)
Field mapper dropdown onChange updates visual state but NOT the internal tier/validation state. User maps BranchName to 'Branch Name' → dropdown shows the selection → internal state still says 'Tier 3 unresolved' → canProceed stays false → Next disabled.

### Task 2: Field Mapper Fix (F28, F33)
- Dropdown onChange now sets status to 'confirmed' when user selects a target
- canProceed checks actual mapping state, not AI tier classification
- User-confirmed mappings override AI tier regardless of confidence
- Non-required unmapped fields do not block Next

### Task 3: Financial Module Detection (F29)
- Operate landing queries committed_data for POS/financial records
- Sabor Grupo (46,700 POS records) now shows Financial module card
- Financial card displays real stats (locations, records, revenue)
- Single-module tenants still show only their module card

### Task 4: Financial Sidebar (F31)
- Analysis section shows correct item count
- All Analysis child pages accessible from sidebar

## Proof Gates: 16
## Acceptance Gates: PG-03 (Next enabled), PG-04 (Next navigates), PG-07 (dual-module cards)"
```

---

## SCOPE BOUNDARIES

### IN SCOPE
- Field mapper dropdown onChange → validation state sync (F28, F33)
- canProceed validation fix — check mapping state not tier
- Financial module detection on Operate landing (F29)
- Financial sidebar Analysis section count (F31)

### OUT OF SCOPE — DO NOT TOUCH
- Auth files (NEVER)
- Plan Import pages (HF-064 handled)
- Operate/Perform page content (OB-105 handled)
- Calculation engine
- N+1 optimization (PDR-04 — separate OB)
- Navigation restructure (F20, F21 — separate OB)
- Module activation workflow (F19 — architecture decision)
- Cross-workspace auth redirect (F16 — separate investigation)

---

## ANTI-PATTERNS

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Dropdown onChange only updates visual state | onChange MUST update both visual AND validation state |
| AP-2 | canProceed checks AI tier instead of actual mapping | Check: does the field have a targetField selected? That's all that matters |
| AP-3 | User action ignored by validation gate | Any user selection = confirmed. Period. AI confidence is a suggestion, not a gate. |
| AP-4 | Financial detection checks flag that doesn't exist | Query actual data in committed_data or import_batches |
| AP-5 | Sidebar section count hardcoded or filtered by wrong condition | Count actual child routes that exist |
| AP-6 | Report validation as fixed without testing Next button | PG-03 and PG-04 are ACCEPTANCE GATES — Next must work in browser |

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*"The AI suggests. The user decides. The platform respects the decision."*
