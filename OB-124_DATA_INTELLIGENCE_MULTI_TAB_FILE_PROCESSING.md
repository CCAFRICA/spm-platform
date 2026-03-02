# OB-124: DATA INTELLIGENCE — MULTI-TAB XLSX + FILE PROCESSING FIX

## Target: alpha.2.0
## Depends on: OB-123 (PR #139), HF-081 (PR #140)
## Source: Decision 72 (Independent Tab Classification), CLT-122 F-65, CLT-109 F-15/F-16/F-17, CC-UAT-05 F-04

## READ FIRST — IN THIS ORDER
1. `CC_STANDING_ARCHITECTURE_RULES.md` — ALL sections, ALL rules, ALL anti-patterns
2. `SCHEMA_REFERENCE.md` — committed_data, rule_sets, ingestion_events tables
3. `VIALUCE_CLT_FINDINGS_REGISTRY_R7.md` — Tier 1 (F-65), Tier 4 (import UX), cross-CLT patterns
4. This entire prompt, start to finish, before executing anything

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases, paste all output, commit per phase.

## STANDING RULES REMINDER
- After EVERY commit: `git push origin dev`
- After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
- Git commands from repo root (`/Users/AndrewAfrica/spm-platform`), NOT from `web/`
- Commit this prompt as first action
- DO NOT MODIFY ANY AUTH FILE (middleware.ts, auth-shell.tsx, or auth callback routes)
- Supabase `.in()` ≤ 200 items
- Evidence = paste code/output, NOT "this was implemented"
- One commit per phase

---

## WHY THIS OB EXISTS

The platform cannot process files the way a real customer provides them. Three failures:

1. **Multi-tab XLSX reads Tab 1 only.** Deposit Growth Incentive has plan structure on Tab 1 and per-officer targets on Tab 2. Tab 2 is silently dropped. Result: Deposit Growth produces uniform $30K payouts instead of target-based calculations. This is F-65, the root cause confirmed across CLT-122 and CC-UAT-05.

2. **Multi-file CSV upload processes only the first file.** Seven CSVs dropped into the import become one "Sheet1" card. Six files of data disappear. This has been broken since CLT-102 (F-26).

3. **A customer might put everything in one XLSX workbook.** Plan on Tab 1, roster on Tab 2, three months of transactions on Tabs 3-5, targets on Tab 6. The platform must handle this — each tab classified independently, routed to the correct pipeline.

These are not three separate problems. They are one problem: **the platform treats every upload as a single-sheet entity.** The fix is to treat every TAB as an independent content unit, whether the tabs come from one file or many files.

---

## SCOPE BOUNDARIES

### IN SCOPE
- Multi-tab XLSX: every tab parsed and presented as an independent card
- Multi-file upload: N files → N×M cards (files × sheets)
- Independent AI classification per tab/sheet
- Independent field mapping per tab/sheet
- Tab 2 target data routed to committed_data (not plan interpretation)
- Re-run wire API for LAB tenant after Tab 2 import to verify Deposit Growth
- Batch summary showing all files/tabs before commit

### OUT OF SCOPE — DO NOT TOUCH
- Plan interpretation pipeline (PDF/PPTX → rule_sets) — separate route, don't modify
- Calculation engine — no changes to how calculations run
- Auth files — no middleware, no auth-shell
- Wire API code — already fixed in HF-081, don't modify route.ts
- License-based assignment fix (F-01) — separate HF
- Reconciliation UI — separate OB
- Navigation or landing pages — separate OB

---

## PHASE 0: DIAGNOSTIC — TRACE THE EXACT FILE PROCESSING PATH

Before writing code, understand exactly how files flow through the current system.

```bash
cd /Users/AndrewAfrica/spm-platform

echo "╔══════════════════════════════════════════════════════╗"
echo "║  OB-124 PHASE 0: FILE PROCESSING DIAGNOSTIC         ║"
echo "╚══════════════════════════════════════════════════════╝"

echo ""
echo "=== 0A: WHERE FILES ENTER ==="
# Find file input handlers in import pages
grep -rn "onDrop\|onChange.*file\|handleFile\|acceptedFiles\|FileList\|useDropzone\|dropzone" \
  web/src/app/data/import/ web/src/app/operate/import/ web/src/app/admin/launch/ \
  --include="*.tsx" --include="*.ts" | head -30

echo ""
echo "=== 0B: HOW FILES ARE PARSED ==="
# Find SheetJS / XLSX usage
grep -rn "XLSX\|xlsx\|readFile\|read.*buffer\|sheet_to_json\|SheetNames\|getSheetNames\|workbook\|Workbook" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -30

echo ""
echo "=== 0C: SINGLE VS MULTI FILE ==="
# Is there a loop over files or only files[0]?
grep -rn "files\[0\]\|file\[0\]\|acceptedFiles\[0\]\|\.files\[0\]" \
  web/src/app/data/import/ web/src/app/operate/import/ web/src/app/admin/launch/ \
  --include="*.tsx" --include="*.ts" | head -20

echo ""
echo "=== 0D: SINGLE VS MULTI SHEET ==="
# Is there a loop over SheetNames or only SheetNames[0]?
grep -rn "SheetNames\[0\]\|sheets\[0\]\|sheet\[0\]\|firstSheet\|Sheets\[.*SheetNames\[0\]\]" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== 0E: HOW ANALYSIS IS CALLED ==="
# Find the API call for file analysis/classification
grep -rn "analyze-workbook\|analyzeWorkbook\|api.*import.*analyze\|api.*classification\|api.*sheet" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== 0F: DATA IMPORT PAGE STRUCTURE ==="
# Find the primary import page(s) and their stepper/step structure
find web/src/app -path "*import*" -name "page.tsx" | sort
find web/src/app -path "*import*" -name "*.tsx" | sort

echo ""
echo "=== 0G: PLAN IMPORT — DOES IT HANDLE XLSX? ==="
# Plan import may also receive XLSX files (e.g., Insurance Referral, Deposit Growth)
grep -rn "XLSX\|xlsx\|sheet\|tab\|workbook" \
  web/src/app/admin/launch/plan-import/ --include="*.ts" --include="*.tsx" | head -15

echo ""
echo "=== 0H: HOW COMMITTED_DATA IS WRITTEN ==="
# Find the commit/save handler that writes to committed_data
grep -rn "committed_data\|committedData\|commit.*data" \
  web/src/app/api/ web/src/lib/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -20
```

**PASTE ALL OUTPUT.** This reveals:
- WHERE the `files[0]` / `SheetNames[0]` bottleneck is
- HOW MANY import pages exist and which one is primary
- WHETHER plan import also handles XLSX (for Deposit Growth Tab 1)
- WHAT the commit path looks like

**Commit:** `OB-124 Phase 0: File processing diagnostic — trace exact bottlenecks`

---

## PHASE 1: FIX FILE PARSING — EVERY FILE, EVERY TAB

Using Phase 0 findings, fix the file parser to handle:
- Single CSV → 1 card (1 file × 1 sheet)
- Single XLSX with 1 tab → 1 card
- Single XLSX with N tabs → N cards
- M CSV files → M cards
- Mixed upload (1 XLSX + 3 CSVs) → (N tabs from XLSX) + 3 cards

### 1A: Create or Fix the Multi-File Parser

The core parsing function must produce this structure:

```typescript
interface ParsedTab {
  filename: string;       // Source filename
  tabName: string;        // Sheet name (or filename for CSVs)
  tabIndex: number;       // Position within the file
  fileIndex: number;      // Which file this came from
  columns: string[];      // Column headers
  rowCount: number;       // Data rows (excluding header)
  sampleRows: Record<string, any>[]; // First 5 rows for preview + AI analysis
}
```

Implementation requirements:
- Loop over ALL files, not `files[0]`
- For each file, loop over ALL SheetNames, not `SheetNames[0]`
- CSVs have one implicit "sheet" — use the filename as the tab name
- Preserve the parent filename so the user sees "CFG_Deposit_Growth.xlsx → Tab 2: Targets"
- Do NOT merge sheets from different files

### 1B: Wire the Parser Into the Import Page

Replace the current single-file parsing with the multi-file parser. The state should change from:

```typescript
// BEFORE: single sheet
const [analysisResult, setAnalysisResult] = useState<SheetAnalysis | null>(null);

// AFTER: array of tabs
const [parsedTabs, setParsedTabs] = useState<ParsedTab[]>([]);
```

### 1C: Verify Locally

After implementing, verify with a console.log test:
```typescript
// Temporary verification — remove after confirming
console.log('[OB-124] Parsed tabs:', parsedTabs.length);
parsedTabs.forEach(t => console.log(`  ${t.filename} → ${t.tabName}: ${t.rowCount} rows, ${t.columns.length} cols`));
```

Expected output for Deposit Growth XLSX:
```
[OB-124] Parsed tabs: 2
  CFG_Deposit_Growth_Incentive_Q1_2024.xlsx → Sheet1: 1 row, 8 cols (plan structure)
  CFG_Deposit_Growth_Incentive_Q1_2024.xlsx → Targets: 25 rows, 3 cols (per-officer targets)
```

**Commit:** `OB-124 Phase 1: Multi-file multi-tab parser — every file, every tab as independent card`

---

## PHASE 2: UPDATE UI — SHOW N CARDS, NOT 1

### 2A: Sheet Analysis Step

Replace the single card with a card-per-tab layout:

```tsx
// Each parsed tab gets its own card
{parsedTabs.map((tab, idx) => (
  <div key={idx} className="border border-zinc-700 rounded-lg p-4 mb-3">
    <div className="flex items-center justify-between mb-2">
      <div>
        <span className="text-zinc-200 font-medium">{tab.tabName}</span>
        <span className="text-zinc-500 text-sm ml-2">from {tab.filename}</span>
      </div>
      <span className="text-zinc-400 text-sm">
        {tab.rowCount} rows · {tab.columns.length} columns
      </span>
    </div>
    
    {/* Column preview */}
    <div className="text-xs text-zinc-500 mt-1">
      {tab.columns.slice(0, 6).join(', ')}
      {tab.columns.length > 6 ? ` +${tab.columns.length - 6} more` : ''}
    </div>
    
    {/* AI classification result (populated after Phase 3) */}
    {tab.classification && (
      <div className="text-sm text-zinc-400 mt-2">
        {tab.classification.type} · {tab.classification.confidence}% confidence
      </div>
    )}
  </div>
))}
```

### 2B: File Grouping

When multiple tabs come from the same file, group them visually:

```tsx
// Group tabs by source file
const fileGroups = parsedTabs.reduce((groups, tab) => {
  const key = tab.filename;
  if (!groups[key]) groups[key] = [];
  groups[key].push(tab);
  return groups;
}, {} as Record<string, ParsedTab[]>);

// Render grouped
{Object.entries(fileGroups).map(([filename, tabs]) => (
  <div key={filename} className="mb-4">
    <div className="text-sm text-zinc-500 mb-1">
      {filename} ({tabs.length} {tabs.length === 1 ? 'sheet' : 'sheets'})
    </div>
    {tabs.map(tab => (
      // ... card per tab
    ))}
  </div>
))}
```

**Commit:** `OB-124 Phase 2: UI shows N cards — one per tab, grouped by source file`

---

## PHASE 3: AI CLASSIFICATION PER TAB

Each tab gets its own classification call. This is where Tab 2 of Deposit Growth gets classified as "plan_targets" or "transaction_data" instead of being ignored.

### 3A: Independent Classification Calls

```typescript
// Classify each tab independently
const classificationResults = await Promise.all(
  parsedTabs.map(async (tab) => {
    const response = await fetch('/api/import/analyze-workbook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: tab.filename,
        sheets: [{
          name: tab.tabName,
          columns: tab.columns,
          sampleValues: tab.sampleRows,
          rowCount: tab.rowCount,
        }],
        tenantId,
        existingPlans: plans.map(p => p.name),
      }),
    });
    return response.json();
  })
);

// Merge results back into parsedTabs
parsedTabs.forEach((tab, idx) => {
  tab.classification = classificationResults[idx];
});
```

### 3B: Verify Classification Output

For the Deposit Growth XLSX, expected classification:
- Tab 1 (plan structure): `plan_document` or `plan_config`
- Tab 2 (per-officer targets): `plan_targets` or `transaction_data` or `roster_supplement`

The exact classification type doesn't matter as long as Tab 2 is NOT ignored and IS routed to committed_data.

### 3C: Handle the "Plan + Data in One File" Case

When a multi-tab XLSX contains BOTH plan structure (Tab 1) and operational data (Tab 2+):
- Tab 1 classified as plan → route to plan interpretation if user confirms
- Tab 2+ classified as data → route to data import pipeline (field mapping → committed_data)

This does NOT require both pipelines to run simultaneously. Present the tabs to the user and let them confirm routing:

```
CFG_Deposit_Growth_Incentive_Q1_2024.xlsx
  Tab 1: Sheet1    → Plan Document (1 row, rate table detected)     [Keep as Plan]
  Tab 2: Targets   → Target Data (25 rows, OfficerID + GrowthTarget) [Import as Data]
```

**Commit:** `OB-124 Phase 3: Independent AI classification per tab`

---

## PHASE 4: FIELD MAPPING PER TAB

Each tab that is classified as data (not plan) goes through field mapping independently.

### 4A: Per-Tab Field Mapping State

```typescript
// Each data tab has its own mapping
interface TabMapping {
  tabIndex: number;
  columns: string[];
  mappings: Record<string, string>; // column → semantic type
  confirmed: boolean;
}

const [tabMappings, setTabMappings] = useState<TabMapping[]>([]);
```

### 4B: Field Mapping UI

Show a mapping table per data tab. Tabs classified as "plan" skip this step (they go to plan interpretation).

```tsx
{dataTabs.map(tab => (
  <div key={tab.tabIndex}>
    <h4>{tab.filename} → {tab.tabName}</h4>
    <FieldMappingTable
      columns={tab.columns}
      sampleValues={tab.sampleRows}
      aiSuggestions={tab.classification?.fieldMappings}
      onUpdate={(mappings) => updateTabMappings(tab.tabIndex, mappings)}
    />
  </div>
))}
```

### 4C: Carry Everything, Express Contextually

When committing data to committed_data, ALL columns from each tab are stored in the `data` JSONB field — mapped AND unmapped. The field mapping tells the engine WHICH columns are semantically meaningful, but all data is preserved. This is Decision 51.

**Commit:** `OB-124 Phase 4: Per-tab field mapping with Carry Everything principle`

---

## PHASE 5: COMMIT ALL TABS TO COMMITTED_DATA

### 5A: Batch Commit

Each data tab produces rows in committed_data with:
- `tenant_id` — current tenant
- `data_type` — normalized from AI classification (e.g., `deposit_targets`, `loan_disbursements`)
- `entity_id` — resolved from entity column if identified
- `period_date` — resolved from date column if identified
- `data` — full row as JSONB (all columns, mapped + unmapped)

```typescript
// For each data tab, commit all rows
for (const tab of dataTabs) {
  const normalizedType = normalizeDataType(tab.classification.type, tab.tabName, tab.filename);
  
  const rows = tab.allRows.map(row => ({
    tenant_id: tenantId,
    data_type: normalizedType,
    entity_id: resolveEntityId(row, tab.mappings),
    period_date: resolvePeriodDate(row, tab.mappings),
    data: row, // Carry Everything
  }));
  
  // Batch insert (respecting 200-item Supabase limit)
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    await supabase.from('committed_data').insert(batch);
  }
}
```

### 5B: Data Type Normalization

The data_type must be normalized BEFORE writing — not after (this was the HF-081 race condition). Use the same normalization logic from the wire API:
- Strip `component_data:` prefix if present
- Lowercase
- Replace spaces and special characters with underscores
- Use semantic name from AI classification when available

### 5C: Batch Summary Before Commit

Before writing to the database, show a summary:

```
Import Summary — 13 files, 14 tabs
─────────────────────────────────────────────────────────
✓ CFG_Personnel_Q1_2024.xlsx        → Roster (25 entities)
✓ CFG_Loan_Disbursements_Jan2024.csv → loan_disbursements (89 rows, Jan 2024)
✓ CFG_Loan_Disbursements_Feb2024.csv → loan_disbursements (92 rows, Feb 2024)  
✓ CFG_Loan_Disbursements_Mar2024.csv → loan_disbursements (87 rows, Mar 2024)
✓ CFG_Mortgage_Closings_Q1_2024.csv  → mortgage_closings (15 rows, Q1 2024)
✓ CFG_Insurance_Referrals_Q1.csv     → insurance_referrals (47 rows, Q1 2024)
✓ CFG_Deposit_Balances_Q1_2024.csv   → deposit_balances (75 rows, Q1 2024)
✓ CFG_Loan_Defaults_Q1_2024.csv      → loan_defaults (7 rows, Q1 2024)
✓ CFG_Deposit_Growth.xlsx → Tab 1    → Plan Document (skip — plan import)
✓ CFG_Deposit_Growth.xlsx → Tab 2    → deposit_targets (25 rows)
...

Total: [N] rows across [M] data types
[Commit All]
```

**Commit:** `OB-124 Phase 5: Batch commit to committed_data with normalized data_types`

---

## PHASE 6: VERIFICATION — DEPOSIT GROWTH TAB 2

This is the proof that the multi-tab fix works. Specifically: does Tab 2 of the Deposit Growth XLSX end up in committed_data with the right data_type?

### 6A: Check Committed Data for Target Data

```bash
cd /Users/AndrewAfrica/spm-platform

npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';

console.log('=== COMMITTED DATA TYPES AFTER OB-124 ===');
const { data } = await sb.from('committed_data').select('data_type').eq('tenant_id', LAB);
const types: Record<string, number> = {};
for (const r of data || []) types[r.data_type] = (types[r.data_type] || 0) + 1;
for (const [t, c] of Object.entries(types).sort()) console.log('  ', t, ':', c, 'rows');

console.log('');
console.log('=== TARGET DATA SEARCH ===');
const { data: targetRows } = await sb.from('committed_data')
  .select('data_type, data')
  .eq('tenant_id', LAB)
  .limit(2000);

let targetCount = 0;
for (const row of targetRows || []) {
  const keys = Object.keys(row.data || {});
  if (keys.some(k => k.toLowerCase().includes('target') || k.toLowerCase().includes('growth'))) {
    targetCount++;
    if (targetCount <= 3) {
      console.log('  Target row found:', row.data_type, '|', JSON.stringify(row.data).slice(0, 200));
    }
  }
}
console.log(\`  Total rows with target fields: \${targetCount}\`);
console.log(\`  VERDICT: \${targetCount > 0 ? 'PASS — Tab 2 target data in committed_data' : 'FAIL — no target data found'}\`);
"
```

### 6B: Verify Multi-File Parsing

If the import was re-run with the full Caribe package:

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';

const { data } = await sb.from('committed_data').select('data_type').eq('tenant_id', LAB);
const types: Record<string, number> = {};
for (const r of data || []) types[r.data_type] = (types[r.data_type] || 0) + 1;

const uniqueTypes = Object.keys(types).length;
console.log('Unique data_types:', uniqueTypes);
console.log('Expected: at least 6 (loan_disbursements, mortgage_closings, insurance_referrals, deposit_balances, deposit_targets, loan_defaults)');
console.log('VERDICT:', uniqueTypes >= 6 ? 'PASS' : 'FAIL — some files not processed');
for (const [t, c] of Object.entries(types).sort()) console.log('  ', t, ':', c);
"
```

**PASTE ALL OUTPUT.**

**Commit:** `OB-124 Phase 6: Verification — Tab 2 target data in committed_data`

---

## PHASE 7: BUILD + CLEAN SERVER TEST

```bash
cd /Users/AndrewAfrica/spm-platform
kill $(lsof -ti:3000) 2>/dev/null || true
rm -rf web/.next
cd web && npm run build && cd ..
echo "Build exit code: $?"

cd web && npm run dev &
sleep 10
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000
echo ""
kill $(lsof -ti:3000) 2>/dev/null || true
```

**PASTE BUILD OUTPUT.** Must exit 0.

**Commit:** `OB-124 Phase 7: Build clean, dev server responds`

---

## PHASE 8: COMPLETION REPORT

Create `OB-124_COMPLETION_REPORT.md` at project root.

### PROOF GATES — HARD

| # | Criterion | How to Verify |
|---|-----------|---------------|
| PG-01 | `npm run build` exits 0 | Paste exit code |
| PG-02 | Multi-tab XLSX: all tabs parsed (not just Tab 1) | Console.log showing N tabs from one XLSX |
| PG-03 | Multi-file CSV: all files parsed independently | Console.log showing N cards from N files |
| PG-04 | Each tab gets independent AI classification | N classification calls made, N results returned |
| PG-05 | Each data tab gets independent field mapping | Field mapping state has N entries for N data tabs |
| PG-06 | Deposit Growth Tab 2 target data exists in committed_data | DB query showing target rows |
| PG-07 | All data_types normalized before write (no component_data: prefix) | DB query showing 0 unnormalized types |
| PG-08 | Batch summary shows all files/tabs before commit | Screenshot or component output |
| PG-09 | MBC committed_data unchanged | Row count before/after |
| PG-10 | No auth files modified | `git diff --name-only` |
| PG-11 | localhost:3000 responds after clean build | curl output |

### PROOF GATES — SOFT

| # | Criterion | How to Verify |
|---|-----------|---------------|
| PG-S1 | Mixed upload (1 XLSX + 3 CSVs) produces correct card count | Manual test or log |
| PG-S2 | Cards grouped by source file in UI | Visual confirmation |
| PG-S3 | No Korean Test violations in new code | grep for domain vocabulary |
| PG-S4 | Carry Everything: unmapped columns preserved in committed_data.data | DB query showing full row |

**Commit:** `OB-124 Phase 8: Completion report`

---

## FINAL: GIT PROTOCOL

```bash
cd /Users/AndrewAfrica/spm-platform
git add -A
git commit -m "OB-124 Complete: Multi-tab XLSX + multi-file processing"
git push origin dev

gh pr create --base main --head dev \
  --title "OB-124: Data Intelligence — Multi-tab XLSX + File Processing" \
  --body "Every tab in every file parsed and classified independently. Deposit Growth Tab 2 target data now reaches committed_data. Multi-file CSV upload processes all files. Batch summary before commit. Decision 72 implemented."
```

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Reading only `files[0]` or `SheetNames[0]` | Loop over ALL files AND ALL sheets. The [0] assumption is the root cause. |
| AP-2 | Merging sheets from different files into one workbook | Each file is independent. Each tab within a file is independent. Never merge. |
| AP-3 | Hardcoding tab names ("Sheet1", "Targets") | Use SheetNames array. Tab names are whatever the customer chose. Korean Test. |
| AP-4 | Writing `component_data:` prefix to committed_data | Normalize data_type BEFORE insert. This caused HF-081's convergence race. |
| AP-5 | Running plan interpretation on ALL tabs | Only tabs classified as plan_document go to plan interpretation. Data tabs go to committed_data. |
| AP-6 | Building a new import page instead of fixing the existing one | Fix the existing import flow. Don't create a parallel pipeline (CC Pattern 21 — dual code path). |
| AP-7 | Committing data without batch summary | User must see what will be committed before it's committed. Proposal + Confirmation (Decision 73). |
| AP-8 | Assuming column names match across tabs | Each tab has its own columns. Don't assume Tab 2 has the same columns as Tab 1. |

---

## CC FAILURE PATTERNS TO AVOID

| Pattern | Description | Prevention |
|---------|-------------|------------|
| 18 | Stale accumulation | DELETE existing committed_data for this import batch before INSERT |
| 19 | Domain vocabulary leak | No "Mortgage", "Deposit", "LoanAmount" in foundational parsing code |
| 21 | Dual code path | ONE import page, not a new one alongside the old one |
| 22 | RLS silent swallow | Use service role client for committed_data writes. Check count after insert. |

---

*"The platform treats every upload as a single-sheet entity. The fix is to treat every tab as an independent content unit."*
*"We are not making a movie."*
