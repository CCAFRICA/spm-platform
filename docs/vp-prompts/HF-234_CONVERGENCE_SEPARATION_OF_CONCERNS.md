# HF-234: CONVERGENCE SEPARATION OF CONCERNS — COLUMN MAPPING vs METRIC DERIVATION

## Governance

- **Predecessor:** HF-114 (PR #217, convergence_mapping task type), HF-227 (PR #404, binding filter completion), HF-228 (PR #406, metric derivation execution in production entity loop)
- **Governing decisions:** D111 (convergence_bindings sole structural output), D153 LOCKED (signal surface), D154 LOCKED (Korean Test)
- **Defect evidence:** CRP Plan 1 P1/P2 reconcile exact ($73,142.72 / $109,139.46). P3/P4 fail ($110,269.14 / $94,700.74 vs GT $93,524.42 / $84,201.24). Root cause: AI non-deterministically returns string format (no filter) vs object format (with filter) in `resolveColumnMappingsViaAI`. String format accepted by parsing → metric marked resolved → Pass 4 skipped → no filter derivation → all revenue summed instead of Capital Equipment only.

## Why This HF Exists

The convergence pipeline has two AI calls with mixed responsibilities:

**Call 1 (`resolveColumnMappingsViaAI`):** Asks the AI to map metrics to columns. HF-227 injected `categoricalFields` into the prompt, hoping the AI would return filters. The AI sometimes returns `{"metric": "column"}` (string — no filter), sometimes `{"metric": {"column": "col", "filters": [...]}}` (object — with filter). The parsing only accepts strings. When the AI returns the object format, the metric is unmapped, Pass 4 fires, and correctly produces the filter derivation. When the AI returns the string format, the metric is mapped without filters, Pass 4 is skipped, and the result is wrong.

**The correct result happens when Call 1 FAILS.** This means Call 1 is attempting something it shouldn't. Column mapping and metric derivation are separate concerns:

- **Column mapping** answers: "which column contains measure data for this role?" — structural, data-level, plan-independent. `total_amount` is the revenue column. Period.
- **Metric derivation** answers: "how do you compute this metric from the available data?" — contextual, plan-level, qualification-dependent. `sum(total_amount) WHERE product_category = Capital Equipment`. Operation + column + qualifications.

Call 1 should do the first. Pass 4 should do the second. They should not overlap.

## What Changes (1 file, ~20 lines)

**File:** `web/src/lib/intelligence/convergence-service.ts`

### Change 1: Remove categoricalFields from Call 1's prompt

Find where `categoricalFields` are injected into the `resolveColumnMappingsViaAI` prompt (HF-227 addition). Remove them. Call 1's prompt should contain ONLY metric field names and measure column names with contextual identities. No categorical field vocabulary. No filter guidance.

Call 1's prompt asks: "Match each metric field to the best data column." That's its job. Column mapping. Nothing else.

### Change 2: Pass 4 fires for ALL metrics when categoricalFields exist

Currently Pass 4 (`generateAISemanticDerivations`) fires only for "unresolved metrics" — metrics that Call 1 did not map. This is the trigger condition:

```typescript
// Current: only unresolved metrics
const unresolvedMetrics = allMetrics.filter(m => !resolvedByCall1.has(m));
if (unresolvedMetrics.length > 0) {
  // invoke Pass 4
}
```

Change to: Pass 4 fires for ALL metrics when the tenant's data has categorical fields. Every metric gets a derivation specification with the appropriate operation and qualifications.

```typescript
// HF-234: Pass 4 fires for ALL metrics when categorical data exists.
// Column mapping (Call 1) is structural — which column has the data.
// Metric derivation (Pass 4) is contextual — how to compute the metric
// from that column, including operations and qualifications (filters).
// These are complementary, not competing.
const hasCategoricalData = capabilities.some(cap => 
  cap.categoricalFields && cap.categoricalFields.length > 0
);

const metricsForDerivation = hasCategoricalData
  ? allMetrics  // ALL metrics need derivation specifications
  : allMetrics.filter(m => !resolvedByCall1.has(m));  // only unresolved

if (metricsForDerivation.length > 0) {
  // invoke Pass 4 with metricsForDerivation
}
```

When categorical fields exist in the data, EVERY metric goes through Pass 4. Pass 4's prompt already includes categorical field vocabulary and instructs the AI to produce operations with optional filters. Pass 4 produces `MetricDerivationRule[]` with `operation`, `source_field`, and `filters`.

When no categorical fields exist (e.g., Meridian — one metric per column, no filtering needed), Pass 4 fires only for unresolved metrics (existing behavior preserved).

### Change 3: Convergence write path writes BOTH structures

Verify the current write path writes both `convergence_bindings` AND `metric_derivations` to `input_bindings` when both exist. If the write path suppresses `metric_derivations` when `convergence_bindings` is present (per the stale AUD-001 code), fix it to write both unconditionally.

```typescript
// HF-234: Both structures serve different purposes.
// convergence_bindings: structural column-to-role mapping (Call 1)
// metric_derivations: contextual operation + filter specifications (Pass 4)
// Engine uses both: bindings for column resolution, derivations for filtered metrics.
if (Object.keys(result.componentBindings).length > 0) {
  updatedBindings.convergence_bindings = result.componentBindings;
}
if (result.derivations.length > 0) {
  updatedBindings.metric_derivations = result.derivations;
}
```

### What this does NOT change

- Call 1's return type (`Record<string, string>`) — unchanged, still flat column mapping
- Call 1's parsing logic — unchanged, still accepts strings only
- Pass 4's prompt — unchanged, already handles operations + filters correctly
- Pass 4's response parsing — unchanged, already produces `MetricDerivationRule[]`
- Engine's `resolveMetricsFromConvergenceBindings` — unchanged, still reads bindings
- Engine's `applyMetricDerivations` + merge (HF-228) — unchanged, still executes derivations
- The merge order — derivations override bindings for same metric key (HF-228 unconditional merge)

### Why there is no overwrite conflict

Call 1 maps `actual → total_amount` on the binding. No filter. The engine resolves: sum ALL `total_amount` values for the entity.

Pass 4 derives `period_equipment_revenue → sum(total_amount) WHERE product_category = Capital Equipment`. With filter. The engine executes the derivation: sum only Capital Equipment rows.

The HF-228 merge puts `period_equipment_revenue = [filtered sum]` into `metrics{}`. The intent executor reads `period_equipment_revenue` from `metrics{}`. The derivation value wins because the merge runs AFTER binding resolution. The binding's unfiltered value for `actual` is present but the intent executor reads the derivation's filtered value by metric name.

There is no conflict because they produce DIFFERENT keys. The binding produces a role-based value (`actual`). The derivation produces a metric-name-based value (`period_equipment_revenue`). The intent executor reads by metric name.

### Verification against known file types

| Tenant | Categorical data? | Call 1 behavior | Pass 4 behavior | Result |
|---|---|---|---|---|
| Meridian | No | Maps 7 metrics to 7 columns | Fires only for unresolved (0) | Same as today — correct |
| CRP Plan 1 | Yes (`product_category`, `order_type`) | Maps `actual → total_amount` (no filter) | Fires for ALL metrics — produces `sum(total_amount) WHERE Capital Equipment` | Derivation carries filter — correct |
| CRP Plan 2 | Yes | Maps `numerator → total_amount`, `denominator → monthly_quota` | Fires for ALL — produces `consumable_revenue = sum(total_amount) WHERE Consumables`, `monthly_quota = sum(monthly_quota)` | Derivation carries filter — correct |
| CRP Plan 3 | Yes | Maps `actual → quantity` | Fires for ALL — produces `equipment_deal_count = count WHERE Capital Equipment`, `cross_sell_count = count WHERE Cross-Sell` | Derivation carries filters — correct |

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. Final step: `gh pr create --base main --head hf-234-convergence-separation-of-concerns` with descriptive title+body
5. Commit this prompt to git as first action.
6. Read `CC_STANDING_ARCHITECTURE_RULES.md` before any code changes.
7. **Every proof gate requires pasted evidence — code, terminal output, or grep results. PASS/FAIL self-attestation is NOT accepted.**

---

## PHASE 0: DIAGNOSTIC — READ CURRENT STATE (15 min)

```bash
cd ~/spm-platform
git fetch origin
git checkout main && git pull origin main
git checkout -b hf-234-convergence-separation-of-concerns
```

### 0A: Find where categoricalFields are injected into Call 1's prompt

```bash
grep -n "categoricalFields\|categorical" web/src/lib/intelligence/convergence-service.ts | head -20
```

Read 20 lines of context around each hit in `resolveColumnMappingsViaAI`. Paste verbatim. Identify which lines are the HF-227 additions that inject categorical fields into Call 1's prompt.

### 0B: Find the Pass 4 trigger condition

```bash
grep -n "generateAISemanticDerivations\|unresolvedMetrics\|unresolved\|Pass 4" web/src/lib/intelligence/convergence-service.ts | head -20
```

Read 30 lines of context around the trigger. Paste verbatim. Identify the condition that determines which metrics Pass 4 processes.

### 0C: Find the convergence write path

```bash
grep -n "convergence_bindings\|metric_derivations\|updatedBindings" web/src/lib/intelligence/convergence-service.ts | head -20
```

Read the write block. Paste verbatim. Confirm whether `metric_derivations` is written when `convergence_bindings` exists.

Also check the caller in route.ts or execute routes:

```bash
grep -n "convergence_bindings\|metric_derivations\|updatedBindings" web/src/app/api/calculation/run/route.ts | head -20
```

### 0D: Confirm Pass 4 prompt includes categorical fields

```bash
grep -n "categoricalFields\|categorical\|filter" web/src/lib/intelligence/convergence-service.ts | grep -i "pass 4\|semantic\|derivation" | head -10
```

Or search within `generateAISemanticDerivations` for categorical field usage. Paste verbatim. Confirm Pass 4 already has access to categorical vocabulary.

**Proof gate 0 (IMMUTABLE):**
```
□ Call 1 categoricalFields injection point identified (paste code + line numbers)
□ Pass 4 trigger condition identified (paste code + line numbers)
□ Convergence write path — does it write metric_derivations when convergence_bindings exists? (paste code)
□ Pass 4 prompt includes categorical fields (paste evidence)
```

**Commit:** `git add -A && git commit -m "HF-234 Phase 0: diagnostic — convergence separation of concerns" && git push origin hf-234-convergence-separation-of-concerns`

---

## PHASE 1: REMOVE CATEGORICAL FIELDS FROM CALL 1 (10 min)

**File:** `web/src/lib/intelligence/convergence-service.ts`

Remove the HF-227 lines that inject `categoricalFields` into `resolveColumnMappingsViaAI`'s prompt. The prompt should contain only:
- Metric field names from plan components
- Measure column names with contextual identities
- The instruction to return flat `{"metric": "column"}` JSON

Do NOT remove categorical field COLLECTION in `generateAllComponentBindings` — the categorical fields are still needed for Pass 4 and for the binding's filter attachment. Only remove them from Call 1's PROMPT.

**Proof gate 1 (IMMUTABLE):**
```
□ categoricalFields removed from resolveColumnMappingsViaAI prompt (paste before/after)
□ categoricalFields still collected in generateAllComponentBindings (paste evidence)
□ categoricalFields still available for Pass 4 (paste evidence)
□ npm run build exits 0
```

**Commit:** `git add -A && git commit -m "HF-234 Phase 1: remove categorical fields from Call 1 prompt" && git push origin hf-234-convergence-separation-of-concerns`

---

## PHASE 2: PASS 4 FIRES FOR ALL METRICS WHEN CATEGORICAL DATA EXISTS (15 min)

**File:** `web/src/lib/intelligence/convergence-service.ts`

Find the Pass 4 trigger condition. Change it so that when ANY capability has categorical fields, ALL metrics are sent to Pass 4 — not just unresolved ones.

Preserve the existing behavior for tenants without categorical data (Pass 4 fires only for unresolved metrics).

**Proof gate 2 (IMMUTABLE):**
```
□ Pass 4 trigger condition updated (paste before/after)
□ hasCategoricalData check uses capabilities array (paste)
□ When categorical data exists: ALL metrics sent to Pass 4 (paste)
□ When no categorical data: only unresolved metrics sent (existing behavior preserved — paste)
□ npm run build exits 0
```

**Commit:** `git add -A && git commit -m "HF-234 Phase 2: Pass 4 fires for all metrics when categorical data exists" && git push origin hf-234-convergence-separation-of-concerns`

---

## PHASE 3: CONVERGENCE WRITE PATH WRITES BOTH STRUCTURES (10 min)

**File:** `web/src/lib/intelligence/convergence-service.ts` (and/or caller in route.ts)

Verify and fix the write path to write both `convergence_bindings` AND `metric_derivations` to `input_bindings` when both exist. If the current code suppresses `metric_derivations` when `convergence_bindings` is present, remove the conditional.

**Proof gate 3 (IMMUTABLE):**
```
□ Write path writes convergence_bindings unconditionally when componentBindings exist (paste)
□ Write path writes metric_derivations unconditionally when derivations exist (paste)
□ Both can coexist in input_bindings (paste the combined write)
□ npm run build exits 0
```

**Commit:** `git add -A && git commit -m "HF-234 Phase 3: convergence writes both bindings and derivations" && git push origin hf-234-convergence-separation-of-concerns`

---

## PHASE 4: CLEAR BINDINGS + COMPLETION REPORT + PR (10 min)

### 4A: Clear CRP input_bindings

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
  const { data, error } = await sb
    .from('rule_sets')
    .update({ input_bindings: {} })
    .eq('tenant_id', tenantId)
    .select('id, name');
  console.log('Cleared ' + (data?.length || 0) + ' rule_sets');
  for (const rs of data || []) console.log('  ' + rs.name);
})();
"
```

### 4B: Write completion report

Write to `docs/completion-reports/HF-234_COMPLETION_REPORT.md` per Rules 25-28.

### 4C: Final build + PR

```bash
cd ~/spm-platform && rm -rf web/.next && cd web && npm run build
echo "BUILD EXIT: $?"
```

```bash
gh pr create --base main --head hf-234-convergence-separation-of-concerns \
  --title "HF-234: Convergence separation of concerns — Call 1 maps columns, Pass 4 derives metrics" \
  --body "Separates column mapping (structural) from metric derivation (contextual) in the convergence pipeline. Call 1 (resolveColumnMappingsViaAI) maps metric fields to columns without categorical fields or filters — pure structural mapping. Pass 4 (generateAISemanticDerivations) derives metric specifications with operations and qualifications (filters) — fires for ALL metrics when categorical data exists, not just unresolved ones. Both convergence_bindings and metric_derivations written to input_bindings unconditionally. Engine uses both: bindings for column resolution, derivations for filtered metric computation. Fixes CRP Plan 1 P3/P4 non-deterministic filter loss."
```

HALT after PR creation. Architect calculates all four CRP plans across all periods. P3/P4 should now produce filter derivations consistently because Pass 4 always fires when categorical data exists.

---

## SCOPE BOUNDARY — DO NOT CHANGE

- **Do NOT modify** `resolveColumnMappingsViaAI` return type or parsing logic
- **Do NOT modify** `generateAISemanticDerivations` prompt or response parsing
- **Do NOT modify** `applyMetricDerivations` or the HF-228 merge in route.ts
- **Do NOT modify** `resolveMetricsFromConvergenceBindings`
- **Do NOT modify** the intent executor
- **Do NOT modify** any import pipeline code
- **Do NOT add** any new npm dependencies

## ANTI-PATTERNS SPECIFIC TO THIS HF

**AP-1: Adding filters to Call 1.** Call 1 maps columns. Period. If you find yourself adding filter logic to `resolveColumnMappingsViaAI` or its prompt, STOP.

**AP-2: Making Pass 4 conditional on Call 1 failure.** Pass 4 fires for ALL metrics when categorical data exists. If you find yourself writing `if (!resolvedByCall1.has(metric))` as the ONLY trigger, STOP — that's the current bug.

**AP-3: Suppressing metric_derivations when convergence_bindings exists.** Both structures serve different purposes. If you find yourself writing `if (convergenceBindings) { /* skip derivations */ }`, STOP.

---

## EXECUTION SEQUENCE

Phases 0 → 1 → 2 → 3 → 4 in sequence. Every Phase has a proof gate. Paste evidence at every gate. Do NOT skip gates.

Commit + push after every Phase.
