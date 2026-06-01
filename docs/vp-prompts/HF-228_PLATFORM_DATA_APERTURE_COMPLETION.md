# HF-228: PLATFORM DATA APERTURE COMPLETION

## Governance

- **Predecessor:** HF-226 (PR #403, convergence unification), HF-227 (PR #404, binding filter completion), DIAG-048 (PR #405 + addendum, CRP Plans 2/3/4 failure trace)
- **Data Contract Map:** DCM required — inter-stage data flows modified across SCI classification → convergence inventory → convergence binding → engine metric resolution → intent execution
- **Governing decisions:** D92 (5 SCI agents: Plan/Entity/Target/Transaction/Reference), D111 (convergence_bindings sole output), D151 (intent executor sole authority), D153 LOCKED (signal surface), D154 LOCKED (Korean Test — structural primitives), D155 LOCKED (canonical primitive registry)
- **Defect evidence:** DIAG-048 Phases 1-10 — verbatim code for every function in the chain

## Why This HF Exists

CRP Plan 1 reconciles exactly ($360,007.84, 96 entity-period cells). Plans 2, 3, and 4 fail. DIAG-048 traced the complete code path for each failure. The root causes are:

1. **Plan 3 ($0):** The production entity loop in `route.ts` does not execute `metric_derivations`. The convergence pipeline produces correct derivation rules (`equipment_deal_count` count with Capital Equipment filter, `cross_sell_count` count with Cross-Sell filter). `applyMetricDerivations` in `run-calculation.ts` can execute them. But `route.ts` never calls it. The `metrics{}` map that reaches the intent executor has neither metric. The conditional gate evaluates `equipment_deal_count >= 1` as false. Every entity gets $0.

2. **Plan 2 (wrong amounts):** The quota file (`05_CRP_Quotas_20260101.csv`) classified as `entity` instead of `target`. Its 24 rows landed in `committed_data` with `data_type="entity"` alongside 33 roster rows. `inventoryData` sampled the first 30 entity rows — all roster — missing the quota rows entirely. `monthly_quota` never appeared in `DataCapability`. `matchComponentsToData` matched the Consumables component to `data_type="transaction"` only. `measureColumns` contained only transaction columns. The AI mapped `monthly_quota → unit_price` (wrong). Even with correct classification, the single-data-type-per-component matching gate prevents cross-source metric discovery.

3. **Plan 4 (TypeError crash):** `resolveSource` case `'aggregate'` at `intent-executor.ts:104` calls `field.startsWith('metric:')` where `field = src.sourceSpec.field` is undefined. Null safety bug.

These are not ICM-specific issues. Any domain — financial, franchise, rebates — will have plans combining transaction data with reference/target data, components needing derived metrics with filters, and intent sources that may lack complete specifications. The fixes are domain-agnostic.

## What Changes (5 files)

---

### Change 1: SCI Referential-vs-Definitional Classification Signal

**File:** `web/src/lib/sci/agents.ts`

**Architectural principle:** Entity data DEFINES entities (each row IS an entity). Target/reference data REFERENCES entities (each row ASSOCIATES a value WITH an existing entity). The structural signal that distinguishes them: do the identifier values in this file match entities that ALREADY EXIST in the tenant?

**Current state (DIAG-048 Phase 8.2):** TARGET_WEIGHTS has `has_entity_id` (+0.20), `has_numeric_fields` (+0.15), `single_or_few_per_entity` (+0.15), `no_date` (+0.10). ENTITY_WEIGHTS has `has_entity_id` (+0.20) plus roster-pattern signals. The quota file scores entity 80%, target 70%. The referential signal is missing.

**What to add — two signals, both structural, Korean Test compliant:**

**Target Agent — `referential_identifiers` signal:**
- At classification time, the SCI has access to the file's parsed rows and the tenant's existing entities
- Count how many of the file's identifier column values match existing entity external_ids
- If match_ratio > 0.7 (most identifiers reference existing entities) AND at least one numeric non-identifier column exists → signal fires
- Weight: +0.15
- Evidence: `"{matched}/{total} identifiers match existing entities — referential data pattern"`

**Entity Agent — `referential_not_definitional` counter-signal:**
- Same check: if match_ratio > 0.7 → this file is referencing entities, not defining new ones
- Weight: -0.15
- Evidence: `"Most identifiers already exist — file references entities rather than defining them"`

**Implementation detail:** The SCI classification scoring function receives a `ProfilePayload` which includes `patterns.hasEntityIdentifier`. The function needs access to the tenant's existing entity external_ids to compute the match ratio. Check whether the scoring function already receives tenant context or entity list. If not, pass it through from the caller.

**What NOT to do:**
- Do NOT match on field names ("quota", "target", "monthly_quota") — Korean Test violation
- Do NOT hardcode any column names — structural signals only
- Do NOT change existing signal weights — add new signals additively

---

### Change 2: inventoryData Sampling Coverage

**File:** `web/src/lib/intelligence/convergence-service.ts`
**Function:** `inventoryData` (line 898)

**Current state (DIAG-048 Phase 3.2):** Queries `committed_data.limit(500)`, then takes the first 30 rows per data_type (line 954: `if (samples.length < 30)`). For CRP's 57 entity rows (33 roster + 24 quota), the 30-sample lands entirely on roster rows. Quota row schema (`monthly_quota`, `effective_date`, `plan`) is invisible.

**The problem:** The 30-cap samples rows in default query order (insertion time / primary key). If different row schemas exist within one data_type (roster rows vs quota rows both as `data_type="entity"`), the sample may miss entire schemas.

**Fix:** After the initial 30-row sample per data_type, check whether there are rows with different column schemas that were missed. The structural heuristic: compare column keys of sampled rows vs total rows for each data_type.

**Approach — ensure all distinct row schemas are represented:**

```typescript
// After the existing sample loop (lines 949-957), add a schema coverage check:
for (const [dt, samples] of byType.entries()) {
  // Collect column-key signatures from sampled rows
  const sampledSignatures = new Set(
    samples.map(rd => Object.keys(rd).filter(k => !k.startsWith('_')).sort().join(','))
  );
  
  // Check remaining rows for unseen signatures
  const allRowsForType = allRows.filter(r => (r.data_type as string) === dt);
  for (const row of allRowsForType) {
    if (samples.length >= 50) break; // cap to avoid unbounded growth
    const rd = row.row_data as Record<string, unknown> | null;
    if (!rd) continue;
    const sig = Object.keys(rd).filter(k => !k.startsWith('_')).sort().join(',');
    if (!sampledSignatures.has(sig)) {
      samples.push(rd);
      sampledSignatures.add(sig);
    }
  }
}
```

This ensures that if quota rows have a different column schema than roster rows, at least one quota row enters the sample. `monthly_quota` appears in the DataCapability. The cap at 50 prevents unbounded growth.

**Korean Test:** Uses column key structure, not column names. Domain-agnostic.

---

### Change 3: Cross-Data-Type Column Discovery in Convergence

**File:** `web/src/lib/intelligence/convergence-service.ts`
**Function:** `generateAllComponentBindings` (line 2181)

**Current state (DIAG-048 Phase 3.3 + Phase 7.2):** `measureColumns` is built only from capabilities whose `dataType` appears in `matches`:

```typescript
for (const match of matches) {
  const cap = capabilities.find(c => c.dataType === match.dataType);
  if (!cap) continue;
  // ... collects columns from THIS matched capability only
}
```

The function receives `capabilities` (ALL tenant capabilities, per Phase 7.2 line 373) but only iterates `matches`. Capabilities not matched to a component contribute no columns. The AI only sees columns from matched data_types.

**Fix:** After collecting columns from matched capabilities, also collect numeric columns from UNMATCHED capabilities as supplementary candidates. Mark them as cross-source so the AI can distinguish primary vs supplementary columns.

```typescript
// After the existing match-based loop (lines 2190-2214):

// HF-228: Cross-data-type discovery — include numeric fields from ALL capabilities
// so the AI can resolve metrics that come from a different data source than the
// component's primary match (e.g., quota from target data, revenue from transaction data).
const matchedDataTypes = new Set(matches.map(m => m.dataType));
for (const cap of capabilities) {
  if (matchedDataTypes.has(cap.dataType)) continue; // already included
  for (const nf of cap.numericFields) {
    if (!measureColumns.some(mc => mc.name === nf.field) && cap.columnStats[nf.field]) {
      measureColumns.push({
        name: nf.field,
        fi: { structuralType: 'measure', contextualIdentity: 'cross_source_numeric', confidence: 0.4 },
        stats: cap.columnStats[nf.field],
        batchId: cap.batchIds[0] || '',
      });
    }
  }
  // Also include categorical fields from unmatched capabilities for filter discovery
  for (const cf of cap.categoricalFields || []) {
    if (!seenCategoricalFields.has(cf.field)) {
      seenCategoricalFields.add(cf.field);
      aggregatedCategoricalFields.push({ field: cf.field, distinctValues: cf.distinctValues });
    }
  }
}
```

The `contextualIdentity: 'cross_source_numeric'` marker distinguishes these from primary columns. The AI sees ALL numeric columns across all data_types and can map `monthly_quota` from the target/entity capability to the Consumables component's denominator role.

**Korean Test:** Uses structural type classification, not column names.

**Note:** The `seenCategoricalFields` and `aggregatedCategoricalFields` variables are already initialized above (HF-227, lines 2233-2243). The cross-source loop extends them.

---

### Change 4: Metric Derivation Execution in Production Entity Loop

**File:** `web/src/app/api/calculation/run/route.ts`

**Current state (DIAG-048 Phase 10):** The production entity loop (lines 1488-2480) does NOT call `applyMetricDerivations`. The comment at line 2195 says: `"HF-220 R2 / ADR Decision 1: OB-118 merge-guard retired."` The function `applyMetricDerivations` exists at `run-calculation.ts:119` and correctly executes `sum`, `count`, `delta`, `ratio` operations with `rowMatchesFilters`. The `metric_derivations` array exists in `input_bindings` (DIAG-048 Phase 2.1 confirms 2 rules for Cross-Sell, 1 for Consumables, 1 for Capital Equipment). But the production loop ignores them.

**What to add — NOT restoring OB-118 merge-guard. Completing the unified path:**

After the per-entity data fetch (where `entitySheetData` is constructed from committed_data rows) and BEFORE the per-component loop, call `applyMetricDerivations` to produce derived metrics. Then inside the per-component loop, merge derived metrics into the component's `metrics{}` map after convergence_bindings resolution and before intent execution.

**Insertion point:** Find where the per-entity `entitySheetData` Map is fully constructed (after the OB-152 source_date path fetches committed_data and builds the batch cache). Before the component loop begins.

```typescript
// HF-228: Execute metric_derivations to produce derived metrics.
// Convergence produces derivation rules (operation + filter + source_field).
// The intent executor needs the results in data.metrics.
// This completes the convergence → engine → intent pipeline.
const derivedMetrics = metricDerivations.length > 0
  ? applyMetricDerivations(entitySheetData, metricDerivations)
  : {};
```

Then inside the per-component loop, after `metrics` is populated from convergence_bindings (or set to `{}` on fallback), merge:

```typescript
// HF-228: Merge derived metrics — derivations carry operation+filter rules
// that produce metrics the bindings can't express (counts, cross-category sums).
for (const [key, value] of Object.entries(derivedMetrics)) {
  metrics[key] = value;
}
```

**Import:** `applyMetricDerivations` is already exported from `run-calculation.ts`. Verify the import exists in `route.ts` or add it.

**What this does NOT do:**
- Does NOT restore the OB-118 merge-guard (the guard was a conditional that checked whether derived metrics conflicted with binding-resolved metrics — correctly removed)
- Does NOT restore `buildMetricsForComponent` fallback (correctly retired by HF-220 R1)
- Does NOT modify the intent executor's sole authority (D151 — unchanged)

**What this DOES do:**
- Executes convergence-produced derivation rules for every entity
- Makes derived metrics available in `data.metrics` for the intent executor
- Enables `conditional_gate` (Plan 3) to find `equipment_deal_count` and `cross_sell_count`
- Enables `piecewise_linear` (Plan 2) to find `consumable_revenue` from the derivation rule with Consumables filter

---

### Change 5: Null Safety in resolveSource

**File:** `web/src/lib/calculation/intent-executor.ts`

**Current state (DIAG-048 Phase 4.1):** Four `startsWith` calls at lines 77, 89, 91, 105 access `src.sourceSpec.field` or `src.sourceSpec.numerator`/`denominator` without null checks. If `sourceSpec.field` is undefined (e.g., aggregate intent with incomplete specification), TypeError crashes the entire calculation run.

**Fix — null guard on all four sites:**

```typescript
// Line 75 (metric case):
const field = src.sourceSpec?.field ?? '';

// Line 89 (ratio case - numerator):
const numKey = (src.sourceSpec?.numerator ?? '').startsWith('metric:')
  ? src.sourceSpec.numerator.slice(7) : (src.sourceSpec?.numerator ?? '');

// Line 91 (ratio case - denominator):
const denKey = (src.sourceSpec?.denominator ?? '').startsWith('metric:')
  ? src.sourceSpec.denominator.slice(7) : (src.sourceSpec?.denominator ?? '');

// Line 104 (aggregate case):
const field = src.sourceSpec?.field ?? '';
```

The `?? ''` ensures `startsWith` never receives undefined. When field is empty, the metric key is empty, `data.metrics['']` is undefined, `?? 0` produces 0. The component produces $0 rather than crashing the entire run. This is correct behavior — an incomplete intent specification should produce zero, not a TypeError.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. Final step: `gh pr create --base main --head hf-228-platform-data-aperture` with descriptive title+body
5. Commit this prompt to git as first action.
6. Read `CC_STANDING_ARCHITECTURE_RULES.md` before any code changes.
7. **Supabase `.in()` batch ≤ 200.**
8. **Every proof gate requires pasted evidence — code, terminal output, or grep results. PASS/FAIL self-attestation is NOT accepted.**

---

## PHASE 0: DIAGNOSTIC — READ CURRENT STATE (10 min)

```bash
cd ~/spm-platform
git fetch origin
git checkout main && git pull origin main
git checkout -b hf-228-platform-data-aperture
```

### 0A: Read files being modified

```bash
# 1. SCI agents scoring
grep -n "TARGET_WEIGHTS\|ENTITY_WEIGHTS\|referential\|ProfilePayload" web/src/lib/sci/agents.ts | head -20

# 2. inventoryData sampling
grep -n "function inventoryData\|samples.length < 30\|byType" web/src/lib/intelligence/convergence-service.ts | head -10

# 3. generateAllComponentBindings measureColumns
grep -n "measureColumns\|matchedDataTypes\|cross_source" web/src/lib/intelligence/convergence-service.ts | head -10

# 4. route.ts entity loop — applyMetricDerivations reference
grep -n "applyMetricDerivations\|derivedMetrics\|metricDerivations\|HF-220 R2" web/src/app/api/calculation/run/route.ts | head -15

# 5. resolveSource startsWith calls
grep -n "startsWith\|sourceSpec" web/src/lib/calculation/intent-executor.ts | head -20

# 6. Import availability
grep -n "applyMetricDerivations" web/src/lib/calculation/run-calculation.ts | head -5
```

Read 20 lines of context around each call site. Paste verbatim.

### 0B: Verify SCI scoring function receives tenant context

```bash
grep -n "scoreAgents\|classifyContent\|computeScores\|ProfilePayload" web/src/lib/sci/agents.ts | head -20
```

Check whether the scoring function has access to existing entity external_ids for the tenant. If not, identify where tenant entities are available in the SCI pipeline (the execute-bulk route has `tenantId`).

**Proof gate 0 (IMMUTABLE):**
```
□ TARGET_WEIGHTS + ENTITY_WEIGHTS current signals pasted
□ inventoryData sampling logic pasted
□ measureColumns construction pasted
□ route.ts entity loop — metricDerivations variable location pasted
□ resolveSource startsWith call sites pasted
□ applyMetricDerivations import availability confirmed
□ SCI scoring function signature + tenant context access confirmed
```

**Commit:** `git add -A && git commit -m "HF-228 Phase 0: diagnostic — read current state" && git push origin hf-228-platform-data-aperture`

---

## PHASE 1: SCI REFERENTIAL CLASSIFICATION SIGNAL (30 min)

**File:** `web/src/lib/sci/agents.ts`

### 1A: Add referential signal infrastructure

The scoring function needs access to existing entity external_ids for the tenant. Determine from Phase 0B how to pass this data. Options:

- If `ProfilePayload` already includes tenant entities: use directly
- If not: add an optional `existingEntityIds?: Set<string>` parameter to the scoring function, passed from execute-bulk where entity lookup is already available

### 1B: Add Target Agent `referential_identifiers` signal

In TARGET_WEIGHTS array, add:

```typescript
{
  signal: 'referential_identifiers',
  weight: 0.15,
  test: (p, ctx) => {
    if (!ctx?.existingEntityIds || ctx.existingEntityIds.size === 0) return false;
    if (!p.patterns.hasEntityIdentifier) return false;
    // Check if the file has at least one numeric non-identifier column
    if (p.structure.numericFieldRatio <= 0.10) return false;
    // Check if identifier values match existing entities
    const identifierValues = p.patterns.identifierValues || [];
    if (identifierValues.length === 0) return false;
    const matchCount = identifierValues.filter(v => ctx.existingEntityIds.has(String(v))).length;
    const matchRatio = matchCount / identifierValues.length;
    return matchRatio > 0.7;
  },
  evidence: (p, ctx) => {
    const identifierValues = p.patterns.identifierValues || [];
    const matchCount = identifierValues.filter(v => ctx?.existingEntityIds?.has(String(v))).length;
    return `${matchCount}/${identifierValues.length} identifiers match existing entities — referential data pattern`;
  },
},
```

### 1C: Add Entity Agent `referential_not_definitional` counter-signal

In ENTITY_WEIGHTS array, add:

```typescript
{
  signal: 'referential_not_definitional',
  weight: -0.15,
  test: (p, ctx) => {
    if (!ctx?.existingEntityIds || ctx.existingEntityIds.size === 0) return false;
    if (!p.patterns.hasEntityIdentifier) return false;
    const identifierValues = p.patterns.identifierValues || [];
    if (identifierValues.length === 0) return false;
    const matchCount = identifierValues.filter(v => ctx.existingEntityIds.has(String(v))).length;
    const matchRatio = matchCount / identifierValues.length;
    return matchRatio > 0.7;
  },
  evidence: () => 'Most identifiers already exist — file references entities rather than defining them',
},
```

### 1D: Verify ProfilePayload includes identifierValues

Check whether `p.patterns.identifierValues` exists. If not, it needs to be populated during the profiling step — extract the distinct values from the identifier column and include them in the profile.

**Korean Test verification:**
```bash
grep -nE "'quota'|'target'|'monthly_quota'|'effective_date'" web/src/lib/sci/agents.ts
# Must return 0 results — no field name matching
```

**Proof gate 1 (IMMUTABLE):**
```
□ referential_identifiers signal added to TARGET_WEIGHTS (paste)
□ referential_not_definitional signal added to ENTITY_WEIGHTS (paste)
□ Scoring function receives existingEntityIds context (paste signature)
□ Korean Test: 0 field name matches in agents.ts
□ npm run build exits 0
```

**Commit:** `git add -A && git commit -m "HF-228 Phase 1: SCI referential classification signal" && git push origin hf-228-platform-data-aperture`

---

## PHASE 2: inventoryData SAMPLING COVERAGE (15 min)

**File:** `web/src/lib/intelligence/convergence-service.ts`
**Function:** `inventoryData` (line 898)

After the existing sample loop (lines 949-957), add a schema coverage check to ensure all distinct row schemas within a data_type are represented in the sample.

The approach is described in Change 2 above. Implementation detail: the `allRows` variable contains up to 500 rows. The schema coverage loop iterates these rows (already in memory), checks column signatures, and adds unseen schemas up to a cap of 50 per data_type.

**Proof gate 2 (IMMUTABLE):**
```
□ Schema coverage check added after line 957 (paste code)
□ Cap at 50 rows per data_type prevents unbounded growth (paste)
□ npm run build exits 0
```

**Commit:** `git add -A && git commit -m "HF-228 Phase 2: inventoryData schema-aware sampling" && git push origin hf-228-platform-data-aperture`

---

## PHASE 3: CROSS-DATA-TYPE COLUMN DISCOVERY (20 min)

**File:** `web/src/lib/intelligence/convergence-service.ts`
**Function:** `generateAllComponentBindings` (line 2181)

After the existing match-based measureColumns loop (lines 2190-2214), add a cross-data-type discovery loop as described in Change 3 above. The loop iterates ALL capabilities, skips matched data_types (already included), and adds numeric columns + categorical fields from unmatched capabilities.

**Important:** The cross-source columns have `confidence: 0.4` (lower than primary columns at 0.5-0.9). The AI naturally prefers higher-confidence columns for primary metrics and uses cross-source columns for supplementary metrics (like quota).

**Proof gate 3 (IMMUTABLE):**
```
□ Cross-data-type loop added after line 2214 (paste code)
□ matchedDataTypes set excludes already-included data_types (paste)
□ Cross-source columns have contextualIdentity 'cross_source_numeric' (paste)
□ Categorical fields from unmatched capabilities added (paste)
□ npm run build exits 0
□ Korean Test: 0 field name matches
```

**Commit:** `git add -A && git commit -m "HF-228 Phase 3: cross-data-type column discovery" && git push origin hf-228-platform-data-aperture`

---

## PHASE 4: METRIC DERIVATION EXECUTION IN PRODUCTION ENTITY LOOP (25 min)

**File:** `web/src/app/api/calculation/run/route.ts`

### 4A: Import applyMetricDerivations

Verify or add the import at the top of route.ts:

```typescript
import { applyMetricDerivations } from '@/lib/calculation/run-calculation';
```

### 4B: Add derivedMetrics computation before the component loop

Find where `entitySheetData` is fully constructed (after OB-152 source_date fetch, after HF-109 batch cache build). Before the component loop begins, add:

```typescript
// HF-228: Execute metric_derivations to produce derived metrics.
// Convergence produces derivation rules (operation + filter + source_field).
// The intent executor needs the results in data.metrics.
const derivedMetrics = metricDerivations.length > 0
  ? applyMetricDerivations(entitySheetData, metricDerivations)
  : {};
```

### 4C: Add merge inside the per-component loop

After the convergence_bindings resolution (or empty-metrics fallback) produces `metrics`, and BEFORE the metrics are pushed to `perComponentMetrics` and `componentResults`, add:

```typescript
// HF-228: Merge derived metrics into component metrics.
// Derived metrics (from convergence metric_derivations) carry operation+filter rules
// that produce metrics the convergence_bindings can't express (filtered counts,
// cross-category sums, reference data lookups).
// Derivations take precedence over binding-resolved values for the same key.
for (const [key, value] of Object.entries(derivedMetrics)) {
  metrics[key] = value;
}
```

### 4D: Verify metricDerivations variable availability

The variable `metricDerivations` is already read from `input_bindings.metric_derivations` earlier in route.ts (DIAG-048 Phase 1.3 confirms: `OB-118 Metric derivations: N rules from input_bindings`). Verify it's in scope at the insertion point.

**Proof gate 4 (IMMUTABLE):**
```
□ applyMetricDerivations imported (paste import line)
□ derivedMetrics computed before component loop (paste code + line number)
□ Merge inside component loop, after binding resolution, before componentResults push (paste code + line number)
□ metricDerivations variable in scope (paste its declaration)
□ npm run build exits 0
```

**Commit:** `git add -A && git commit -m "HF-228 Phase 4: metric derivation execution in production entity loop" && git push origin hf-228-platform-data-aperture`

---

## PHASE 5: NULL SAFETY IN resolveSource (10 min)

**File:** `web/src/lib/calculation/intent-executor.ts`

Add null guards on all four `startsWith` call sites as described in Change 5 above. Lines 75, 89, 91, 104.

**Proof gate 5 (IMMUTABLE):**
```
□ Line 75: field = src.sourceSpec?.field ?? '' (paste)
□ Line 89: numKey null-guarded (paste)
□ Line 91: denKey null-guarded (paste)
□ Line 104: field = src.sourceSpec?.field ?? '' (paste)
□ npm run build exits 0
```

**Commit:** `git add -A && git commit -m "HF-228 Phase 5: null safety in resolveSource" && git push origin hf-228-platform-data-aperture`

---

## PHASE 6: CLEAR BINDINGS + COMPLETION REPORT + PR (10 min)

### 6A: Clear CRP input_bindings for re-derivation

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
  if (error) console.error('ERROR:', error.message);
  for (const rs of data || []) console.log('  ' + rs.name);
})();
"
```

### 6B: Write completion report

Write to `docs/completion-reports/HF-228_COMPLETION_REPORT.md` per Rules 25-28.

**Reconciliation-channel separation:** Do NOT include any ground truth values, expected totals, or reconciliation interpretation.

### 6C: Final build + PR

```bash
cd ~/spm-platform && rm -rf web/.next && cd web && npm run build
echo "BUILD EXIT: $?"
```

```bash
gh pr create --base main --head hf-228-platform-data-aperture \
  --title "HF-228: Platform data aperture completion — classification, cross-source discovery, derivation execution, null safety" \
  --body "Completes the convergence-to-engine pipeline for multi-source plans. SCI gains referential-vs-definitional classification signal (quota files classify as target). inventoryData gains schema-aware sampling. generateAllComponentBindings gains cross-data-type column discovery. Production entity loop executes metric_derivations. resolveSource gains null safety. Domain-agnostic — all changes use structural signals, not field names. Korean Test compliant."
```

HALT after PR creation. Architect re-imports CRP quota file (should classify as `target`), then calculates all four plans.

---

## SCOPE BOUNDARY — DO NOT CHANGE

- **Do NOT modify** `resolveColumnMappingsViaAI` — already correct (HF-227)
- **Do NOT modify** `generateAISemanticDerivations` — already correct (HF-226)
- **Do NOT modify** `rowMatchesFilters` — already correct
- **Do NOT modify** `resolveColumnFromBatch` — already correct (HF-226)
- **Do NOT modify** the intent executor's execution logic — D151 sole authority, unchanged
- **Do NOT restore** `buildMetricsForComponent` fallback — correctly retired by HF-220 R1
- **Do NOT restore** OB-118 merge-guard conditional — correctly retired by HF-220 R2
- **Do NOT modify** any auth, session, or storage code
- **Do NOT add** any new npm dependencies

## ANTI-PATTERNS SPECIFIC TO THIS HF

**AP-1: Field name matching in SCI classification.** The referential signal checks identifier VALUE matching (do these IDs exist as entities?), not field NAME matching. If you find yourself writing `'quota'` or `'target'` in agents.ts, STOP. Korean Test violation.

**AP-2: Removing existing SCI signals.** Add new signals additively. Do NOT change existing signal weights. The referential signal is a new dimension, not a replacement for existing structural signals.

**AP-3: Making derivedMetrics conditional on path.** The merge must run regardless of whether convergence_bindings or sheet-matching was the resolution path. Do NOT wrap it in `if (!usedConvergenceBindings)`.

**AP-4: Modifying applyMetricDerivations.** The function is correct. It executes derivation rules with filters. The fix is in route.ts (calling it), not in run-calculation.ts (the function itself).

---

## EXECUTION SEQUENCE

Phases 0 → 1 → 2 → 3 → 4 → 5 → 6 in sequence. Every Phase has a proof gate. Paste evidence at every gate. Do NOT skip gates. Do NOT proceed to the next Phase until the current Phase's proof gate passes.

Commit + push after every Phase.
