# HF-227: CONVERGENCE BINDING FILTER COMPLETION — SINGLE STRUCTURE, SINGLE CONTRACT

## Governance

- **Predecessor:** HF-226 (PR #403) — unified derivation pass, emitter fidelity, engine filter parameter. Architecturally incomplete: `convergence_bindings` still lacks filter capability; `findMetricFilters` bridge invented by CC to compensate.
- **Data Contract Map:** DCM_CONVERGENCE_ENGINE_DATA_FLOW.md — reviewed, architect-confirmed. Two structures are evolutionary (`metric_derivations` → `convergence_bindings` per Decision 111), not complementary. `convergence_bindings` must absorb filter capability to complete the evolution.
- **IRA Invocation:** DS-025, Option D ADOPTED. HF-226 delivered Phases 1-3 of Option D. HF-227 completes it.
- **Governing decisions:** D111 (convergence_bindings is sole output), D153 LOCKED (signal surface), D154 LOCKED (Korean Test), D64v2 LOCKED (classification_signals canonical).
- **Defect class closed:** The `findMetricFilters` bridge is a cross-structure lookup that depends on metric name matching between two independently produced structures. It is an instance of AP-DCM-4 (Bridge invention — symptom of incomplete design).

## Why This HF Exists

`convergence_bindings` tells the engine WHERE to find data (batch + column + role). `metric_derivations` tells the engine HOW to derive values (operation + filter + source). Decision 111 established `convergence_bindings` as the sole output for new convergence runs. But `convergence_bindings` never gained filter vocabulary — it was built before any tenant required categorical subsetting.

HF-226 made `generateAISemanticDerivations` (Pass 4) the sole `metric_derivations` authority, correctly producing filters. But the engine prioritizes `convergence_bindings` (Path B) when present. Path B reads column-role mappings from `convergence_bindings`, then uses the `findMetricFilters` bridge to look up filters from `metric_derivations` by metric name. This bridge is fragile — it depends on metric names matching across two independently produced structures.

The fix: `resolveColumnMappingsViaAI` gains filter vocabulary. `generateAllComponentBindings` writes filters into each binding entry. The engine reads filters from the binding directly. The `findMetricFilters` bridge is removed. `convergence_bindings` becomes the single complete structure per Decision 111.

## What Changes (3 files, ~80 lines)

### Change 1: `resolveColumnMappingsViaAI` prompt gains filter vocabulary

**File:** `web/src/lib/intelligence/convergence-service.ts`
**Function:** `resolveColumnMappingsViaAI` (line ~1843)

**Current prompt schema:**
```
{"metric_field": "column_name", ...}
```
Flat string→string map. No filter vocabulary.

**New prompt schema:**
```json
{
  "metric_field": {
    "column": "column_name",
    "filters": [
      {"field": "categorical_column", "operator": "eq", "value": "category_value"}
    ]
  }
}
```

Each metric field maps to an object with `column` (the data column) and optional `filters` (categorical subset predicates). When no filter is needed, `filters` is an empty array.

**The prompt text must include:**
- The existing METRIC FIELDS list (with plan-agent intent when available)
- The existing DATA COLUMNS list
- NEW: categorical fields with their distinct values (from `DataCapability.categoricalFields`) — so the AI can identify subsetting opportunities
- NEW: instruction text modeled on the existing `generateAISemanticDerivations` prompt lines 2468-2472: "If the metric label suggests a subset of a broader numeric field, identify the categorical field and value that filters to the correct subset"
- NEW: example output showing the enriched schema

**The response parser must change:**
- Current: reads `result[metricField]` as `string` (column name)
- New: reads `result[metricField]` as `string | { column: string; filters?: Array<{field, operator, value}> }`
- Backward compatible: if the AI returns a plain string (old format), treat it as `{ column: value, filters: [] }`

**Korean Test:** The prompt must NOT contain any hardcoded field names, column names, or category values. The categorical fields and their distinct values come from `DataCapability`, not from code.

### Change 2: `generateAllComponentBindings` writes filters onto binding entries

**File:** `web/src/lib/intelligence/convergence-service.ts`
**Function:** `generateAllComponentBindings`

**Current:** After `resolveColumnMappingsViaAI` returns `mapping: Record<string, string>` (metric→column), the function builds `compBindings[role]` with `source_batch_id`, `column`, `field_identity`, `match_pass`, `confidence`. No `filters` field.

**New:** `resolveColumnMappingsViaAI` returns `Record<string, string | { column: string; filters?: ... }>`. The function reads the enriched mapping:

```typescript
const proposedMapping = aiMapping[req.metricField];
const proposedColumnName = typeof proposedMapping === 'string'
  ? proposedMapping
  : proposedMapping?.column;
const proposedFilters = typeof proposedMapping === 'object' && proposedMapping?.filters
  ? proposedMapping.filters
  : [];
```

Then writes filters onto the binding entry:

```typescript
compBindings[req.role] = {
  source_batch_id: column.batchId,
  column: proposedColumnName,
  field_identity: { ... },
  match_pass: validation.valid ? 1 : 2,
  confidence: validation.valid ? 0.9 : 0.6,
  filters: proposedFilters,  // NEW: from AI response
};
```

When the AI returns no filters (empty array), behavior is identical to today — `rowMatchesFilters` returns `true` for all rows.

### Change 3: `resolveMetricsFromConvergenceBindings` reads filters from binding, bridge removed

**File:** `web/src/app/api/calculation/run/route.ts`
**Function:** `resolveMetricsFromConvergenceBindings` (line ~1247)

**Current (post-HF-226):** Calls `findMetricFilters(metricName)` to look up filters from `metric_derivations`, then passes to `resolveColumnFromBatch(column, lookupKey, filters)`.

**New:** Reads `filters` directly from the binding entry:

```typescript
// BEFORE (HF-226 bridge):
const rawActualValue = resolveColumnFromBatch(
  actualBinding.column, lookupKey, findMetricFilters(expectedMetrics[0])
);

// AFTER (native):
const rawActualValue = resolveColumnFromBatch(
  actualBinding.column, lookupKey, actualBinding.filters
);
```

Same pattern for all four call sites (numerator, denominator, actual, target).

**`findMetricFilters` function is removed entirely.** It was a bridge; the bridge is no longer needed.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. Final step: `gh pr create --base main --head hf-227-binding-filter-completion` with descriptive title+body
5. Commit this prompt to git as first action.
6. Read `CC_STANDING_ARCHITECTURE_RULES.md` before any code changes.
7. **Supabase `.in()` batch ≤200.**
8. **Every proof gate requires pasted evidence — code, terminal output, or grep results. PASS/FAIL self-attestation is NOT accepted.**

---

## PHASE 0: DIAGNOSTIC — READ CURRENT STATE (10 min)

### 0A: Confirm branch and HEAD

```bash
cd ~/spm-platform
git fetch origin
git checkout main && git pull origin main
git log --oneline -3
```

Confirm main includes HF-226 (PR #403) if already merged. If #403 is not merged, create the feature branch from the HF-226 branch instead:

```bash
# If PR #403 NOT merged:
git checkout hf-226-convergence-unification && git pull
git checkout -b hf-227-binding-filter-completion

# If PR #403 IS merged:
git checkout -b hf-227-binding-filter-completion main
```

### 0B: Read the three functions being modified

```bash
cd ~/spm-platform

# 1. resolveColumnMappingsViaAI — full body including prompt text
grep -n "function resolveColumnMappingsViaAI" web/src/lib/intelligence/convergence-service.ts
# Read the full function body at the line number found

# 2. generateAllComponentBindings — full body including binding construction
grep -n "function generateAllComponentBindings" web/src/lib/intelligence/convergence-service.ts
# Read the full function body

# 3. resolveMetricsFromConvergenceBindings — full body including findMetricFilters
grep -n "function resolveMetricsFromConvergenceBindings\|function findMetricFilters" web/src/app/api/calculation/run/route.ts
# Read both function bodies

# 4. Confirm resolveColumnFromBatch already has filters parameter (HF-226)
grep -n "function resolveColumnFromBatch" web/src/app/api/calculation/run/route.ts
# Confirm signature includes filters?: MetricDerivationRule['filters']
```

Paste ALL function signatures and line numbers.

**Also read:** What categorical data does `DataCapability` carry? The prompt needs categorical fields + distinct values.

```bash
grep -n "categoricalFields\|CategoricalField\|interface DataCapability" web/src/lib/intelligence/convergence-service.ts | head -20
```

Paste the `DataCapability` interface and `categoricalFields` type.

**Proof gate 0 (IMMUTABLE):**
```
□ resolveColumnMappingsViaAI signature + line number pasted
□ generateAllComponentBindings signature + line number pasted
□ resolveMetricsFromConvergenceBindings signature + line number pasted
□ findMetricFilters signature + line number pasted (HF-226 bridge — to be removed)
□ resolveColumnFromBatch signature confirms filters parameter present (HF-226)
□ DataCapability.categoricalFields type pasted
□ Current prompt text in resolveColumnMappingsViaAI pasted (including EXAMPLE OUTPUT line)
```

**Commit:** `git add -A && git commit -m "HF-227 Phase 0: diagnostic — read current state" && git push origin hf-227-binding-filter-completion`

---

## PHASE 1: PROMPT + PARSER EVOLUTION (30 min)

**File:** `web/src/lib/intelligence/convergence-service.ts`
**Function:** `resolveColumnMappingsViaAI`

### 1A: Add categorical fields to the prompt context

The function currently receives `measureColumns` (column name + field identity + stats). It needs access to categorical fields to pass them to the AI. Find where `resolveColumnMappingsViaAI` is called within `generateAllComponentBindings` — the caller has access to `DataCapability[]` which carries `categoricalFields`.

Add a parameter to `resolveColumnMappingsViaAI`:

```typescript
async function resolveColumnMappingsViaAI(
  components: PlanComponent[],
  allRequirements: Array<{ compIndex: number; compName: string; req: ComponentInputRequirement }>,
  measureColumns: Array<{ name: string; fi: FieldIdentity; stats: ColumnValueStats }>,
  metricComprehension: MetricComprehensionSignal[] = [],
  categoricalFields?: Array<{ field: string; distinctValues: unknown[] }>,  // NEW
): Promise<Record<string, string | { column: string; filters?: Array<{ field: string; operator: string; value: unknown }> }>> {
```

### 1B: Evolve the prompt text

Add categorical context after the DATA COLUMNS section:

```typescript
const categoricalContext = categoricalFields && categoricalFields.length > 0
  ? `\n\nCATEGORICAL FIELDS (available for filtering):\n${
      categoricalFields.map((cf, i) =>
        `${i + 1}. "${cf.field}" — distinct values: ${JSON.stringify(cf.distinctValues.slice(0, 20))}`
      ).join('\n')
    }\n\nIf a metric label suggests a subset of a broader numeric field (e.g., a revenue metric
that applies to only one product category), use a categorical field and one of its distinct
values as a filter. The filter value MUST be one of the listed distinct values.`
  : '';
```

Append `categoricalContext` to `userPrompt`.

Change the EXAMPLE OUTPUT from:

```
{"metric_a": "Column_A", "metric_b": "Column_B"}
```

to:

```
{"metric_a": "Column_A", "metric_b": {"column": "Column_B", "filters": [{"field": "Category_Col", "operator": "eq", "value": "Some_Category"}]}}
```

Add a note: "Use a plain string when no filter is needed. Use the object form with filters when the metric requires categorical subsetting."

### 1C: Evolve the response parser

Current parser:
```typescript
const mapping: Record<string, string> = {};
for (const [key, val] of Object.entries(result)) {
  if (typeof val === 'string' && columnNames.includes(val)) {
    mapping[key] = val;
  }
}
```

New parser:
```typescript
const mapping: Record<string, string | { column: string; filters?: Array<{ field: string; operator: string; value: unknown }> }> = {};
for (const [key, val] of Object.entries(result)) {
  if (typeof val === 'string' && columnNames.includes(val)) {
    // Plain string — backward compatible, no filters
    mapping[key] = val;
  } else if (
    typeof val === 'object' && val !== null &&
    typeof (val as Record<string, unknown>).column === 'string' &&
    columnNames.includes((val as Record<string, unknown>).column as string)
  ) {
    // Enriched form — column + optional filters
    const obj = val as Record<string, unknown>;
    const filters = Array.isArray(obj.filters)
      ? (obj.filters as Array<Record<string, unknown>>)
          .filter(f => f.field && f.value != null)
          .map(f => ({
            field: String(f.field),
            operator: String(f.operator || 'eq'),
            value: f.value as string | number | boolean,
          }))
      : [];
    mapping[key] = { column: obj.column as string, filters };
  }
}
```

### 1D: Update the validator

`isValidColumnMapping` currently counts entries where `result[m]` is a string in `columnNames`. Update to also accept the enriched form:

```typescript
function isValidColumnMapping(
  result: Record<string, unknown>,
  metricFields: string[],
  columnNames: string[],
): boolean {
  const mappedCount = metricFields.filter(m => {
    const val = result[m];
    if (typeof val === 'string') return columnNames.includes(val);
    if (typeof val === 'object' && val !== null) {
      return typeof (val as Record<string, unknown>).column === 'string'
        && columnNames.includes((val as Record<string, unknown>).column as string);
    }
    return false;
  }).length;
  return mappedCount >= Math.ceil(metricFields.length * 0.5);
}
```

**Proof gate 1 (IMMUTABLE):**
```
□ resolveColumnMappingsViaAI signature includes categoricalFields parameter (paste)
□ Prompt text includes CATEGORICAL FIELDS section (paste the categoricalContext construction)
□ EXAMPLE OUTPUT shows enriched form with filters (paste)
□ Parser handles both string and {column, filters} forms (paste parser code)
□ Validator handles both forms (paste validator code)
□ Return type is Record<string, string | { column, filters? }> (paste)
□ npm run build exits 0
□ Korean Test — no hardcoded field names or category values:
    grep -nE "'product_category'|'Capital Equipment'|'Consumables'|'Cross-Sell'" web/src/lib/intelligence/convergence-service.ts
    Must return 0 results
```

**Commit:** `git add -A && git commit -m "HF-227 Phase 1: resolveColumnMappingsViaAI gains filter vocabulary" && git push origin hf-227-binding-filter-completion`

---

## PHASE 2: BINDING CONSTRUCTION WRITES FILTERS (20 min)

**File:** `web/src/lib/intelligence/convergence-service.ts`
**Function:** `generateAllComponentBindings`

### 2A: Pass categorical fields to resolveColumnMappingsViaAI

Find the call site for `resolveColumnMappingsViaAI` inside `generateAllComponentBindings`. The caller has access to `dataCapabilities: DataCapability[]`. Extract categorical fields and pass them:

```typescript
const allCategoricalFields = dataCapabilities.flatMap(cap =>
  (cap.categoricalFields || []).map(cf => ({
    field: cf.field,
    distinctValues: cf.distinctValues || [],
  }))
);

const aiMapping = await resolveColumnMappingsViaAI(
  components, allRequirements, measureColumns, metricComprehension,
  allCategoricalFields,  // NEW
);
```

### 2B: Read enriched mapping into binding entries

Find the binding construction loop where `compBindings[req.role]` is built. Change from:

```typescript
const proposedColumnName = aiMapping[req.metricField];
```

to:

```typescript
const proposedMapping = aiMapping[req.metricField];
const proposedColumnName = typeof proposedMapping === 'string'
  ? proposedMapping
  : proposedMapping?.column;
const proposedFilters = typeof proposedMapping === 'object' && Array.isArray(proposedMapping?.filters)
  ? proposedMapping.filters
  : [];
```

Then add `filters` to the binding entry:

```typescript
compBindings[req.role] = {
  source_batch_id: column.batchId,
  column: proposedColumnName,
  field_identity: { ... },
  match_pass: validation.valid ? 1 : 2,
  confidence: validation.valid ? 0.9 : 0.6,
  filters: proposedFilters,
  // ... existing scale_factor logic unchanged
};
```

When `proposedFilters` is empty, the binding entry has `filters: []` — same behavior as today. `rowMatchesFilters` returns `true` for empty arrays.

**Proof gate 2 (IMMUTABLE):**
```
□ categoricalFields extracted from dataCapabilities (paste code)
□ resolveColumnMappingsViaAI call passes categoricalFields (paste call site)
□ Binding entry construction reads enriched mapping (paste proposedMapping/proposedFilters code)
□ compBindings[role] includes filters field (paste binding construction)
□ npm run build exits 0
□ Korean Test: 0 results
```

**Commit:** `git add -A && git commit -m "HF-227 Phase 2: generateAllComponentBindings writes filters onto binding entries" && git push origin hf-227-binding-filter-completion`

---

## PHASE 3: ENGINE READS FILTERS NATIVELY, BRIDGE REMOVED (15 min)

**File:** `web/src/app/api/calculation/run/route.ts`

### 3A: Read filters from binding entry

In `resolveMetricsFromConvergenceBindings`, replace every `findMetricFilters(...)` call with the binding entry's own `filters`:

```typescript
// Ratio branch:
const rawNumValue = resolveColumnFromBatch(numBinding.column, lookupKey, numBinding.filters);
const rawDenValue = resolveColumnFromBatch(denBinding.column, lookupKey, denBinding.filters);

// Single/dual input branch:
const rawActualValue = resolveColumnFromBatch(actualBinding.column, lookupKey, actualBinding.filters);
// ... and target:
const rawTargetValue = resolveColumnFromBatch(targetBinding.column, lookupKey, targetBinding.filters);
```

The `ConvergenceBindingEntry` type (or its cast) must now include `filters?`. If typed, add:

```typescript
interface ConvergenceBindingEntry {
  // ... existing fields ...
  filters?: Array<{ field: string; operator: string; value: string | number | boolean }>;
}
```

If cast as `Record<string, unknown>`, access via `(actualBinding as Record<string, unknown>).filters`.

### 3B: Remove findMetricFilters

Delete the entire `findMetricFilters` function. It was a bridge between `metric_derivations` and `convergence_bindings` — no longer needed because the binding itself carries filters.

Verify no other call sites reference it:

```bash
grep -rn "findMetricFilters" web/src/app/api/calculation/run/route.ts
# Must return 0 results after removal
```

**Proof gate 3 (IMMUTABLE):**
```
□ All four resolveColumnFromBatch call sites pass binding.filters (paste each)
□ findMetricFilters function removed (grep returns 0)
□ ConvergenceBindingEntry type includes filters? (paste type or cast)
□ npm run build exits 0
□ Korean Test: 0 results on route.ts
```

**Commit:** `git add -A && git commit -m "HF-227 Phase 3: engine reads filters from binding, findMetricFilters bridge removed" && git push origin hf-227-binding-filter-completion`

---

## PHASE 4: CLEAR BINDINGS FOR RE-DERIVATION (5 min)

Phase 4A of HF-226 already cleared `input_bindings` for all three tenants. If HF-226 bindings have been re-populated since (via import or calc-time convergence), clear them again so the new prompt produces enriched bindings with filters.

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  for (const [name, tid] of [
    ['CRP', 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'],
    ['Meridian', '5035b1e8-0754-4527-b7ec-9f93f85e4c79'],
    ['BCL', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'],
  ]) {
    const { data, error } = await sb
      .from('rule_sets')
      .update({ input_bindings: {} })
      .eq('tenant_id', tid)
      .select('id, name');
    console.log(name + ': cleared ' + (data?.length || 0) + ' rule_sets');
    if (error) console.error('  ERROR:', error.message);
  }
})();
"
```

**Proof gate 4 (IMMUTABLE):**
```
□ input_bindings cleared for all three tenants (paste script output)
```

**Commit:** `git add -A && git commit -m "HF-227 Phase 4: clear bindings for re-derivation" && git push origin hf-227-binding-filter-completion`

---

## PHASE 5: COMPLETION REPORT + PR (10 min)

Write completion report to `docs/completion-reports/HF-227_COMPLETION_REPORT.md` per Rules 25-28. Mandatory sections: COMMITS, FILES CREATED, FILES MODIFIED, PROOF GATES — HARD, STANDING RULE COMPLIANCE, KNOWN ISSUES.

**Reconciliation-channel separation:** Do NOT include any ground truth values, expected totals, or reconciliation interpretation. Report what the code does. Report what the build produces. Do NOT report whether calculated values match any target.

After writing the report:

```bash
mkdir -p docs/completion-reports
git add docs/completion-reports/HF-227_COMPLETION_REPORT.md
git commit -m "HF-227: completion report per Rules 25-28"
git push origin hf-227-binding-filter-completion
```

Final build verification:

```bash
cd ~/spm-platform && rm -rf web/.next && cd web && npm run build
echo "BUILD EXIT: $?"
```

Append build output to completion report, commit + push.

PR:

```bash
gh pr create --base main --head hf-227-binding-filter-completion \
  --title "HF-227: Convergence binding filter completion — single structure, single contract" \
  --body "Completes Decision 111 evolution. resolveColumnMappingsViaAI gains filter vocabulary. generateAllComponentBindings writes filters onto binding entries. Engine reads filters from binding natively. findMetricFilters bridge removed. Three-tenant re-verification required post-merge (architect-driven)."
```

HALT after PR creation. Phase 5B (re-import) and 5C (calculate + reconcile) are architect-driven via browser.

---

## SCOPE BOUNDARY — DO NOT CHANGE

- **Do NOT modify** `generateAISemanticDerivations` — its prompt and parser are correct (HF-226 verified)
- **Do NOT modify** `applyMetricDerivations` or `rowMatchesFilters` — already correct
- **Do NOT modify** `resolveColumnFromBatch` — already has filters parameter (HF-226)
- **Do NOT modify** `emitPlanComprehensionSignals` — already carries full rawComp (HF-226)
- **Do NOT modify** signal consumption sites — already carry full signal_value (HF-226)
- **Do NOT remove** `generateAISemanticDerivations` or `generateDerivationsForMatch` — these are separate concerns from the binding evolution; cleanup is DS-022 scope
- **Do NOT modify** any auth, session, or storage code
- **Do NOT add** any new npm dependencies

## ANTI-PATTERNS SPECIFIC TO THIS HF

**AP-1: Hardcoded field names.** The prompt must get categorical fields and their values from `DataCapability`, not from code. If you find yourself writing `product_category` or `Capital Equipment` in the prompt, you are violating the Korean Test. STOP.

**AP-2: Inventing a new bridge.** If you find yourself creating a new function to look up data from one structure and inject it into another, you are repeating the `findMetricFilters` pattern. The binding must carry its own filters. STOP.

**AP-3: Breaking backward compatibility.** The enriched mapping format (`{column, filters}`) must coexist with the plain string format. Pre-HF-227 bindings with no filters field must not cause errors. `rowMatchesFilters` returns `true` for empty/missing/undefined filter arrays.

**AP-4: Modifying the generateAISemanticDerivations prompt.** That prompt is correct and verified. This HF evolves `resolveColumnMappingsViaAI` only.

---

## EXECUTION SEQUENCE

Phases 0 → 1 → 2 → 3 → 4 → 5 in sequence. Phase 5B (re-import) and 5C (calculate + reconcile) are architect-driven via browser — HALT after PR creation and report.

Every Phase has a proof gate. Paste evidence at every gate. Do NOT skip gates. Do NOT proceed to the next Phase until the current Phase's proof gate passes.

Commit + push after every Phase.
