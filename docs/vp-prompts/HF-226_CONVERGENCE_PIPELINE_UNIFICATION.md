# HF-226: CONVERGENCE PIPELINE UNIFICATION — UNIFIED DERIVATION AUTHORITY WITH PLATFORM-WIDE FILTER CONTRACT

## Governance

- **IRA Invocation:** DS-025, Class A Advisory/Innovation, tier_3_novel, $1.53333
- **IRA Disposition:** Option D ADOPTED (composite of Options A+B+C)
- **Supersession candidates accepted:** T2-E08 extend, T2-E25 extend, T2-E01 extend (all via ICA path post-implementation)
- **Governing decisions:** D153 LOCKED, D64v2 LOCKED, D151 LOCKED, D154 LOCKED (Korean Test)
- **AUD evidence:** AUD-009 (19-function registry/cherry-pick inventory), DIAG-047 (4-stage filter provenance), DIAG-046 (convergence binding diagnostic)
- **Defect class closed:** Registry/cherry-pick pattern — function enumerates known fields from rich input, silently discarding unenumerated content

## Why This HF Exists

The convergence pipeline has two AI-mediated paths. Path 1-3 (`resolveColumnMappingsViaAI`) resolves metrics with a flat `{"metric_field": "column_name"}` schema — no filter vocabulary. Path 4 (`generateAISemanticDerivations`) produces full derivation rules WITH filters, including categorical subset detection. But Path 4 only fires for metrics that Path 1-3 failed to resolve. Since Path 1-3 resolves the metric (correctly mapping column, incorrectly omitting filter), Path 4 never fires.

The engine has two resolution paths. Path A (`applyMetricDerivations`) applies `rowMatchesFilters` when filters are present. Path B (`resolveMetricsFromConvergenceBindings → resolveColumnFromBatch`) has no filter parameter — sums all rows regardless.

This is not a tenant-specific defect. Any tenant with categorical subsetting in shared transaction data (e.g., "Equipment Revenue" filtered from a general `total_amount` by `product_category`) will produce wrong results silently. The architecture must handle filter derivation for any format, any content, any language — without pre-teaching the prompt for each new constraint type.

## Architectural Principle

**Unify and simplify.** One derivation authority. One filter contract. Every stage carries full content. Every consumer selects contextually. The registry/cherry-pick pattern is closed at the class level, not patched at individual function instances.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. Final step: `gh pr create --base main --head dev` with descriptive title+body
5. Commit this prompt to git as first action.
6. Read `CC_STANDING_ARCHITECTURE_RULES.md` before any code changes.
7. **Supabase `.in()` batch ≤200.**
8. **Every proof gate requires pasted evidence — code, terminal output, or grep results. PASS/FAIL self-attestation is NOT accepted.**
9. **Fix logic not data — never hardcode answer values, never provide expected outputs.**

---

## PHASE 0: DIAGNOSTIC — VERIFY CURRENT STATE (10 min)

### 0A: Confirm branch and HEAD

```bash
cd ~/spm-platform
git checkout dev && git pull origin dev
git log --oneline -5
```

Verify HEAD is post-PR #399 (HF-225 merged). Verify PRs #400, #401, #402 are NOT yet merged (diagnostic branches — merge separately if directed).

### 0B: Read the five critical-path functions completely

```bash
cd ~/spm-platform

# 1. emitPlanComprehensionSignals — full file
wc -l web/src/lib/compensation/plan-comprehension-emitter.ts
cat web/src/lib/compensation/plan-comprehension-emitter.ts

# 2. convergence-service.ts — full file (large; read it all)
wc -l web/src/lib/intelligence/convergence-service.ts
cat web/src/lib/intelligence/convergence-service.ts

# 3. run-calculation.ts — applyMetricDerivations + rowMatchesFilters
grep -n "function applyMetricDerivations\|function rowMatchesFilters" web/src/lib/calculation/run-calculation.ts

# 4. route.ts — resolveMetricsFromConvergenceBindings + resolveColumnFromBatch
grep -n "function resolveMetricsFromConvergenceBindings\|function resolveColumnFromBatch" web/src/app/api/calculation/run/route.ts
```

Read ALL function bodies at the line numbers found above. Paste the function signatures and line counts.

**Proof gate 0B (IMMUTABLE):**
```
□ plan-comprehension-emitter.ts line count pasted
□ convergence-service.ts line count pasted
□ All five function signatures + line numbers pasted
□ Confirmed: generateAISemanticDerivations exists and contains filter parsing (d.filters loop)
□ Confirmed: resolveColumnMappingsViaAI exists and contains NO filter vocabulary in prompt
□ Confirmed: generateDerivationsForMatch contains filters: [] hardcoded
□ Confirmed: resolveColumnFromBatch has NO filter parameter
□ Confirmed: rowMatchesFilters is called in applyMetricDerivations sum branch
```

### 0C: Identify which engine path active tenants use

```bash
cd ~/spm-platform/web

# Check what CRP Plan 1 has in input_bindings
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb
    .from('rule_sets')
    .select('id, name, input_bindings')
    .eq('tenant_id', 'e44bbcb1-2710-4880-8c7d-a1bd902720b7');
  for (const rs of (data || [])) {
    const ib = rs.input_bindings || {};
    const hasConvergence = ib.convergence_bindings && Object.keys(ib.convergence_bindings).length > 0;
    const hasDerivations = Array.isArray(ib.metric_derivations) && ib.metric_derivations.length > 0;
    console.log(rs.name + ':');
    console.log('  convergence_bindings:', hasConvergence ? Object.keys(ib.convergence_bindings).length + ' components' : 'NONE');
    console.log('  metric_derivations:', hasDerivations ? ib.metric_derivations.length + ' rules' : 'NONE');
    if (hasDerivations) {
      for (const d of ib.metric_derivations) {
        console.log('    ' + d.metric + ': op=' + d.operation + ' filters=' + JSON.stringify(d.filters));
      }
    }
  }
})();
"

# Also check Meridian and BCL
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  for (const [name, tid] of [['Meridian', '5035b1e8-0754-4527-b7ec-9f93f85e4c79'], ['BCL', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111']]) {
    const { data } = await sb
      .from('rule_sets')
      .select('id, name, input_bindings')
      .eq('tenant_id', tid)
      .limit(3);
    for (const rs of (data || [])) {
      const ib = rs.input_bindings || {};
      const hasConvergence = ib.convergence_bindings && Object.keys(ib.convergence_bindings).length > 0;
      const hasDerivations = Array.isArray(ib.metric_derivations) && ib.metric_derivations.length > 0;
      console.log(name + ' / ' + rs.name + ':');
      console.log('  convergence_bindings:', hasConvergence ? 'YES' : 'NONE');
      console.log('  metric_derivations:', hasDerivations ? 'YES' : 'NONE');
    }
  }
})();
"
```

**Proof gate 0C (IMMUTABLE):** Paste the full output. This determines which engine path each tenant uses, which governs Phase 4 fix surface.

**Commit:** `git add -A && git commit -m "HF-226 Phase 0: diagnostic — verify current state" && git push origin dev`

---

## PHASE 1: EMITTER FIDELITY — CARRY FULL LLM OUTPUT (20 min)

### What changes

**File:** `web/src/lib/compensation/plan-comprehension-emitter.ts`

**Current:** `signalValue` at lines ~89-101 is a new object literal enumerating 7 keys (`metric_label`, `metric_op`, `metric_inputs`, `semantic_intent`, `component_id`, `component_type`, `source_evidence`). No spread of `rawComp`. Everything the LLM expressed outside these 7 keys is discarded.

**Fix:** Spread the full component into `signal_value`, then overlay the structural keys for guaranteed consumer access.

```typescript
// BEFORE (cherry-pick — AUD-009 finding #1):
const signalValue: Record<string, unknown> = {
  metric_label: comp.name ?? comp.id ?? 'unnamed_component',
  metric_op: metricOp,
  metric_inputs: metricInputs,
  semantic_intent: comp.reasoning ?? null,
  component_id: comp.id ?? null,
  component_type: comp.type ?? null,
  source_evidence: { ... },
};

// AFTER (carry everything, express contextually):
const signalValue: Record<string, unknown> = {
  ...rawComp,                        // Carry full LLM output
  metric_label: comp.name ?? comp.id ?? 'unnamed_component',
  metric_op: metricOp,
  metric_inputs: metricInputs,
  semantic_intent: comp.reasoning ?? null,
  component_id: comp.id ?? null,
  component_type: comp.type ?? null,
  source_evidence: {
    rule_set_id: args.ruleSetId,
    plan_confidence: args.planConfidence ?? null,
    component_confidence: comp.confidence ?? null,
  },
};
```

The structural overlay keys guarantee backward compatibility — existing consumers reading `metric_label`, `semantic_intent`, `metric_inputs` continue to work. The spread ensures that `calculationIntent`, `calculationMethod`, `filters`, `expectedMetrics`, `metrics`, and any future LLM output fields are preserved in the signal.

### What NOT to change

- Do NOT modify `canonical-signal-writer.ts` — it already carries `signal_value` as whole JSONB.
- Do NOT modify `writeSignalBatch` — passthrough, not on fix surface.
- Do NOT modify the `CanonicalSignalInput` interface — `signalValue` is already `Record<string, unknown>`.

### Verification

```bash
# Confirm no cherry-pick — signalValue should spread rawComp
grep -A 15 "const signalValue" web/src/lib/compensation/plan-comprehension-emitter.ts

# Build
cd ~/spm-platform/web && rm -rf .next && npm run build

# Korean Test — no hardcoded field names or values
grep -n "'product_category'\|'Capital Equipment'\|'Consumables'" web/src/lib/compensation/plan-comprehension-emitter.ts
# Must return 0 results
```

**Proof gate 1 (IMMUTABLE):**
```
□ signalValue contains ...rawComp spread (paste the new code)
□ Structural overlay keys preserved (metric_label, semantic_intent, etc.)
□ npm run build exits 0
□ Korean Test grep returns 0 results
```

**Commit:** `git add -A && git commit -m "HF-226 Phase 1: emitter fidelity — carry full LLM output to signal_value" && git push origin dev`

---

## PHASE 2: UNIFIED DERIVATION PASS (60 min)

This is the largest phase. Three sub-phases.

### Phase 2A: Signal consumers carry full context to AI prompt

**File:** `web/src/lib/intelligence/convergence-service.ts`

**Current:** Signal consumption sites at ~595, ~1857, ~2447 read only `metric_label`, `semantic_intent`, `metric_inputs` from `signal_value`.

**Fix:** Each consumption site passes the full `signal_value` object as context rather than extracting three fields. The AI prompt receives everything the plan agent expressed.

For each of the three consumption sites, find where the signal is consumed and change:

```typescript
// BEFORE (cherry-pick — AUD-009 finding #7):
const metricLabel = sv.metric_label;
const semanticIntent = sv.semantic_intent;
const metricInputs = sv.metric_inputs;

// AFTER (carry everything):
// Pass full signal_value; downstream prompt builder includes all context
```

The specific change depends on how each site currently structures the data. CC must read the full site before editing. The guiding principle: the AI prompt builder should receive `signal_value` as an object, not three extracted strings.

**Proof gate 2A (IMMUTABLE):**
```
□ All three signal consumption sites identified (paste line numbers)
□ Each site passes full signal_value to downstream consumer (paste new code for each)
□ npm run build exits 0
```

**Commit:** `git add -A && git commit -m "HF-226 Phase 2A: signal consumers carry full context" && git push origin dev`

### Phase 2B: Eliminate routing gate — generateAISemanticDerivations becomes sole derivation authority

**File:** `web/src/lib/intelligence/convergence-service.ts`

**Current architecture:**
1. `resolveColumnMappingsViaAI` (Pass 1-3) runs first, produces `{"metric": "column"}` flat mapping
2. `generateDerivationsForMatch` constructs `MetricDerivationRule` with `filters: []` from that mapping
3. `generateAISemanticDerivations` (Pass 4) runs ONLY for unresolved metrics

**Target architecture:**
1. `generateAISemanticDerivations` is the SOLE derivation authority for ALL metrics
2. `resolveColumnMappingsViaAI` is REMOVED (its capability is a strict subset of Pass 4)
3. `generateDerivationsForMatch` is REMOVED (its `filters: []` hardcoding is the defect)
4. `generateFilteredCountDerivations` is REMOVED (token-overlap heuristic fails Korean Test for non-English)

**Implementation approach:**

The convergence pipeline currently calls these functions in sequence inside `convergeBindings` or `generateAllComponentBindings`. CC must:

1. **Read the full `convergeBindings` function** to understand the orchestration.
2. **Read `generateAllComponentBindings`** to understand where each pass is called.
3. **Restructure the orchestration** so that ALL metrics (not just unresolved ones) are passed to `generateAISemanticDerivations`.
4. **Remove or comment out** calls to `resolveColumnMappingsViaAI`, `generateDerivationsForMatch`, and `generateFilteredCountDerivations`. Do NOT delete the function bodies yet — comment them with `// HF-226: Superseded by unified derivation pass. Remove after three-tenant verification.`
5. **Ensure `generateAISemanticDerivations` receives the full signal context** from Phase 2A.

**Critical: the AI prompt in `generateAISemanticDerivations` already handles filters correctly.** Lines ~598-639 instruct the AI to identify categorical subsets and produce `filters: [{field, operator, value}]`. The parser at lines ~688-699 carries them. Do NOT rewrite the prompt. Do NOT rewrite the parser.

**What to change inside `generateAISemanticDerivations`:** The derivation push at line ~701 cherry-picks 5 fields from `d`. Fix:

```typescript
// BEFORE (cherry-pick — AUD-009 finding #10):
derivations.push({
  metric,
  operation: operation as MetricDerivationRule['operation'],
  source_pattern: sourcePattern,
  source_field: d.source_field ? String(d.source_field) : undefined,
  filters,
});

// AFTER (carry everything, overlay typed fields):
derivations.push({
  ...d,                             // Carry full AI output
  metric,                           // Overlay validated typed fields
  operation: operation as MetricDerivationRule['operation'],
  source_pattern: sourcePattern,
  source_field: d.source_field ? String(d.source_field) : undefined,
  filters,
});
```

The spread carries any additional AI output (confidence, reasoning, scope) as untyped metadata. The overlay ensures typed fields are validated.

### Handling the binding reuse gate

The convergence pipeline has a binding reuse check (`hasCompleteBindings` or similar) that skips re-derivation when valid bindings exist. This MUST be preserved — binding reuse is proven working and is the Progressive Performance principle (same fingerprint, second encounter at $0/~100ms).

However, bindings produced BEFORE this HF will have `filters: []`. The reuse gate must be modified:

```typescript
// If existing bindings exist BUT were produced pre-HF-226 (no filters on any derivation
// that should have filters), re-derive. Detect by checking if any derivation has
// filters populated — if ALL are empty, re-derive.
```

CC must read the current binding reuse gate and modify it to invalidate pre-HF-226 bindings. The simplest approach: add a version marker to the binding output (e.g., `convergence_version: 'HF-226'`) and skip reuse when the marker is absent or pre-HF-226.

**Proof gate 2B (IMMUTABLE):**
```
□ resolveColumnMappingsViaAI call sites commented out (paste the comment + surrounding code)
□ generateDerivationsForMatch call sites commented out (paste)
□ generateFilteredCountDerivations call sites commented out (paste)
□ ALL metrics now flow to generateAISemanticDerivations (paste the orchestration code)
□ derivations.push spreads d (paste the new push code)
□ Binding reuse gate modified (paste the gate code)
□ npm run build exits 0
□ Korean Test grep returns 0 hardcoded field names in convergence-service.ts:
    grep -n "'product_category'\|'Capital Equipment'\|'Consumables'\|'Cross-Sell'" web/src/lib/intelligence/convergence-service.ts
```

**Commit:** `git add -A && git commit -m "HF-226 Phase 2B: unified derivation pass — generateAISemanticDerivations as sole authority" && git push origin dev`

### Phase 2C: MetricDerivationRule carries AI context

**File:** `web/src/lib/calculation/run-calculation.ts` (interface definition) OR `web/src/types/` if the interface lives elsewhere.

**Current:** `MetricDerivationRule` has 7 typed fields: `metric`, `operation`, `source_pattern`, `filters`, `source_field`, `numerator_metric`, `denominator_metric`, `scale_factor`.

**Fix:** Add an open-ended `ai_context` field:

```typescript
export interface MetricDerivationRule {
  metric: string;
  operation: 'count' | 'sum' | 'delta' | 'ratio';
  source_pattern: string;
  filters: Array<{
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
    value: string | number | boolean;
  }>;
  source_field?: string;
  numerator_metric?: string;
  denominator_metric?: string;
  scale_factor?: number;
  ai_context?: Record<string, unknown>;  // HF-226: Carry Everything — unenumerated AI output
}
```

This preserves the typed contract (engine reads typed fields deterministically) while carrying anything else the AI expressed. The `ai_context` field is:
- Written by `generateAISemanticDerivations` (Phase 2B spread populates it)
- Read by future intelligence consumers (classification signals, observatory, debugging)
- Ignored by the engine's deterministic execution path (engine reads only typed fields)

**Proof gate 2C (IMMUTABLE):**
```
□ MetricDerivationRule interface updated (paste the full interface)
□ npm run build exits 0
```

**Commit:** `git add -A && git commit -m "HF-226 Phase 2C: MetricDerivationRule ai_context field" && git push origin dev`

---

## PHASE 3: UNIFIED ENGINE FILTER CONTRACT (30 min)

### Phase 3A: resolveColumnFromBatch gains filter parameter

**File:** `web/src/app/api/calculation/run/route.ts`

**Current:** `resolveColumnFromBatch(column, entityExternalId)` — two parameters, sums all rows.

**Fix:** Add `filters` parameter, apply `rowMatchesFilters` before summing:

```typescript
// BEFORE:
function resolveColumnFromBatch(column: string, entityExternalId: string): number | null {
  // ... finds entity rows ...
  for (const rd of entityRows) {
    const val = rd[column];
    if (typeof val === 'number') { sum += val; found = true; }
    // ...
  }
  return found ? sum : null;
}

// AFTER:
function resolveColumnFromBatch(
  column: string,
  entityExternalId: string,
  filters?: MetricDerivationRule['filters']
): number | null {
  // ... finds entity rows ...
  for (const rd of entityRows) {
    // HF-226: Apply filter contract — skip rows that don't match filters
    if (filters && filters.length > 0 && !rowMatchesFilters(rd, filters)) continue;
    const val = rd[column];
    if (typeof val === 'number') { sum += val; found = true; }
    // ...
  }
  return found ? sum : null;
}
```

Import `rowMatchesFilters` from `run-calculation.ts` if not already imported. Import `MetricDerivationRule` type if not already imported.

When `filters` is undefined or empty, behavior is identical to today — `rowMatchesFilters` returns `true` for empty arrays. No regression for Meridian or BCL.

### Phase 3B: resolveMetricsFromConvergenceBindings reads filters

**File:** `web/src/app/api/calculation/run/route.ts`

**Current:** `resolveMetricsFromConvergenceBindings` reads `compBindings.{actual, row, target, column, numerator, denominator, entity_identifier}`. No `filters` field.

**Fix:** Read `filters` from the binding and pass to `resolveColumnFromBatch`:

CC must read the full function body and find every call to `resolveColumnFromBatch`. At each call site, pass the binding's `filters` array as the third argument.

The `convergence_bindings` JSONB structure stores per-component bindings. The filters must be written there by Phase 2B (convergence writes the unified derivation output to `convergence_bindings`). CC must verify that the convergence output write path populates filters into the binding structure.

**If convergence writes `metric_derivations` (not `convergence_bindings`) for a tenant:** The existing `applyMetricDerivations` path already handles filters via `rowMatchesFilters`. No change needed for Path A. Phase 3 only fixes Path B (convergence_bindings path).

**Proof gate 3 (IMMUTABLE):**
```
□ resolveColumnFromBatch has filters parameter (paste new signature)
□ rowMatchesFilters imported (paste import line)
□ resolveMetricsFromConvergenceBindings passes filters to resolveColumnFromBatch (paste each call site)
□ npm run build exits 0
□ Korean Test — no hardcoded field names:
    grep -n "'product_category'\|'Capital Equipment'" web/src/app/api/calculation/run/route.ts
    Must return 0 results
```

**Commit:** `git add -A && git commit -m "HF-226 Phase 3: unified engine filter contract — resolveColumnFromBatch applies filters" && git push origin dev`

---

## PHASE 4: THREE-TENANT RE-VERIFICATION (30 min)

This phase verifies the platform produces correct results across three structurally different tenants.

### 4A: Clear convergence bindings for all three tenants

The existing bindings were produced pre-HF-226 (without filters). Clear them so convergence re-derives with the unified pass.

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  for (const [name, tid] of [
    ['Meridian', '5035b1e8-0754-4527-b7ec-9f93f85e4c79'],
    ['BCL', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'],
    ['CRP', 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'],
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

### 4B: Re-import each tenant (triggers convergence)

Andrew will trigger re-import via browser for each tenant. CC does NOT trigger imports.

After Andrew confirms each import, CC verifies the new convergence bindings:

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  // CRP — the critical check: do metric_derivations now have filters?
  const { data } = await sb
    .from('rule_sets')
    .select('id, name, input_bindings')
    .eq('tenant_id', 'e44bbcb1-2710-4880-8c7d-a1bd902720b7');
  for (const rs of (data || [])) {
    const ib = rs.input_bindings || {};
    const derivations = ib.metric_derivations || [];
    console.log(rs.name + ':');
    for (const d of derivations) {
      console.log('  ' + d.metric + ': op=' + d.operation + ' source_field=' + (d.source_field || 'N/A') + ' filters=' + JSON.stringify(d.filters));
    }
  }
})();
"
```

**Expected for CRP Plan 1:** `period_equipment_revenue: op=sum source_field=total_amount filters=[{field: product_category, operator: eq, value: Capital Equipment}]`

### 4C: Ground truth verification

Andrew will calculate each tenant via browser. CC verifies results:

```bash
cd ~/spm-platform/web

# Meridian — must be $185,063 EXACT
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb
    .from('calculation_results')
    .select('total_payout, created_at')
    .eq('tenant_id', '5035b1e8-0754-4527-b7ec-9f93f85e4c79')
    .order('created_at', { ascending: false })
    .limit(3);
  for (const r of (data || [])) {
    console.log('Meridian payout:', r.total_payout, 'at', r.created_at);
  }
})();
"

# BCL — must be $312,033 EXACT
# (same pattern, tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111')

# CRP — must be $561,028.97 net EXACT (corrected GT)
# (same pattern, tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7')
```

**Proof gate 4 (IMMUTABLE — THIS IS THE RECONCILIATION GATE):**
```
□ Meridian: $185,063 EXACT (paste calculation_results query output)
□ BCL: $312,033 EXACT (paste calculation_results query output)
□ CRP Plan 1: filters populated (paste the metric_derivations with filters)
□ CRP: $561,028.97 net (paste calculation_results query output)
    — OR — if CRP does not reconcile, paste the per-plan totals and the
    specific discrepancy. Do NOT claim PASS if any plan is wrong.
```

**Commit:** `git add -A && git commit -m "HF-226 Phase 4: three-tenant re-verification" && git push origin dev`

---

## SCOPE BOUNDARY — DO NOT CHANGE

- **Do NOT modify** `canonical-signal-writer.ts` — passthrough, already correct
- **Do NOT modify** `loadMetricComprehensionSignals` — returns raw rows, already correct
- **Do NOT modify** `applyMetricDerivations` sum/count/delta branches — `rowMatchesFilters` already works
- **Do NOT modify** `rowMatchesFilters` — already correct
- **Do NOT modify** any auth, session, or storage code
- **Do NOT add** any new npm dependencies
- **Do NOT modify** the AI prompt text in `generateAISemanticDerivations` — it already handles filters correctly
- **Do NOT modify** the AI response parser in `generateAISemanticDerivations` — it already carries filters
- **Do NOT create** new TypeScript files — all changes are to existing files
- **Do NOT delete** superseded functions yet — comment them with `// HF-226: Superseded` for rollback safety

## ANTI-PATTERNS SPECIFIC TO THIS HF

**AP-1: Solving for CRP.** The fix must work for ANY tenant with ANY data shape in ANY language. If you find yourself writing `product_category` or `Capital Equipment` in code, you are instantiating the defect class. STOP.

**AP-2: Registry/cherry-pick.** If you find yourself constructing a new object literal with enumerated fields from a richer source, you are instantiating the defect class. Spread first, overlay typed fields.

**AP-3: Prompt rewriting.** The `generateAISemanticDerivations` prompt already handles filters. Do NOT rewrite it, extend it, or add new instructions. The prompt change (if any) is removing the "unresolved metrics only" framing — it should now say "all metrics" since it's the sole derivation authority.

**AP-4: Parallel code paths.** Do NOT create a new function alongside the existing ones. Unify INTO `generateAISemanticDerivations`. One path, one authority.

**AP-5: Skipping the binding reuse gate.** Binding reuse MUST be preserved for the Progressive Performance principle. Modify the gate to detect pre-HF-226 bindings, do NOT remove it.

---

## EXECUTION SEQUENCE

Phases 0 → 1 → 2A → 2B → 2C → 3A → 3B → 4A in sequence. Phase 4B and 4C require architect to trigger imports and calculations via browser — HALT after 4A and report.

Every Phase has a proof gate. Paste evidence at every gate. Do NOT skip gates. Do NOT proceed to the next Phase until the current Phase's proof gate passes.

Commit + push after every Phase. Final step: `gh pr create --base main --head dev --title "HF-226: Convergence pipeline unification — unified derivation authority with platform-wide filter contract" --body "IRA DS-025 Option D. Closes registry/cherry-pick defect class across signal emission, convergence derivation, and engine filter contract. Three-tenant re-verification required post-merge."`
