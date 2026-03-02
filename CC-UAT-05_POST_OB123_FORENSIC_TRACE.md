# CC-UAT-05: POST OB-123 FORENSIC WIRING TRACE

## READ FIRST — IN THIS ORDER
1. `CC_STANDING_ARCHITECTURE_RULES.md` — ALL sections
2. `SCHEMA_REFERENCE.md` — all tables referenced below
3. `VIALUCE_CLT_FINDINGS_REGISTRY_R7.md` — particularly CLT-122 findings and cross-CLT patterns
4. `CC_UAT_ARCHITECTURE_TRACE.md` — existing architecture trace specification
5. `CC_UAT_CALCULATION_TRACE.md` — existing calculation trace specification
6. This entire prompt, start to finish, before executing anything

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all layers, paste all output, commit.

---

## PURPOSE

OB-123 built a Wiring API (`POST /api/intelligence/wire`) and a "Prepare for Calculation" button on the Calculate page. The completion report shows 2 of 10 proof gates passing (build clean + no auth files modified). The other 8 are "verify with script." **None have been verified.**

This CC-UAT is NOT a script that checks row counts. It is a forensic trace that follows individual records through every database table to verify that OB-123 produced CORRECT wiring — not just wiring that EXISTS.

**The test:** Can we trace a single officer from roster through entity creation through plan assignment through committed data through input bindings through calculation and get a correct, non-zero result?

**Two tenants are traced:**
1. **Latin American Bank (LAB)** — Fresh tenant created in CLT-122. OB-123's Wiring API targets this tenant. Expected: 25 entities, 4 plans, license-based assignments, non-zero calculation results.
2. **MBC (Óptica Luminar / Caribe Financial / Pipeline Test Co)** — Established tenant with proven calculations. Regression check. Expected: $3,256,677.72 grand total, 320 result rows, no changes from OB-123.

---

## LAYER 0: DISCOVER TENANT IDS AND CURRENT STATE

```bash
echo "╔══════════════════════════════════════════════════════╗"
echo "║  CC-UAT-05 LAYER 0: TENANT DISCOVERY               ║"
echo "╚══════════════════════════════════════════════════════╝"

cd /Users/AndrewAfrica/spm-platform

npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

console.log('=== ALL TENANTS ===');
const { data: tenants } = await sb.from('tenants').select('id, name, created_at').order('created_at');
for (const t of tenants || []) {
  // Count entities, rule_sets, assignments, committed_data, calculation_results for each
  const [entities, ruleSets, assignments, committed, results] = await Promise.all([
    sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id),
    sb.from('rule_sets').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id),
    sb.from('rule_set_assignments').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id),
    sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id),
    sb.from('calculation_results').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id),
  ]);
  console.log(\`\nTenant: \${t.name} [\${t.id}]\`);
  console.log(\`  Created: \${t.created_at}\`);
  console.log(\`  Entities: \${entities.count}\`);
  console.log(\`  Rule Sets: \${ruleSets.count}\`);
  console.log(\`  Assignments: \${assignments.count}\`);
  console.log(\`  Committed Data: \${committed.count}\`);
  console.log(\`  Calculation Results: \${results.count}\`);
}
"
```

**PASTE ALL OUTPUT.**

From the output, identify:
- `LAB_TENANT_ID` — the Latin American Bank / Caribe Financial tenant created in CLT-122
- `MBC_TENANT_ID` — the established MBC tenant with $3,256,677.72 grand total

Store these as constants for all subsequent queries.

**Commit:** `CC-UAT-05 Layer 0: Tenant discovery — current platform state`

---

## LAYER 1: LAB ENTITY VERIFICATION — ARE THE RIGHT ENTITIES CREATED?

The roster file `CFG_Personnel_Q1_2024.xlsx` contains 25 officers. Each has:
- OfficerID (e.g., 1001, 1002...)
- OfficerName (e.g., "Carlos Gutierrez")
- Role (e.g., "Senior Loan Officer")
- Branch (e.g., "CFG-CDMX-001 Polanco")
- Region (e.g., "Metropolitana")
- ProductLicenses (e.g., "CL,MO,IR,DG" — comma-separated)

```bash
echo "╔══════════════════════════════════════════════════════╗"
echo "║  CC-UAT-05 LAYER 1: ENTITY VERIFICATION            ║"
echo "╚══════════════════════════════════════════════════════╝"

cd /Users/AndrewAfrica/spm-platform

npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'REPLACE_WITH_LAB_TENANT_ID';

console.log('=== LAYER 1A: ENTITY COUNT ===');
const { data: entities, count } = await sb.from('entities').select('*', { count: 'exact' }).eq('tenant_id', LAB).order('external_id');
console.log('Total entities:', count);
console.log('Expected: 25');
console.log('VERDICT:', count === 25 ? 'PASS' : 'FAIL — count mismatch');

console.log('');
console.log('=== LAYER 1B: ENTITY DETAIL (first 10) ===');
for (const e of (entities || []).slice(0, 10)) {
  console.log(\`  \${e.external_id} | \${e.name || 'NO NAME'} | metadata: \${JSON.stringify(e.metadata)}\`);
}

console.log('');
console.log('=== LAYER 1C: ENTITY METADATA QUALITY ===');
let hasName = 0, hasRole = 0, hasLicenses = 0, hasRegion = 0, hasBranch = 0;
let licenseCounts: Record<string, number> = {};
for (const e of entities || []) {
  if (e.name && e.name !== 'Unknown' && e.name !== '') hasName++;
  const m = e.metadata || {};
  if (m.role || m.Role) hasRole++;
  if (m.region || m.Region) hasRegion++;
  if (m.branch || m.Branch) hasBranch++;
  
  // Check licenses — could be string, array, or nested
  const licenses = m.licenses || m.product_licenses || m.ProductLicenses;
  if (licenses) {
    hasLicenses++;
    const licArray = Array.isArray(licenses) ? licenses : String(licenses).split(',').map(s => s.trim());
    for (const lic of licArray) {
      licenseCounts[lic] = (licenseCounts[lic] || 0) + 1;
    }
  }
}
console.log(\`  Has name:     \${hasName}/\${count} (\${hasName === count ? 'PASS' : 'FAIL'})\`);
console.log(\`  Has role:     \${hasRole}/\${count}\`);
console.log(\`  Has licenses: \${hasLicenses}/\${count} (\${hasLicenses === count ? 'PASS' : 'FAIL — license metadata critical for assignments'})\`);
console.log(\`  Has region:   \${hasRegion}/\${count}\`);
console.log(\`  Has branch:   \${hasBranch}/\${count}\`);
console.log('');
console.log('  License distribution:', licenseCounts);
console.log('  Expected: CL ~24, MO ~14, IR ~20, DG ~22 (varies by officer)');

console.log('');
console.log('=== LAYER 1D: SPECIFIC ENTITY TRACE — Officer 1001 ===');
const officer1001 = entities?.find(e => e.external_id === '1001' || e.external_id === 1001);
if (officer1001) {
  console.log('  Found:', JSON.stringify(officer1001, null, 2));
  console.log('  Expected: Carlos Gutierrez, Senior Loan Officer, licenses CL,MO,IR,DG');
} else {
  console.log('  NOT FOUND — entities may use different external_id format');
  console.log('  Available external_ids:', entities?.slice(0,5).map(e => e.external_id));
}

console.log('');
console.log('=== LAYER 1E: DEDUPLICATION CHECK ===');
const extIds = entities?.map(e => e.external_id) || [];
const uniqueIds = new Set(extIds);
console.log(\`  Unique external_ids: \${uniqueIds.size}\`);
console.log(\`  Total entities: \${extIds.length}\`);
console.log(\`  VERDICT: \${uniqueIds.size === extIds.length ? 'PASS — no duplicates' : 'FAIL — duplicates exist (CLT111-F33 repeat)'}\`);
"
```

**PASTE ALL OUTPUT.**

---

## LAYER 2: LAB RULE SET VERIFICATION — ARE ALL 4 PLANS ACTIVE AND CORRECT?

```bash
echo "╔══════════════════════════════════════════════════════╗"
echo "║  CC-UAT-05 LAYER 2: RULE SET VERIFICATION           ║"
echo "╚══════════════════════════════════════════════════════╝"

cd /Users/AndrewAfrica/spm-platform

npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'REPLACE_WITH_LAB_TENANT_ID';

console.log('=== LAYER 2A: ALL RULE SETS FOR LAB ===');
const { data: ruleSets } = await sb.from('rule_sets').select('id, name, status, created_at, configuration, input_bindings').eq('tenant_id', LAB).order('name');

for (const rs of ruleSets || []) {
  console.log(\`\n  Plan: \${rs.name}\`);
  console.log(\`    ID: \${rs.id}\`);
  console.log(\`    Status: \${rs.status}\`);
  console.log(\`    Created: \${rs.created_at}\`);
  
  // Component count
  const config = rs.configuration || {};
  const components = config.components || config.tiers || [];
  console.log(\`    Components: \${Array.isArray(components) ? components.length : 'NOT ARRAY — check structure'}\`);
  
  // Component detail
  if (Array.isArray(components)) {
    for (const [i, comp] of components.entries()) {
      console.log(\`      [\${i}]: \${comp.name || comp.label || 'UNNAMED'} | type: \${comp.componentType || comp.type || 'UNTYPED'}\`);
      if (comp.calculationIntent) {
        console.log(\`            intent: \${comp.calculationIntent.operation || 'NO OPERATION'}\`);
      } else {
        console.log(\`            intent: NONE — legacy config only\`);
      }
    }
  }
  
  // Input bindings
  const bindings = rs.input_bindings || {};
  const bindingKeys = Object.keys(bindings);
  console.log(\`    Input Bindings: \${bindingKeys.length > 0 ? bindingKeys.length + ' keys' : 'EMPTY'}\`);
  if (bindingKeys.length > 0) {
    for (const key of bindingKeys.slice(0, 5)) {
      console.log(\`      \${key}: \${JSON.stringify(bindings[key])}\`);
    }
    if (bindingKeys.length > 5) console.log(\`      ... and \${bindingKeys.length - 5} more\`);
  }
}

console.log('');
console.log('=== LAYER 2B: PLAN COUNT VERDICT ===');
const activeCount = ruleSets?.filter(rs => rs.status === 'active').length || 0;
console.log(\`  Active plans: \${activeCount}\`);
console.log(\`  Expected: 4 (Consumer Lending, Deposit Growth, Insurance Referral, Mortgage)\`);
console.log(\`  VERDICT: \${activeCount === 4 ? 'PASS' : 'FAIL'}\`);

const archivedCount = ruleSets?.filter(rs => rs.status === 'archived').length || 0;
if (archivedCount > 0) {
  console.log(\`  WARNING: \${archivedCount} archived plans — OB-123 wiring may have activated these\`);
}

console.log('');
console.log('=== LAYER 2C: INPUT BINDINGS VERDICT ===');
for (const rs of ruleSets || []) {
  const bindings = rs.input_bindings || {};
  const hasBindings = Object.keys(bindings).length > 0;
  console.log(\`  \${rs.name}: \${hasBindings ? 'HAS BINDINGS' : 'EMPTY — convergence did not run or produced nothing'}\`);
}
"
```

**PASTE ALL OUTPUT.**

---

## LAYER 3: LAB ASSIGNMENT VERIFICATION — ARE ENTITIES CORRECTLY ASSIGNED TO PLANS?

This is the most critical trace. The OB-123 completion report mentions "license-based mapping with full-coverage fallback." We need to know WHICH happened.

```bash
echo "╔══════════════════════════════════════════════════════╗"
echo "║  CC-UAT-05 LAYER 3: ASSIGNMENT VERIFICATION         ║"
echo "╚══════════════════════════════════════════════════════╝"

cd /Users/AndrewAfrica/spm-platform

npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'REPLACE_WITH_LAB_TENANT_ID';

console.log('=== LAYER 3A: TOTAL ASSIGNMENTS ===');
const { data: assignments, count } = await sb.from('rule_set_assignments')
  .select('*, entities!inner(external_id, name, metadata), rule_sets!inner(name)', { count: 'exact' })
  .eq('tenant_id', LAB);

console.log('Total assignments:', count);

// If every entity assigned to every plan: 25 × 4 = 100 (full-coverage fallback)
// If license-based: variable (depends on ProductLicenses per officer)
// Expected license-based total: CL(24) + MO(14) + IR(20) + DG(22) = ~80

console.log('');
console.log('=== LAYER 3B: ASSIGNMENTS PER PLAN ===');
const byPlan: Record<string, number> = {};
for (const a of assignments || []) {
  const planName = (a as any).rule_sets?.name || 'UNKNOWN';
  byPlan[planName] = (byPlan[planName] || 0) + 1;
}
for (const [plan, planCount] of Object.entries(byPlan).sort()) {
  console.log(\`  \${plan}: \${planCount} entities assigned\`);
}

console.log('');
console.log('=== LAYER 3C: FULL-COVERAGE FALLBACK CHECK ===');
const allPlansPerEntity: Record<string, string[]> = {};
for (const a of assignments || []) {
  const extId = (a as any).entities?.external_id || 'UNKNOWN';
  const plan = (a as any).rule_sets?.name || 'UNKNOWN';
  if (!allPlansPerEntity[extId]) allPlansPerEntity[extId] = [];
  allPlansPerEntity[extId].push(plan);
}

const planCounts = Object.values(allPlansPerEntity).map(plans => plans.length);
const allSame = planCounts.every(c => c === planCounts[0]);
if (allSame && planCounts[0] === (Object.keys(byPlan).length)) {
  console.log(\`  ⚠️ FULL-COVERAGE FALLBACK DETECTED: Every entity assigned to all \${planCounts[0]} plans\`);
  console.log('  This means license-based mapping FAILED and fallback was used.');
  console.log('  Result: Officer with only CL license is assigned to Mortgage, Insurance, Deposits.');
  console.log('  VERDICT: FAIL — assignments are functionally wrong even though rows exist.');
} else {
  console.log('  Assignments vary by entity — license-based mapping appears active.');
  const minAssign = Math.min(...planCounts);
  const maxAssign = Math.max(...planCounts);
  console.log(\`  Range: \${minAssign} to \${maxAssign} plans per entity\`);
}

console.log('');
console.log('=== LAYER 3D: OFFICER 1001 ASSIGNMENT TRACE ===');
const officer1001Assignments = assignments?.filter(a => 
  (a as any).entities?.external_id === '1001' || (a as any).entities?.external_id === 1001
) || [];
console.log(\`  Officer 1001 assignments: \${officer1001Assignments.length}\`);
for (const a of officer1001Assignments) {
  console.log(\`    → \${(a as any).rule_sets?.name}\`);
}
console.log('  Expected (if licenses = CL,MO,IR,DG): 4 assignments to all 4 plans');

console.log('');
console.log('=== LAYER 3E: OFFICER WITH FEWER LICENSES ===');
// Find an officer with only 2 licenses to verify non-uniform assignment
const entities2 = Object.entries(allPlansPerEntity).find(([_, plans]) => plans.length < Object.keys(byPlan).length);
if (entities2) {
  console.log(\`  Officer \${entities2[0]}: \${entities2[1].length} assignments → \${entities2[1].join(', ')}\`);
  console.log('  This confirms license-based (not full-coverage) assignment.');
} else {
  console.log('  No officer found with fewer than max assignments.');
  console.log('  This suggests full-coverage fallback was used.');
}
"
```

**PASTE ALL OUTPUT.**

---

## LAYER 4: LAB COMMITTED DATA — IS THE RIGHT DATA AVAILABLE FOR CALCULATION?

```bash
echo "╔══════════════════════════════════════════════════════╗"
echo "║  CC-UAT-05 LAYER 4: COMMITTED DATA VERIFICATION     ║"
echo "╚══════════════════════════════════════════════════════╝"

cd /Users/AndrewAfrica/spm-platform

npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'REPLACE_WITH_LAB_TENANT_ID';

console.log('=== LAYER 4A: COMMITTED DATA OVERVIEW ===');
const { count: totalRows } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', LAB);
console.log('Total committed_data rows:', totalRows);

console.log('');
console.log('=== LAYER 4B: DATA TYPES (what files were imported?) ===');
const { data: dataTypes } = await sb.from('committed_data').select('data_type').eq('tenant_id', LAB);
const typeCount: Record<string, number> = {};
for (const row of dataTypes || []) {
  typeCount[row.data_type || 'NULL'] = (typeCount[row.data_type || 'NULL'] || 0) + 1;
}
for (const [dt, dtCount] of Object.entries(typeCount).sort()) {
  console.log(\`  \${dt}: \${dtCount} rows\`);
}

console.log('');
console.log('=== LAYER 4C: DATA_TYPE NORMALIZATION CHECK ===');
const rawPrefixed = Object.keys(typeCount).filter(k => k.startsWith('component_data:'));
if (rawPrefixed.length > 0) {
  console.log(\`  ⚠️ UNNORMALIZED data_types found: \${rawPrefixed.join(', ')}\`);
  console.log('  OB-123 Step 2 (normalize) may not have run or missed these.');
  console.log('  VERDICT: FAIL');
} else {
  console.log('  All data_types normalized (no component_data: prefix).');
  console.log('  VERDICT: PASS');
}

console.log('');
console.log('=== LAYER 4D: OFFICER 1001 DATA TRACE ===');
// Find rows for officer 1001
const { data: officer1001Data } = await sb.from('committed_data')
  .select('data_type, period_date, data')
  .eq('tenant_id', LAB)
  .or('entity_id.eq.1001,data->>OfficerID.eq.1001,data->>officer_id.eq.1001')
  .limit(20);

if (officer1001Data && officer1001Data.length > 0) {
  console.log(\`  Rows for Officer 1001: \${officer1001Data.length}\`);
  for (const row of officer1001Data.slice(0, 5)) {
    const dataKeys = Object.keys(row.data || {});
    console.log(\`    \${row.data_type} | period: \${row.period_date} | fields: \${dataKeys.join(', ')}\`);
  }
} else {
  console.log('  No rows found for Officer 1001 — trying entity_id from entities table...');
  // Look up entity ID
  const { data: entity } = await sb.from('entities').select('id').eq('tenant_id', LAB).or('external_id.eq.1001');
  if (entity && entity.length > 0) {
    const entityUuid = entity[0].id;
    const { data: dataByEntity } = await sb.from('committed_data')
      .select('data_type, period_date, data')
      .eq('tenant_id', LAB)
      .eq('entity_id', entityUuid)
      .limit(20);
    console.log(\`  Rows via entity UUID (\${entityUuid}): \${dataByEntity?.length || 0}\`);
    for (const row of (dataByEntity || []).slice(0, 5)) {
      const dataKeys = Object.keys(row.data || {});
      console.log(\`    \${row.data_type} | period: \${row.period_date} | fields: \${dataKeys.join(', ')}\`);
    }
  }
}

console.log('');
console.log('=== LAYER 4E: DEPOSIT GROWTH TAB 2 CHECK ===');
// This is the critical F-65 root cause check
// Tab 2 of Deposit Growth XLSX should contain per-officer growth targets
// If this data exists nowhere in committed_data, Deposit Growth will be \\$0

const depositTypes = Object.keys(typeCount).filter(k => 
  k.toLowerCase().includes('deposit') || k.toLowerCase().includes('growth') || k.toLowerCase().includes('target')
);
console.log('  Data types related to deposits/targets:', depositTypes.length > 0 ? depositTypes : 'NONE FOUND');

// Check if any committed_data rows contain target values
const { data: targetRows } = await sb.from('committed_data')
  .select('data_type, data')
  .eq('tenant_id', LAB)
  .limit(500);

let hasTargetField = false;
for (const row of targetRows || []) {
  const dataObj = row.data || {};
  const keys = Object.keys(dataObj);
  if (keys.some(k => k.toLowerCase().includes('target') || k.toLowerCase().includes('growth_target'))) {
    hasTargetField = true;
    console.log(\`  FOUND target field in \${row.data_type}: \${keys.filter(k => k.toLowerCase().includes('target'))}\`);
    break;
  }
}

if (!hasTargetField) {
  console.log('  ⚠️ NO TARGET DATA FOUND in committed_data');
  console.log('  This means Deposit Growth Tab 2 was never imported (CLT122-F65 confirmed)');
  console.log('  Deposit Growth will produce \\$0 regardless of wiring correctness');
  console.log('  VERDICT: KNOWN GAP — Decision 72 (multi-tab XLSX) not addressed by OB-123');
}

console.log('');
console.log('=== LAYER 4F: PERIODS ===');
const { data: periods } = await sb.from('periods').select('*').eq('tenant_id', LAB).order('start_date');
console.log('  Periods:', periods?.length || 0);
for (const p of periods || []) {
  console.log(\`    \${p.label || 'UNLABELED'}: \${p.start_date} → \${p.end_date}\`);
}
"
```

**PASTE ALL OUTPUT.**

---

## LAYER 5: LAB CALCULATION TRACE — DOES THE ENGINE PRODUCE CORRECT RESULTS?

```bash
echo "╔══════════════════════════════════════════════════════╗"
echo "║  CC-UAT-05 LAYER 5: CALCULATION TRACE               ║"
echo "╚══════════════════════════════════════════════════════╝"

cd /Users/AndrewAfrica/spm-platform

npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'REPLACE_WITH_LAB_TENANT_ID';

console.log('=== LAYER 5A: EXISTING CALCULATION RESULTS ===');
const { data: results, count } = await sb.from('calculation_results')
  .select('*, rule_sets!inner(name), entities!inner(external_id, name)', { count: 'exact' })
  .eq('tenant_id', LAB);

console.log('Total calculation results:', count);

if (!results || results.length === 0) {
  console.log('  NO RESULTS — calculation has not been run yet.');
  console.log('  This is expected if the Prepare button was built but never clicked.');
  console.log('');
  console.log('  ATTEMPTING CALCULATION VIA API...');
  
  // Check if we can trigger calculation
  // First get rule_sets and periods
  const { data: rs } = await sb.from('rule_sets').select('id, name').eq('tenant_id', LAB).eq('status', 'active');
  const { data: periods } = await sb.from('periods').select('id, label, start_date').eq('tenant_id', LAB);
  
  if (rs && rs.length > 0 && periods && periods.length > 0) {
    console.log(\`  Active plans: \${rs.map(r => r.name).join(', ')}\`);
    console.log(\`  Periods: \${periods.map(p => p.label || p.start_date).join(', ')}\`);
    console.log('');
    console.log('  To test calculation, run from browser or via API call.');
    console.log('  This trace will continue with whatever results exist.');
  }
} else {
  console.log('');
  console.log('=== LAYER 5B: RESULTS BY PLAN ===');
  const byPlan: Record<string, { count: number; total: number; nonZero: number; min: number; max: number }> = {};
  for (const r of results) {
    const planName = (r as any).rule_sets?.name || 'UNKNOWN';
    if (!byPlan[planName]) byPlan[planName] = { count: 0, total: 0, nonZero: 0, min: Infinity, max: -Infinity };
    const payout = Number(r.total_payout) || 0;
    byPlan[planName].count++;
    byPlan[planName].total += payout;
    if (payout > 0) byPlan[planName].nonZero++;
    byPlan[planName].min = Math.min(byPlan[planName].min, payout);
    byPlan[planName].max = Math.max(byPlan[planName].max, payout);
  }

  let grandTotal = 0;
  for (const [plan, stats] of Object.entries(byPlan).sort()) {
    grandTotal += stats.total;
    const allZero = stats.nonZero === 0;
    console.log(\`  \${plan}:\`);
    console.log(\`    Results: \${stats.count} | Non-zero: \${stats.nonZero} | Total: \$\${stats.total.toFixed(2)}\`);
    console.log(\`    Range: [\$\${stats.min.toFixed(2)}, \$\${stats.max.toFixed(2)}]\`);
    if (allZero) console.log(\`    ⚠️ ALL ZERO — plan produces no payouts\`);
    if (stats.max <= 1 && stats.nonZero > 0) console.log(\`    ⚠️ MAX ≤ \\$1 — possible rate-not-volume bug (CC Pattern)\`);
  }

  console.log('');
  console.log(\`  GRAND TOTAL: \$\${grandTotal.toFixed(2)}\`);
  console.log(\`  Total results: \${results.length}\`);

  console.log('');
  console.log('=== LAYER 5C: OFFICER 1001 CALCULATION TRACE ===');
  const officer1001Results = results.filter(r => 
    (r as any).entities?.external_id === '1001' || (r as any).entities?.external_id === 1001
  );
  console.log(\`  Officer 1001 results: \${officer1001Results.length}\`);
  for (const r of officer1001Results) {
    const planName = (r as any).rule_sets?.name || 'UNKNOWN';
    console.log(\`    \${planName}: \$\${Number(r.total_payout).toFixed(2)} | components: \${JSON.stringify(r.component_results || r.components || 'NONE').slice(0, 200)}\`);
  }
}
"
```

**PASTE ALL OUTPUT.**

---

## LAYER 6: MBC REGRESSION — IS THE ESTABLISHED TENANT UNAFFECTED?

```bash
echo "╔══════════════════════════════════════════════════════╗"
echo "║  CC-UAT-05 LAYER 6: MBC REGRESSION                  ║"
echo "╚══════════════════════════════════════════════════════╝"

cd /Users/AndrewAfrica/spm-platform

npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MBC = 'REPLACE_WITH_MBC_TENANT_ID';

console.log('=== LAYER 6A: MBC GRAND TOTAL ===');
const { data: results, count } = await sb.from('calculation_results')
  .select('total_payout, rule_sets!inner(name)', { count: 'exact' })
  .eq('tenant_id', MBC);

const grandTotal = (results || []).reduce((sum, r) => sum + (Number(r.total_payout) || 0), 0);
console.log(\`  Grand total: \$\${grandTotal.toFixed(2)}\`);
console.log(\`  Expected:    \$3,256,677.72\`);
console.log(\`  Delta:       \$\${Math.abs(grandTotal - 3256677.72).toFixed(2)}\`);
console.log(\`  VERDICT:     \${Math.abs(grandTotal - 3256677.72) < 0.10 ? 'PASS' : 'FAIL — regression detected'}\`);

console.log('');
console.log('=== LAYER 6B: MBC RESULT COUNT ===');
console.log(\`  Total results: \${count}\`);
console.log(\`  Expected:      320\`);
console.log(\`  VERDICT:       \${count === 320 ? 'PASS' : 'FAIL — row count changed'}\`);

console.log('');
console.log('=== LAYER 6C: MBC PER-PLAN TOTALS ===');
const byPlan: Record<string, { count: number; total: number }> = {};
for (const r of results || []) {
  const planName = (r as any).rule_sets?.name || 'UNKNOWN';
  if (!byPlan[planName]) byPlan[planName] = { count: 0, total: 0 };
  byPlan[planName].count++;
  byPlan[planName].total += Number(r.total_payout) || 0;
}
for (const [plan, stats] of Object.entries(byPlan).sort()) {
  console.log(\`  \${plan}: \${stats.count} results, \$\${stats.total.toFixed(2)}\`);
}

console.log('');
console.log('=== LAYER 6D: MBC ENTITY/ASSIGNMENT/BINDING UNCHANGED ===');
const [entities, assignments, ruleSets] = await Promise.all([
  sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', MBC),
  sb.from('rule_set_assignments').select('*', { count: 'exact', head: true }).eq('tenant_id', MBC),
  sb.from('rule_sets').select('name, input_bindings, status').eq('tenant_id', MBC),
]);
console.log(\`  Entities: \${entities.count}\`);
console.log(\`  Assignments: \${assignments.count}\`);
for (const rs of ruleSets.data || []) {
  const bindingCount = Object.keys(rs.input_bindings || {}).length;
  console.log(\`  \${rs.name} [\${rs.status}]: \${bindingCount} input bindings\`);
}
"
```

**PASTE ALL OUTPUT.**

---

## LAYER 7: KOREAN TEST + DOMAIN LEAK SCAN

```bash
echo "╔══════════════════════════════════════════════════════╗"
echo "║  CC-UAT-05 LAYER 7: KOREAN TEST + DOMAIN LEAK       ║"
echo "╚══════════════════════════════════════════════════════╝"

cd /Users/AndrewAfrica/spm-platform

echo "=== 7A: DOMAIN VOCABULARY IN WIRING API ==="
grep -rn "commission\|mortgage\|insurance\|loan\|deposit\|referral\|disbursement\|clawback" \
  web/src/app/api/intelligence/wire/ --include="*.ts" -i | head -30

echo ""
echo "=== 7B: DOMAIN VOCABULARY IN CALCULATION LIB ==="
grep -rn "commission\|mortgage\|insurance\|loan\|deposit\|referral\|disbursement" \
  web/src/lib/calculation/ --include="*.ts" -i | head -20

echo ""
echo "=== 7C: HARDCODED FIELD NAMES ==="
grep -rn "LoanAmount\|OfficerID\|ProductCode\|Qualified\|OriginalAmount\|TotalDeposit\|ProductLicenses\|ConsumerLending" \
  web/src/lib/ web/src/app/api/intelligence/ --include="*.ts" | head -20

echo ""
echo "=== 7D: SHEET_COMPONENT_PATTERNS (should be 0) ==="
echo "References:"
grep -rn "SHEET_COMPONENT_PATTERNS" web/src/ --include="*.ts" | wc -l

echo ""
echo "=== 7E: OB-123 NEW FILES ==="
echo "Files added or modified by OB-123:"
git log --oneline --name-only HEAD~4..HEAD | grep -v "^[a-f0-9]" | sort -u
```

**PASTE ALL OUTPUT.**

---

## LAYER 8: WIRING API CODE REVIEW

```bash
echo "╔══════════════════════════════════════════════════════╗"
echo "║  CC-UAT-05 LAYER 8: WIRING API CODE REVIEW          ║"
echo "╚══════════════════════════════════════════════════════╝"

cd /Users/AndrewAfrica/spm-platform

echo "=== 8A: WIRE ROUTE FULL SOURCE ==="
cat web/src/app/api/intelligence/wire/route.ts

echo ""
echo "=== 8B: CALCULATE PAGE CHANGES (diff) ==="
git diff HEAD~4..HEAD -- web/src/app/admin/launch/calculate/page.tsx | head -200

echo ""
echo "=== 8C: VERIFICATION SCRIPT ==="
cat web/scripts/ob123-verify.ts 2>/dev/null || echo "File not found"
```

**PASTE ALL OUTPUT.** This allows the trace to identify:
- Whether the wiring API uses domain-specific strings (Korean Test)
- Whether the full-coverage fallback masks missing license metadata
- Whether convergence is actually called or stubbed
- Whether the Calculate page readiness check is correct

---

## COMPLETION REPORT FORMAT

After executing all layers, produce a report structured as:

```
CC-UAT-05 COMPLETION REPORT
============================

LAYER 0: Tenant Discovery
  LAB tenant ID: [id]
  MBC tenant ID: [id]
  Platform state: [summary]

LAYER 1: Entity Verification
  Count: [n]/25 — [PASS/FAIL]
  Metadata quality: names [n]/25, licenses [n]/25
  Deduplication: [PASS/FAIL]
  Officer 1001 trace: [found/not found, data summary]

LAYER 2: Rule Set Verification
  Active plans: [n]/4 — [PASS/FAIL]
  Input bindings: [per-plan status]
  Component integrity: [summary]

LAYER 3: Assignment Verification
  Total assignments: [n]
  Method: [LICENSE-BASED / FULL-COVERAGE FALLBACK]
  Officer 1001: [n] assignments — [PASS/FAIL]
  Variable assignment test: [PASS/FAIL]

LAYER 4: Committed Data
  Total rows: [n]
  Data types: [list]
  Normalization: [PASS/FAIL]
  Deposit Growth Tab 2 targets: [PRESENT/ABSENT]
  Officer 1001 data: [summary]

LAYER 5: Calculation Results
  Results exist: [YES/NO]
  Grand total: $[amount]
  Per-plan: [summary]
  Non-zero plans: [n]/4
  Officer 1001 trace: [per-plan payouts]

LAYER 6: MBC Regression
  Grand total: $[amount] vs $3,256,677.72 — [PASS/FAIL]
  Row count: [n] vs 320 — [PASS/FAIL]
  Per-plan: [unchanged/changed]

LAYER 7: Korean Test
  Domain leak in wire API: [count] — [PASS/FAIL]
  Domain leak in calc lib: [count] — [PASS/FAIL]
  SHEET_COMPONENT_PATTERNS: [count] (should be 0)

LAYER 8: Code Review
  Full-coverage fallback present: [YES/NO]
  Convergence actually called: [YES/NO]
  Domain strings in route.ts: [list]

═══════════════════════════════════════════
OVERALL VERDICT
═══════════════════════════════════════════

LAB Wiring:     [PASS / PARTIAL / FAIL]
LAB Calculation: [PASS / PARTIAL / FAIL / NOT RUN]
MBC Regression:  [PASS / FAIL]
Korean Test:     [PASS / FAIL]
Deposit Growth:  [KNOWN GAP — F-65 unresolved / FIXED]

CRITICAL FINDINGS:
1. [finding]
2. [finding]
...

RECOMMENDATION:
[Merge / Fix before merge / Block]
```

---

## GIT PROTOCOL

```bash
cd /Users/AndrewAfrica/spm-platform
git add -A
git commit -m "CC-UAT-05: Post OB-123 forensic wiring trace — 8-layer verification"
git push origin dev
```

**DO NOT create a PR for this.** This is a diagnostic, not a code change. Commit the trace output and completion report to dev for the record.

---

## WHAT THIS TRACE WILL REVEAL

If OB-123 worked correctly:
- 25 entities with parsed licenses → 4 plans active → ~80 license-based assignments → non-empty input_bindings → non-zero calculation results → MBC unchanged

If OB-123 used full-coverage fallback:
- 25 entities with EMPTY metadata → 4 plans active → 100 assignments (every entity to every plan) → possibly non-zero results BUT functionally wrong assignments

If OB-123's convergence didn't run:
- Entities + assignments exist → input_bindings EMPTY → calculation produces $0

If Deposit Growth Tab 2 is missing (F-65):
- No target data in committed_data → Deposit Growth $0 regardless of other wiring

**The trace doesn't just check if rows exist. It checks if the RIGHT rows with the RIGHT values are connected the RIGHT way.**

---

*"A count tells you something exists. A trace tells you if it's correct."*
*"We are not making a movie." — Standing Rule 27.*
