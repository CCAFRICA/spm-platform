# OB-88: END-TO-END PIPELINE ACCURACY PROOF
## Clean Tenant. Plan Import. Data Import. Calculate. Reconcile. Prove.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE.md` — actual database schema
3. This prompt in its entirety before writing a single line of code

---

## CONTEXT — WHY THIS EXISTS

The platform has been through 87 operational briefs, 57 hotfixes, and 159 proof gates. Individual systems work. What has NEVER been proven is the complete end-to-end pipeline on a clean tenant:

**Plan Import → Data Import → Calculate → Reconcile → Accuracy Report**

Previous accuracy work (OB-85 R3 through R6) was done on a tenant with accumulated debris from months of development — orphaned entities, duplicate periods, stale rule sets, overlapping imports. The 97.9% accuracy result (MX$1,280,465 vs benchmark MX$1,253,832) is promising but was achieved by surgical fixes on a dirty tenant.

This OB creates a clean tenant, runs the ENTIRE pipeline from scratch, and produces a definitive accuracy report. The benchmark is known: CLT-14B independently verified $1,253,832 across 719 employees for January 2024. If VL matches that number on a clean pipeline, the calculation engine is proven.

### Ground Truth (from CLT-14B)

| Metric | Value |
|--------|-------|
| Employees | 719 |
| Period | January 2024 |
| Total payout | MX$1,253,832 |
| Components | 6 (Optical Sales, Store Sales, New Customers, Collections, Insurance, Warranty) |
| Component totals | Optical: $505,750, Store: $129,200, Customers: $207,200, Collections: $214,400, Insurance: $46,032, Warranty: $151,250 |
| Cert/Non-cert split | ~457 certified, ~262 non-certified |

### Source Files

| File | Content | Records |
|------|---------|---------|
| `RetailCorp_Plan1.pptx` | Commission plan — 6 components, tier tables, cert/non-cert variants | 20 slides |
| `BacktTest_Optometrista_mar2025_Proveedores.xlsx` | Source data — 7 sheets (roster, individual sales, store sales, customers, collections, insurance, warranty) | ~119K total rows |
| `RetailCo data results.xlsx` | Benchmark — per-employee payouts with component breakdown | 2,157 rows (719 × 3 months) |

---

## FIRST PRINCIPLES

1. **FIX LOGIC NOT DATA** — Never provide CC with answer values. Never hardcode expected outputs. Let the engine derive results from source material.
2. **KOREAN TEST** — Zero hardcoded column names or field patterns from this specific dataset.
3. **CLEAN ROOM** — The new tenant must have ZERO data from any previous development. No orphaned entities, no stale periods, no accumulated debris.
4. **THE PIPELINE IS THE TEST** — This is not a unit test. This is the actual platform pipeline: the same screens, the same AI, the same engine a real customer would use.
5. **CLASSIFICATION SIGNALS** — Every AI decision during this pipeline generates signals via OB-86 infrastructure.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev`
4. Architecture Decision Gate before implementation
5. Anti-Pattern Registry check (AP-1 through AP-20)
6. Supabase batch ≤200 for all `.in()` calls
7. Build EXACTLY what this prompt specifies
8. Terminology: "Classification Signal" not "Training Signal"
9. ALL git commands from repository root (spm-platform), not web/

---

## PHASE 0: CREATE CLEAN TENANT

### 0A: Assessment — Current Database State

Before creating anything, understand what exists:

```bash
cd /Users/AndrewAfrica/spm-platform/web

echo "=== EXISTING TENANTS ==="
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data } = await sb.from('tenants').select('id, name, slug, industry');
console.table(data);
"

echo ""
echo "=== EXISTING PROFILES ==="
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data } = await sb.from('profiles').select('email, role, scope_level, tenant_id');
console.table(data);
"

echo ""
echo "=== DATA VOLUME PER TENANT ==="
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tables = ['entities', 'periods', 'rule_sets', 'committed_data', 'calculation_batches', 'calculation_results'];
for (const table of tables) {
  const { count } = await sb.from(table).select('*', { count: 'exact', head: true });
  console.log(table.padEnd(25), count);
}
"
```

**PASTE all output.**

### 0B: Create Clean Tenant

Create a new tenant specifically for this E2E proof. Do NOT modify or reuse any existing tenant.

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const { data: tenant, error } = await sb.from('tenants').insert({
  name: 'Pipeline Proof Co',
  slug: 'pipeline-proof',
  industry: 'retail_optical',
  country_code: 'MX',
  settings: {
    currency: 'MXN',
    locale: 'es-MX',
    timezone: 'America/Mexico_City',
    demo_users: []
  }
}).select().single();

if (error) { console.error('Tenant creation error:', error); process.exit(1); }
console.log('Created tenant:', tenant.id, tenant.name);
"
```

**RECORD the tenant ID.** It will be needed for every subsequent step.

### 0C: Create Auth User + Profile for This Tenant

Create a user that can log in and operate this tenant:

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Create auth user
const { data: authUser, error: authError } = await sb.auth.admin.createUser({
  email: 'admin@pipelineproof.mx',
  password: 'demo-password-VL1',
  email_confirm: true
});

if (authError) { console.error('Auth error:', authError); process.exit(1); }
console.log('Auth user created:', authUser.user.id);

// IMPORTANT: Read the new tenant ID from above step
// Replace TENANT_ID_HERE with the actual ID from step 0B

const { data: profile, error: profileError } = await sb.from('profiles').insert({
  auth_user_id: authUser.user.id,
  email: 'admin@pipelineproof.mx',
  display_name: 'Pipeline Proof Admin',
  role: 'admin',
  scope_level: 'admin',
  tenant_id: 'TENANT_ID_HERE'  // <-- Replace with actual tenant ID from 0B
}).select().single();

if (profileError) { console.error('Profile error:', profileError); process.exit(1); }
console.log('Profile created:', profile.id, profile.email);
"
```

### 0D: Verify Clean State

Confirm the new tenant has ZERO data:

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TENANT_ID = 'TENANT_ID_HERE';  // <-- Replace

const checks = ['entities', 'periods', 'rule_sets', 'committed_data', 'calculation_batches', 'calculation_results', 'reconciliation_sessions', 'classification_signals'];
for (const table of checks) {
  const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
  console.log(table.padEnd(30), count === 0 ? '✅ CLEAN' : '❌ HAS DATA: ' + count);
}
"
```

**ALL must show ✅ CLEAN.** If any table has data for this tenant, investigate and clean before proceeding.

**Commit:** `OB-88 Phase 0: Clean tenant created — Pipeline Proof Co`

---

## MISSION 1: PLAN IMPORT

This is the first step of the real pipeline. The plan file is `RetailCorp_Plan1.pptx`.

### 1A: Verify Plan Import UI

Open localhost:3000 in a browser. Log in as `admin@pipelineproof.mx` / `demo-password-VL1`. Select the "Pipeline Proof Co" tenant.

Navigate to the plan import page. The location may be:
- `/operate/plan-import`
- `/configure/plans`
- `/data/import` (with plan option)

```bash
echo "=== FIND PLAN IMPORT PAGES ==="
find web/src -path "*plan*import*" -type f | head -10
find web/src -path "*plan*interpret*" -type f | head -10
grep -rn "plan.*import\|interpret.*plan\|PlanImport\|PlanInterpret" web/src/app/ --include="*.tsx" -l | head -10
```

### 1B: Programmatic Plan Import (if UI is not end-to-end)

If the plan import UI doesn't provide a complete flow, trigger plan interpretation programmatically using the same service the UI calls:

```bash
echo "=== FIND AI PLAN INTERPRETATION SERVICE ==="
grep -rn "interpretPlan\|planInterpret\|AIService.*plan\|parsePlan" web/src/lib/ --include="*.ts" -l | head -10
```

The goal is: feed `RetailCorp_Plan1.pptx` through the AI plan interpretation pipeline and verify it produces a rule set with:
- 6 components (Optical Sales, Store Sales, New Customers, Collections, Insurance, Warranty)
- 2 variants per component (certified, non-certified)
- Correct tier tables and rate values

### 1C: Verify Rule Set Created

After plan import, verify the rule set exists in Supabase:

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT_ID = 'TENANT_ID_HERE';

const { data } = await sb.from('rule_sets').select('*').eq('tenant_id', TENANT_ID);
console.log('Rule sets:', data?.length);
data?.forEach(rs => {
  console.log('  ID:', rs.id);
  console.log('  Name:', rs.name);
  console.log('  Components:', JSON.stringify(Object.keys(rs.rules || rs.components || {})));
  console.log('  Created:', rs.created_at);
});
"
```

**Expected:** 1 rule set with 6 components.

### 1D: Classification Signals from Plan Import

Verify that plan interpretation generated classification signals:

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT_ID = 'TENANT_ID_HERE';

const { data, count } = await sb.from('classification_signals')
  .select('signal_type, confidence', { count: 'exact' })
  .eq('tenant_id', TENANT_ID);

console.log('Signals after plan import:', count);
data?.forEach(s => console.log('  ', s.signal_type, s.confidence));
"
```

**Commit:** `OB-88 Mission 1: Plan import — rule set created with 6 components`

---

## MISSION 2: DATA IMPORT

The data file is `BacktTest_Optometrista_mar2025_Proveedores.xlsx` (119K records, 7 sheets).

### 2A: Find the Import Pipeline

```bash
echo "=== IMPORT PIPELINE ENTRY POINTS ==="
find web/src -path "*import*" -name "page.tsx" -type f | head -10
grep -rn "handleImport\|processImport\|importFile\|uploadData\|smartImport\|enhancedImport" web/src/ --include="*.tsx" --include="*.ts" -l | head -15
```

### 2B: Execute Import

Navigate to the import page. Upload `BacktTest_Optometrista_mar2025_Proveedores.xlsx`.

The import pipeline should:
1. Parse all 7 sheets
2. AI-classify each sheet (roster, sales, etc.)
3. AI-map fields for each sheet
4. Detect period data (column `Mes` with values 1, 2, 3)
5. Commit all data to `committed_data` table

If the import UI is incomplete or broken, identify the programmatic import endpoint:

```bash
echo "=== API IMPORT ROUTES ==="
find web/src/app/api -path "*import*" -type f | head -10
```

### 2C: Verify Import Results

After import completes, verify the data landed:

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT_ID = 'TENANT_ID_HERE';

// Entities created
const { count: entityCount } = await sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
console.log('Entities:', entityCount);

// Periods created
const { data: periods } = await sb.from('periods').select('*').eq('tenant_id', TENANT_ID);
console.log('Periods:', periods?.length);
periods?.forEach(p => console.log('  ', p.label || p.id, p.start_date, '→', p.end_date));

// Committed data
const { count: cdCount } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
console.log('Committed data rows:', cdCount);

// Import batches
const { data: imports } = await sb.from('import_batches').select('*').eq('tenant_id', TENANT_ID);
console.log('Import batches:', imports?.length);
imports?.forEach(ib => console.log('  ', ib.file_name, ib.status, ib.row_count));
"
```

**Expected:** ~719 entities, 3 periods (Jan/Feb/Mar 2024), committed_data with source records.

### 2D: Verify Entity Quality

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT_ID = 'TENANT_ID_HERE';

const { data: entities } = await sb.from('entities').select('external_id, display_name, entity_type, metadata')
  .eq('tenant_id', TENANT_ID).limit(10);

console.log('Sample entities (first 10):');
entities?.forEach(e => console.log('  ', e.external_id, '|', e.display_name, '|', e.entity_type, '|', JSON.stringify(e.metadata || {}).substring(0, 80)));
"
```

**Verify:** External IDs are employee numbers (not UUIDs), display names are human-readable, entity_type is 'individual' or equivalent.

**Commit:** `OB-88 Mission 2: Data import — entities, periods, committed_data verified`

---

## MISSION 3: CALCULATE

### 3A: Find the Calculation Trigger

```bash
echo "=== CALCULATION ENTRY POINTS ==="
find web/src -path "*calculate*" -name "page.tsx" -type f | head -10
grep -rn "runCalculation\|executeCalculation\|triggerCalc\|createBatch" web/src/ --include="*.ts" --include="*.tsx" -l | head -15
echo ""
echo "=== CALCULATION API ROUTES ==="
find web/src/app/api -path "*calc*" -type f | head -10
```

### 3B: Execute Calculation for January 2024

Navigate to the calculate page. Select:
- **Period:** January 2024
- **Rule Set:** The rule set created in Mission 1

Trigger the calculation. If the UI doesn't provide this flow, use the API:

```bash
echo "=== API CALCULATION ENDPOINT ==="
grep -rn "route.ts" web/src/app/api/calculation/ --include="*.ts" -l 2>/dev/null || \
grep -rn "route.ts" web/src/app/api/calc/ --include="*.ts" -l 2>/dev/null || \
find web/src/app/api -path "*calc*route*" -type f | head -5
```

### 3C: Verify Calculation Results

After calculation completes, verify results:

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT_ID = 'TENANT_ID_HERE';

// Calculation batches
const { data: batches } = await sb.from('calculation_batches').select('*').eq('tenant_id', TENANT_ID);
console.log('Calculation batches:', batches?.length);
batches?.forEach(b => {
  console.log('  ID:', b.id);
  console.log('  Period:', b.period_id);
  console.log('  State:', b.lifecycle_state);
  console.log('  Entity count:', b.entity_count);
  console.log('  Summary:', JSON.stringify(b.summary || {}).substring(0, 200));
});

// Calculation results
const { count: resultCount } = await sb.from('calculation_results').select('*', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
console.log('Calculation results:', resultCount);

// Sum of payouts
const { data: results } = await sb.from('calculation_results').select('total_payout').eq('tenant_id', TENANT_ID);
const totalPayout = results?.reduce((sum, r) => sum + (parseFloat(r.total_payout) || 0), 0);
console.log('VL Total Payout: MX$' + totalPayout?.toLocaleString());
console.log('Benchmark Total: MX$1,253,832');
console.log('Delta: MX$' + (totalPayout - 1253832)?.toLocaleString());
console.log('Delta %:', ((totalPayout - 1253832) / 1253832 * 100).toFixed(2) + '%');

// Non-zero check
const zeroPayouts = results?.filter(r => parseFloat(r.total_payout) === 0).length;
console.log('Zero payouts:', zeroPayouts, 'of', results?.length);
"
```

**Expected:** 719 calculation results, total near MX$1,253,832, zero or minimal zero-payout entities.

### 3D: Component-Level Verification

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT_ID = 'TENANT_ID_HERE';

const { data: results } = await sb.from('calculation_results').select('components').eq('tenant_id', TENANT_ID);

// Aggregate components
const componentTotals = {};
results?.forEach(r => {
  const comps = r.components || {};
  for (const [name, value] of Object.entries(comps)) {
    const amount = typeof value === 'object' ? (value.amount || value.payout || 0) : (parseFloat(value) || 0);
    componentTotals[name] = (componentTotals[name] || 0) + amount;
  }
});

console.log('Component Totals:');
let grandTotal = 0;
for (const [name, total] of Object.entries(componentTotals).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + name.padEnd(30), 'MX$' + total.toLocaleString());
  grandTotal += total;
}
console.log('  ' + 'TOTAL'.padEnd(30), 'MX$' + grandTotal.toLocaleString());

console.log('');
console.log('Benchmark Component Totals:');
console.log('  Optical Sales:              MX$505,750');
console.log('  Store Sales:                MX$129,200');
console.log('  New Customers:              MX$207,200');
console.log('  Collections:                MX$214,400');
console.log('  Insurance:                  MX$46,032');
console.log('  Warranty:                   MX$151,250');
console.log('  TOTAL:                      MX$1,253,832');
"
```

**This is the definitive accuracy test.** Compare each component against benchmark.

**Commit:** `OB-88 Mission 3: Calculation executed — [ACTUAL DELTA]% vs benchmark`

---

## MISSION 4: RECONCILIATION (OB-87 Feature Test)

This tests the newly built OB-87 Reconciliation Intelligence on fresh data.

### 4A: Navigate to Reconciliation

Navigate to the reconciliation page (likely `/investigate/reconciliation`). The OB-87 rewrite should present a 4-step workflow: Select Batch → Upload → Analyze → Results.

### 4B: Upload Benchmark File

Select the calculation batch from Mission 3. Upload `RetailCo data results.xlsx`.

**What OB-87 should produce:**

1. **Depth Assessment:** Entity Match ✅, Total Payout ✅, Period (Mes + Año) ✅, Components (6 columns) 🔍
2. **Period Matching:** 3 periods detected (Jan/Feb/Mar 2024), only Jan 2024 comparable
3. **Period Filtering:** 1,438 rows excluded (Feb + Mar), 719 rows used
4. **Comparison at depth:** Total + component level

### 4C: Programmatic Reconciliation (if UI flow is incomplete)

If the UI doesn't provide the complete 4-step flow, use the OB-87 API endpoints:

```bash
echo "=== RECONCILIATION API ROUTES ==="
ls web/src/app/api/reconciliation/ 2>/dev/null
cat web/src/app/api/reconciliation/analyze/route.ts | head -30
```

### 4D: Verify Reconciliation Results

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT_ID = 'TENANT_ID_HERE';

// Reconciliation sessions
const { data: sessions } = await sb.from('reconciliation_sessions').select('*').eq('tenant_id', TENANT_ID);
console.log('Reconciliation sessions:', sessions?.length);
sessions?.forEach(s => {
  const summary = s.summary || {};
  console.log('  Benchmark:', s.benchmark_filename);
  console.log('  Periods compared:', s.periods_compared);
  console.log('  Depth achieved:', s.depth_achieved);
  console.log('  Match rate:', summary.matchRate);
  console.log('  VL Total:', summary.vlTotal);
  console.log('  Benchmark Total:', summary.benchmarkTotal);
  console.log('  Delta:', summary.deltaPercent + '%');
  console.log('  False greens:', summary.falseGreenCount);
});
"
```

**Commit:** `OB-88 Mission 4: Reconciliation executed — OB-87 discoverable depth verified`

---

## MISSION 5: ACCURACY REPORT

### 5A: Generate Comprehensive Accuracy Report

Create `OB-88_ACCURACY_REPORT.md` at PROJECT ROOT with:

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT_ID = 'TENANT_ID_HERE';

// Fetch all data
const { data: results } = await sb.from('calculation_results')
  .select('entity_id, total_payout, components, metrics, attainment')
  .eq('tenant_id', TENANT_ID);

const { data: entities } = await sb.from('entities')
  .select('id, external_id, display_name, metadata')
  .eq('tenant_id', TENANT_ID);

const entityMap = {};
entities?.forEach(e => entityMap[e.id] = e);

// Build report
let report = '# OB-88 ACCURACY REPORT\\n';
report += '## Clean Tenant Pipeline Proof — Pipeline Proof Co\\n';
report += '## ' + new Date().toISOString().split('T')[0] + '\\n\\n';

report += '## Summary\\n';
const totalPayout = results?.reduce((s, r) => s + parseFloat(r.total_payout), 0);
const benchmark = 1253832;
const delta = ((totalPayout - benchmark) / benchmark * 100);
report += '| Metric | Value |\\n';
report += '|--------|-------|\\n';
report += '| Entities calculated | ' + results?.length + ' |\\n';
report += '| VL Total | MX\$' + totalPayout?.toLocaleString() + ' |\\n';
report += '| Benchmark Total | MX\$1,253,832 |\\n';
report += '| Delta | ' + delta.toFixed(2) + '% |\\n';
report += '| Zero-payout entities | ' + results?.filter(r => parseFloat(r.total_payout) === 0).length + ' |\\n\\n';

// Component totals
const compTotals = {};
results?.forEach(r => {
  const comps = r.components || {};
  for (const [name, val] of Object.entries(comps)) {
    const amt = typeof val === 'object' ? (val.amount || val.payout || 0) : (parseFloat(val) || 0);
    compTotals[name] = (compTotals[name] || 0) + amt;
  }
});

report += '## Component Accuracy\\n';
report += '| Component | VL | Benchmark | Delta % |\\n';
report += '|-----------|-----|-----------|---------|\\n';
const benchComps = { 'Optical Sales': 505750, 'Store Sales': 129200, 'New Customers': 207200, 'Collections': 214400, 'Insurance': 46032, 'Warranty': 151250 };
for (const [name, benchVal] of Object.entries(benchComps)) {
  // Find matching VL component (fuzzy)
  const vlKey = Object.keys(compTotals).find(k => k.toLowerCase().includes(name.split(' ')[0].toLowerCase())) || name;
  const vlVal = compTotals[vlKey] || 0;
  const compDelta = benchVal > 0 ? ((vlVal - benchVal) / benchVal * 100).toFixed(2) : 'N/A';
  report += '| ' + name + ' | MX\$' + vlVal.toLocaleString() + ' | MX\$' + benchVal.toLocaleString() + ' | ' + compDelta + '% |\\n';
}

// Top 10 biggest deltas (entity level)
// ... would need benchmark file parsing here — skip for now, reconciliation session has this

report += '\\n## Pipeline Steps Completed\\n';
report += '| Step | Status |\\n';
report += '|------|--------|\\n';
report += '| Clean tenant created | ✅ |\\n';
report += '| Plan imported | ✅ |\\n';
report += '| Data imported | ✅ |\\n';
report += '| Calculation executed | ✅ |\\n';
report += '| Reconciliation executed | ✅ |\\n';

fs.writeFileSync('OB-88_ACCURACY_REPORT.md', report.replace(/\\\\n/g, '\\n'));
console.log('Report written to OB-88_ACCURACY_REPORT.md');
console.log('Delta:', delta.toFixed(2) + '%');
"
```

### 5B: Accuracy Assessment

Based on the report:

| Delta | Assessment | Action |
|-------|------------|--------|
| <1% | **EXCELLENT** — Production-ready | Document and celebrate |
| 1-5% | **GOOD** — Viable with known tolerances | Document component-level gaps, plan R7 fix if needed |
| 5-15% | **NEEDS WORK** — Specific components off | Identify which components and formulas need correction |
| >15% | **PIPELINE ISSUE** — Something broke | Diagnose: entity count, period filter, formula errors |

**Commit:** `OB-88 Mission 5: Accuracy report generated — [DELTA]%`

---

## MISSION 6: DIAGNOSIS AND FIX (IF DELTA > 5%)

**Only execute this mission if the accuracy delta exceeds 5%.** If delta is ≤5%, skip to Mission 7.

### 6A: Identify Problem Components

From the accuracy report, identify which components have the largest deltas. For each problem component:

1. Check rule set: does the formula match the plan?
2. Check committed data: does the source data have the expected values?
3. Check entity resolution: are entities correctly linked to their data?
4. Check period filtering: is January 2024 data correctly isolated?

### 6B: Fix and Re-calculate

If formula issues are found:
1. Fix the calculation engine logic (NOT the data, NOT the expected values)
2. Delete the calculation batch for this tenant
3. Re-run the calculation
4. Re-run the accuracy check

**Rule: Fix logic, not data. Never hardcode expected outputs.**

### 6C: Re-run Reconciliation

After fixing and recalculating:
1. Delete previous reconciliation sessions for this tenant
2. Re-run reconciliation with benchmark file
3. Update accuracy report with new delta

**Commit:** `OB-88 Mission 6: Calculation fix — [NEW DELTA]% (from [OLD DELTA]%)`

---

## MISSION 7: BUILD + COMPLETION

### 7A: Build Verification

```bash
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build
npm run dev &
sleep 10
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

### 7B: Completion Report

Create `OB-88_COMPLETION_REPORT.md` at PROJECT ROOT:

1. Clean tenant verification (zero starting data)
2. Plan import results (components extracted, rule set created)
3. Data import results (entity count, period count, committed_data volume)
4. Calculation results (total payout, component breakdown, zero-payout count)
5. Reconciliation results (match rate, delta, false green count, depth achieved)
6. Accuracy report (overall delta, per-component deltas)
7. Classification signals generated during pipeline
8. All proof gates with PASS/FAIL and evidence

### 7C: PR

```bash
gh pr create --base main --head dev \
  --title "OB-88: End-to-End Pipeline Accuracy Proof — Clean Tenant" \
  --body "## Clean Room Pipeline Proof

### What This Proves
Complete pipeline on a clean tenant with zero accumulated debris:
Plan Import → Data Import → Calculate → Reconcile → Accuracy Report

### Ground Truth
- 719 employees, January 2024
- MX\$1,253,832 benchmark (independently verified in CLT-14B)
- 6 components: Optical Sales, Store Sales, New Customers, Collections, Insurance, Warranty

### Results
[DELTA]% overall accuracy
[ENTITY_COUNT] entities calculated
[FALSE_GREEN_COUNT] false greens detected
[DEPTH] reconciliation depth achieved

### Pipeline Steps
- Clean tenant: Pipeline Proof Co
- Plan import: RetailCorp_Plan1.pptx → 6-component rule set
- Data import: 119K records → entities + committed_data
- Calculation: January 2024
- Reconciliation: OB-87 discoverable depth with period awareness

## Proof Gates: see OB-88_COMPLETION_REPORT.md"
```

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Clean tenant created | Pipeline Proof Co with zero data |
| PG-2 | Auth user works | admin@pipelineproof.mx can log in |
| PG-3 | Plan imported | Rule set with 6 components created |
| PG-4 | Plan has cert/non-cert variants | Two variant paths per component |
| PG-5 | Data imported | ~719 entities created |
| PG-6 | Periods detected | January 2024 (at minimum) |
| PG-7 | Committed data present | Source records in committed_data table |
| PG-8 | Calculation executed | calculation_batch created with results |
| PG-9 | 719 calculation results | One per entity |
| PG-10 | Zero or minimal zero-payouts | <5% zero-payout entities |
| PG-11 | Total payout within range | VL total vs benchmark delta documented |
| PG-12 | All 6 components produce values | No component with $0 total |
| PG-13 | Reconciliation executed | Using OB-87 discoverable depth engine |
| PG-14 | Period filtering works | Benchmark filtered to January 2024 (719 of 2,157 rows) |
| PG-15 | Entity matching | 719/719 entity match |
| PG-16 | False green detection | False greens surfaced if any exist |
| PG-17 | Accuracy report generated | OB-88_ACCURACY_REPORT.md with per-component breakdown |
| PG-18 | Classification signals captured | Signals from plan import + data import + reconciliation |
| PG-19 | Korean Test | Zero hardcoded field names in any new code |
| PG-20 | npm run build exits 0 | Clean build |
| PG-21 | localhost:3000 responds | HTTP 200/307 |
| PG-22 | Completion report committed | OB-88_COMPLETION_REPORT.md |

---

## CC FAILURE PATTERN WARNING

| Pattern | What Happened Before | What To Do Instead |
|---------|---------------------|-------------------|
| Dirty tenant data | OB-85 R3: entity UUID fragmentation from multiple imports on same tenant | Phase 0 creates a CLEAN tenant. Zero accumulated debris. |
| Period overcounting | Benchmark has 3 months. Comparing against all 3 produced phantom 48.73% delta | OB-87 period filtering should handle this. Verify. |
| Supabase batch limit | .in() with >200 UUIDs returns 0 rows | Batch ≤200. Verify in all queries. |
| Formula overcorrection | OB-85 R4 killed 3 component pipes while fixing formulas | Mission 6 is surgical: identify specific problem, fix only that |
| Theory-first coding | Assumed pipeline worked without running it | This entire OB is an execution test, not a build |

---

## WHAT THIS OB DOES NOT BUILD

- Demo persona switcher fix (Track A — separate OB)
- Navigation cleanup (separate OB)
- UX improvements (separate OB)
- New features of any kind

This OB ONLY proves the pipeline works end-to-end on clean data. It creates a tenant, runs the pipeline, and reports accuracy. Any code changes are limited to fixing bugs discovered during the pipeline run.

---

*OB-88 — February 24, 2026*
*"The pipeline has never been proven from first login to final reconciliation on a clean tenant. Today it is."*
*"Ground truth: 719 employees, MX$1,253,832, 6 components. Every number is known. The engine either gets it right or it doesn't."*
