# OB-191: Convergence Pass 4 — Read calculationIntent Metrics, Not Component Names

## CONTEXT — THE UNIVERSAL BLOCKER

Convergence Pass 4 (OB-185 AI semantic derivation) is the platform's mechanism for bridging plan metric requirements to data fields. When Passes 1-3 fail to match structurally, Pass 4 invokes the AI to produce MetricDerivationRules.

**The bug:** Pass 4 sends the **component name** (e.g., "Senior Rep Equipment Commission") as the unresolved metric. The AI sees this string alongside committed_data fields like `total_amount, product_category, quantity` and can't produce a derivation because there's no semantic bridge between the component name and the data fields.

**The fix:** Pass 4 should read `calculationIntent.inputMetric` (e.g., `period_equipment_revenue`, label: "Equipment Revenue") and `calculationIntent.inputMetricLabel`. These are the semantic names the AI chose during plan interpretation — they bridge to data columns. "Equipment Revenue" → `SUM(total_amount) WHERE product_category = 'Capital Equipment'` is an inference the AI can make. "Senior Rep Equipment Commission" → ??? is not.

**This is universal.** Every tenant where Passes 1-3 fail (which is every tenant with raw transaction data) hits this. BCL and Meridian work because they have pre-aggregated data where column names match component names. CRP is the first real-world test with transaction-level data.

**This OB fixes ALL FOUR CRP plans in one pass:**

| Plan | Current Pass 4 Input | Correct Pass 4 Input | Expected Derivation |
|------|---------------------|---------------------|-------------------|
| Plan 1 (Capital Equipment) | "Senior Rep Equipment Commission" | `period_equipment_revenue` (label: "Equipment Revenue") | `SUM(total_amount) WHERE product_category = 'Capital Equipment'` |
| Plan 2 (Consumables) | Component name | `consumable_revenue` (label: "Consumable Revenue") | `SUM(total_amount) WHERE product_category = 'Consumables'` |
| Plan 3 (Cross-Sell) | Component name | `equipment_deal_count` + `cross_sell_count` | `COUNT(*) WHERE product_category = 'Capital Equipment'` + `COUNT(*) WHERE order_type = 'Cross-Sell'` |
| Plan 4 (District Override) | Component name | `equipment_revenue` (scope: district, label: "District Equipment Revenue") | `SUM(total_amount) WHERE product_category = 'Capital Equipment'` scoped by district |

## CC_STANDING_ARCHITECTURE_RULES
All rules from CC_STANDING_ARCHITECTURE_RULES.md v3.0 apply. Key rules:

- **Vertical Slice Rule:** This OB touches convergence (engine infrastructure) which feeds calculation which feeds reconciliation. One PR.
- **Rule 51v2:** `rm -rf .next` → `git stash` → `npx tsc --noEmit` → `npx next lint` → `git stash pop`. Both 0 errors on COMMITTED code.
- **Korean Test (AP-25):** ALL field identification uses STRUCTURAL heuristics. The AI prompt must describe what to match structurally, not reference specific field names like "product_category" or "total_amount."
- **Standing Rule 34:** No bypass. Fix convergence structurally.
- **Standing Rule 35:** EPG mandatory — the derivation rules produce numbers that feed formulas.
- **Code Gate:** Search AUD-001 before speculating. The convergence-service.ts code is extracted at section 6.1.
- **Never give CC the answer key.** Do NOT include the expected derivation rules in the prompt. CC must fix the convergence code so it produces them.

## GROUND TRUTH — WHAT CORRECT CONVERGENCE PRODUCES

When convergence works correctly for CRP Plan 1, the engine should:
1. Use `metric_derivations` to compute `period_equipment_revenue = SUM(total_amount) WHERE product_category = 'Capital Equipment'` per entity
2. Feed that value as `x` into the linear_function: `y = 0.06x + 200` (Senior Rep) or `y = 0.04x + 150` (Rep)
3. Produce $73,142.72 for Jan 1-15 (24 entities with revenue, 8 Senior + 16 Rep)

When convergence works for Plan 4 (scope_aggregate), the engine should:
1. Use `metric_derivations` to compute equipment revenue aggregated at district/region scope
2. Apply the override rate (1.5% for DM, 0.5% for RVP)
3. Produce $66,756.89 for January

## ARCHITECTURE DECISION GATE

Before writing any code, CC MUST:

1. **Read the convergence Pass 4 code:**
   ```bash
   grep -n "Pass 4\|unresolved\|semantic derivation\|aiService" web/src/lib/intelligence/convergence-service.ts | head -30
   ```
   Paste the output. Identify the exact function and line numbers where Pass 4 builds its AI prompt.

2. **Read what Pass 4 currently sends as the "unresolved metric":**
   ```bash
   # Find where the unresolved metric list is built
   grep -n "unresolved\|metric.*name\|component.*name" web/src/lib/intelligence/convergence-service.ts | head -20
   ```
   Paste the output. Identify whether it uses `component.name`, `component.expectedMetrics`, or `calculationIntent.inputMetric`.

3. **Read the calculationIntent structure on CRP Plan 1:**
   ```bash
   cd ~/spm-platform/web
   npx tsx --env-file=.env.local -e "
   const { createClient } = require('@supabase/supabase-js');
   const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
   async function run() {
     const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
     const { data: rs } = await sb.from('rule_sets')
       .select('id, name, components, input_bindings')
       .eq('tenant_id', tenantId)
       .eq('status', 'active');
     for (const r of rs || []) {
       console.log('\\n=== ' + r.name + ' ===');
       const comps = r.components?.variants?.[0]?.components || r.components?.components || [];
       for (const c of comps) {
         const ci = c.calculationIntent || {};
         console.log('  Component:', c.name);
         console.log('  calculationIntent.operation:', ci.operation);
         console.log('  calculationIntent inputs:', JSON.stringify(ci.inputs || ci.input || {}).substring(0, 200));
         console.log('  calculationMethod.inputMetric:', c.calculationMethod?.inputMetric);
         console.log('  calculationMethod.inputMetricLabel:', c.calculationMethod?.inputMetricLabel);
         console.log('  calculationMethod.baseMetric:', c.calculationMethod?.baseMetric);
         console.log('  calculationMethod.scope:', c.calculationMethod?.scope);
         console.log('  calculationMethod.metric:', c.calculationMethod?.metric);
       }
       console.log('  input_bindings keys:', Object.keys(r.input_bindings || {}));
       const md = (r.input_bindings?.metric_derivations || []);
       console.log('  metric_derivations count:', md.length);
       for (const d of md) {
         console.log('    ', d.metric, '→', d.operation, d.source_field || '', JSON.stringify(d.filters || []));
       }
     }
   }
   run();
   "
   ```
   Paste the FULL output. This reveals what metric names are available in `calculationIntent` for each plan.

4. **Read the existing AI prompt for Pass 4:**
   ```bash
   # Find the AI call in convergence-service.ts
   grep -n -A 20 "aiService\|getAIService\|semantic.*derivation\|Pass 4" web/src/lib/intelligence/convergence-service.ts | head -60
   ```
   Paste the output. This shows what prompt the AI receives and what context it gets.

5. **Check committed_data fields and categorical values for CRP:**
   ```bash
   cd ~/spm-platform/web
   npx tsx --env-file=.env.local -e "
   const { createClient } = require('@supabase/supabase-js');
   const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
   async function run() {
     const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
     const { data } = await sb.from('committed_data')
       .select('data_type, row_data')
       .eq('tenant_id', tenantId)
       .limit(5);
     console.log('Sample committed_data:');
     for (const d of data || []) {
       console.log('  data_type:', d.data_type);
       console.log('  row_data keys:', Object.keys(d.row_data || {}));
       console.log('  product_category:', d.row_data?.product_category);
       console.log('  order_type:', d.row_data?.order_type);
       console.log();
     }
     // Get distinct categorical values
     const { data: cats } = await sb.rpc('get_distinct_values', { p_tenant_id: tenantId }).catch(() => ({ data: null }));
     if (!cats) {
       // Manual approach
       const { data: allRows } = await sb.from('committed_data')
         .select('row_data')
         .eq('tenant_id', tenantId)
         .limit(100);
       const categories = new Set();
       const orderTypes = new Set();
       for (const r of allRows || []) {
         if (r.row_data?.product_category) categories.add(r.row_data.product_category);
         if (r.row_data?.order_type) orderTypes.add(r.row_data.order_type);
       }
       console.log('Distinct product_category:', Array.from(categories));
       console.log('Distinct order_type:', Array.from(orderTypes));
     }
   }
   run();
   "
   ```
   Paste the output. This shows what filter values the derivation rules need to target.

**CC must paste the results of ALL FIVE diagnostics before writing any code.**

---

## PHASE 1: FIX PASS 4 METRIC INPUT

### What to Change

In `web/src/lib/intelligence/convergence-service.ts`, find where Pass 4 builds the list of unresolved metrics to send to the AI. Currently it likely uses `component.name` or `component.expectedMetrics` (which may be derived from the component name).

**Change it to read from `calculationIntent`:**

For each unresolved metric/component, extract:
- `calculationIntent.inputs` or `calculationIntent.input` → the `sourceSpec.field` values (these are the metric names like `period_equipment_revenue`)
- `calculationMethod.inputMetric` / `calculationMethod.inputMetricLabel` (alternative location)
- `calculationMethod.baseMetric` / `calculationMethod.ratioMetric` (for piecewise_linear)
- `calculationMethod.metric` + `calculationMethod.scope` (for scope_aggregate)

Build the unresolved metric list from these fields instead of from the component name.

**For scope_aggregate specifically:** The AI needs to know that the metric should be aggregated at a scope level (district, region). The prompt should include the scope level so the AI can produce a derivation that the scope_aggregate evaluator can consume.

### What the AI Prompt Should Receive

Instead of:
```
Unresolved metrics: ["Senior Rep Equipment Commission"]
Available data fields: ["total_amount", "product_category", "quantity", ...]
```

It should receive:
```
Unresolved metrics: [
  { name: "period_equipment_revenue", label: "Equipment Revenue", operation: "linear_function" },
]
Available data fields: [
  { field: "total_amount", type: "number", sample_values: [179527, 93522, ...] },
  { field: "product_category", type: "categorical", distinct_values: ["Capital Equipment", "Consumables"] },
  { field: "order_type", type: "categorical", distinct_values: ["New", "Cross-Sell"] },
  ...
]
```

The AI can then infer: "Equipment Revenue" → `SUM(total_amount)` filtered by `product_category = 'Capital Equipment'`.

### Korean Test Compliance

The AI prompt must NOT hardcode field names or filter values. It describes structural patterns:
- "Match the metric name to available data fields. If the metric name suggests a subset of a broader numeric field, identify the categorical field and value that filters to the correct subset."
- The AI sees "Equipment Revenue" and "product_category: [Capital Equipment, Consumables]" and infers the filter.
- A Korean tenant with "장비매출" and "제품유형: [장비, 소모품]" would work identically.

---

## PHASE 2: FIX SCOPE_AGGREGATE DERIVATION (Plan 4)

### What's Different About scope_aggregate

Plan 4 (District Override) needs `equipment_revenue` aggregated at the **district** or **region** scope. The derivation rule is the same as Plan 1 (SUM total_amount WHERE product_category = Capital Equipment), but it needs to be aggregated across ALL entities in the same district/region, not just the individual entity.

The existing engine already has `entityScopeAgg` (HF-155) which pre-computes scope aggregates from `entities.metadata.district` and `entities.metadata.region`. The `intent-executor.ts` reads `data.scopeAggregates[key]`.

**The gap is that convergence doesn't produce a derivation for scope_aggregate metrics.** When the AI sees "District Equipment Revenue" with scope: "district", it needs to produce a derivation that tells the engine to aggregate across entities, not just sum for the individual.

### Implementation

In the convergence AI prompt (Phase 1), when the component's `calculationIntent.operation` is `scope_aggregate`, include the scope information:

```
{ name: "equipment_revenue", label: "District Equipment Revenue", operation: "scope_aggregate", scope: "district" }
```

The AI should produce a `metric_derivation` like:
```json
{
  "metric": "equipment_revenue",
  "operation": "sum",
  "source_field": "total_amount",
  "source_pattern": "...",
  "filters": [{ "field": "product_category", "operator": "eq", "value": "Capital Equipment" }],
  "scope": "district"
}
```

The engine's `applyMetricDerivations` or the scope aggregate pre-computation would then use this.

**NOTE:** Check whether `applyMetricDerivations` already supports a `scope` field. If not, the scope aggregate path in the engine uses `entityScopeAgg` which pre-sums ALL numeric fields by district/region. The fix may be to have the derivation produce the metric at the entity level, and then the existing scope aggregation sums it across entities in the district. This is simpler — the derivation filters `total_amount` by `product_category`, and the scope aggregation sums across entities.

---

## PHASE 3: VERIFY AND PERSIST BINDINGS

### HF-165 Write-Back

After convergence produces derivations at calc time (HF-165), it writes them back to `rule_sets.input_bindings`. Verify this write-back works correctly:

1. After Pass 4 produces derivations, they should be persisted as `metric_derivations` on the rule_set
2. The next calculation for the same plan should find non-empty `metric_derivations` and skip Pass 4
3. The binding reuse pattern (C-105) should apply — one AI call per plan, reused on subsequent calculations

### Diagnostic Logging

Add logging to show what Pass 4 sends to the AI and what it receives:

```typescript
addLog(`[Convergence] Pass 4: Sending ${unresolvedMetrics.length} metrics to AI`);
for (const m of unresolvedMetrics) {
  addLog(`[Convergence] Pass 4 metric: ${m.name} (label: ${m.label}, op: ${m.operation})`);
}
// After AI response:
addLog(`[Convergence] Pass 4: AI returned ${derivations.length} derivations`);
for (const d of derivations) {
  addLog(`[Convergence] Pass 4 derivation: ${d.metric} → ${d.operation}(${d.source_field}) filters=${JSON.stringify(d.filters || [])}`);
}
```

---

## DO NOT

- Do NOT hardcode CRP-specific field names, filter values, or metric names in the convergence code
- Do NOT bypass convergence with manual `metric_derivation` population via SQL
- Do NOT modify the engine's evaluation logic — fix the convergence input, not the engine output
- Do NOT modify reconciliation or Calculate page code — this OB is convergence-only
- Do NOT skip the Architecture Decision Gate diagnostics
- Do NOT create separate PRs — one PR for the vertical slice
- Do NOT give the AI the answer — the AI must infer filters from the data's categorical values and the metric's semantic name

## PROOF GATES

| # | Gate | PASS Criteria |
|---|------|---------------|
| 1 | Architecture Decision Gate | All 5 diagnostic queries pasted with results |
| 2 | Pass 4 reads calculationIntent | `git show HEAD:web/src/lib/intelligence/convergence-service.ts \| grep "calculationIntent\|inputMetric\|inputMetricLabel"` shows new code |
| 3 | scope_aggregate handled | `git show HEAD:...convergence-service.ts \| grep "scope_aggregate\|scope.*district\|scope.*region"` shows scope handling |
| 4 | Diagnostic logging added | `git show HEAD:...convergence-service.ts \| grep "Pass 4.*metric\|Pass 4.*derivation"` shows logging |
| 5 | Rule 51v2 PASS | tsc 0 errors + lint 0 errors AFTER git stash |
| 6 | No orphaned code | npx next lint 0 errors |
| 7 | PR created | `gh pr create --base main --head dev` |

## BUILD VERIFICATION

```bash
cd /home/project/spm-platform
git add -A
git commit -m "OB-191: Convergence Pass 4 reads calculationIntent metrics + scope_aggregate support"
git push origin dev

# Rule 51v2
cd web
rm -rf .next
git stash
npx tsc --noEmit 2>&1 | tail -5
echo "TSC EXIT: $?"
npx next lint 2>&1 | tail -5
echo "LINT EXIT: $?"
git stash pop
```

## COMPLETION REPORT TEMPLATE

```
# OB-191 COMPLETION REPORT

## ARCHITECTURE DECISION GATE
### Pass 4 current code (grep output):
[paste]

### Pass 4 unresolved metric source:
[paste]

### CRP calculationIntent structure:
[paste — FULL output for all 4 plans]

### Pass 4 AI prompt (current):
[paste]

### CRP committed_data fields + categorical values:
[paste]

## COMMITS
[paste git log --oneline -2]

## PHASE 1: PASS 4 METRIC INPUT FIX
### What changed:
[describe which function, which lines]
### How unresolved metrics are now built:
[describe the new logic]
### Korean Test verification:
[confirm no hardcoded field names in the prompt]

## PHASE 2: SCOPE_AGGREGATE
### How scope information is passed to AI:
[describe]
### How scope derivations are consumed by engine:
[describe — does applyMetricDerivations support scope? Or does entity-level derivation + existing scope aggregation handle it?]

## PHASE 3: BINDING PERSISTENCE
### HF-165 write-back verified:
[paste evidence that metric_derivations are persisted after convergence]
### Diagnostic logging:
[paste git show HEAD: grep output showing logging lines]

## BUILD VERIFICATION
[paste Rule 51v2 output]

## PR
[paste PR URL]

## PROOF GATES
[PASS/FAIL for each gate with evidence]
```

## FINAL STEP
```bash
gh pr create --base main --head dev --title "OB-191: Convergence Pass 4 — calculationIntent metrics + scope_aggregate" --body "Pass 4 AI semantic derivation now reads calculationIntent.inputMetric instead of component name. Scope_aggregate plans include scope level in AI prompt. Diagnostic logging for Pass 4 input/output. Korean Test compliant — no hardcoded field names."
```
