# OB-126: LAB RECALCULATION + CC-UAT-06 FORENSIC VERIFICATION

## Target: alpha.2.0 — Engine Proof
## Depends on: OB-123 (PR #139), OB-124 (PR #141), HF-081 (PR #140), HF-082 (PR #142), OB-125 (PR #143)
## Source: CC-UAT-05 stale results (400 rows under 100 assignments), HF-082 assignment change (100→67)

## READ FIRST — IN THIS ORDER
1. `CC_STANDING_ARCHITECTURE_RULES.md` — ALL sections
2. `SCHEMA_REFERENCE.md` — calculation_results, calculation_batches, committed_data, rule_set_assignments, rule_sets
3. `CC_UAT_05_FORENSIC_WIRING_TRACE.md` — The baseline. Know every finding.
4. `HF-082_COMPLETION_REPORT.md` — What changed (100→67 assignments, token overlap matching)
5. `OB-124_COMPLETION_REPORT.md` — Multi-tab XLSX distinct data_types
6. This entire prompt before executing

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases, paste all output, commit per phase.

## STANDING RULES
- After EVERY commit: `git push origin dev`
- After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
- Git commands from repo root (`/Users/AndrewAfrica/spm-platform`)
- DO NOT MODIFY ANY AUTH FILE
- Supabase `.in()` ≤ 200 items
- Evidence = paste, not describe
- One commit per phase
- **FIX LOGIC NOT DATA** — do not manually insert or modify calculation_results, committed_data, or rule_sets

---

## WHY THIS OB EXISTS

Three engine fixes have been applied since the last calculation:
1. **OB-124** — Multi-tab XLSX produces distinct data_types per tab (`deposit_growth__account_balances` vs `deposit_growth__growth_targets`)
2. **HF-082** — License-based assignment reduced LAB from 100 to 67 assignments. Officers with 2 licenses get 2 plans, not 4.
3. **HF-081** — Mortgage source_pattern normalized, Consumer Lending count→sum fixed

LAB's 400 calculation results were computed under the OLD state (100 assignments, pre-normalization bindings). They are stale. We need to:
1. Delete stale results
2. Recalculate with current state
3. Run a forensic trace to verify what changed
4. Compare against CC-UAT-05 baseline

This is a pure engine verification OB. No UI changes. No new features. Prove the fixes work.

---

## SCOPE BOUNDARIES

### IN SCOPE
- Delete stale LAB calculation results and batches
- Trigger recalculation for all 4 LAB plans
- Run CC-UAT-06 forensic trace (8-layer verification)
- Compare results against CC-UAT-05 baseline
- Identify remaining gaps

### OUT OF SCOPE — DO NOT TOUCH
- UI changes (separate OB)
- MBC data (regression check only — read, don't write)
- Auth files
- Wire API code (already fixed)
- Committed_data (already correct)
- Re-importing Deposit Growth Tab 2 (requires UI flow, not this OB)

---

## PHASE 0: PRE-CALCULATION STATE SNAPSHOT

Before deleting anything, capture the current state for comparison.

```bash
cd /Users/AndrewAfrica/spm-platform

echo "╔══════════════════════════════════════════════════════╗"
echo "║  OB-126 PHASE 0: PRE-RECALCULATION SNAPSHOT         ║"
echo "╚══════════════════════════════════════════════════════╝"

npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';
const MBC = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

console.log('=== LAB PRE-RECALCULATION STATE ===');

// Entities
const { count: entityCount } = await sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', LAB);
console.log('Entities:', entityCount);

// Assignments
const { data: assignments } = await sb.from('rule_set_assignments')
  .select('*, rule_sets!inner(name)')
  .eq('tenant_id', LAB);
const byPlan: Record<string, number> = {};
for (const a of assignments || []) byPlan[(a as any).rule_sets?.name] = (byPlan[(a as any).rule_sets?.name] || 0) + 1;
console.log('Assignments:', assignments?.length);
for (const [p, c] of Object.entries(byPlan).sort()) console.log('  ', p, ':', c);

// Periods
const { data: periods } = await sb.from('periods').select('label, start_date, end_date').eq('tenant_id', LAB);
console.log('Periods:', periods?.length);
periods?.forEach(p => console.log('  ', p.label || p.start_date, '→', p.end_date));

// Committed data
const { data: cdTypes } = await sb.from('committed_data').select('data_type').eq('tenant_id', LAB);
const typeCount: Record<string, number> = {};
for (const r of cdTypes || []) typeCount[r.data_type] = (typeCount[r.data_type] || 0) + 1;
console.log('Committed data:', cdTypes?.length, 'rows');
for (const [t, c] of Object.entries(typeCount).sort()) console.log('  ', t, ':', c);

// Rule sets + input_bindings
const { data: ruleSets } = await sb.from('rule_sets')
  .select('name, status, input_bindings, components')
  .eq('tenant_id', LAB).eq('status', 'active');
console.log('\\nActive rule sets:', ruleSets?.length);
for (const rs of ruleSets || []) {
  const bindings = rs.input_bindings || {};
  const derivations = bindings.metric_derivations || [];
  const componentCount = (rs.components || []).length;
  console.log('  ', rs.name);
  console.log('    Components:', componentCount);
  console.log('    Derivations:', derivations.length);
  for (const d of derivations) {
    console.log('      ', d.metricName || d.metric, '→', d.operation, 'on', d.source_pattern, '.', d.source_field || '');
  }
}

// Current stale results
const { data: results } = await sb.from('calculation_results')
  .select('rule_set_id, total_payout')
  .eq('tenant_id', LAB);
console.log('\\nCurrent (stale) results:', results?.length);

const byRsId: Record<string, { count: number; total: number }> = {};
for (const r of results || []) {
  if (!byRsId[r.rule_set_id]) byRsId[r.rule_set_id] = { count: 0, total: 0 };
  byRsId[r.rule_set_id].count++;
  byRsId[r.rule_set_id].total += Number(r.total_payout) || 0;
}

for (const rs of ruleSets || []) {
  const stats = byRsId[rs.name] || { count: 0, total: 0 };
  // Find by matching rule_set name to ID
  const rsResults = (results || []).filter(r => {
    // We need the actual rule_set_id mapping
    return true; // Will refine below
  });
}

// Simpler: group by rule_set_id and resolve names
const { data: rsMap } = await sb.from('rule_sets').select('id, name').eq('tenant_id', LAB).eq('status', 'active');
const idToName: Record<string, string> = {};
for (const rs of rsMap || []) idToName[rs.id] = rs.name;

const planTotals: Record<string, { count: number; total: number; nonZero: number }> = {};
for (const r of results || []) {
  const name = idToName[r.rule_set_id] || r.rule_set_id.slice(0, 8);
  if (!planTotals[name]) planTotals[name] = { count: 0, total: 0, nonZero: 0 };
  planTotals[name].count++;
  planTotals[name].total += Number(r.total_payout) || 0;
  if (Number(r.total_payout) > 0) planTotals[name].nonZero++;
}

for (const [plan, stats] of Object.entries(planTotals).sort()) {
  console.log('  ', plan, ': ', stats.count, 'results,', stats.nonZero, 'non-zero, \$' + stats.total.toFixed(2));
}

const grandTotal = Object.values(planTotals).reduce((s, p) => s + p.total, 0);
console.log('  Grand total: \$' + grandTotal.toFixed(2));
console.log('  (CC-UAT-05 baseline: \$9,337,311.77 with 400 results under 100 assignments)');

console.log('\\n=== MBC REGRESSION BASELINE ===');
const { data: mbcResults } = await sb.from('calculation_results').select('total_payout').eq('tenant_id', MBC);
const mbcTotal = (mbcResults || []).reduce((s, r) => s + (Number(r.total_payout) || 0), 0);
const { count: mbcAssign } = await sb.from('rule_set_assignments').select('*', { count: 'exact', head: true }).eq('tenant_id', MBC);
console.log('MBC results:', mbcResults?.length);
console.log('MBC assignments:', mbcAssign);
console.log('MBC total: \$' + mbcTotal.toFixed(2));
"
```

**PASTE ALL OUTPUT.**

**Commit:** `OB-126 Phase 0: Pre-recalculation state snapshot`

---

## PHASE 1: DELETE STALE LAB RESULTS

Delete ALL calculation_results and calculation_batches for LAB. These were computed under 100 assignments. With 67 assignments, the result set will be smaller and different.

```bash
cd /Users/AndrewAfrica/spm-platform

npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';

// Count before
const { count: resultsBefore } = await sb.from('calculation_results')
  .select('*', { count: 'exact', head: true }).eq('tenant_id', LAB);
const { count: batchesBefore } = await sb.from('calculation_batches')
  .select('*', { count: 'exact', head: true }).eq('tenant_id', LAB);

console.log('Before deletion:');
console.log('  Results:', resultsBefore);
console.log('  Batches:', batchesBefore);

// Delete results first (FK dependency)
const { error: resErr } = await sb.from('calculation_results').delete().eq('tenant_id', LAB);
if (resErr) { console.error('Results DELETE failed:', resErr); process.exit(1); }

const { error: batchErr } = await sb.from('calculation_batches').delete().eq('tenant_id', LAB);
if (batchErr) { console.error('Batches DELETE failed:', batchErr); process.exit(1); }

// Verify
const { count: resultsAfter } = await sb.from('calculation_results')
  .select('*', { count: 'exact', head: true }).eq('tenant_id', LAB);
const { count: batchesAfter } = await sb.from('calculation_batches')
  .select('*', { count: 'exact', head: true }).eq('tenant_id', LAB);

console.log('After deletion:');
console.log('  Results:', resultsAfter, '(should be 0)');
console.log('  Batches:', batchesAfter, '(should be 0)');
console.log('VERDICT:', (resultsAfter === 0 && batchesAfter === 0) ? 'PASS — clean slate' : 'FAIL');
"
```

**PASTE OUTPUT.**

**Commit:** `OB-126 Phase 1: Delete stale LAB results (400 rows from 100-assignment era)`

---

## PHASE 2: RECALCULATE ALL LAB PLANS

Trigger calculation for all 4 LAB plans across all periods. This must use the platform's calculation engine — not a script that writes results directly.

### 2A: Start dev server and trigger calculation

```bash
cd /Users/AndrewAfrica/spm-platform/web
npm run dev &
sleep 15

# Trigger calculation via the API (or the calculate page endpoint)
# Find the calculation trigger endpoint
grep -rn "api.*calculate\|calculate.*route\|runCalculation\|triggerCalculation" \
  web/src/app/api/ --include="*.ts" | head -15
```

### 2B: Trigger for each plan and period

The calculation trigger depends on what the API expects. Common patterns:
- POST `/api/calculate` with `{ tenant_id, rule_set_id, period_id }`
- POST `/api/calculate/all` with `{ tenant_id }`

Find the correct endpoint from 2A and call it for each plan × period combination. If a "Calculate All" endpoint exists, use that.

```bash
# After identifying the endpoint, call it
# Example (adjust based on actual API):
curl -s -X POST http://localhost:3000/api/calculate \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "a630404c-0777-4f6d-b760-b8a190ecd63c"}' | head -200
```

If the API requires individual plan+period calls, iterate:

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';

const { data: plans } = await sb.from('rule_sets').select('id, name').eq('tenant_id', LAB).eq('status', 'active');
const { data: periods } = await sb.from('periods').select('id, label, start_date').eq('tenant_id', LAB);

console.log('Plans to calculate:');
for (const p of plans || []) console.log('  ', p.name, p.id);
console.log('Periods:');
for (const p of periods || []) console.log('  ', p.label || p.start_date, p.id);

// Call calculate endpoint for each combination
for (const plan of plans || []) {
  for (const period of periods || []) {
    console.log(\`\\nCalculating: \${plan.name} × \${period.label || period.start_date}\`);
    try {
      const res = await fetch('http://localhost:3000/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: LAB, rule_set_id: plan.id, period_id: period.id }),
      });
      const data = await res.json();
      console.log('  Status:', res.status, '| Result:', JSON.stringify(data).slice(0, 200));
    } catch (err) {
      console.error('  ERROR:', err);
    }
  }
}
"
```

### 2C: Verify results were created

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';

const { count } = await sb.from('calculation_results')
  .select('*', { count: 'exact', head: true }).eq('tenant_id', LAB);
console.log('New results count:', count);
console.log('Expected: < 400 (was 400 under 100 assignments, now 67 assignments)');
console.log('Expected per plan: CL=25×periods, MO=14×periods, IR=16×periods, DG=12×periods');
"
```

**PASTE ALL OUTPUT.**

Kill the dev server after calculation completes:
```bash
kill $(lsof -ti:3000) 2>/dev/null || true
```

**Commit:** `OB-126 Phase 2: Recalculate all LAB plans with 67 assignments`

---

## PHASE 3: CC-UAT-06 — FORENSIC TRACE

This is the proof. 8-layer verification matching CC-UAT-05 format.

```bash
cd /Users/AndrewAfrica/spm-platform

npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';
const MBC = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║  CC-UAT-06: POST OB-124/HF-082/OB-125 FORENSIC TRACE ║');
console.log('╚══════════════════════════════════════════════════════╝');

// ============================================================
// LAYER 0: TENANT STATE
// ============================================================
console.log('\\n═══ LAYER 0: TENANT STATE ═══');
const { count: entityCount } = await sb.from('entities').select('*', { count:'exact', head:true }).eq('tenant_id', LAB);
const { count: assignCount } = await sb.from('rule_set_assignments').select('*', { count:'exact', head:true }).eq('tenant_id', LAB);
const { count: cdCount } = await sb.from('committed_data').select('*', { count:'exact', head:true }).eq('tenant_id', LAB);
const { count: resultCount } = await sb.from('calculation_results').select('*', { count:'exact', head:true }).eq('tenant_id', LAB);
const { count: periodCount } = await sb.from('periods').select('*', { count:'exact', head:true }).eq('tenant_id', LAB);

console.log('Entities:', entityCount);
console.log('Assignments:', assignCount, '(was 100 in UAT-05, now 67 after HF-082)');
console.log('Committed data:', cdCount);
console.log('Periods:', periodCount);
console.log('Calculation results:', resultCount, '(was 400 in UAT-05)');

// ============================================================
// LAYER 1: ENTITY + LICENSE VERIFICATION
// ============================================================
console.log('\\n═══ LAYER 1: ENTITY + LICENSE VERIFICATION ═══');
const { data: entities } = await sb.from('entities')
  .select('id, external_id, display_name, metadata').eq('tenant_id', LAB);

let withLicenses = 0;
const licenseDistro: Record<string, number> = {};
for (const e of entities || []) {
  const lic = e.metadata?.product_licenses || '';
  if (lic) {
    withLicenses++;
    for (const l of String(lic).split(',').map((s: string) => s.trim())) {
      licenseDistro[l] = (licenseDistro[l] || 0) + 1;
    }
  }
}
console.log('Entities with licenses:', withLicenses + '/' + entityCount);
console.log('License distribution:');
for (const [l, c] of Object.entries(licenseDistro).sort()) console.log('  ', l, ':', c);

// ============================================================
// LAYER 2: ASSIGNMENT VERIFICATION
// ============================================================
console.log('\\n═══ LAYER 2: ASSIGNMENT VERIFICATION ═══');
const { data: allAssignments } = await sb.from('rule_set_assignments')
  .select('entity_id, rule_set_id, rule_sets!inner(name), entities!inner(external_id, metadata)')
  .eq('tenant_id', LAB);

const planAssignments: Record<string, number> = {};
const entityAssignments: Record<string, { count: number; licenses: string; plans: string[] }> = {};

for (const a of allAssignments || []) {
  const plan = (a as any).rule_sets?.name;
  const ext = (a as any).entities?.external_id;
  const lic = (a as any).entities?.metadata?.product_licenses || '';
  
  planAssignments[plan] = (planAssignments[plan] || 0) + 1;
  if (!entityAssignments[ext]) entityAssignments[ext] = { count: 0, licenses: lic, plans: [] };
  entityAssignments[ext].count++;
  entityAssignments[ext].plans.push(plan);
}

console.log('Assignments per plan:');
for (const [p, c] of Object.entries(planAssignments).sort()) console.log('  ', p, ':', c);
console.log('Total:', allAssignments?.length);

const assignCounts = Object.values(entityAssignments).map(e => e.count);
const min = Math.min(...assignCounts), max = Math.max(...assignCounts);
console.log('Assignment range per entity:', min, '-', max);
console.log('Full-coverage fallback:', min === max && max === Object.keys(planAssignments).length ? 'DETECTED ⚠️' : 'NOT DETECTED ✓');

// Mismatch check
let mismatches = 0;
for (const [ext, info] of Object.entries(entityAssignments)) {
  const licCount = String(info.licenses).split(',').map(s => s.trim()).filter(s => s.length > 0).length;
  if (licCount !== info.count) {
    mismatches++;
    if (mismatches <= 3) console.log('  MISMATCH:', ext, 'has', licCount, 'licenses but', info.count, 'assignments');
  }
}
console.log('License↔assignment mismatches:', mismatches + '/' + Object.keys(entityAssignments).length);

// ============================================================
// LAYER 3: INPUT BINDINGS + CONVERGENCE
// ============================================================
console.log('\\n═══ LAYER 3: INPUT BINDINGS + CONVERGENCE ═══');
const { data: ruleSets } = await sb.from('rule_sets')
  .select('id, name, input_bindings, components')
  .eq('tenant_id', LAB).eq('status', 'active');

for (const rs of ruleSets || []) {
  const bindings = rs.input_bindings || {};
  const derivations = bindings.metric_derivations || [];
  const componentCount = (rs.components || []).length;
  console.log('\\n  Plan:', rs.name);
  console.log('  Components:', componentCount);
  console.log('  Derivations:', derivations.length);
  for (const d of derivations) {
    console.log('    ', d.metricName || d.metric, '→', d.operation, 'on', d.source_pattern, 
      d.source_field ? '.' + d.source_field : '', 
      d.filters ? '(filters: ' + d.filters.length + ')' : '');
    
    // Check: does source_pattern exist in committed_data?
    const { count: matchCount } = await sb.from('committed_data')
      .select('*', { count:'exact', head:true })
      .eq('tenant_id', LAB).eq('data_type', d.source_pattern);
    console.log('      source_pattern match:', matchCount, 'rows', matchCount === 0 ? '⚠️ NO DATA' : '✓');
  }
}

// ============================================================
// LAYER 4: COMMITTED DATA TYPES
// ============================================================
console.log('\\n═══ LAYER 4: COMMITTED DATA ═══');
const { data: cdAll } = await sb.from('committed_data').select('data_type').eq('tenant_id', LAB);
const dtCount: Record<string, number> = {};
for (const r of cdAll || []) dtCount[r.data_type] = (dtCount[r.data_type] || 0) + 1;
for (const [t, c] of Object.entries(dtCount).sort()) console.log('  ', t, ':', c, 'rows');
console.log('Total:', cdAll?.length);

// Check for multi-tab data types (OB-124)
const multiTab = Object.keys(dtCount).filter(k => k.includes('__'));
console.log('Multi-tab data_types (OB-124):', multiTab.length > 0 ? multiTab.join(', ') : 'NONE — Tab 2 not yet re-imported');

// ============================================================
// LAYER 5: CALCULATION RESULTS
// ============================================================
console.log('\\n═══ LAYER 5: CALCULATION RESULTS ═══');
const { data: allResults } = await sb.from('calculation_results')
  .select('rule_set_id, entity_id, total_payout, period_id, component_results')
  .eq('tenant_id', LAB);

const idToName: Record<string, string> = {};
for (const rs of ruleSets || []) idToName[rs.id] = rs.name;

const planResults: Record<string, { count: number; total: number; nonZero: number; max: number; min: number }> = {};
for (const r of allResults || []) {
  const name = idToName[r.rule_set_id] || r.rule_set_id.slice(0, 8);
  if (!planResults[name]) planResults[name] = { count: 0, total: 0, nonZero: 0, max: 0, min: Infinity };
  const payout = Number(r.total_payout) || 0;
  planResults[name].count++;
  planResults[name].total += payout;
  if (payout > 0) planResults[name].nonZero++;
  planResults[name].max = Math.max(planResults[name].max, payout);
  planResults[name].min = Math.min(planResults[name].min, payout);
}

console.log('\\n| Plan | Results | Non-zero | Total | Max | Issue |');
console.log('|------|---------|----------|-------|-----|-------|');
for (const [plan, stats] of Object.entries(planResults).sort()) {
  const issue = stats.total === 0 ? '**ALL ZERO**' :
    stats.max === stats.min && stats.nonZero > 1 ? '**UNIFORM — suspect**' :
    stats.nonZero < stats.count * 0.1 ? '**LOW HIT RATE**' : 'OK';
  console.log('|', plan, '|', stats.count, '|', stats.nonZero, '| \$' + stats.total.toFixed(2), '| \$' + stats.max.toFixed(2), '|', issue, '|');
}

const grandTotal = Object.values(planResults).reduce((s, p) => s + p.total, 0);
console.log('\\nGrand total: \$' + grandTotal.toFixed(2));
console.log('Total results:', allResults?.length);
console.log('');
console.log('CC-UAT-05 comparison:');
console.log('  UAT-05 results: 400 (100 assignments × 4 plans)');
console.log('  UAT-06 results:', allResults?.length, '(67 assignments, variable per plan)');
console.log('  UAT-05 total: \$9,337,311.77');
console.log('  UAT-06 total: \$' + grandTotal.toFixed(2));
console.log('  Delta: \$' + (grandTotal - 9337311.77).toFixed(2));

// ============================================================
// LAYER 6: OFFICER 1001 ENTITY TRACE
// ============================================================
console.log('\\n═══ LAYER 6: OFFICER 1001 FORENSIC TRACE ═══');
const officer1001 = (entities || []).find(e => e.external_id === '1001' || e.external_id === 1001);
if (!officer1001) {
  console.log('ERROR: Officer 1001 not found');
} else {
  console.log('Entity:', officer1001.display_name, '| ID:', officer1001.id.slice(0, 8));
  console.log('Licenses:', officer1001.metadata?.product_licenses);
  
  // Assignments
  const o1001Assigns = (allAssignments || []).filter(a => a.entity_id === officer1001.id);
  console.log('Assignments:', o1001Assigns.length);
  for (const a of o1001Assigns) console.log('  →', (a as any).rule_sets?.name);
  
  // Results
  const o1001Results = (allResults || []).filter(r => r.entity_id === officer1001.id);
  console.log('Results:', o1001Results.length);
  
  for (const r of o1001Results) {
    const planName = idToName[r.rule_set_id] || r.rule_set_id.slice(0, 8);
    const payout = Number(r.total_payout) || 0;
    console.log('  ', planName, '| \$' + payout.toFixed(2));
    
    // Component breakdown if available
    if (r.component_results && typeof r.component_results === 'object') {
      const comps = Array.isArray(r.component_results) ? r.component_results : Object.entries(r.component_results);
      for (const comp of comps) {
        if (Array.isArray(comp)) {
          console.log('    Component:', comp[0], '→ \$' + (Number(comp[1]) || 0).toFixed(2));
        } else if (typeof comp === 'object' && comp !== null) {
          console.log('    Component:', (comp as any).name || (comp as any).component, '→ \$' + (Number((comp as any).amount || (comp as any).value || (comp as any).payout) || 0).toFixed(2));
        }
      }
    }
  }
  
  const o1001Total = o1001Results.reduce((s, r) => s + (Number(r.total_payout) || 0), 0);
  console.log('Officer 1001 total: \$' + o1001Total.toFixed(2));
  console.log('');
  console.log('CC-UAT-05 Officer 1001:');
  console.log('  Insurance: \$25,350');
  console.log('  Consumer Lending: \$0.62 (count-not-sum bug — should be higher now)');
  console.log('  Deposit Growth: \$120,000 (uniform \$30K — may still be uniform without Tab 2)');
  console.log('  Mortgage: \$0.00 (source_pattern mismatch — should be > \$0 now)');
}

// ============================================================
// LAYER 7: MBC REGRESSION
// ============================================================
console.log('\\n═══ LAYER 7: MBC REGRESSION ═══');
const { data: mbcResults } = await sb.from('calculation_results').select('total_payout').eq('tenant_id', MBC);
const mbcTotal = (mbcResults || []).reduce((s, r) => s + (Number(r.total_payout) || 0), 0);
const { count: mbcAssignments } = await sb.from('rule_set_assignments').select('*', { count:'exact', head:true }).eq('tenant_id', MBC);
console.log('MBC results:', mbcResults?.length, '(expected 240)');
console.log('MBC assignments:', mbcAssignments, '(expected 80)');
console.log('MBC total: \$' + mbcTotal.toFixed(2), '(expected \$3,245,212.64)');
console.log('Delta: \$' + (mbcTotal - 3245212.64).toFixed(2));
console.log('VERDICT:', Math.abs(mbcTotal - 3245212.64) < 0.10 ? 'PASS' : 'FAIL');

// ============================================================
// LAYER 8: KOREAN TEST
// ============================================================
console.log('\\n═══ LAYER 8: KOREAN TEST ═══');
console.log('(Run separately via grep — not executable from within this script)');
console.log('Required: grep for domain vocabulary in calculation lib, wire API, convergence service');
"
```

### 3B: Korean Test (separate from trace)

```bash
echo "=== KOREAN TEST ==="
grep -rn "mortgage\|insurance\|lending\|deposit\|loan\|consumer\|referral" \
  web/src/app/api/intelligence/wire/route.ts \
  web/src/app/api/calculate/ \
  web/src/lib/calculation/ \
  --include="*.ts" 2>/dev/null | grep -v "console\|comment\|//" | grep -v node_modules | head -20
echo "Expected: 0 matches in foundational code"
```

**PASTE ALL OUTPUT FROM BOTH SCRIPTS.**

**Commit:** `OB-126 Phase 3: CC-UAT-06 forensic trace — 8-layer verification`

---

## PHASE 4: DELTA ANALYSIS

Based on Phase 3 output, document what changed between CC-UAT-05 and CC-UAT-06.

Create a comparison table:

```
CC-UAT-05 vs CC-UAT-06 DELTA ANALYSIS

| Metric                    | CC-UAT-05        | CC-UAT-06        | Delta    | Fix Source |
|---------------------------|------------------|------------------|----------|------------|
| Assignments               | 100              |                  |          | HF-082     |
| Results count             | 400              |                  |          | HF-082     |
| Consumer Lending total    | $15.48           |                  |          | HF-081     |
| Mortgage total            | $0.00            |                  |          | HF-081     |
| Insurance Referral total  | $366,600         |                  |          | —          |
| Deposit Growth total      | $1,440,000       |                  |          | OB-124*    |
| Grand total               | $9,337,311.77    |                  |          |            |
| Officer 1001 CL           | $0.62            |                  |          | HF-081     |
| Officer 1001 Mortgage     | $0.00            |                  |          | HF-081     |
| Officer 1001 DG           | $120,000         |                  |          | OB-124*    |
| Full-coverage fallback    | DETECTED         |                  |          | HF-082     |
| License mismatches        | N/A              |                  |          | HF-082     |
| Multi-tab data_types      | 0                |                  |          | OB-124*    |

* OB-124 infrastructure fix applied but Tab 2 not yet re-imported
```

Fill in the CC-UAT-06 column from Phase 3 output.

Identify:
1. **What improved** — Consumer Lending should produce real dollar amounts (not pennies). Mortgage should be > $0.
2. **What's unchanged** — Insurance Referral should be similar. Deposit Growth likely still uniform until Tab 2 import.
3. **What's new** — Fewer results (67 assignments × periods, not 100 × periods). Officers only have results for their licensed plans.
4. **What's still broken** — Document any remaining issues.

**Commit:** `OB-126 Phase 4: CC-UAT-05 vs CC-UAT-06 delta analysis`

---

## PHASE 5: BUILD + COMPLETION REPORT

```bash
cd /Users/AndrewAfrica/spm-platform
kill $(lsof -ti:3000) 2>/dev/null || true
rm -rf web/.next
cd web && npm run build && cd ..
echo "Build exit code: $?"
```

Create `OB-126_COMPLETION_REPORT.md` at project root.

### PROOF GATES

| # | Criterion | How to Verify |
|---|-----------|---------------|
| PG-01 | `npm run build` exits 0 | Paste exit code |
| PG-02 | LAB stale results deleted (was 400) | Paste delete output |
| PG-03 | LAB recalculated with 67 assignments | Paste new result count |
| PG-04 | Result count < 400 | Paste count |
| PG-05 | Consumer Lending total > $100 (was $15.48) | Paste from trace |
| PG-06 | Mortgage total > $0 (was $0.00) | Paste from trace |
| PG-07 | Officer 1001 CL > $1 (was $0.62) | Paste from trace |
| PG-08 | Officer 1001 Mortgage > $0 (was $0.00) | Paste from trace |
| PG-09 | No full-coverage fallback detected | Paste from Layer 2 |
| PG-10 | License↔assignment mismatches = 0 | Paste from Layer 2 |
| PG-11 | MBC regression: $3,245,212.64 ± $0.10 | Paste from Layer 7 |
| PG-12 | MBC results = 240, assignments = 80 | Paste from Layer 7 |
| PG-13 | No auth files modified | git diff |
| PG-14 | Delta analysis table completed | Paste comparison |

### PROOF GATES — SOFT

| # | Criterion | How to Verify |
|---|-----------|---------------|
| PG-S1 | Korean Test — 0 domain vocabulary in engine code | grep output |
| PG-S2 | Insurance Referral total within ±10% of UAT-05 ($366,600) | Paste from trace |
| PG-S3 | Component breakdown visible in Officer 1001 trace | Paste from Layer 6 |
| PG-S4 | input_bindings source_patterns match committed_data data_types | Paste from Layer 3 |

**Commit:** `OB-126 Phase 5: Build clean + completion report`

---

## FINAL: GIT PROTOCOL

```bash
cd /Users/AndrewAfrica/spm-platform
git add -A
git commit -m "OB-126 Complete: LAB recalculation + CC-UAT-06 forensic verification"
git push origin dev

gh pr create --base main --head dev \
  --title "OB-126: LAB Recalculation + CC-UAT-06 — Engine Proof After HF-082/OB-124/OB-125" \
  --body "Deleted 400 stale results (100-assignment era). Recalculated with 67 license-based assignments. CC-UAT-06 8-layer forensic trace. Consumer Lending: pennies→dollars. Mortgage: \$0→positive. Assignment↔license verified 25/25. MBC regression clean."
```

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Modifying calculation engine code in this OB | This is verification only. If results are wrong, document the issue — don't fix it here. |
| AP-2 | Manually inserting or editing calculation_results | FIX LOGIC NOT DATA. The engine produces results. We verify them. |
| AP-3 | Touching MBC data | Read-only regression check. Zero writes to MBC. |
| AP-4 | Skipping the forensic trace because totals "look right" | "A count tells you something exists. A trace tells you if it's correct." — CC-UAT-05 |
| AP-5 | Fixing issues found during the trace in this same OB | Document findings. The next OB addresses them. This OB is the measurement. |

---

## WHAT THE TRACE WILL REVEAL

### Expected improvements (from HF-081 + HF-082):
- Consumer Lending: $15.48 → real dollar amounts (sum not count)
- Mortgage: $0.00 → positive values (source_pattern normalized)
- Assignments: 100 → 67 (license-based, no fallback)
- Results: 400 → ~268 (67 assignments × 4 periods)

### Expected unchanged:
- Insurance Referral: ~$366,600 (but fewer results — only 16 entities × 4 periods = 64, not 100)
- Deposit Growth: likely still uniform $30K until Tab 2 targets imported

### Expected new gaps:
- Deposit Growth Tab 2 still missing (infrastructure ready via OB-124, data not yet re-imported)
- Possible convergence binding issues revealed by forensic trace
- Component-level breakdown accuracy (only visible through Officer 1001 trace)

---

*"CC-UAT-05 found 400 results under 100 assignments. Three of four plans had critical bugs."*
*"CC-UAT-06 verifies: did the fixes actually fix anything?"*
*"We are not making a movie."*
