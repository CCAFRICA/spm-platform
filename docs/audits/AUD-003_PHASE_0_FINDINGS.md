# AUD-003 Phase 0 FINDINGS — Audit Evidence Extraction

**Authored:** 2026-04-26
**Branch authored on:** `revert-pre-seeds-anchor` (REVERT-001 doc commit on top of substrate anchor `283d4c24`)
**Scope (Rule 36):** Read-only. Diff extraction + static code-path tracing at the anchor. No execution, no DB, no production-source modification, no disposition recommendation.

---

## AUDIT SCOPE

| Field | Value |
|---|---|
| Substrate anchor SHA | `283d4c24ec196b7f45052292367af895dbaabb1e` |
| Branch HEAD at Phase 0 start | `5204818437923202897b2ad13f9a301b3fee1110` (REVERT-001 docs on top of anchor) |
| Origin main HEAD | `a2921fbb9bdc95fd6e4093368c27fd98bbd364c8` |
| Commit count anchor → main | 34 |
| Audit-candidate PR count | 3 |

Audit-candidate PRs:

| # | PR | Merge SHA | Date | Title |
|---|---|---|---|---|
| 1 | #338 | `1277becccb3a7b82f4b34a97fb02590a5e27ab28` | 2026-04-05 08:59:26 -0700 | HF-191: Decision 147 — Plan Intelligence Forward (seed derivations from plan agent to convergence) |
| 2 | #339 | `3a3351eb91e3d752ea77a3d02d4aa375e774ae43` | 2026-04-24 14:51:14 -0700 | HF-193: plan_agent_seeds eradicated; signals via persistSignal |
| 3 | #340 | `a2921fbb9bdc95fd6e4093368c27fd98bbd364c8` | 2026-04-25 20:15:47 -0700 | HF-194: Restore field_identities in execute-bulk pipeline |

---

## PR #338 EVIDENCE

### Metadata

| Field | Value |
|---|---|
| Number | 338 |
| Title | HF-191: Decision 147 — Plan Intelligence Forward (seed derivations from plan agent to convergence) |
| Merge commit | `1277becccb3a7b82f4b34a97fb02590a5e27ab28` |
| Merged at | 2026-04-05T15:59:26Z |
| Base / head | `main` ← `dev` |
| Additions | 1537 |
| Deletions | 20 |
| Files changed | 12 |
| Parents (first, second) | `283d4c24...`, `4deacb16...` |

PR body excerpt: "Plan agent now outputs `metricSemantics` during PDF interpretation … Stored as `plan_agent_seeds` in `rule_sets.input_bindings` via `bridgeAIToEngineFormat`. Convergence reads seeds, validates against actual data capabilities (categorical fields, numeric fields), promotes valid seeds to `MetricDerivationRule`. Seeds preserved across ALL convergence overwrite paths (7 locations in 4 files). Independent AI derivation (Pass 4) becomes fallback for non-seeded metrics."

### Per-file change summary (PR #338)

| File | Additions | Removals |
|---|---|---|
| `DECISION_147_PLAN_INTELLIGENCE_FORWARD (1).md` | 102 | 0 |
| `DECISION_147_PLAN_INTELLIGENCE_FORWARD.md` | 102 | 0 |
| `HF-191_COMPLETION_REPORT.md` | 78 | 0 |
| `HF-191_PLAN_INTELLIGENCE_FORWARD_v2.md` | 394 | 0 |
| `SESSION_HANDOFF_20260405.md` | 302 | 0 |
| `web/src/app/api/calculation/run/route.ts` | 4 | 0 |
| `web/src/app/api/import/commit/route.ts` | 7 | 1 |
| `web/src/app/api/import/sci/execute-bulk/route.ts` | 36 | 18 |
| `web/src/app/api/import/sci/execute/route.ts` | 4 | 0 |
| `web/src/lib/ai/providers/anthropic-adapter.ts` | 47 | 0 |
| `web/src/lib/compensation/ai-plan-interpreter.ts` | 13 | 1 |
| `web/src/lib/intelligence/convergence-service.ts` | 84 | 0 |

(Per-file counts re-derived with quoted-loop variant in the completion report; an unquoted-loop pass earlier produced shell word-splitting noise on the filename "DECISION_147_PLAN_INTELLIGENCE_FORWARD (1).md"; the table above uses corrected values.)

### Seed-introduction additions (verbatim sample)

```
+          // Decision 147: Preserve plan_agent_seeds across convergence updates
+          if (rawBindings?.plan_agent_seeds) {
+            updatedBindings.plan_agent_seeds = rawBindings.plan_agent_seeds;
+          // Decision 147: Preserve plan_agent_seeds across convergence updates
+          if (rsBindings.plan_agent_seeds) {
+            commitBindings.plan_agent_seeds = rsBindings.plan_agent_seeds;
+  // Decision 147: Preserve plan_agent_seeds across convergence invalidation
+      const seeds = (rs.input_bindings as Record<string, unknown>)?.plan_agent_seeds;
+        input_bindings: seeds ? { plan_agent_seeds: seeds } : {},
+For each metric label used in your components (in calculationMethod or calculationIntent), output a top-level "metricSemantics" array that describes HOW each metric is derived from raw transactional data.
+  "metricSemantics": [
+RULES for metricSemantics:
+- Every metric label referenced in ANY component's calculationMethod or calculationIntent MUST have a metricSemantics entry
+  // Decision 147: Extract and validate metricSemantics from raw AI response
+  const rawSemantics = rawResult.metricSemantics as Array<Record<string, unknown>> | undefined;
+      ? { plan_agent_seeds: validSemantics }
+  // ── Decision 147: Plan Intelligence Forward — seed derivation consumption ──
+  const planAgentSeeds = (
+    (ruleSet.input_bindings as Record<string, unknown>)?.plan_agent_seeds ?? []
+  if (planAgentSeeds.length > 0) {
+    console.log(`[Convergence] Decision 147: ${planAgentSeeds.length} plan agent seeds found`);
+    for (const seed of planAgentSeeds) {
+          reason: `Decision 147: Plan agent seed validated — ${seed.reasoning ?? 'plan interpretation'}`,
+        console.log(`[Convergence] Decision 147: Seed "${seed.metric}" VALIDATED → MetricDerivationRule`);
+        console.log(`[Convergence] Decision 147: Seed "${seed.metric}" FAILED: ${validationReasons.join('; ')}`);
+    // Decision 147: Log when seeds fully cover a component
+      console.log(`[Convergence] Decision 147: Component "${comp.name}" fully covered by seeds — no gaps`);
```

### Full diff artifact

`docs/audits/AUD-003_PHASE_0_DIFFS/PR_338_full.diff` — 1707 lines.

---

## PR #339 EVIDENCE

### Metadata

| Field | Value |
|---|---|
| Number | 339 |
| Title | HF-193: plan_agent_seeds eradicated; signals via persistSignal |
| Merge commit | `3a3351eb91e3d752ea77a3d02d4aa375e774ae43` |
| Merged at | 2026-04-24T21:51:14Z |
| Base / head | `main` ← `hf-193-signal-surface` |
| Additions | 5243 |
| Deletions | 42 |
| Files changed | 29 |
| Parents (first, second) | `1277becc...`, `445fcb00...` |

PR body excerpt: "HF-193: plan_agent_seeds eradicated; signals via persistSignal. Minimum cutover per Decision 153. plan_agent_seeds deleted from code (20 lines / 6 files) and data (purged from rule_sets.input_bindings across 4 rule_sets...). Bridge returns SignalData[]; caller stamps rule_set.id and calls persistSignalBatch. A2 columns (rule_set_id, metric_name, component_index) populated on metric_comprehension signals. Convergence reads signals by composite key. … BCL post-cutover calculation produced \\$33,390 vs. historical baseline \\$312,033. Diagnostic evidence establishes this delta is not an HF-193 regression: Two ratio metrics calculated \\$0 due to AI producing ratio(numerator/denominator) semantics referencing non-existent committed_data columns … Baseline rule_set f270f34c used convergence_bindings shape with different AI interpretation run; today's b9e8b7ff uses metric_derivations shape. Numerical comparability between shapes was never established."

### Per-file change summary (PR #339)

| File | Additions | Removals |
|---|---|---|
| `docs/completion-reports/DIAG_019_COMPLETION_REPORT.md` | 184 | 0 |
| `docs/completion-reports/HF_193_A_Phase_2_2a_COMPLETION_REPORT.md` | 509 | 0 |
| `docs/completion-reports/HF_193_COMPLETION_REPORT.md` | 175 | 0 |
| `docs/evidence/hf193-p3-purge-seeds.ts` | 66 | 0 |
| `docs/evidence/hf193-p3-verify-bcl-signals.ts` | 35 | 0 |
| `docs/handoff-reports/HANDOFF_TEMPLATE_CORRECTIONS_patch_corrections_19_to_21.md` | 48 | 0 |
| `docs/handoff-reports/HANDOFF_TEMPLATE_v2.md` | 279 | 0 |
| `docs/handoff-reports/SESSION_CLOSING_REPORT_20260422.md` | 258 | 0 |
| `docs/handoff-reports/SESSION_HANDOFF_20260422.md` | 345 | 0 |
| `docs/prompts/HF_193_GATE_A_CODE_SITE_SURVEY.md` | 302 | 0 |
| `docs/prompts/HF_193_GATE_B_PREFLIGHT_DECISION_30_INVESTIGATION.md` | 325 | 0 |
| `docs/prompts/HF_193_SEEDS_TO_SIGNALS_ATOMIC_CUTOVER.md` | 349 | 0 |
| `web/scripts/hf-193-a-phase-1-3-schema-verification.ts` | 122 | 0 |
| `web/scripts/hf-193-a-phase-2-2a-rpc-verification.ts` | 161 | 0 |
| `web/scripts/hf193-p3-bcl-before-snapshot.ts` | 52 | 0 |
| `web/scripts/hf193-p3-bcl-compare.ts` | 168 | 0 |
| `web/scripts/hf193-p3-purge-seeds.ts` | 66 | 0 |
| `web/scripts/hf193-p3-signal-values.ts` | 35 | 0 |
| `web/scripts/hf193-p3-verify-bcl-signals.ts` | 35 | 0 |
| `web/src/app/api/calculation/run/route.ts` | 0 | 4 |
| `web/src/app/api/import/commit/route.ts` | 0 | 5 |
| `web/src/app/api/import/sci/execute-bulk/route.ts` | 6 | 12 |
| `web/src/app/api/import/sci/execute/route.ts` | 23 | 4 |
| `web/src/lib/ai/signal-persistence.ts` | 10 | 0 |
| `web/src/lib/compensation/ai-plan-interpreter.ts` | 15 | 3 |
| `web/src/lib/intelligence/convergence-service.ts` | 22 | 13 |
| `web/supabase/migrations/20260421030000_hf_193_a_signal_surface_schema.sql` | 34 | 0 |
| `web/supabase/migrations/20260421040000_hf_193_a_bridge_persistence_function.sql` | 90 | 0 |
| `web/supabase/migrations/20260421050000_hf_193_a_bridge_persistence_function_refinement.sql` | 127 | 0 |

### Seed-related removals (verbatim sample)

```
-          // Decision 147: Preserve plan_agent_seeds across convergence updates
-          if (rawBindings?.plan_agent_seeds) {
-            updatedBindings.plan_agent_seeds = rawBindings.plan_agent_seeds;
-          // Decision 147: Preserve plan_agent_seeds across convergence updates
-          if (rsBindings.plan_agent_seeds) {
-            commitBindings.plan_agent_seeds = rsBindings.plan_agent_seeds;
-  // Decision 147: Preserve plan_agent_seeds across convergence invalidation
-      const seeds = (rs.input_bindings as Record<string, unknown>)?.plan_agent_seeds;
-        input_bindings: seeds ? { plan_agent_seeds: seeds } : {},
-      ? { plan_agent_seeds: validSemantics }
-  const planAgentSeeds = (
-    (ruleSet.input_bindings as Record<string, unknown>)?.plan_agent_seeds ?? []
```

### Seed-related additions (verbatim sample, post-cutover purge code)

```
+// HF-193 Phase 3.4 — Purge plan_agent_seeds JSONB from all rule_sets.
+    .not('input_bindings->plan_agent_seeds', 'is', null);
+    delete nextBindings.plan_agent_seeds;
+    .not('input_bindings->plan_agent_seeds', 'is', null);
+  console.log('has plan_agent_seeds key:', ruleSet?.input_bindings && 'plan_agent_seeds' in ruleSet.input_bindings);
+      has_plan_agent_seeds: !!(rs.input_bindings && typeof rs.input_bindings === 'object' && 'plan_agent_seeds' in (rs.input_bindings as object)),
+  const planAgentSeeds = (signalRows ?? []).map(row => {
```

(CC observation, structural only: most "additions" matching `plan_agent_seeds` are in `web/scripts/hf193-p3-*` and `docs/evidence/hf193-p3-*` — purge / verify scripts referencing the key for deletion or absence-checking purposes. One addition in `web/src/lib/intelligence/convergence-service.ts` reuses the variable name `planAgentSeeds` to bind signal rows.)

### Signal-surface additions (verbatim sample)

```
+    .from('classification_signals')
+    .eq('signal_type', 'metric_comprehension')
+    .eq('table_name', 'classification_signals')
+    signal_type: 'metric_comprehension',
+    .from('classification_signals')
+    .select('id, rule_set_id, metric_name, component_index, signal_type');
+    .from('classification_signals')
+    .select('id, rule_set_id, metric_name, component_index, signal_type')
+    row.signal_type === 'metric_comprehension';
+    .from('classification_signals')
+// atomicity: one rule_set INSERT + N classification_signals INSERTs must either all
+    .from('classification_signals')
+    .select('id, metric_name, component_index, rule_set_id, signal_type, tenant_id')
+      'Signal signal_type is metric_comprehension',
+      (signalRows?.every((s) => s.signal_type === 'metric_comprehension') ?? false),
+  await sb.from('classification_signals').delete().eq('rule_set_id', ruleSetId);
+    .from('classification_signals')
+    .select('id, metric_name, component_index, rule_set_id, confidence, signal_type, signal_value')
+    .eq('signal_type', 'metric_comprehension')
+import { persistSignalBatch } from '@/lib/ai/signal-persistence';
+  // HF-193: Write metric_comprehension signals via persistSignalBatch (non-blocking)
+    persistSignalBatch(
```

### Full diff artifact

`docs/audits/AUD-003_PHASE_0_DIFFS/PR_339_full.diff` — 5595 lines.

---

## PR #340 EVIDENCE

### Metadata

| Field | Value |
|---|---|
| Number | 340 |
| Title | HF-194: Restore field_identities in execute-bulk pipeline |
| Merge commit | `a2921fbb9bdc95fd6e4093368c27fd98bbd364c8` |
| Merged at | 2026-04-26T03:15:48Z |
| Base / head | `main` ← `hf-193-signal-surface` |
| Additions | 1188 |
| Deletions | 47 |
| Files changed | 12 |
| Parents (first, second) | `3a3351eb...`, `c9f2015a...` |

PR body excerpt: "Restores `field_identities` writes at three `execute-bulk/route.ts` insert sites by extracting `buildFieldIdentitiesFromBindings` to `web/src/lib/sci/field-identities.ts` and importing it into both routes. Closes the regression surfaced by the diagnostic chain DIAG-020 → 020-A → 021 R1 → 022. … Decision 111 (`convergence_bindings` primary): production path restored. Decision 147 (Plan Intelligence Forward): not touched. Decision 151 (intent executor sole authority): unchanged. … Stage 1 PASS does NOT imply Stage 2 PASS. If Stage 1 passes and Stage 2 fails, HF-195 follows…"

### Per-file change summary (PR #340)

| File | Additions | Removals |
|---|---|---|
| `docs/completion-reports/DIAG-020-A_COMPLETION_REPORT.md` | 49 | 0 |
| `docs/completion-reports/DIAG-020_COMPLETION_REPORT.md` | 56 | 0 |
| `docs/completion-reports/DIAG-021_COMPLETION_REPORT.md` | 58 | 0 |
| `docs/completion-reports/DIAG-022_COMPLETION_REPORT.md` | 61 | 0 |
| `docs/completion-reports/HF-194_COMPLETION_REPORT.md` | 90 | 0 |
| `docs/diagnostics/DIAG-020_FINDINGS.md` | 362 | 0 |
| `docs/tech-debt/AP-17_PARALLEL_METADATA_CONSTRUCTION.md` | 73 | 0 |
| `docs/verification/HF-194_STAGE1_VERIFICATION.md` | 57 | 0 |
| `docs/verification/HF-194_STAGE2_VERIFICATION.md` | 52 | 0 |
| `web/src/app/api/import/sci/execute-bulk/route.ts` | 8 | 0 |
| `web/src/app/api/import/sci/execute/route.ts` | 2 | 45 |
| `web/src/lib/sci/field-identities.ts` | 55 | 0 |

### `field_identities` additions (verbatim)

```
+        // HF-194: restore field_identities for matcher's structural-FI Pass 1
+        field_identities: buildFieldIdentitiesFromBindings(unit.confirmedBindings),
+        // HF-194: restore field_identities for matcher's structural-FI Pass 1
+        field_identities: buildFieldIdentitiesFromBindings(unit.confirmedBindings),
+        // HF-194: restore field_identities for matcher's structural-FI Pass 1
+        field_identities: buildFieldIdentitiesFromBindings(unit.confirmedBindings),
+ * Builds field_identities map from confirmed semantic bindings.
+ * populate committed_data.metadata.field_identities.
+// HF-110: Build field_identities from confirmedBindings when HC trace is unavailable (DS-009 1.3)
```

### Full diff artifact

`docs/audits/AUD-003_PHASE_0_DIFFS/PR_340_full.diff` — 1338 lines.

---

## ANCHOR CODE-PATH TRACE

Static read-only inspection at `revert-pre-seeds-anchor` HEAD (substrate anchor `283d4c24`).

### Anchor 0.4.1 — Plan import → comprehension flow

`web/src/lib/compensation/ai-plan-interpreter.ts` top-level functions at anchor:

| Line | Symbol |
|---|---|
| 453 | `export function interpretationToPlanConfig(` |
| 547 | `function convertComponent(comp: InterpretedComponent, order: number): PlanComponent { ` |
| 725 | `export function bridgeAIToEngineFormat(` |
| 757 | `export function getAIInterpreter(): AIPlainInterpreter { ` |
| 764 | `export function resetAIInterpreter(): void { ` |

`bridgeAIToEngineFormat` body at anchor (lines 725–751, verbatim):

```ts
export function bridgeAIToEngineFormat(
  rawResult: Record<string, unknown>,
  tenantId: string,
  userId: string,
): {
  name: string;
  description: string;
  components: { variants: Array<{ variantId: string; variantName: string; description?: string; components: PlanComponent[] }> };
  inputBindings: Record<string, unknown>;
} {
  // Step 1: Normalize the raw AI output through the same pipeline as the plan import page
  const interpreter = new AIPlainInterpreter();
  const normalized = interpreter.validateAndNormalizePublic(rawResult);

  // Step 2: Convert to engine format via interpretationToPlanConfig
  const config = interpretationToPlanConfig(normalized, tenantId, userId);
  const additiveLookup = config.configuration as AdditiveLookupConfig;

  return {
    name: normalized.ruleSetName,
    description: normalized.description,
    components: { variants: additiveLookup.variants },
    inputBindings: {},
  };
}
```

`web/src/lib/ai/providers/anthropic-adapter.ts` — `metricSemantics | metric_comprehension | plan.*interpretation` references at anchor:

| Line | Reference |
|---|---|
| 134 | `plan_interpretation: \`You are an expert at analyzing compensation and commission plan documents...` |
| 760 | `convergence_mapping: \`You map compensation plan metric requirements to data columns...` |
| 812 | `if (pdfBase64 && (request.task === 'plan_interpretation' || request.task === 'document_analysis')) { ` |
| 951 | `case 'plan_interpretation': { ` |

No matches for `metricSemantics` or `metric_comprehension` at anchor — both are absent from the AI prompt at the substrate anchor.

### Anchor 0.4.2 — Convergence flow

`web/src/lib/intelligence/convergence-service.ts` top-level functions (excerpt; `head -30`):

| Line | Symbol |
|---|---|
| 46 | `function humanizeMetricName(name: string): string { ` |
| 119 | `export async function convergeBindings(` |
| 492 | `function extractComponents(componentsJson: unknown): PlanComponent[] { ` |
| 619 | `async function inventoryData(` |
| 819 | `function matchComponentsToData(` |
| 935 | `function generateDerivationsForMatch(` |
| 1009 | `function extractInputRequirements(component: PlanComponent): ComponentInputRequirement[] { ` |
| 1086 | `function extractRangeFromBoundaries(` |
| 1103 | `function scoreColumnForRequirement(` |
| 1169 | `export function profileColumnDistribution(` |
| 1226 | `function inferScale(stats: ColumnValueStats): ColumnDistribution['scaleInference'] { ` |
| 1259 | `function estimateSampleResult(` |
| 1389 | `function checkCalculationPlausibility(` |
| 1484 | `function hasCompleteBindings(` |
| 1499 | `function isValidColumnMapping(` |
| 1511 | `async function resolveColumnMappingsViaAI(` |
| 1579 | `async function generateAllComponentBindings(` |
| 1751 | `function generateFilteredCountDerivations(` |
| 1827 | `async function generateAISemanticDerivations(` |
| 2038 | `function detectBoundaryScale(componentsJson: unknown, componentIndex: number): number { ` |
| 2072 | `function getRequiredMeasureCount(operation: string): number { ` |
| 2092 | `function tokenize(name: string): string[] { ` |

`convergeBindings` declared at line 119. Three-pass matcher entry points (Phase 1.3 verification reproduced):

| Line | Function |
|---|---|
| 492 | `extractComponents` |
| 619 | `inventoryData` |
| 819 | `matchComponentsToData` |
| 1579 | `generateAllComponentBindings` |

`input_bindings` / `inputBindings` direct write-assignments via `=` or `:` operator at anchor in `convergence-service.ts`: grep returns empty. The file READS `input_bindings` (e.g. line 133 SELECT projection, line 192 read of `convergence_bindings` sub-key per REVERT-001 §H2.2) but contains no direct property-assignment to `input_bindings` / `inputBindings`. Persistence into `input_bindings` is performed at the database write layer (route handlers), not from this service.

`classification_signals | metric_comprehension | persistSignal | signal_type` references at anchor:

| Line | Reference |
|---|---|
| 253 | `await supabase.from('classification_signals').insert({` |
| 255 | `signal_type: 'convergence_calculation_validation',` |

Note: signal-type at anchor is `convergence_calculation_validation` (HF-115 era), NOT `metric_comprehension` (HF-193 era). No `metric_comprehension` or `persistSignal` references at anchor.

`HF-112 | HF-114 | OB-185 | Pass 4 | AI semantic derivation` references at anchor:

| Line | Reference |
|---|---|
| 36 | `// OB-191: Enriched metric context for Pass 4 AI prompt` |
| 191 | `// HF-112: Generate all component bindings with AI mapping + boundary validation` |
| 389 | `// OB-185 Pass 4: AI Semantic Derivation for unresolved metrics` |
| 416 | `console.log(\`[Convergence] OB-185 Pass 4: ${unresolvedForAI.length} unresolved metrics — invoking AI semantic derivation\`);` |
| 418 | `console.log(\`[Convergence] Pass 4 metric: ${mc.name} ...\`);` |
| 435 | `console.log(\`[Convergence] OB-185 Pass 4: ${aiResult.derivations.length} derivations, ${aiResult.gaps.length} gaps\`);` |
| 437 | `console.log(\`[Convergence] Pass 4 derivation: ${d.metric} → ${d.operation}(${d.source_field || ''}) filters=${JSON.stringify(d.filters || [])}\`);` |
| 440 | `console.error('[Convergence] OB-185 Pass 4 AI call failed:', aiErr);` |
| 448 | `// OB-185: Include AI-resolved metrics in the resolved set` |
| 451 | `// OB-185: Check against ALL resolved metrics (Passes 1-3 + Pass 4 AI)` |

OB-185 Pass 4 (AI semantic derivation as fallback for unresolved metrics) is present at anchor.

### Anchor 0.4.3 — Calculation gate + route entry

`HF-165` / convergence-skip-gate references at anchor — file containing matches: `web/src/app/api/calculation/run/route.ts`. Line-level matches:

| Line | Reference |
|---|---|
| 122 | `// ── HF-165: Calc-time convergence (completes OB-182 deferred architecture) ──` |
| 132 | `addLog('HF-165: input_bindings empty — running calc-time convergence');` |
| 169 | `addLog(\`HF-165: Convergence complete — ${derivationCount} derivations, ${bindingCount} component bindings, ${gapCount} gaps\`);` |
| 171 | `addLog(\`HF-165: Convergence produced 0 derivations and 0 bindings (${gapCount} gaps)\`);` |
| 173 | `addLog(\`HF-165 Gap: ${gap.component} — ${gap.reason}\`);` |
| 178 | `addLog(\`HF-165: Convergence failed (non-blocking): ${convErr instanceof Error ? convErr.message : String(convErr)}\`);` |
| 181 | `addLog('HF-165: input_bindings already populated — skipping convergence');` |
| 1528 | `// HF-116: Still skip for convergence path (scale_factor handles it there).` |

`web/src/lib/` returns no `HF-165` references — gate logic lives only in the calculation route.

Calculation route handler at anchor: `web/src/app/api/calculation/run/route.ts`, file size 90166 bytes, `export async function POST(request: NextRequest)` at line 61.

### Anchor 0.4.4 — Primitive support inventory

`linear_function | piecewise_linear | scope_aggregate | conditional_gate | bounded_lookup` references in `web/src/lib/intelligence/`:

| Line (in `convergence-service.ts`) | Reference |
|---|---|
| 41 | `operation: string;     // Calculation operation (e.g., "linear_function")` |
| 42 | `scope?: string;        // Scope level for scope_aggregate (e.g., "district")` |
| 467 | `const opHint = comp.calculationOp === 'ratio' || comp.calculationOp === 'bounded_lookup_1d'` |
| 547 | `// OB-185: Handle piecewise_linear 'ratioInput' and 'baseInput' structures` |
| 573 | `// OB-185: Walk nested onTrue/onFalse for conditional_gate chains` |
| 1021 | `case 'bounded_lookup_2d': { ` |
| 1035 | `case 'bounded_lookup_1d': { ` |
| 1055 | `case 'conditional_gate': { ` |
| 1061 | `case 'piecewise_linear': { ` |
| 1062 | `// OB-185: piecewise_linear has ratioInput (numerator/denominator) and baseInput` |
| 1072 | `case 'linear_function': { ` |
| 1073 | `// OB-185: linear_function has single input` |
| 1300 | `case 'bounded_lookup_1d': { ` |
| 1336 | `case 'bounded_lookup_2d': { ` |
| 1372 | `case 'conditional_gate': { ` |
| 2075 | `case 'bounded_lookup_2d':` |
| 2079 | `case 'bounded_lookup_1d':` |
| 2081 | `case 'conditional_gate':` |

Intent executor / typed transform inventory at anchor:

| Path | Status at anchor |
|---|---|
| `web/src/lib/calculation/intent-executor.ts` | PRESENT (25347 bytes) |
| `web/src/lib/calculation/intent-resolver.ts` | PRESENT (3786 bytes) |
| `web/src/lib/calculation/intent-transformer.ts` | PRESENT (20035 bytes) |
| `web/src/lib/calculation/intent-types.ts` | PRESENT (11806 bytes) |
| `web/src/lib/calculation/intent-validator.ts` | PRESENT (15507 bytes) |

`web/src/lib/calculation/` at anchor contains 20 entries including `engine.ts`, `flywheel-pipeline.ts`, `run-calculation.ts` (64532 bytes), `results-formatter.ts`, `decimal-precision.ts`, anomaly/synaptic helpers, and the intent-* family above.

`web/src/lib/intelligence/` at anchor contains 12 entries including `convergence-service.ts` (85438 bytes), `classification-signal-service.ts` (9083 bytes), `ai-metrics-service.ts`, `insight-engine.ts`, plus state/trajectory/narration helpers.

---

## CLAIM-VS-REALITY

CC tabulates pattern-match counts. CC does not interpret. The architect performs claim-vs-reality interpretation in the inline audit.

| PR | Claim (title) | Pattern matched | Additions matching | Removals matching |
|---|---|---|---|---|
| #338 | Decision 147 — Plan Intelligence Forward (seed derivations from plan agent to convergence) | `plan_agent_seeds | planAgentSeeds | metricSemantics | Decision 147 | Seed.*VALIDATED` | 112 | 0 |
| #339 | plan_agent_seeds eradicated; signals via persistSignal | `plan_agent_seeds | planAgentSeeds | persistSignal | classification_signals | metric_comprehension | atomic | cutover | eradicat` | 269 | 21 |
| #340 | Restore field_identities in execute-bulk pipeline | `field_identities | fieldIdentities | execute-bulk | metadata` | 166 | 2 |

---

## KNOWN LIMITS OF PHASE 0

Phase 0 is static reading only. The evidence above describes what the substrate anchor's source code contains and what each audit-candidate PR's diff shows. It does NOT establish:

- Whether the anchor reproduces BCL's \\$312,033 baseline or Meridian's MX\\$185,063 baseline. Behavioral verification against the anchor substrate is Phase 1 work and was not performed.
- Whether the anchor's `OB-185 Pass 4` AI semantic derivation produces equivalent metric derivations to PR #338's seeds path or to PR #339's signal-surface path on the same input.
- Whether `field_identities` are populated correctly at anchor for any tenant; the anchor predates PR #340 by 23 days, and PR #340's body claims a `field_identities`-absence regression that surfaced post-anchor (DIAG-020-A "70/70 sampled rows from 7 distinct import batches" lacked `field_identities`). Whether that regression was already present at the anchor's `execute-bulk/route.ts` is not verified in Phase 0.
- Whether PR #339's body claim "BCL post-cutover \\$33,390 vs. baseline \\$312,033 delta is not an HF-193 regression" holds. The diff's text is captured; the architect's audit determines whether the diagnostic in the PR body is supported by the observable code change.
- Whether the architect's CRP exclusion (per directive: "CRP is excluded from the trace because its 'proof' was on contaminated code") propagates correctly through the audit; CRP traces were not run.

Phase 0 also does NOT recommend dispositions. The architect's inline audit produces REINSTATE / REDESIGN / DROP / DEFERRED verdicts per PR using the evidence above plus context CC does not have.

---

## ARCHITECT NEXT STEPS

Phase 0 evidence (FINDINGS.md, three full diffs under `docs/audits/AUD-003_PHASE_0_DIFFS/`, completion report) is committed to `revert-pre-seeds-anchor`. Architect channel conducts the inline audit per PR using this evidence. AUD-003 final disposition + AUD-003 Phase 1 verification (execution against anchor substrate to confirm BCL and Meridian baseline reproduction, gating REVERT-002 ship) follow as separate directives. CC takes no further action without an explicit directive.
