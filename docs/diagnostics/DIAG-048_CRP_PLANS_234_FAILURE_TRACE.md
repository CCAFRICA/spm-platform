# DIAG-048 — CRP Plans 2/3/4 Failure Trace

**Status:** ACTIVE
**Type:** Diagnostic, read-only (Phase 0)
**Scope:** Three CRP plan failures. Each arm traces the complete code path from convergence output through engine resolution to intent execution, with runtime data extraction at every stage.
**Predecessor:** DIAG-036 (metric population path), DIAG-047 (filter provenance), AUD-009 (LLM output fidelity)
**Context:** CRP Plan 1 reconciles at $360,007.84 exact across 96 entity-period cells. Plans 2, 3, and 4 fail. This diagnostic surfaces WHY by tracing actual code and actual runtime data.

---

## STANDING RULES

1. **Read-only. No code changes. No migrations. No fixes.**
2. After EVERY phase: `git add -A && git commit -m "DIAG-048 Phase N: [description]" && git push origin diag-048-crp-plans-234-trace`
3. Git from repo root (spm-platform), NOT from web/.
4. Read `CC_STANDING_ARCHITECTURE_RULES.md` before any operations.
5. **DO NOT INTERPRET FINDINGS.** Paste code verbatim. Paste data verbatim. Architect interprets.

---

## BRANCH SETUP

```bash
cd ~/spm-platform
git fetch origin
git checkout main && git pull origin main
git checkout -b diag-048-crp-plans-234-trace
git add -A && git commit --allow-empty -m "DIAG-048 Phase 0: branch setup" && git push -u origin diag-048-crp-plans-234-trace
```

---

## Phase 1 — The source_pattern gate in applyMetricDerivations

### 1.1 Read applyMetricDerivations full body

```bash
grep -n "export function applyMetricDerivations" web/src/lib/calculation/run-calculation.ts
```

Read the ENTIRE function from declaration to closing brace. Paste verbatim with line numbers.

**Critical questions this answers:**
- Does `source_pattern` regex still gate row collection?
- If `matchingRows.length === 0`, does `continue` skip the derivation?
- For `count` operation, does it use `rowMatchesFilters` or inline filter logic?
- For `sum` operation, does it use `rowMatchesFilters`?

### 1.2 Read the OB-118 merge site

Find the merge layer in the per-entity per-component loop:

```bash
grep -n "OB-118.*Merge derived\|derivedMetrics\|for.*entries.*derivedMetrics" web/src/app/api/calculation/run/route.ts
```

Read 30 lines of context around each hit. Paste verbatim. Confirm:
- Is the merge INSIDE the per-component loop (applies to each component)?
- Does it run regardless of whether convergence_bindings was the resolution path?
- Does it run BEFORE the intent executor?

### 1.3 Read the derivationInput construction

```bash
grep -n "derivationInput\|applyMetricDerivations" web/src/app/api/calculation/run/route.ts | head -15
```

Read 40 lines of context around the `derivationInput` construction. Paste verbatim. This shows what Map keys (data_type strings) are available to the source_pattern regex.

Append all under `## Phase 1 — applyMetricDerivations source_pattern gate` in output file.

```bash
git add docs/diagnostics/DIAG-048_CRP_PLANS_234_FAILURE_TRACE_OUTPUT.md
git commit -m "DIAG-048 Phase 1: applyMetricDerivations source_pattern gate"
git push origin diag-048-crp-plans-234-trace
```

---

## Phase 2 — Plan 3 (Cross-Sell): source_pattern vs entitySheetData keys

### 2.1 Extract the actual source_pattern from CRP Cross-Sell derivation rules

The derivation rules are persisted in `input_bindings.metric_derivations`. Read them:

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
  const { data: plans } = await sb.from('rule_sets')
    .select('id, name, input_bindings')
    .eq('tenant_id', tenantId);
  for (const p of plans || []) {
    const bindings = p.input_bindings || {};
    const derivations = bindings.metric_derivations || [];
    const cb = bindings.convergence_bindings || {};
    console.log('\n=== ' + p.name + ' ===');
    console.log('metric_derivations (' + derivations.length + '):');
    for (const d of derivations) {
      console.log('  metric=' + d.metric + ' op=' + d.operation + ' source_pattern=' + JSON.stringify(d.source_pattern) + ' source_field=' + (d.source_field || 'N/A') + ' filters=' + JSON.stringify(d.filters));
    }
    console.log('convergence_bindings keys:', Object.keys(cb));
    for (const [k, v] of Object.entries(cb)) {
      const binding = v as Record<string, unknown>;
      const roles = Object.keys(binding).filter(r => r !== 'period' && r !== 'entity_identifier');
      for (const role of roles) {
        const entry = binding[role] as Record<string, unknown>;
        console.log('  ' + k + '.' + role + ' → column=' + (entry?.column || 'N/A') + ' filters=' + JSON.stringify((entry as any)?.filters || []));
      }
    }
  }
})();
"
```

Paste complete output verbatim.

### 2.2 Extract the entitySheetData keys for a CRP entity

The `entitySheetData` Map is keyed by `data_type` from `committed_data`. Find what `data_type` values exist for CRP entities:

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
  // Get all distinct data_type values
  const { data: types } = await sb
    .from('committed_data')
    .select('data_type')
    .eq('tenant_id', tenantId);
  const unique = [...new Set((types || []).map(r => r.data_type))];
  console.log('Distinct data_type values (' + unique.length + '):');
  for (const dt of unique) {
    const { count } = await sb
      .from('committed_data')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('data_type', dt);
    console.log('  ' + JSON.stringify(dt) + ' → ' + count + ' rows');
  }

  // Get one entity's data to see what keys entitySheetData would have
  console.log('\nSample: Tyler Morrison (CRP-6007) committed_data:');
  const { data: entityRows } = await sb
    .from('committed_data')
    .select('data_type, source_date, row_data')
    .eq('tenant_id', tenantId)
    .eq('entity_identifier', 'CRP-6007')
    .limit(5);
  for (const r of entityRows || []) {
    const rd = r.row_data as Record<string, unknown>;
    console.log('  data_type=' + JSON.stringify(r.data_type) + ' source_date=' + r.source_date + ' keys=' + Object.keys(rd).join(','));
    // Show product_category and order_type if present
    if (rd.product_category) console.log('    product_category=' + rd.product_category);
    if (rd.order_type) console.log('    order_type=' + rd.order_type);
  }
})();
"
```

Paste complete output verbatim.

### 2.3 Test the regex match

Using the source_pattern from 2.1 and the data_type values from 2.2, test whether the regex matches:

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
// Paste the source_pattern values from 2.1 and data_type values from 2.2 here
// This script tests whether the regex matches
const patterns = []; // FILL from 2.1
const dataTypes = []; // FILL from 2.2

for (const pattern of patterns) {
  const regex = new RegExp(pattern, 'i');
  console.log('Pattern: ' + pattern);
  for (const dt of dataTypes) {
    console.log('  vs ' + JSON.stringify(dt) + ' → ' + regex.test(dt));
  }
}
"
```

**NOTE TO CC:** Fill the arrays from the actual values extracted in 2.1 and 2.2 before running.

Paste complete output verbatim.

Append all under `## Phase 2 — Plan 3 source_pattern vs entitySheetData keys` in output file.

```bash
git add docs/diagnostics/DIAG-048_CRP_PLANS_234_FAILURE_TRACE_OUTPUT.md
git commit -m "DIAG-048 Phase 2: Plan 3 source_pattern vs entitySheetData keys"
git push origin diag-048-crp-plans-234-trace
```

---

## Phase 3 — Plan 2 (Consumables): quota column resolution

### 3.1 Extract DataCapability for CRP

The convergence AI call receives column lists from `inventoryData()`. What columns does it see?

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Import inventoryData if possible, otherwise replicate the query
(async () => {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

  // Get all import_batches for the tenant
  const { data: batches } = await sb
    .from('import_batches')
    .select('id, file_name, data_type, status')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  console.log('Import batches (' + (batches?.length || 0) + '):');
  for (const b of batches || []) {
    console.log('  ' + b.file_name + ' | data_type=' + b.data_type + ' | status=' + b.status + ' | id=' + b.id);
  }

  // For each distinct data_type, sample the columns
  const { data: allRows } = await sb
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', tenantId)
    .limit(200);

  const byType = new Map();
  for (const r of allRows || []) {
    if (!byType.has(r.data_type)) byType.set(r.data_type, []);
    byType.get(r.data_type).push(r.row_data);
  }

  for (const [dt, rows] of byType.entries()) {
    console.log('\ndata_type=' + JSON.stringify(dt) + ' (' + rows.length + ' sampled rows):');
    // Collect all column names
    const allCols = new Set();
    for (const rd of rows) {
      if (rd && typeof rd === 'object') {
        for (const k of Object.keys(rd)) allCols.add(k);
      }
    }
    console.log('  columns: ' + [...allCols].sort().join(', '));

    // Check if monthly_quota exists
    if (allCols.has('monthly_quota')) {
      const vals = rows.map(r => r.monthly_quota).filter(v => v != null);
      console.log('  monthly_quota values (first 5): ' + JSON.stringify(vals.slice(0, 5)));
    }

    // Show categorical fields (fields with string values, <20 distinct)
    const catFields = [];
    for (const col of allCols) {
      if (col.startsWith('_')) continue;
      const vals = rows.map(r => r[col]).filter(v => typeof v === 'string');
      const distinct = [...new Set(vals)];
      if (distinct.length > 0 && distinct.length <= 20) {
        catFields.push({ field: col, distinctValues: distinct });
      }
    }
    if (catFields.length > 0) {
      console.log('  categorical fields:');
      for (const cf of catFields) {
        console.log('    ' + cf.field + ': ' + JSON.stringify(cf.distinctValues));
      }
    }

    // Show numeric fields
    const numFields = [];
    for (const col of allCols) {
      if (col.startsWith('_')) continue;
      const vals = rows.map(r => r[col]).filter(v => typeof v === 'number');
      if (vals.length > rows.length * 0.3) {
        numFields.push(col);
      }
    }
    if (numFields.length > 0) {
      console.log('  numeric fields: ' + numFields.join(', '));
    }
  }
})();
"
```

Paste complete output verbatim.

**Key question:** Does the quota file's `monthly_quota` column appear as a numeric field in any data_type? If yes, does `resolveColumnMappingsViaAI` receive it in the `measureColumns` list? If no, why is the quota batch excluded from capabilities?

### 3.2 Read how inventoryData builds DataCapability

```bash
grep -n "function inventoryData\|async function inventoryData" web/src/lib/intelligence/convergence-service.ts
```

Read the full function body. Paste verbatim. Critical questions:
- Does it query ALL import_batches for the tenant?
- Does it filter by data_type or status?
- Does it sample committed_data rows to build the capability?
- If the quota file has a different data_type than the sales file, are both included?

### 3.3 Read what measureColumns resolveColumnMappingsViaAI receives

In `generateAllComponentBindings`, find where `measureColumns` is constructed and passed to `resolveColumnMappingsViaAI`:

```bash
grep -n "measureColumns\|measureCols" web/src/lib/intelligence/convergence-service.ts | head -20
```

Read 30 lines of context around the construction site. Paste verbatim. Does `measureColumns` include columns from ALL data capabilities, or only from one matched capability?

Append all under `## Phase 3 — Plan 2 quota column resolution` in output file.

```bash
git add docs/diagnostics/DIAG-048_CRP_PLANS_234_FAILURE_TRACE_OUTPUT.md
git commit -m "DIAG-048 Phase 3: Plan 2 quota column resolution"
git push origin diag-048-crp-plans-234-trace
```

---

## Phase 4 — Plan 4 (District Override): TypeError crash

### 4.1 Find the startsWith crash site

The error is in minified code: `eK` at route.js:1:34760. Find the unminified equivalent:

```bash
grep -n "startsWith" web/src/app/api/calculation/run/route.ts | head -20
```

For each `startsWith` call site, read 20 lines of context. Paste verbatim.

### 4.2 Check which function is eK in the minified bundle

```bash
# Find the crash location in the minified bundle
cat web/.next/server/app/api/calculation/run/route.js | cut -c34740-34800
```

Paste verbatim. This shows the minified context around the crash.

### 4.3 Read buildMetricsForComponent for null safety

The crash happens in the sheet-matching fallback path. Read `buildMetricsForComponent`:

```bash
grep -n "function buildMetricsForComponent" web/src/lib/calculation/run-calculation.ts
```

Read the full function body. Paste verbatim. Look for:
- Any `startsWith` calls
- Any property access that could be undefined
- What happens when an entity has no matching sheets (only roster data)

### 4.4 Read the entity data for Elena Marchetti (the crashing entity)

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

  // Find Elena Marchetti's entity
  const { data: entities } = await sb
    .from('entities')
    .select('id, external_id, name, metadata')
    .eq('tenant_id', tenantId)
    .ilike('name', '%Marchetti%');

  console.log('Entities matching Marchetti:', JSON.stringify(entities, null, 2));

  if (entities && entities.length > 0) {
    const eid = entities[0].id;
    const extId = entities[0].external_id;

    // Get committed_data for this entity
    const { data: rows } = await sb
      .from('committed_data')
      .select('data_type, source_date, row_data')
      .eq('tenant_id', tenantId)
      .or('entity_id.eq.' + eid + ',entity_identifier.eq.' + extId)
      .limit(10);

    console.log('\nCommitted data rows (' + (rows?.length || 0) + '):');
    for (const r of rows || []) {
      const rd = r.row_data as Record<string, unknown>;
      console.log('  data_type=' + r.data_type + ' source_date=' + r.source_date);
      console.log('  row_data keys: ' + Object.keys(rd).sort().join(', '));
    }
  }
})();
"
```

Paste complete output verbatim.

Append all under `## Phase 4 — Plan 4 TypeError crash` in output file.

```bash
git add docs/diagnostics/DIAG-048_CRP_PLANS_234_FAILURE_TRACE_OUTPUT.md
git commit -m "DIAG-048 Phase 4: Plan 4 TypeError crash"
git push origin diag-048-crp-plans-234-trace
```

---

## Phase 5 — Plan 3 (Cross-Sell): conditional_gate intent structure

Even if source_pattern matches and derivedMetrics are populated, the conditional_gate executor needs to find them by the right metric names.

### 5.1 Read the Cross-Sell plan's calculationIntent

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
  const { data: plans } = await sb
    .from('rule_sets')
    .select('id, name, components')
    .eq('tenant_id', tenantId)
    .ilike('name', '%Cross-Sell%');

  for (const p of plans || []) {
    console.log('=== ' + p.name + ' ===');
    const comps = p.components as Record<string, unknown>;
    const variants = (comps?.variants || []) as Array<Record<string, unknown>>;
    for (const v of variants) {
      const vComps = (v.components || []) as Array<Record<string, unknown>>;
      for (const c of vComps) {
        console.log('Component: ' + c.name);
        console.log('calculationIntent:', JSON.stringify(c.calculationIntent, null, 2));
        console.log('expectedMetrics:', JSON.stringify(c.expectedMetrics));
        console.log('calculationMethod:', JSON.stringify(c.calculationMethod, null, 2));
      }
    }
  }
})();
"
```

Paste complete output verbatim.

### 5.2 Read the conditional_gate executor

```bash
grep -n "conditional_gate\|conditionalGate\|executeConditionalGate" web/src/lib/calculation/intent-executor.ts
```

If found, read the full function/case body. If not in intent-executor.ts:

```bash
grep -rn "conditional_gate" web/src/lib/calculation/ | head -20
```

Read the execution code for conditional_gate. Paste verbatim. Critical questions:
- What metric names does it look for in the `metrics{}` map?
- Does it read from `data.metrics[metricName]`?
- What metric name does it use for the gate condition?
- What metric name does it use for the payout input?
- If either metric is missing/0, what does it return?

### 5.3 Read getExpectedMetricNames for Cross-Sell component

The intent executor uses `getExpectedMetricNames(component)` to determine which metrics to expect. Read this function:

```bash
grep -n "function getExpectedMetricNames\|getExpectedMetric" web/src/app/api/calculation/run/route.ts | head -5
```

Read full function body. Paste verbatim. How does it determine the metric names for a conditional_gate component?

Append all under `## Phase 5 — Plan 3 conditional_gate intent structure` in output file.

```bash
git add docs/diagnostics/DIAG-048_CRP_PLANS_234_FAILURE_TRACE_OUTPUT.md
git commit -m "DIAG-048 Phase 5: Plan 3 conditional_gate intent structure"
git push origin diag-048-crp-plans-234-trace
```

---

## Phase 6 — Plan 2 (Consumables): piecewise_linear intent and quota resolution

### 6.1 Read the Consumables plan's calculationIntent

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
  const { data: plans } = await sb
    .from('rule_sets')
    .select('id, name, components')
    .eq('tenant_id', tenantId)
    .ilike('name', '%Consumable%');

  for (const p of plans || []) {
    console.log('=== ' + p.name + ' ===');
    const comps = p.components as Record<string, unknown>;
    const variants = (comps?.variants || []) as Array<Record<string, unknown>>;
    for (const v of variants) {
      const vComps = (v.components || []) as Array<Record<string, unknown>>;
      for (const c of vComps) {
        console.log('Component: ' + c.name);
        console.log('calculationIntent:', JSON.stringify(c.calculationIntent, null, 2));
        console.log('expectedMetrics:', JSON.stringify(c.expectedMetrics));
      }
    }
  }
})();
"
```

Paste complete output verbatim.

### 6.2 Read the piecewise_linear executor

```bash
grep -n "piecewise_linear\|piecewiseLinear" web/src/lib/calculation/intent-executor.ts | head -10
```

Read the execution code. Paste verbatim. Critical questions:
- How does it compute attainment (revenue/quota)?
- What metric names does it read for numerator and denominator?
- Does it use `ratioInput` or similar structure?
- If the denominator metric is missing/0, what happens?

### 6.3 Check what metric names the convergence_binding produces for Consumables

From Phase 2.1 output, check the Consumables plan's convergence_bindings. The binding has `numerator`, `denominator`, `actual` roles. What metric names do `getExpectedMetricNames` and `resolveMetricsFromConvergenceBindings` produce from these roles?

Read `resolveMetricsFromConvergenceBindings` — the ratio branch that handles numerator + denominator bindings. From AUD-009 Phase 6.2 (already in context):
- It computes `metrics[expectedMetrics[0]] = numValue / denValue`
- The metric key is `expectedMetrics[0]` — a SINGLE metric (the ratio result)
- But `piecewise_linear` needs BOTH `consumable_revenue` AND `monthly_quota` as SEPARATE metrics to compute attainment then apply tiers

This is the structural gap: `resolveMetricsFromConvergenceBindings` ratio branch produces ONE metric (the ratio). But `piecewise_linear` needs the RAW numerator and denominator values separately to apply tiered rates to the revenue.

Verify by reading the piecewise_linear executor's input expectations.

Append all under `## Phase 6 — Plan 2 piecewise_linear intent and quota resolution` in output file.

```bash
git add docs/diagnostics/DIAG-048_CRP_PLANS_234_FAILURE_TRACE_OUTPUT.md
git commit -m "DIAG-048 Phase 6: Plan 2 piecewise_linear intent and quota"
git push origin diag-048-crp-plans-234-trace
```

---

## Output file specification

**Path:** `docs/diagnostics/DIAG-048_CRP_PLANS_234_FAILURE_TRACE_OUTPUT.md`

**Required structure:**

```markdown
# DIAG-048 COMPLETION REPORT — CRP Plans 2/3/4 Failure Trace

**Date:** [ISO timestamp]
**Branch:** diag-048-crp-plans-234-trace
**Commit:** [SHA at start]
**Tenant:** Cascade Revenue Partners (e44bbcb1-2710-4880-8c7d-a1bd902720b7)

## Phase 1 — applyMetricDerivations source_pattern gate
[verbatim code + line numbers]

## Phase 2 — Plan 3 source_pattern vs entitySheetData keys
[verbatim data + regex test results]

## Phase 3 — Plan 2 quota column resolution
[verbatim data capabilities + inventoryData code]

## Phase 4 — Plan 4 TypeError crash
[verbatim code + entity data]

## Phase 5 — Plan 3 conditional_gate intent structure
[verbatim intent JSON + executor code]

## Phase 6 — Plan 2 piecewise_linear intent and quota
[verbatim intent JSON + executor code]
```

**Self-check before commit:**
1. ☐ Every section contains verbatim code or data — no paraphrase, no summary
2. ☐ No PASS/FAIL claims
3. ☐ No fix proposals
4. ☐ No source files modified
5. ☐ Line numbers included for all code pastes

---

## PR

```bash
gh pr create --base main --head diag-048-crp-plans-234-trace \
  --title "DIAG-048 Phase 0: CRP Plans 2/3/4 failure trace — read-only diagnostic" \
  --body "Read-only diagnostic tracing CRP Plans 2 (Consumables piecewise_linear), 3 (Cross-Sell conditional_gate), and 4 (District Override scope_aggregate TypeError) failures. Six phases: applyMetricDerivations source_pattern gate, source_pattern vs entitySheetData regex, quota column resolution, TypeError crash site, conditional_gate intent structure, piecewise_linear intent and quota. No code changes. Predecessor: DIAG-036, DIAG-047, AUD-009."
```

HALT after PR. Architect interprets findings.
