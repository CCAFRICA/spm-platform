# HF-081: LAB CALCULATION ACCURACY — MORTGAGE SOURCE PATTERN + CONSUMER LENDING DERIVATION FIX

## Target: alpha.4.0
## Depends on: OB-123 (PR #139)
## Source: CC-UAT-05 Forensic Wiring Trace — Findings F-02, F-03

## READ FIRST — IN THIS ORDER
1. `CC_STANDING_ARCHITECTURE_RULES.md` — ALL sections, ALL rules, ALL anti-patterns
2. `SCHEMA_REFERENCE.md` — rule_sets, committed_data, calculation_results tables
3. `VIALUCE_CLT_FINDINGS_REGISTRY_R7.md` — Cross-CLT Patterns section
4. `CC_UAT_05_FORENSIC_WIRING_TRACE.md` — Full trace output, particularly Layers 2, 5
5. This entire prompt, start to finish, before executing anything

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases, paste all output, commit per phase.

## STANDING RULES REMINDER (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## CONTEXT

CC-UAT-05 ran an 8-layer forensic trace against the LAB (Latin American Bank) tenant after OB-123 built the Wiring Layer. The trace found:

**F-02 (HIGH): Mortgage Origination Bonus — $0 for all entities.**
Root cause: The convergence layer wrote a metric_derivation with `source_pattern: "component_data:CFG_Mortgage_Closings_Q1_2024"`. But the wire API's normalization step already updated committed_data to `data_type: "mortgage_closings"`. The derivation points to a data_type that no longer exists. Convergence ran before normalization completed during the wire sequence.

**F-03 (HIGH): Consumer Lending Commission — max payout $0.32.**
Root cause: The metric_derivation uses `operation: "count"` which returns raw row count (e.g., 9 rows). The calculation intent then applies `scalar_multiply` with a rate (e.g., 0.025), producing $0.225 instead of dollar amounts. The derivation should use `operation: "sum"` with a `source_field` pointing to the loan amount column, so the rate is applied to dollar volume, not row count.

Both findings are **data fixes in Supabase** (stored derivation rules in rule_sets.input_bindings) combined with a **code fix** to prevent the race condition from recurring.

---

## SCOPE BOUNDARIES

### IN SCOPE
- Fix Mortgage derivation source_pattern in rule_sets for LAB tenant
- Fix Consumer Lending derivation operation from count → sum with correct source_field
- Fix wire API to ensure normalization completes BEFORE convergence writes derivations
- Re-run calculation for LAB to verify non-zero Mortgage and realistic Consumer Lending
- Re-run CC-UAT-05 Layers 2 and 5 to verify correctness
- MBC regression check (Layer 6)

### OUT OF SCOPE — DO NOT TOUCH
- Full-coverage fallback (F-01) — separate fix, lower priority
- Deposit Growth uniform payout (F-04) — requires multi-tab XLSX (Decision 72), separate OB
- Auth files — do not modify middleware.ts, auth-shell.tsx, or any auth-related code
- Óptica Luminar, Sabor, Pipeline Test Co — do not modify any other tenant's data
- Import pipeline, field mapping, plan interpretation — no changes to import code
- UI components — no frontend changes in this HF

---

## PHASE 0: DIAGNOSTIC — UNDERSTAND CURRENT STATE

Before fixing anything, trace the exact current state. Do NOT rely on CC-UAT-05's output from hours ago — the state may have changed.

### 0A: Identify LAB Tenant and Rule Sets

```bash
cd /Users/AndrewAfrica/spm-platform

npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Find LAB tenant
const { data: tenants } = await sb.from('tenants').select('id, name').ilike('name', '%latin%');
const labId = tenants?.[0]?.id;
if (!labId) {
  // Try 'caribe' or other name patterns
  const { data: t2 } = await sb.from('tenants').select('id, name').order('created_at', { ascending: false }).limit(3);
  console.log('Recent tenants:', t2);
  process.exit(1);
}
console.log('LAB tenant:', labId, tenants?.[0]?.name);

// Get ALL rule_sets with full input_bindings
const { data: ruleSets } = await sb.from('rule_sets')
  .select('id, name, status, input_bindings, configuration')
  .eq('tenant_id', labId);

for (const rs of ruleSets || []) {
  console.log('\n════════════════════════════════════════');
  console.log('Plan:', rs.name, '|', rs.status);
  console.log('ID:', rs.id);
  
  // Show input_bindings in full
  const bindings = rs.input_bindings || {};
  console.log('input_bindings:', JSON.stringify(bindings, null, 2));
  
  // Show metric_derivations specifically
  const derivations = bindings.metric_derivations || bindings.derivations || [];
  if (Array.isArray(derivations) && derivations.length > 0) {
    console.log('\nDERIVATIONS:');
    for (const d of derivations) {
      console.log('  metric:', d.metric || d.metric_name);
      console.log('  operation:', d.operation);
      console.log('  source_pattern:', d.source_pattern || d.data_type || 'NONE');
      console.log('  source_field:', d.source_field || d.field || 'NONE');
      console.log('  filters:', JSON.stringify(d.filters || d.filter || 'NONE'));
      console.log('  ---');
    }
  } else {
    console.log('DERIVATIONS: NONE or not in expected location');
    console.log('Top-level keys:', Object.keys(bindings));
  }
}
"
```

**PASTE ALL OUTPUT.** This reveals the exact structure and location of derivation rules.

### 0B: Verify Committed Data Types

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// REPLACE with actual LAB tenant ID from 0A
const LAB = 'REPLACE_WITH_LAB_TENANT_ID';

// Get ALL distinct data_types
const { data } = await sb.from('committed_data').select('data_type').eq('tenant_id', LAB);
const types: Record<string, number> = {};
for (const r of data || []) types[r.data_type] = (types[r.data_type] || 0) + 1;
console.log('Committed data types:');
for (const [t, c] of Object.entries(types).sort()) console.log('  ', t, ':', c, 'rows');

// Show sample fields for mortgage data
console.log('\nMortgage data sample fields:');
const { data: mortgageSample } = await sb.from('committed_data')
  .select('data_type, data')
  .eq('tenant_id', LAB)
  .or('data_type.ilike.%mortgage%,data_type.ilike.%closing%')
  .limit(3);
for (const row of mortgageSample || []) {
  console.log('  type:', row.data_type, '| fields:', Object.keys(row.data || {}));
  // Show one full row to identify the amount field
  console.log('  sample:', JSON.stringify(row.data));
}

// Show sample fields for loan disbursement data
console.log('\nLoan disbursement data sample fields:');
const { data: loanSample } = await sb.from('committed_data')
  .select('data_type, data')
  .eq('tenant_id', LAB)
  .or('data_type.ilike.%loan%,data_type.ilike.%disbursement%')
  .limit(3);
for (const row of loanSample || []) {
  console.log('  type:', row.data_type, '| fields:', Object.keys(row.data || {}));
  console.log('  sample:', JSON.stringify(row.data));
}
"
```

**PASTE ALL OUTPUT.** This reveals:
- The exact normalized data_type names (what source_pattern SHOULD reference)
- The actual field names in the data (what source_field SHOULD reference for sum operations)

**Commit:** `HF-081 Phase 0: Diagnostic — current LAB state before fixes`

---

## PHASE 1: FIX MORTGAGE SOURCE PATTERN (F-02)

Using the data_type discovered in Phase 0B, update the Mortgage plan's derivation to reference the NORMALIZED data_type.

### 1A: Identify the Exact Fix

From Phase 0A output, locate the Mortgage derivation's `source_pattern`. It should be something like `component_data:CFG_Mortgage_Closings_Q1_2024`.

From Phase 0B output, locate the actual data_type in committed_data. It should be something like `mortgage_closings`.

### 1B: Apply the Fix

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const LAB = 'REPLACE_WITH_LAB_TENANT_ID';
const MORTGAGE_RS_ID = 'REPLACE_WITH_MORTGAGE_RULE_SET_ID';

// Read current input_bindings
const { data: rs } = await sb.from('rule_sets').select('input_bindings').eq('id', MORTGAGE_RS_ID).single();
const bindings = rs?.input_bindings || {};

console.log('BEFORE:', JSON.stringify(bindings, null, 2));

// Fix the source_pattern in derivations
// IMPORTANT: Adapt this to the actual structure found in Phase 0A
const derivations = bindings.metric_derivations || bindings.derivations || [];
let fixed = 0;
for (const d of derivations) {
  const sp = d.source_pattern || d.data_type;
  if (sp && sp.includes('component_data:')) {
    const oldPattern = sp;
    // Normalize: strip 'component_data:' prefix, lowercase, replace spaces with underscores
    // Then match against actual committed_data data_types from Phase 0B
    const newPattern = 'REPLACE_WITH_ACTUAL_NORMALIZED_DATA_TYPE'; // e.g. 'mortgage_closings'
    
    // Update whichever key the derivation uses
    if (d.source_pattern !== undefined) d.source_pattern = newPattern;
    if (d.data_type !== undefined) d.data_type = newPattern;
    
    console.log('Fixed source_pattern:', oldPattern, '→', newPattern);
    fixed++;
  }
}

if (fixed === 0) {
  console.log('ERROR: No unnormalized source_patterns found. Check Phase 0A output for exact structure.');
  process.exit(1);
}

// Write back
const { error } = await sb.from('rule_sets').update({ input_bindings: bindings }).eq('id', MORTGAGE_RS_ID);
if (error) { console.error('UPDATE FAILED:', error); process.exit(1); }

console.log('\nAFTER:', JSON.stringify(bindings, null, 2));
console.log('\nMortgage source_pattern fixed. Derivations updated:', fixed);
"
```

### 1C: Verify the Fix

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const MORTGAGE_RS_ID = 'REPLACE_WITH_MORTGAGE_RULE_SET_ID';

const { data: rs } = await sb.from('rule_sets').select('input_bindings').eq('id', MORTGAGE_RS_ID).single();
const bindings = rs?.input_bindings || {};
const derivations = bindings.metric_derivations || bindings.derivations || [];

let hasUnnormalized = false;
for (const d of derivations) {
  const sp = d.source_pattern || d.data_type || '';
  if (sp.includes('component_data:')) hasUnnormalized = true;
  console.log('metric:', d.metric || d.metric_name, '| source_pattern:', sp);
}

console.log('\nVERDICT:', hasUnnormalized ? 'FAIL — unnormalized patterns remain' : 'PASS — all patterns normalized');
"
```

**PASTE ALL OUTPUT.**

**Commit:** `HF-081 Phase 1: Fix Mortgage source_pattern — normalized data_type reference`

---

## PHASE 2: FIX CONSUMER LENDING DERIVATION (F-03)

The Consumer Lending derivation uses `operation: "count"` which returns row count (e.g., 9). The calculation intent then multiplies by a rate (e.g., 0.025), producing $0.225.

The fix: change `operation` from `"count"` to `"sum"` and add `source_field` pointing to the actual amount column from the committed_data (discovered in Phase 0B — likely "LoanAmount" or "amount" or similar).

### 2A: Identify the Amount Field

From Phase 0B output, identify the field name in loan disbursement committed_data that contains the dollar amount. This is the field that `sum` should operate on.

### 2B: Apply the Fix

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const LAB = 'REPLACE_WITH_LAB_TENANT_ID';
const CL_RS_ID = 'REPLACE_WITH_CONSUMER_LENDING_RULE_SET_ID';

// Read current input_bindings
const { data: rs } = await sb.from('rule_sets').select('input_bindings').eq('id', CL_RS_ID).single();
const bindings = rs?.input_bindings || {};

console.log('BEFORE:', JSON.stringify(bindings, null, 2));

// Fix derivations from count → sum with source_field
const derivations = bindings.metric_derivations || bindings.derivations || [];
let fixed = 0;
for (const d of derivations) {
  if (d.operation === 'count') {
    const metric = d.metric || d.metric_name;
    
    // Determine if this metric SHOULD be a sum (dollar-based) or genuinely a count
    // Consumer Lending Commission: the plan applies a RATE to a VOLUME
    // Volume = total loan amount, not number of loans
    // So the derivation must SUM the amount field, not COUNT rows
    
    // Check if there's a filter suggesting this is meant to count qualified items
    const hasQualificationFilter = d.filters && JSON.stringify(d.filters).toLowerCase().includes('qualified');
    
    if (!hasQualificationFilter) {
      // This is a volume metric — change to sum
      console.log('Fixing:', metric, '| count →', 'sum');
      d.operation = 'sum';
      d.source_field = 'REPLACE_WITH_ACTUAL_AMOUNT_FIELD'; // e.g., 'LoanAmount' or 'amount'
      // NOTE: Use the EXACT field name from Phase 0B committed_data sample
      // The field name in committed_data.data JSONB is the key to use
      fixed++;
    } else {
      console.log('Keeping count for:', metric, '(has qualification filter — genuinely counting qualified items)');
    }
  }
}

if (fixed === 0) {
  console.log('WARNING: No count operations found to fix. Verify Phase 0A output.');
  console.log('Derivations:', JSON.stringify(derivations, null, 2));
}

// Write back
const { error } = await sb.from('rule_sets').update({ input_bindings: bindings }).eq('id', CL_RS_ID);
if (error) { console.error('UPDATE FAILED:', error); process.exit(1); }

console.log('\nAFTER:', JSON.stringify(bindings, null, 2));
console.log('\nConsumer Lending derivations fixed:', fixed);
"
```

### 2C: Verify the Fix

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const CL_RS_ID = 'REPLACE_WITH_CONSUMER_LENDING_RULE_SET_ID';

const { data: rs } = await sb.from('rule_sets').select('input_bindings').eq('id', CL_RS_ID).single();
const bindings = rs?.input_bindings || {};
const derivations = bindings.metric_derivations || bindings.derivations || [];

for (const d of derivations) {
  console.log('metric:', d.metric || d.metric_name);
  console.log('  operation:', d.operation);
  console.log('  source_field:', d.source_field || 'NONE');
  console.log('  source_pattern:', d.source_pattern || d.data_type || 'NONE');
}
"
```

**PASTE ALL OUTPUT.**

**Commit:** `HF-081 Phase 2: Fix Consumer Lending derivation — sum on amount field, not count`

---

## PHASE 3: CODE FIX — PREVENT RACE CONDITION IN WIRE API

The root cause of F-02 is that convergence can run before normalization completes. The wire API sequence must guarantee normalization finishes before convergence writes derivation rules.

### 3A: Read Current Wire API

```bash
cat web/src/app/api/intelligence/wire/route.ts
```

### 3B: Verify Normalization → Convergence Order

In the wire API code, confirm that:
1. Step 2 (normalize data_types) is `await`ed and completes fully
2. Step 5 (convergence) runs AFTER Step 2 resolves
3. There is no parallel execution that could cause convergence to read pre-normalization data_types

If the order is already correct (normalization awaited, convergence after), the race condition was a one-time issue from multiple wire calls. In that case, add a verification step: convergence should validate that `source_pattern` matches an existing `data_type` in committed_data before writing the derivation.

### 3C: Add Source Pattern Validation to Convergence

In the convergence function (likely in the wire API or a service it calls), add a guard:

```typescript
// Before writing a derivation rule, verify source_pattern matches actual data
// This prevents the race condition from producing broken derivations
const { data: matchingData } = await supabase
  .from('committed_data')
  .select('data_type')
  .eq('tenant_id', tenantId)
  .eq('data_type', derivation.source_pattern)
  .limit(1);

if (!matchingData || matchingData.length === 0) {
  console.warn(`[convergence] source_pattern "${derivation.source_pattern}" has no matching committed_data — skipping derivation`);
  // Do NOT write this derivation — it would produce $0 results
  continue;
}
```

**IMPORTANT:** This validation must:
- NOT hardcode any data_type names (Korean Test)
- NOT introduce domain vocabulary
- Simply verify that the referenced data_type exists in committed_data for this tenant

### 3D: Build Verification

```bash
cd /Users/AndrewAfrica/spm-platform
kill $(lsof -ti:3000) 2>/dev/null || true
rm -rf web/.next
cd web && npm run build && cd ..
echo "Build exit code: $?"
```

**PASTE BUILD OUTPUT.** Must exit 0.

**Commit:** `HF-081 Phase 3: Convergence source_pattern validation — prevent race condition`

---

## PHASE 4: RE-RUN CALCULATION FOR LAB

Delete existing LAB calculation results and re-run to verify the fixes produce correct payouts.

### 4A: Delete Existing LAB Results

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'REPLACE_WITH_LAB_TENANT_ID';

// Count before
const { count: before } = await sb.from('calculation_results').select('*', { count: 'exact', head: true }).eq('tenant_id', LAB);
console.log('Results before delete:', before);

// Delete
const { error, count: deleted } = await sb.from('calculation_results').delete({ count: 'exact' }).eq('tenant_id', LAB);
if (error) { console.error('DELETE FAILED:', error); process.exit(1); }
console.log('Deleted:', deleted, 'rows');

// Count after
const { count: after } = await sb.from('calculation_results').select('*', { count: 'exact', head: true }).eq('tenant_id', LAB);
console.log('Results after delete:', after, '(should be 0)');
"
```

### 4B: Trigger Calculation via API

```bash
# Start dev server if not running
cd /Users/AndrewAfrica/spm-platform/web
npm run dev &
sleep 10

# Get rule_set IDs and period IDs for LAB
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'REPLACE_WITH_LAB_TENANT_ID';

const { data: rs } = await sb.from('rule_sets').select('id, name').eq('tenant_id', LAB).eq('status', 'active');
const { data: periods } = await sb.from('periods').select('id, label, start_date').eq('tenant_id', LAB);

console.log('Rule Sets:', rs?.map(r => ({ id: r.id, name: r.name })));
console.log('Periods:', periods?.map(p => ({ id: p.id, label: p.label || p.start_date })));

// Trigger calculation for each plan × period
for (const plan of rs || []) {
  for (const period of periods || []) {
    console.log(\`\nCalculating: \${plan.name} × \${period.label || period.start_date}...\`);
    const response = await fetch('http://localhost:3000/api/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: LAB,
        rule_set_id: plan.id,
        period_id: period.id
      })
    });
    const result = await response.json();
    console.log('  Status:', response.status, '| Results:', result.count || result.results_count || JSON.stringify(result).slice(0, 100));
  }
}
"
```

**NOTE:** The calculation API endpoint may be at a different path. Check `web/src/app/api/` for the correct route. It could be `/api/calculate`, `/api/admin/calculate`, `/api/calculation/run`, etc. Adapt accordingly.

**PASTE ALL OUTPUT.**

**Commit:** `HF-081 Phase 4: Re-run LAB calculation with fixed derivations`

---

## PHASE 5: CC-UAT VERIFICATION TRACE (LAYERS 2, 5, 6)

This is the integrated verification. Re-run the forensic trace layers that are affected by the fixes.

### 5A: Layer 2 — Rule Set Input Bindings

```bash
echo "╔══════════════════════════════════════════════════════╗"
echo "║  HF-081 VERIFICATION: LAYER 2 — RULE SET BINDINGS   ║"
echo "╚══════════════════════════════════════════════════════╝"

cd /Users/AndrewAfrica/spm-platform

npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'REPLACE_WITH_LAB_TENANT_ID';

const { data: ruleSets } = await sb.from('rule_sets')
  .select('id, name, status, input_bindings')
  .eq('tenant_id', LAB)
  .eq('status', 'active');

let allBindingsValid = true;
for (const rs of ruleSets || []) {
  const bindings = rs.input_bindings || {};
  const derivations = bindings.metric_derivations || bindings.derivations || [];
  
  console.log(\`\n\${rs.name}:\`);
  for (const d of (Array.isArray(derivations) ? derivations : [])) {
    const sp = d.source_pattern || d.data_type || 'NONE';
    const op = d.operation || 'NONE';
    const sf = d.source_field || 'NONE';
    const hasPrefix = sp.includes('component_data:');
    
    console.log(\`  metric: \${d.metric || d.metric_name}\`);
    console.log(\`    source_pattern: \${sp} \${hasPrefix ? '⚠️ UNNORMALIZED' : '✓'}\`);
    console.log(\`    operation: \${op}\`);
    console.log(\`    source_field: \${sf}\`);
    
    if (hasPrefix) allBindingsValid = false;
  }
}

console.log(\`\nLAYER 2 VERDICT: \${allBindingsValid ? 'PASS — all source_patterns normalized' : 'FAIL — unnormalized patterns remain'}\`);
"
```

### 5B: Layer 5 — Calculation Results

```bash
echo "╔══════════════════════════════════════════════════════╗"
echo "║  HF-081 VERIFICATION: LAYER 5 — CALCULATION RESULTS ║"
echo "╚══════════════════════════════════════════════════════╝"

cd /Users/AndrewAfrica/spm-platform

npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const LAB = 'REPLACE_WITH_LAB_TENANT_ID';

const { data: results, count } = await sb.from('calculation_results')
  .select('*, rule_sets!inner(name), entities!inner(external_id, name)', { count: 'exact' })
  .eq('tenant_id', LAB);

console.log('Total results:', count);

const byPlan: Record<string, { count: number; total: number; nonZero: number; min: number; max: number }> = {};
for (const r of results || []) {
  const plan = (r as any).rule_sets?.name || 'UNKNOWN';
  if (!byPlan[plan]) byPlan[plan] = { count: 0, total: 0, nonZero: 0, min: Infinity, max: -Infinity };
  const payout = Number(r.total_payout) || 0;
  byPlan[plan].count++;
  byPlan[plan].total += payout;
  if (payout > 0) byPlan[plan].nonZero++;
  byPlan[plan].min = Math.min(byPlan[plan].min, payout);
  byPlan[plan].max = Math.max(byPlan[plan].max, payout);
}

let grandTotal = 0;
let mortgageNonZero = false;
let clReasonable = false;

for (const [plan, s] of Object.entries(byPlan).sort()) {
  grandTotal += s.total;
  console.log(\`\n\${plan}:\`);
  console.log(\`  Results: \${s.count} | Non-zero: \${s.nonZero} | Total: \$\${s.total.toFixed(2)}\`);
  console.log(\`  Range: [\$\${s.min.toFixed(2)}, \$\${s.max.toFixed(2)}]\`);
  
  if (plan.toLowerCase().includes('mortgage') && s.nonZero > 0) mortgageNonZero = true;
  if (plan.toLowerCase().includes('consumer') && s.max > 100) clReasonable = true;
  
  if (s.nonZero === 0) console.log(\`  ⚠️ ALL ZERO\`);
  if (s.max <= 1 && s.nonZero > 0) console.log(\`  ⚠️ MAX ≤ \$1 — rate-not-volume bug persists\`);
}

console.log(\`\nGRAND TOTAL: \$\${grandTotal.toFixed(2)}\`);

console.log('\n═══ F-02 CHECK (Mortgage) ═══');
console.log(mortgageNonZero ? 'PASS — Mortgage produces non-zero results' : 'FAIL — Mortgage still \$0');

console.log('\n═══ F-03 CHECK (Consumer Lending) ═══');
console.log(clReasonable ? 'PASS — Consumer Lending produces realistic amounts (max > \$100)' : 'FAIL — Consumer Lending still producing pennies');

console.log('\n═══ OFFICER 1001 TRACE ═══');
const o1001 = results?.filter(r => {
  const ext = (r as any).entities?.external_id;
  return ext === '1001' || ext === 1001;
}) || [];
for (const r of o1001) {
  console.log(\`  \${(r as any).rule_sets?.name}: \$\${Number(r.total_payout).toFixed(2)}\`);
}
"
```

### 5C: Layer 6 — MBC Regression

```bash
echo "╔══════════════════════════════════════════════════════╗"
echo "║  HF-081 VERIFICATION: LAYER 6 — MBC REGRESSION      ║"
echo "╚══════════════════════════════════════════════════════╝"

cd /Users/AndrewAfrica/spm-platform

npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Find MBC tenant — Caribe Financial or Mexican Bank Co
const { data: tenants } = await sb.from('tenants').select('id, name');
const mbc = tenants?.find(t => t.name.includes('Mexican') || t.name.includes('Caribe') || t.name.includes('Pipeline'));
if (!mbc) { console.log('MBC tenant not found. Available:', tenants?.map(t => t.name)); process.exit(1); }

// NOTE: Use the same MBC tenant_id from CC-UAT-05 Layer 6
const MBC = mbc.id;
console.log('MBC tenant:', mbc.name, MBC);

const { data: results, count } = await sb.from('calculation_results')
  .select('total_payout', { count: 'exact' })
  .eq('tenant_id', MBC);

const grandTotal = (results || []).reduce((sum, r) => sum + (Number(r.total_payout) || 0), 0);
console.log(\`Grand total:  \$\${grandTotal.toFixed(2)}\`);
console.log(\`Expected:     \$3,245,212.64\`);
console.log(\`Delta:        \$\${Math.abs(grandTotal - 3245212.64).toFixed(2)}\`);
console.log(\`Row count:    \${count}\`);
console.log(\`VERDICT:      \${Math.abs(grandTotal - 3245212.64) < 0.10 && count === 240 ? 'PASS' : 'FAIL'}\`);
"
```

**PASTE ALL OUTPUT from 5A, 5B, 5C.**

**Commit:** `HF-081 Phase 5: CC-UAT verification trace — Layers 2, 5, 6`

---

## PHASE 6: COMPLETION REPORT

Create `HF-081_COMPLETION_REPORT.md` at project root.

```markdown
# HF-081 COMPLETION REPORT
## LAB Calculation Accuracy — Mortgage Source Pattern + Consumer Lending Derivation Fix
## Date: [DATE]

## COMMITS (in order)
| Hash | Phase | Description |
|------|-------|-------------|
| | Phase 0 | Diagnostic — current LAB state |
| | Phase 1 | Fix Mortgage source_pattern |
| | Phase 2 | Fix Consumer Lending derivation |
| | Phase 3 | Convergence source_pattern validation |
| | Phase 4 | Re-run LAB calculation |
| | Phase 5 | CC-UAT verification trace |
| | Phase 6 | This completion report |

## FILES MODIFIED
| File | Change |
|------|--------|
| web/src/app/api/intelligence/wire/route.ts | Source_pattern validation in convergence |

## DATABASE CHANGES
| Table | Change |
|-------|--------|
| rule_sets (LAB Mortgage) | input_bindings.metric_derivations[].source_pattern normalized |
| rule_sets (LAB Consumer Lending) | input_bindings.metric_derivations[].operation: count → sum, source_field added |
| calculation_results (LAB) | Deleted and re-calculated |

## PROOF GATES — HARD
| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| PG-01 | npm run build exits 0 | | [paste exit code] |
| PG-02 | Mortgage source_pattern references normalized data_type | | [paste from 5A] |
| PG-03 | Consumer Lending derivation uses sum, not count | | [paste from 5A] |
| PG-04 | Consumer Lending source_field references actual amount column | | [paste from 5A] |
| PG-05 | Mortgage results > $0 (at least 1 non-zero entity) | | [paste from 5B] |
| PG-06 | Consumer Lending max payout > $100 (realistic dollar amounts) | | [paste from 5B] |
| PG-07 | Insurance Referral results unchanged or improved (was $366,600) | | [paste from 5B] |
| PG-08 | MBC grand total = $3,245,212.64 ± $0.10 | | [paste from 5C] |
| PG-09 | MBC row count = 240 | | [paste from 5C] |
| PG-10 | No auth files modified | | [git diff --name-only] |

## PROOF GATES — SOFT
| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| PG-S1 | Officer 1001 has non-zero Mortgage payout | | [paste from 5B] |
| PG-S2 | Officer 1001 Consumer Lending payout > $100 | | [paste from 5B] |
| PG-S3 | Convergence validation prevents future race conditions | | [paste code snippet] |
| PG-S4 | No domain vocabulary in new code (Korean Test) | | [grep output] |

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): PASS/FAIL
- Rule 2 (cache clear after build): PASS/FAIL
- Rule 25 (report before final build): PASS/FAIL
- Rule 27 (evidence = paste): PASS/FAIL
- Rule 28 (commit per phase): PASS/FAIL

## KNOWN ISSUES
- F-01 (full-coverage fallback): NOT ADDRESSED — separate fix
- F-04 (Deposit Growth uniform): NOT ADDRESSED — requires Decision 72 multi-tab XLSX
- F-65 (Tab 2 targets): NOT ADDRESSED — requires separate OB

## CC-UAT-05 TRACE COMPARISON
| Finding | Before HF-081 | After HF-081 |
|---------|---------------|--------------|
| F-02 Mortgage | $0.00 all entities | [new total] |
| F-03 Consumer Lending | $0.32 max, $15.48 total | [new total] |
| F-01 Full-coverage | 100 assignments | 100 assignments (unchanged) |
| F-04 Deposit Growth | $30K uniform | [unchanged / improved] |
| Grand total | $1,806,615.48 | [new total] |
```

**Commit:** `HF-081 Phase 6: Completion report with CC-UAT evidence`

---

## FINAL: GIT PROTOCOL

```bash
cd /Users/AndrewAfrica/spm-platform
kill $(lsof -ti:3000) 2>/dev/null || true
rm -rf web/.next
cd web && npm run build && cd ..
npm run dev &
sleep 10
# Verify localhost:3000 responds
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
kill $(lsof -ti:3000) 2>/dev/null || true

git add -A
git commit -m "HF-081 Complete: LAB Mortgage + Consumer Lending calculation accuracy"
git push origin dev

gh pr create --base main --head dev --title "HF-081: LAB Calculation Accuracy — Mortgage source_pattern + Consumer Lending derivation" --body "Fixes CC-UAT-05 findings F-02 (Mortgage \$0 from unnormalized source_pattern) and F-03 (Consumer Lending pennies from count-not-sum). Includes convergence validation to prevent future race conditions. CC-UAT verification trace: Layers 2, 5, 6."
```

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Hardcoding data_type names in convergence validation | Query committed_data for EXISTING data_types — never assume names |
| AP-2 | Fixing LAB by changing the normalization to match old patterns | Fix derivations to match normalized data. Data normalization is correct. |
| AP-3 | Changing Consumer Lending to sum without identifying the actual amount field | Phase 0B reveals exact field names. Use the real field name. |
| AP-4 | Modifying MBC data or calculations | MBC is regression baseline. Zero changes to MBC tenant. |
| AP-5 | Running convergence again instead of surgically fixing stored derivations | Convergence might recreate the same broken derivations. Fix the stored data directly, THEN fix convergence code to prevent recurrence. |
| AP-6 | Adding domain vocabulary to convergence validation (e.g., checking for "mortgage" or "loan") | Validation checks data_type EXISTS in committed_data. Does not check what the data_type IS. Korean Test. |

---

*"Mortgage $0 and Consumer Lending $0.32 both passed the row-count verification. They both fail the forensic trace."*
*"We are not making a movie." — Standing Rule 27.*
