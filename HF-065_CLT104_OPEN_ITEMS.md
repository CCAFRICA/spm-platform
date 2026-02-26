# HF-065: CLT-104 OPEN ITEMS RESOLUTION
## Import UX, Navigation Fixes, and Field Mapping Improvements

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute all tasks sequentially. Commit after each task. Push after each commit.**

---

## READ FIRST — MANDATORY

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply (VERSION 3.0, Section E execution rules)
2. `AUTH_FLOW_REFERENCE.md` — DO NOT MODIFY ANY AUTH FILE
3. `SCHEMA_REFERENCE.md` — authoritative column reference
4. `DS-005_DATA_INGESTION_FACILITY.md` — data ingestion specification

**Rules 26-32 (Section E) are in effect. Max 5 tasks. Every task = file change + commit. PR in final compound command.**

---

## WHY THIS HF EXISTS

CLT-104 browser testing across Mexican Bank Co (Caribe) and Sabor Grupo revealed 13 findings not addressed by OB-105 (Bloodwork landings) or HF-064 (PDF interpretation). These findings fall into three categories:

1. **Import pipeline blockers** — Field mapper doesn't support hierarchy fields, Next button disabled despite valid mappings, Unresolved fields may be silently dropped, plan header misleading on roster imports
2. **Navigation regressions** — Tenant admin cross-workspace login redirect loop, Financial breadcrumb wrong, submenu collapses on selection
3. **UX debt** — Smart Import vs Standard Import dual paths, three separate import entry points, Configure > Plans is actually Plan Import

This HF addresses the 5 highest-priority items. Remaining items are documented in the DEFERRED section for a future OB.

---

## CLT-104 FINDING INVENTORY

| # | Finding | Severity | Addressed By |
|---|---------|----------|-------------|
| F16 | Tenant admin `/operate` → `/perform` login redirect loop | P0 | **DEFERRED — auth investigation required** |
| F17 | Financial breadcrumb shows wrong path | P1 | **Task 2** |
| F18 | Financial submenu collapses on child selection | P1 | **Task 2** |
| F19 | Empty tenant — no module activation path | P1 | **DEFERRED — architecture decision needed** |
| F20 | Configure > Plans is actually Plan Import | P2 | **DEFERRED — nav restructure OB** |
| F21 | Three separate import entry points | P2 | **DEFERRED — DS-005 unified import OB** |
| F22 | PDF plan interpretation fails | P0 | **HF-064 ✓ MERGED** |
| F23 | XLSX interpretation unreliable | P1 | **HF-064 ✓ MERGED** |
| F24 | Queue shows wrong plan name for file | P1 | **HF-064 ✓ MERGED** |
| F25 | Field mapper only shows semantic model fields — no hierarchy | P1 | **Task 1** |
| F26 | Roster import shows plan-specific header — roster is tenant-level | P1 | **Task 3** |
| F27 | Verify Unresolved fields committed to committed_data (Carry Everything) | P0 | **Task 4** |
| F28 | Next button inactive after all fields mapped including custom fields | P0 | **Task 1** |

**Operate/Perform landings → OB-105 (running separately)**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. **Git commands from repo root (spm-platform), NOT from web/.**
4. **Commit this prompt to git as first action.**
5. **DO NOT MODIFY ANY FILE IN THE AUTH CHAIN.**
6. **Supabase .in() ≤ 200 items.**

---

## TASK 1: FIX FIELD MAPPER — CUSTOM FIELDS + NEXT BUTTON (F25, F28)

The import field mapper has two blockers:

**Problem A (F28):** User creates custom fields (BranchName, Status, ProductLicenses, Email) and maps them. "All critical fields are mapped" shows green. But the Next button remains disabled. Custom fields at 0% AI confidence may be failing a minimum confidence validation gate.

**Problem B (F25):** The field mapping dropdown only shows fields from the semantic model (Entity ID, Entity Name, Role/Position, Store ID, Store Range, Date). There's no built-in option for hierarchy data like Branch Name, Region, or Email. Users must manually create custom fields via "+ Add" to map these columns.

### 1A: Diagnose Next Button

```bash
echo "============================================"
echo "TASK 1: FIELD MAPPER DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 1A: FIELD MAPPING COMPONENT ==="
echo "--- Find the field mapping component ---"
find web/src -name "*field-map*" -o -name "*FieldMap*" -o -name "*field_map*" | grep -v node_modules | grep -v .next

echo ""
echo "--- Find the Next button logic ---"
grep -rn "Next\|canProceed\|isValid\|disabled\|handleNext\|canAdvance\|allMapped" web/src/app/admin/launch/plan-import/ web/src/components/import/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -30

echo ""
echo "--- Find confidence threshold checks ---"
grep -rn "confidence\|threshold\|minimum.*confidence\|isResolved\|unresolved" web/src/app/admin/launch/plan-import/ web/src/components/import/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -20

echo ""
echo "=== 1B: DATA IMPORT (ENHANCED) FIELD MAPPING ==="
echo "--- Enhanced import page ---"
find web/src -path "*enhanced*" -name "*.tsx" | grep -v node_modules | grep -v .next
echo ""
echo "--- Look for field mapping validation in enhanced import ---"
grep -rn "canProceed\|isValid\|disabled\|Next\|allMapped\|required.*field\|critical.*field" web/src/app/operate/import/enhanced/ web/src/app/**/import/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -20

echo ""
echo "=== 1C: CUSTOM FIELD CREATION ==="
echo "--- How are custom fields created? ---"
grep -rn "custom.*field\|addField\|newField\|createField\|Add.*field" web/src/components/import/ web/src/app/operate/import/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -15

echo ""
echo "=== 1D: WHAT VALIDATION BLOCKS NEXT? ==="
echo "--- Find the exact validation function ---"
grep -rn "function.*valid\|const.*valid\|canProceed\|isReady" web/src/app/operate/import/enhanced/ web/src/components/import/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -15
```

### 1B: Fix Next Button Validation

The validation gate must NOT block on:
- Custom fields at 0% confidence (user explicitly created and mapped them)
- "Unresolved" fields (they should be carried as-is per Carry Everything principle)

Fix the validation to only require:
- All fields marked with ★ (Required) are mapped to SOMETHING (including custom fields)
- Entity ID is mapped (this is the true required field for entity resolution)

```typescript
// WRONG: Block if any field has low confidence
const canProceed = mappings.every(m => m.confidence >= 50 || m.status === 'resolved');

// CORRECT: Block only if required fields are unmapped
const canProceed = requiredFields.every(rf => 
  mappings.some(m => m.targetField === rf.id && m.sourceColumn !== null)
);
// Custom fields always count as valid mappings regardless of confidence
// Unresolved fields are allowed — they'll be carried to committed_data
```

### 1C: Expand Default Field Options

The field mapping dropdown should include common hierarchy fields WITHOUT requiring custom field creation:

Add to the semantic field registry (whatever file defines the available target fields):

```typescript
// Standard entity fields (already exist)
{ id: 'entity_id', label: 'Entity ID', required: true },
{ id: 'entity_name', label: 'Entity Name' },
{ id: 'first_name', label: 'First Name' },
{ id: 'last_name', label: 'Last Name' },
{ id: 'role_position', label: 'Role/Position' },

// Hierarchy fields (ADD THESE)
{ id: 'branch_name', label: 'Branch Name' },
{ id: 'branch_id', label: 'Branch ID' },
{ id: 'region', label: 'Region' },
{ id: 'department', label: 'Department' },
{ id: 'location', label: 'Location' },
{ id: 'manager_id', label: 'Manager ID' },
{ id: 'manager_name', label: 'Manager Name' },

// Contact fields (ADD THESE)
{ id: 'email', label: 'Employee Email' },
{ id: 'phone', label: 'Phone Number' },

// Employment fields (ADD THESE)
{ id: 'hire_date', label: 'Hire Date' },
{ id: 'status', label: 'Status' },
{ id: 'product_licenses', label: 'Product Licenses' },

// Store fields (already exist)
{ id: 'store_id', label: 'Store ID' },
{ id: 'store_range', label: 'Store Range' },
```

**IMPORTANT:** These are semantic mapping targets, NOT database columns. All imported data goes to `committed_data` regardless of what it maps to. The mapping tells the entity resolution step what role each column plays. New fields don't require schema changes.

### Proof Gates — Task 1

```
PG-01: Next button is ENABLED after mapping all fields (including custom fields at 0% confidence)
PG-02: "Unresolved" fields do NOT block the Next button
PG-03: Field mapping dropdown includes Branch Name, Region, Email, Hire Date, Status without custom field creation
PG-04: npm run build exits 0
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-065 Task 1: Field mapper — custom field validation + expanded hierarchy fields" && git push origin dev`

---

## TASK 2: FIX FINANCIAL NAVIGATION — BREADCRUMB + SUBMENU (F17, F18)

### 2A: Diagnose Navigation Structure

```bash
echo "============================================"
echo "TASK 2: FINANCIAL NAVIGATION DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 2A: SIDEBAR NAVIGATION CONFIG ==="
echo "--- Find sidebar configuration ---"
grep -rn "sidebar\|navigation\|navItems\|menuItems\|Analysis\|Network\|Timeline" web/src/components/sidebar/ web/src/components/navigation/ web/src/components/layout/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -30

echo ""
echo "=== 2B: BREADCRUMB COMPONENT ==="
echo "--- Find breadcrumb implementation ---"
find web/src -name "*breadcrumb*" -o -name "*Breadcrumb*" | grep -v node_modules | grep -v .next
echo ""
grep -rn "breadcrumb\|Breadcrumb" web/src/components/ web/src/app/financial/ --include="*.tsx" 2>/dev/null | head -15

echo ""
echo "=== 2C: FINANCIAL SIDEBAR SECTIONS ==="
echo "--- What sections exist in Financial sidebar? ---"
grep -rn "Network\|Analysis\|Controls\|Revenue Timeline\|Location Bench\|Staff\|Patterns\|Summary\|Products" web/src/components/ --include="*.tsx" 2>/dev/null | grep -i "label\|title\|section\|group" | head -20

echo ""
echo "=== 2D: SUBMENU EXPAND/COLLAPSE LOGIC ==="
echo "--- How does the sidebar handle active section expansion? ---"
grep -rn "expanded\|collapse\|isOpen\|openSection\|activeSection\|toggle" web/src/components/sidebar/ web/src/components/navigation/ web/src/components/layout/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -20
```

### 2B: Fix Breadcrumb Path (F17)

Revenue Timeline page shows "Financial > Network > Overview" but it's under the Analysis section, not Network. 

The breadcrumb is likely deriving its path from the URL or from a hardcoded mapping that's wrong. Fix the breadcrumb to read from the sidebar navigation config's section hierarchy:

```typescript
// The breadcrumb should derive from the nav config, not from URL segments
// Revenue Timeline is under: Financial > Analysis > Revenue Timeline
// NOT: Financial > Network > Overview
```

Find where the breadcrumb maps routes to labels. Update the mapping for `/financial/timeline`:
- WRONG: `{ path: '/financial/timeline', breadcrumb: ['Financial', 'Network', 'Overview'] }`
- CORRECT: `{ path: '/financial/timeline', breadcrumb: ['Financial', 'Analysis', 'Revenue Timeline'] }`

Or better: derive breadcrumbs dynamically from the sidebar nav config so they can't get out of sync.

### 2C: Fix Submenu Collapse on Selection (F18)

When clicking "Revenue Timeline" under the Analysis section, the Analysis submenu collapses. The active section should stay expanded when any of its children is the current page.

```typescript
// The sidebar should keep a section expanded when:
// 1. The user explicitly expanded it (click on section header)
// 2. The current page (pathname) matches one of the section's children

// Fix: When determining expanded sections, ALWAYS include the section that contains the active page
const activeSection = navSections.find(section => 
  section.children.some(child => pathname.startsWith(child.href))
);

// expandedSections should include activeSection by default
useEffect(() => {
  if (activeSection && !expandedSections.includes(activeSection.id)) {
    setExpandedSections(prev => [...prev, activeSection.id]);
  }
}, [pathname]);
```

### Proof Gates — Task 2

```
PG-05: Revenue Timeline page breadcrumb shows "Financial > Analysis > Revenue Timeline"
PG-06: Clicking Revenue Timeline under Analysis does NOT collapse the Analysis submenu
PG-07: Active page's parent section is always expanded in sidebar
PG-08: npm run build exits 0
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-065 Task 2: Financial navigation — breadcrumb path + submenu persistence" && git push origin dev`

---

## TASK 3: FIX ROSTER IMPORT CONTEXT — PLAN HEADER (F26)

### 3A: Diagnose Import Header

```bash
echo "============================================"
echo "TASK 3: IMPORT CONTEXT DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 3A: IMPORT PAGE HEADER ==="
echo "--- What shows in the import header? ---"
grep -rn "AI-Powered\|plan.*name\|planName\|header.*title\|import.*title" web/src/app/operate/import/ web/src/app/admin/launch/ --include="*.tsx" 2>/dev/null | head -15

echo ""
echo "=== 3B: HOW IS PLAN CONTEXT SET? ==="
echo "--- Does the import inherit a plan context from a prior step? ---"
grep -rn "selectedPlan\|currentPlan\|planContext\|ruleSet.*name\|activePlan" web/src/app/operate/import/ web/src/contexts/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -15

echo ""
echo "=== 3C: WHAT TYPE OF IMPORT IS THIS? ==="
echo "--- Does the import flow know it's a roster vs transaction data? ---"
grep -rn "importType\|dataType\|roster\|personnel\|transaction\|classification" web/src/app/operate/import/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -15
```

### 3B: Fix Import Header

The import page header shows "Mortgage Origination Bonus Plan 2024" when importing a roster file. This is wrong — a roster is tenant-level data, not plan-specific.

**Fix options (choose the one that matches the codebase):**

1. **If the header reads from a "last imported plan" state:** Clear the plan context when starting a new data import. The header should show "Data Package Import — [Tenant Name]" not a specific plan name.

2. **If the import flow has a plan selection step:** Make plan association optional for roster/entity data. Roster data applies to ALL plans — it's the entity master list. Transaction data may be plan-scoped.

3. **If the AI classification identifies this as Personnel/Roster:** The header should update to reflect the detected type: "Personnel Import — [Tenant Name]" rather than a plan name.

```typescript
// After sheet analysis classifies the import:
const importTitle = classifiedType === 'personnel' 
  ? `Personnel Import — ${tenantName}`
  : classifiedType === 'transaction'
    ? `Transaction Import — ${selectedPlan?.name || tenantName}`
    : `Data Import — ${tenantName}`;
```

### Proof Gates — Task 3

```
PG-09: Roster import header does NOT show a specific plan name
PG-10: Roster import header shows "Personnel Import" or "Data Import" with tenant name
PG-11: npm run build exits 0
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-065 Task 3: Import header — roster is tenant-level not plan-scoped" && git push origin dev`

---

## TASK 4: VERIFY CARRY EVERYTHING — UNRESOLVED FIELDS (F27)

This is a critical architectural verification. The "Carry Everything, Express Contextually" principle requires that ALL columns in an uploaded file — mapped AND unmapped — are committed to `committed_data`. Unresolved fields must NOT be silently dropped.

### 4A: Diagnose Commit Logic

```bash
echo "============================================"
echo "TASK 4: CARRY EVERYTHING DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 4A: DATA COMMIT LOGIC ==="
echo "--- Find where import data is committed to database ---"
grep -rn "committed_data\|commitData\|insertData\|bulkInsert\|importCommit" web/src/app/api/ web/src/lib/import-pipeline/ --include="*.ts" --include="*.tsx" 2>/dev/null | head -20

echo ""
echo "=== 4B: DOES COMMIT USE ONLY MAPPED FIELDS? ==="
echo "--- Check if commit filters to only mapped columns ---"
grep -rn "mappedFields\|mapped.*only\|filter.*mapped\|resolved.*only\|skip.*unresolved\|unmapped" web/src/lib/import-pipeline/ web/src/app/api/ --include="*.ts" 2>/dev/null | head -15

echo ""
echo "=== 4C: COMMITTED_DATA SCHEMA ==="
echo "--- What columns does committed_data have? ---"
grep -rn "committed_data" web/src/lib/ --include="*.ts" | head -10
echo ""
echo "--- Check if it has a JSONB column for all data ---"
echo "Look for: raw_data, data, source_data, original_data, all_fields"
grep -rn "raw_data\|source_data\|original_data\|all_fields\|jsonb" web/src/lib/import-pipeline/ --include="*.ts" 2>/dev/null | head -10

echo ""
echo "=== 4D: WHAT GETS COMMITTED ==="
echo "--- Trace the full commit flow ---"
find web/src -name "*commit*" -o -name "*import*commit*" | grep -v node_modules | grep -v .next
echo ""
echo "--- The actual insert statement ---"
grep -A 20 "\.insert\|\.upsert" web/src/lib/import-pipeline/*.ts web/src/app/api/import*/route.ts 2>/dev/null | head -40
```

### 4B: Fix If Unresolved Fields Are Dropped

If the commit logic filters to only mapped fields, fix it to include ALL columns:

```typescript
// WRONG — only commits mapped columns
const dataToCommit = rows.map(row => {
  const mapped: Record<string, any> = {};
  fieldMappings.filter(m => m.status === 'resolved').forEach(m => {
    mapped[m.targetField] = row[m.sourceColumn];
  });
  return { tenant_id: tenantId, ...mapped };
});

// CORRECT — commits ALL columns to committed_data
const dataToCommit = rows.map(row => ({
  tenant_id: tenantId,
  import_batch_id: batchId,
  // ALL original columns preserved in a JSONB field
  committed_data: row,  // the entire original row
  // Mapped fields extracted for indexed queries
  entity_id: row[entityIdColumn],
  // ... other indexed fields from mappings
}));
```

The key principle: `committed_data` should store the COMPLETE original row (all columns, mapped and unmapped) in a JSONB field. Mapped fields may additionally be extracted to indexed columns for query performance. But the original data is NEVER filtered or reduced.

### 4C: Verification Query

After the fix, provide a SQL query Andrew can run to verify:

```sql
-- After importing the Caribe roster, check committed_data
-- Look for BranchName, Status, ProductLicenses, Email in the committed data
SELECT 
  id,
  committed_data->>'EmployeeID' as employee_id,
  committed_data->>'BranchName' as branch_name,
  committed_data->>'Status' as status,
  committed_data->>'ProductLicenses' as product_licenses,
  committed_data->>'Email' as email
FROM committed_data
WHERE tenant_id = (SELECT id FROM tenants WHERE name ILIKE '%mexican%')
LIMIT 5;
-- If BranchName, Status, ProductLicenses, Email are NULL, Carry Everything is violated
```

### Proof Gates — Task 4

```
PG-12: Commit logic includes ALL source columns, not just mapped ones
PG-13: committed_data rows contain unmapped fields (BranchName, Status, ProductLicenses, Email)
PG-14: No filtering or skipping of "Unresolved" fields before database insert
PG-15: npm run build exits 0
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-065 Task 4: Carry Everything — all columns committed including unresolved" && git push origin dev`

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

Create `HF-065_COMPLETION_REPORT.md` at project root:

1. Task 1: Field mapper — custom field validation fix, expanded hierarchy fields, Next button unblocked
2. Task 2: Financial navigation — breadcrumb path corrected, submenu stays expanded on child selection
3. Task 3: Import header — roster shows tenant-level context, not plan name
4. Task 4: Carry Everything — unresolved fields committed to committed_data
5. All proof gates PG-01 through PG-15 with PASS/FAIL
6. Deferred findings list (F16, F19, F20, F21) with rationale

**CRITICAL RULE 31:** If any task was NOT executed, report must say "Task X: NOT EXECUTED — [reason]".

### 5C: PR (COMPOUND COMMAND — Rule 3)

```bash
cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-065 Complete: CLT-104 open items resolution" && git push origin dev && gh pr create --base main --head dev --title "HF-065: CLT-104 Open Items — Import UX, Navigation, Carry Everything" --body "## CLT-104 Findings Addressed: 6

### Task 1: Field Mapper Fix (F25, F28)
- Next button no longer blocked by custom fields at 0% confidence
- Expanded default field options: Branch Name, Region, Email, Hire Date, Status, Department, Location, Manager
- Unresolved fields don't block progression

### Task 2: Financial Navigation (F17, F18)
- Breadcrumb shows correct path: Financial > Analysis > Revenue Timeline
- Active section stays expanded when child page selected
- No more losing spatial context on navigation

### Task 3: Import Header (F26)
- Roster import shows tenant-level header, not plan-specific
- AI classification updates header to match detected type (Personnel/Transaction/Data)

### Task 4: Carry Everything (F27)
- All source columns committed to committed_data including unmapped/unresolved fields
- No silent data loss on import
- Verification query provided for post-import validation

## Deferred Findings (separate OBs needed)
- F16: Cross-workspace auth redirect loop (requires auth investigation)
- F19: Empty tenant module activation (architecture decision)
- F20: Configure > Plans labeling (nav restructure)
- F21: Three import entry points → unified (DS-005 OB)

## Proof Gates: 15"
```

---

## SCOPE BOUNDARIES

### IN SCOPE
- Field mapper validation — Next button unblocked for custom fields (F25, F28)
- Financial sidebar — breadcrumb path fix, submenu persistence (F17, F18)
- Import header — roster is tenant-level, not plan-scoped (F26)
- Carry Everything — unresolved fields committed to committed_data (F27)

### OUT OF SCOPE — DO NOT TOUCH
- Auth files or login redirect logic (F16 — separate investigation)
- Operate/Perform landing pages (OB-105 handles these)
- Plan Import pages (HF-064 handles these)
- Module activation workflow (F19 — architecture decision needed)
- Navigation restructure / import unification (F20, F21 — separate OB)
- Calculation engine
- Financial module page content
- New Supabase tables or migrations

---

## DEFERRED FINDINGS — DOCUMENTED FOR FUTURE WORK

### F16: Cross-Workspace Auth Redirect Loop (P0 — SEPARATE INVESTIGATION)
**Problem:** Ana Cristina Vidal (Sabor admin) logged in on `/operate`. Clicking Perform in sidebar → redirected to `/login?redirect=%2Fperform`. Session valid on one workspace, rejected on the other. 1,199 requests, 3.8 min finish.
**Why deferred:** This is an auth chain issue. The middleware or session context is not recognizing the tenant user's session when crossing workspace boundaries. Fixing this requires understanding the auth flow deeply — and Standing Rule says DO NOT MODIFY AUTH FILES without reading AUTH_FLOW_REFERENCE.md. This needs a dedicated investigation, not a drive-by fix.
**Recommended:** Dedicated HF with Phase 0 auth flow trace for tenant-scoped users.

### F19: Empty Tenant — No Module Activation Path (P1 — ARCHITECTURE DECISION)
**Problem:** After `clear-tenant.ts`, Operate shows "No modules configured" with [Configure] button that leads nowhere. No UI to enable ICM or Financial module.
**Why deferred:** Module detection is currently data-driven (rule sets = ICM, POS data = Financial). The question is: should modules be explicitly enabled via a toggle, or implicitly detected from imported data? This is an architecture decision, not a bug fix.
**Recommended:** Add to Architecture Decision backlog. Either: (a) Observatory module toggle, or (b) import-driven detection with confirmation, or (c) both.

### F20: Configure > Plans Is Actually Plan Import (P2 — NAV RESTRUCTURE)
**Problem:** "Plans" under Configure is the AI interpretation upload wizard, not a plan management page. User expects to see existing plans, edit rules, manage versions.
**Recommended:** Part of the navigation restructure OB. Configure > Plans should show the plan management view; Plan Import lives under Operate > Import (unified).

### F21: Three Separate Import Entry Points (P2 — DS-005 OB)
**Problem:** Plan Import (Configure > Plans), Data Import (Operate > Import), POS Import (Financial > Import POS Data). Should be one unified upload zone where AI classifies everything.
**Recommended:** Dedicated OB implementing DS-005 Data Ingestion Facility specification. One drop zone, AI classifies, routes to appropriate pipeline.

---

## ANTI-PATTERNS

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Custom field at 0% confidence blocks Next button | Confidence is a hint, not a gate. User-created mappings are always valid |
| AP-2 | Breadcrumb path hardcoded separately from nav config | Derive breadcrumbs from nav hierarchy — single source of truth |
| AP-3 | Submenu collapses when child is active | Active page's parent section always stays expanded |
| AP-4 | Import header shows last plan instead of data context | Detect import type from AI classification, show appropriate context |
| AP-5 | Only mapped fields committed to database | ALL source columns committed — Carry Everything principle |
| AP-6 | Modifying auth files for redirect fix | DEFERRED — needs dedicated investigation with auth flow trace |

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*"Carry Everything, Express Contextually. The platform never forgets what you gave it — even if it doesn't know what to do with it yet."*
