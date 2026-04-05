# HF-191: Plan Intelligence Forward — Seed Derivations from Plan Agent to Convergence
## Implements Decision 147
## April 5, 2026

---

## CONTEXT

CRP Plan 4 (scope_aggregate) is BLOCKED at $0 vs GT $136,530.42. Root cause: convergence fails to map "Equipment Revenue" → `sum(total_amount) WHERE product_category = 'Capital Equipment'`. The plan agent understood this mapping when reading the PDF but the comprehension was discarded — never stored in a form convergence can consume. Decision 147 (LOCKED) requires that plan agent metric comprehension be persisted as structured seed derivations and consumed by convergence before any independent AI derivation.

---

## CODE PROVENANCE

All code references below are from `AUD-001_CODE_EXTRACTION.md` (generated March 7, 2026) verified against HF-186 through HF-190 scope. None of those HFs touched the three critical files:

| File | AUD-001 Last Commit | Touched by HF-186–190? |
|------|---------------------|------------------------|
| `web/src/lib/ai/anthropic-adapter.ts` | 2026-03-20 (HF-160) | NO |
| `web/src/lib/compensation/ai-plan-interpreter.ts` | 2026-03-21 (HF-155) | NO |
| `web/src/lib/intelligence/convergence-service.ts` | 2026-03-09 (HF-115) | NO |

**CC MUST still verify:** Run `git log --oneline -3 <filepath>` for each file to confirm no changes since AUD-001 extraction. If any file was modified, CC must read the current version and adapt the insertion points accordingly. Paste the git log output in the Architecture Decision Gate.

---

## READ FIRST — MANDATORY

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. This specification in its entirety — do NOT skip to implementation

---

## ARCHITECTURE DECISION GATE

CC must verify and paste evidence for each:

1. **File existence:** `ls -la web/src/lib/ai/anthropic-adapter.ts web/src/lib/compensation/ai-plan-interpreter.ts web/src/lib/intelligence/convergence-service.ts`
2. **File currency:** `git log --oneline -3` for each file — confirm last commits match AUD-001
3. **Convergence call site:** Where does `convergeBindings` execute? AUD-001 shows execute-bulk removed it (OB-182 comment at line 729), but execute/route.ts still imports and calls it (lines 1704, 1887). Verify which route is active and whether convergence also runs at calculation time. `grep -rn "convergeBindings" web/src/`
4. **Current bridgeAIToEngineFormat:** Verify it still returns `inputBindings: {}`. Paste the return statement.
5. **Current plan_interpretation prompt:** Verify the SCOPE AGGREGATE example is present (HF-160 added it). Paste the last 20 lines before "Return your analysis as valid JSON."

Post gate results BEFORE writing code.

---

## PHASE A: Plan Agent Outputs metricSemantics

### A1: Extend the Plan Interpretation System Prompt

**File:** `web/src/lib/ai/anthropic-adapter.ts`
**Location:** `SYSTEM_PROMPTS.plan_interpretation` — currently ends at approximately:

```typescript
CRITICAL: Every component MUST include both "calculationMethod" (existing format) AND "calculationIntent" (structural vocabulary). The calculationIntent must be valid against the 7 primitives above.

Return your analysis as valid JSON.`,
```

**Insert BETWEEN the "CRITICAL" line and "Return your analysis" line:**

```
METRIC SEMANTICS (required for EVERY metric referenced in components):
For each metric label used in your components (in calculationMethod or calculationIntent), output a top-level "metricSemantics" array that describes HOW each metric is derived from raw transactional data.

This tells the platform how to compute each metric from imported data — which field to aggregate, how to filter, what operation to use.

{
  "metricSemantics": [
    {
      "metric": "equipment_revenue",
      "operation": "sum",
      "source_field": "total_amount",
      "filters": [
        { "field": "product_category", "operator": "eq", "value": "Capital Equipment" }
      ],
      "confidence": 0.95,
      "reasoning": "Equipment revenue is the sum of total_amount for transactions where product_category is Capital Equipment"
    },
    {
      "metric": "consumable_revenue",
      "operation": "sum",
      "source_field": "total_amount",
      "filters": [
        { "field": "product_category", "operator": "eq", "value": "Consumables" }
      ],
      "confidence": 0.95,
      "reasoning": "Consumable revenue is the sum of total_amount for Consumables transactions"
    },
    {
      "metric": "equipment_deal_count",
      "operation": "count",
      "filters": [
        { "field": "product_category", "operator": "eq", "value": "Capital Equipment" }
      ],
      "confidence": 0.90,
      "reasoning": "Count of Capital Equipment transactions"
    },
    {
      "metric": "quota_attainment",
      "operation": "ratio",
      "numerator_metric": "consumable_revenue",
      "denominator_metric": "monthly_quota",
      "confidence": 0.90,
      "reasoning": "Ratio of consumable revenue to monthly quota target"
    }
  ]
}

RULES for metricSemantics:
- Every metric label referenced in ANY component's calculationMethod or calculationIntent MUST have a metricSemantics entry
- Use field names and values as described in the plan document (e.g., "total_amount", "product_category", "Capital Equipment")
- operation must be one of: "sum", "count", "delta", "ratio"
- source_field is required for "sum" and "delta" (the numeric field to aggregate)
- For "ratio", use numerator_metric and denominator_metric referencing other metric names
- filters may be empty if the metric uses ALL rows without filtering
- The filters describe categorical constraints: which subset of rows contribute to this metric
- confidence reflects how clearly the plan document specifies this derivation (0.0-1.0)
```

### A2: Extend the Plan Interpretation User Prompt

**File:** `web/src/lib/ai/anthropic-adapter.ts`
**Location:** `case 'plan_interpretation':` block — the user prompt defines the expected response JSON structure. Currently (AUD-001 line 15953–15988):

```typescript
Return a JSON object with:
{
  "ruleSetName": "Name of the plan",
  ...
  "components": [ ... ],
  "requiredInputs": [ ... ],
  "workedExamples": [ ... ],
  "confidence": 0-100,
  "reasoning": "Overall analysis reasoning"
}
```

**Add `"metricSemantics"` to the response JSON template:**

After `"requiredInputs"` and before `"workedExamples"`, add:

```
  "metricSemantics": [
    { "metric": "field_name", "operation": "sum|count|delta|ratio", "source_field": "field_to_aggregate", "filters": [{ "field": "category_field", "operator": "eq", "value": "category_value" }], "confidence": 0-100, "reasoning": "explanation" }
  ],
```

### A3: Extract metricSemantics in bridgeAIToEngineFormat

**File:** `web/src/lib/compensation/ai-plan-interpreter.ts`
**Location:** `bridgeAIToEngineFormat` function. Currently (AUD-001 line 17655–17679):

```typescript
export function bridgeAIToEngineFormat(
  rawResult: Record<string, unknown>,
  tenantId: string,
  userId: string,
): {
  name: string;
  description: string;
  components: { variants: ... };
  inputBindings: Record<string, unknown>;
} {
  const interpreter = new AIPlainInterpreter();
  const normalized = interpreter.validateAndNormalizePublic(rawResult);
  const config = interpretationToPlanConfig(normalized, tenantId, userId);
  const additiveLookup = config.configuration as AdditiveLookupConfig;

  return {
    name: normalized.ruleSetName,
    description: normalized.description,
    components: { variants: additiveLookup.variants },
    inputBindings: {},   // ← THIS IS THE GAP. Always empty.
  };
}
```

**Change to:**

```typescript
export function bridgeAIToEngineFormat(
  rawResult: Record<string, unknown>,
  tenantId: string,
  userId: string,
): {
  name: string;
  description: string;
  components: { variants: ... };
  inputBindings: Record<string, unknown>;
} {
  const interpreter = new AIPlainInterpreter();
  const normalized = interpreter.validateAndNormalizePublic(rawResult);
  const config = interpretationToPlanConfig(normalized, tenantId, userId);
  const additiveLookup = config.configuration as AdditiveLookupConfig;

  // Decision 147: Extract and validate metricSemantics from AI response
  const rawSemantics = rawResult.metricSemantics as Array<Record<string, unknown>> | undefined;
  const validSemantics = (rawSemantics ?? []).filter((s) => {
    return (
      typeof s.metric === 'string' &&
      typeof s.operation === 'string' &&
      ['sum', 'count', 'delta', 'ratio'].includes(s.operation as string)
    );
  });

  return {
    name: normalized.ruleSetName,
    description: normalized.description,
    components: { variants: additiveLookup.variants },
    inputBindings: validSemantics.length > 0
      ? { plan_agent_seeds: validSemantics }
      : {},
  };
}
```

**Key detail:** `rawResult` is the unprocessed AI response. `normalized` has been through `validateAndNormalizePublic` which may strip unknown fields. So metricSemantics MUST be extracted from `rawResult`, not `normalized`. CC must verify that `rawResult` is the original AI JSON response.

### A4: Verify Storage Path

The `inputBindings` from `bridgeAIToEngineFormat` flows to `rule_sets.input_bindings` at the upsert in execute-bulk (AUD-001 line 2933):

```typescript
input_bindings: engineFormat.inputBindings as unknown as Json,
```

And the same pattern in execute/route.ts (AUD-001 line 3168). Both paths store `inputBindings` directly. So `{ plan_agent_seeds: [...] }` will be written to the database. No additional storage code needed.

**BUT:** There is a critical conflict. After SCI execution, convergence runs and OVERWRITES `input_bindings` (AUD-001 lines 1930–1933):

```typescript
await supabase
  .from('rule_sets')
  .update({ input_bindings: updatedBindings as unknown as Json })
  .eq('id', rs.id);
```

This replaces ALL input_bindings with `updatedBindings`. The plan_agent_seeds would be lost.

**Fix:** In the convergence post-processing block (execute-bulk lines 1919–1928), where existing metric_mappings are preserved:

```typescript
// Preserve existing metric_mappings if present
const { data: currentRs } = await supabase
  .from('rule_sets')
  .select('input_bindings')
  .eq('id', rs.id)
  .single();
const currentBindings = (currentRs?.input_bindings as Record<string, unknown>) ?? {};
if (currentBindings.metric_mappings) {
  updatedBindings.metric_mappings = currentBindings.metric_mappings;
}
```

**Add immediately after the metric_mappings preservation:**

```typescript
// Decision 147: Preserve plan_agent_seeds across convergence updates
if (currentBindings.plan_agent_seeds) {
  updatedBindings.plan_agent_seeds = currentBindings.plan_agent_seeds;
}
```

This ensures seeds survive convergence's input_bindings overwrite. CC must find the SAME pattern in execute/route.ts if it also runs convergence post-import.

### A5: Phase A Proof Gate

Re-import CRP Plan 4 PDF through vialuce.ai. After import:

```sql
SELECT name, input_bindings->'plan_agent_seeds' as seeds
FROM rule_sets
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
  AND status = 'active';
```

**Expected:** At least one seed with `metric: "equipment_revenue"`, `operation: "sum"`, filters containing `product_category = Capital Equipment`.

**If seeds are null/empty:** The AI did not produce metricSemantics. Causes: (a) prompt not updated correctly, (b) `rawResult` was modified before reaching `bridgeAIToEngineFormat`, (c) convergence overwrote seeds. Debug by logging `rawResult.metricSemantics` in `bridgeAIToEngineFormat`.

**Do NOT proceed to Phase B until Phase A passes.**

---

## PHASE B: Convergence Reads and Validates Seeds

### B1: Read Seeds in convergeBindings

**File:** `web/src/lib/intelligence/convergence-service.ts`
**Location:** `convergeBindings` function (AUD-001 line 31217). Currently after step 2 (extractComponents) and before step 3 (inventoryData):

```typescript
// 2. Extract plan requirements
const components = extractComponents(ruleSet.components);
if (components.length === 0) return { derivations, matchReport, signals, gaps, componentBindings };

// 3. Inventory data capabilities (OB-162: includes field identities)
const capabilities = await inventoryData(tenantId, supabase);
```

**Insert AFTER step 3 (inventoryData) and BEFORE step 4 (matchComponentsToData):**

```typescript
// ── Decision 147: Plan Intelligence Forward — seed derivation consumption ──
const planAgentSeeds = (
  (ruleSet.input_bindings as Record<string, unknown>)?.plan_agent_seeds ?? []
) as Array<{
  metric: string;
  operation: string;
  source_field?: string;
  filters?: Array<{ field: string; operator: string; value: string | number }>;
  numerator_metric?: string;
  denominator_metric?: string;
  confidence: number;
  reasoning?: string;
}>;

const seededMetrics = new Set<string>();

if (planAgentSeeds.length > 0) {
  console.log(`[Convergence] Decision 147: ${planAgentSeeds.length} plan agent seeds found`);

  for (const seed of planAgentSeeds) {
    let seedValid = true;
    const validationReasons: string[] = [];

    // Validate filter fields and values against data capabilities
    if (seed.filters && seed.filters.length > 0) {
      for (const filter of seed.filters) {
        // Check filter field exists as categorical in any capability
        const fieldCap = capabilities.find(dc =>
          dc.categoricalFields.some(cf => cf.field === filter.field)
        );
        if (!fieldCap) {
          seedValid = false;
          validationReasons.push(`Filter field "${filter.field}" not found in committed_data categorical fields`);
          continue;
        }
        // Check filter value exists in that field's distinct values
        const valueExists = fieldCap.categoricalFields.some(cf =>
          cf.field === filter.field &&
          cf.distinctValues.some(dv => dv === String(filter.value))
        );
        if (!valueExists) {
          seedValid = false;
          validationReasons.push(`Filter value "${filter.value}" not found in field "${filter.field}" (values: ${
            fieldCap.categoricalFields.find(cf => cf.field === filter.field)?.distinctValues.join(', ') ?? 'none'
          })`);
        }
      }
    }

    // Validate source_field exists as numeric (for sum/delta)
    if (seed.source_field && ['sum', 'delta'].includes(seed.operation)) {
      // Check columnStats (includes ALL numeric columns, unlike numericFields which filters by avg)
      const fieldExists = capabilities.some(dc =>
        dc.columnStats[seed.source_field!] !== undefined
      );
      if (!fieldExists) {
        seedValid = false;
        validationReasons.push(`Source field "${seed.source_field}" not found as numeric in committed_data`);
      }
    }

    if (seedValid) {
      // Promote seed to MetricDerivationRule
      const derivation: MetricDerivationRule = {
        metric: seed.metric,
        operation: seed.operation as MetricDerivationRule['operation'],
        source_pattern: '.*',
        filters: (seed.filters ?? []).map(f => ({
          field: f.field,
          operator: f.operator as MetricDerivationRule['filters'][0]['operator'],
          value: f.value,
        })),
        source_field: seed.source_field,
        numerator_metric: seed.numerator_metric,
        denominator_metric: seed.denominator_metric,
      };
      derivations.push(derivation);
      seededMetrics.add(seed.metric);
      matchReport.push({
        component: seed.metric,
        dataType: 'plan_agent_seed',
        confidence: seed.confidence,
        reason: `Decision 147: Plan agent seed validated — ${seed.reasoning ?? 'plan interpretation'}`,
      });
      console.log(`[Convergence] Decision 147: Seed "${seed.metric}" VALIDATED → MetricDerivationRule`);
    } else {
      console.log(`[Convergence] Decision 147: Seed "${seed.metric}" FAILED: ${validationReasons.join('; ')}`);
    }
  }
}

// Existing step 4 continues below — seeded metrics will be excluded from gap detection
```

### B2: Skip Gap Detection for Seeded Metrics

**Location:** After the `generateDerivationsForMatch` loop (AUD-001 lines 31261-31287) and in the gap detection section. The gap detection logic (AUD-001 lines ~31380+) checks for components whose expectedMetrics have no derivation. CC must find where gaps are generated for unmatched components and add a check:

```typescript
// Skip gap if ALL expected metrics for this component are covered by seeds
const allMetricsSeeded = comp.expectedMetrics.every(m => seededMetrics.has(m));
if (allMetricsSeeded) {
  console.log(`[Convergence] Decision 147: Component "${comp.name}" fully covered by seeds — skipping gap`);
  continue; // or skip the gap push
}
```

CC must locate the exact gap generation loop — it's in the section after all matches are processed, where components without matches get gap entries. The `seededMetrics` Set declared in B1 is in scope for this check.

### B3: Phase B Proof Gate

After Phase A (seeds stored) and Phase B code deployed:

1. **Import CRP transaction data** (if not already present)
2. **Trigger convergence** — either by re-importing a data file (if convergence runs post-import) or by running calculation (if convergence runs at calc time). CC must verify which path is active.

**Expected log output (Vercel):**
```
[Convergence] Decision 147: 1 plan agent seeds found
[Convergence] Decision 147: Seed "equipment_revenue" VALIDATED → MetricDerivationRule
```

**Verify input_bindings updated:**
```sql
SELECT input_bindings->'metric_derivations' as derivations,
       input_bindings->'plan_agent_seeds' as seeds
FROM rule_sets
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
  AND status = 'active'
  AND name ILIKE '%district%' OR name ILIKE '%override%';
```

**Expected:** `metric_derivations` contains an entry with `metric: "equipment_revenue"`, `operation: "sum"`, `source_field: "total_amount"`, `filters: [{ field: "product_category", operator: "eq", value: "Capital Equipment" }]`. `plan_agent_seeds` still present (not overwritten).

---

## PHASE C: Calculate and Verify

### C1: Calculate Plan 4 January → verify $66,756.90
### C2: Calculate Plan 4 February → verify $69,773.52
### C3: Full CRP Reconciliation

| Plan | Expected Total |
|------|---------------|
| Plan 1 (linear_function) | $360,007.84 |
| Plan 2 (piecewise_linear) | $65,740.71 |
| Plan 3 (conditional_gate) | $4,450.00 |
| Plan 4 (scope_aggregate) | $136,530.42 |
| **Pre-clawback Total** | **$566,728.97** |

---

## REGRESSION CHECKS

1. Plans 1–3 unchanged: $360,007.84, $65,740.71, $4,450.00
2. BCL spot check: grand total $312,033
3. Plans without seeds: convergence must handle `plan_agent_seeds: undefined` via the `?? []` fallback — verify no crash on BCL or any tenant without seeds

---

## COMPLETION REPORT REQUIREMENTS

1. **Architecture Decision Gate** — pasted `git log` and code for all 5 verification points
2. **Phase A proof:** SQL showing plan_agent_seeds in input_bindings after plan import
3. **Seed survival proof:** SQL showing plan_agent_seeds still present AFTER convergence runs (not overwritten)
4. **Phase B proof:** Vercel log showing seed validation
5. **Phase C proof:** Calculation results for all 10 CRP periods
6. **Regression:** Plans 1–3 and BCL unchanged
7. **Build:** `npx tsc --noEmit` PASS, `npx next lint` PASS (Rule 51v2 on committed code)

---

## ANTI-PATTERN CHECKS

- [ ] No hardcoded field names (Korean Test) — seeds come from AI, validation checks against runtime data
- [ ] No SQL data fixes (Standing Rule 34)
- [ ] No domain language in foundational code — convergence validates structurally
- [ ] Seeds validated against data capabilities, not trusted blindly
- [ ] Existing convergence passes preserved as fallback for non-seeded metrics
- [ ] plan_agent_seeds preserved across convergence input_bindings updates
- [ ] No per-entity AI calls during calculation loop (Rule 22)
- [ ] `rawResult` (not `normalized`) used for metricSemantics extraction

---

## FINAL STEP

```bash
gh pr create --base main --head dev --title "HF-191: Decision 147 — Plan Intelligence Forward (seed derivations from plan agent to convergence)" --body "Decision 147. Plan agent outputs metricSemantics during interpretation. Stored as plan_agent_seeds in input_bindings. Convergence reads seeds, validates against data capabilities, promotes to MetricDerivationRule. Independent AI derivation becomes fallback. Resolves CRP Plan 4 convergence blocker ($0 → $136,530.42)."
```
