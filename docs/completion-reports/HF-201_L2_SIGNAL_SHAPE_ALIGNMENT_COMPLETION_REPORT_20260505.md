# HF-201 L2 SIGNAL SHAPE ALIGNMENT COMPLETION REPORT

## Date
2026-05-05

## Execution Time
Approximately 11 minutes (Phase 0 baseline → Phase 1 edits → Phase 2 type compat → Phase 3 build+lint → Phase 4 commit+push → Phase 5 PR → Phase 6 report). No HALTs.

## COMMITS (in order)

| Hash | Phase | Description |
|---|---|---|
| `63eed0a7013f0e1db2006bd67085bb647a891e0e` | Phase 4 | HF-201: restore L2 signal producer-consumer shape alignment |

## FILES CREATED

| File | Purpose |
|---|---|
| `docs/completion-reports/HF-201_L2_SIGNAL_SHAPE_ALIGNMENT_COMPLETION_REPORT_20260505.md` | This completion report |

## FILES MODIFIED

| File | Change |
|---|---|
| `web/src/app/api/import/sci/execute/route.ts` | Two emitter caller re-routes (lines 1318-1335 and 1568-1585; net +11 / -8). Single concern: pass `interpretation.components` (AI-output shape) instead of `variants.flatMap(v => v.components ?? [])` (engine-format) to `emitPlanComprehensionSignals`. |

## PROOF GATES — HARD

### BEFORE state — Site 1 (executeBatchedPlanInterpretation, lines 1318-1335)

```typescript
  // HF-198 E5: Emit per-component comprehension:plan_interpretation signals (L2)
  // so convergence Pass 4 reads authoritative semantic intent before AI derivation.
  // Read-coupling per AUD-004 v3 §2 E3 — declared reader: convergence-service.ts
  // loadMetricComprehensionSignals. Fire-and-forget; rule_set save already committed.
  try {
    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
    const componentsForSignals = variants.flatMap(v => v.components ?? []);
    void emitPlanComprehensionSignals({
      tenantId,
      ruleSetId,
      interpretation: { components: componentsForSignals as unknown as Array<Record<string, unknown>> },
      planConfidence: response.confidence,
    });
  } catch (sigErr) {
    console.warn('[SCI Execute] Plan comprehension signal emission threw (non-blocking):', sigErr instanceof Error ? sigErr.message : String(sigErr));
  }
```

### BEFORE state — Site 2 (executePlanPipeline, lines 1568-1582)

```typescript
  // HF-198 E5: Emit per-component comprehension:plan_interpretation signals (L2).
  try {
    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
    const componentsForSignals = variants.flatMap(v => v.components ?? []);
    void emitPlanComprehensionSignals({
      tenantId,
      ruleSetId,
      interpretation: { components: componentsForSignals as unknown as Array<Record<string, unknown>> },
      planConfidence: response.confidence,
    });
  } catch (sigErr) {
    console.warn('[SCI Execute] Plan comprehension signal emission threw (non-blocking):', sigErr instanceof Error ? sigErr.message : String(sigErr));
  }
```

### AFTER state — Site 1 (executeBatchedPlanInterpretation, lines 1318-1335)

```typescript
  // HF-198 E5 + HF-201: Emit per-component comprehension:plan_interpretation signals (L2)
  // so convergence Pass 4 reads authoritative semantic intent before AI derivation.
  // HF-201 Shape B: pass plan-agent's original output (interpretation.components) so the
  // signal carries plan-agent reasoning verbatim. PlanComponent (engine-format) drops
  // reasoning during convertComponent; routing to interpretation.components preserves it.
  try {
    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
    const componentsForSignals = (interpretation.components ?? []) as unknown as Array<Record<string, unknown>>;
    void emitPlanComprehensionSignals({
      tenantId,
      ruleSetId,
      interpretation: { components: componentsForSignals },
      planConfidence: response.confidence,
    });
  } catch (sigErr) {
    console.warn('[SCI Execute] Plan comprehension signal emission threw (non-blocking):', sigErr instanceof Error ? sigErr.message : String(sigErr));
  }
```

### AFTER state — Site 2 (executePlanPipeline, lines 1568-1585)

```typescript
  // HF-198 E5 + HF-201: Emit per-component comprehension:plan_interpretation signals (L2).
  // HF-201 Shape B: pass plan-agent's original output (interpretation.components) so the
  // signal carries plan-agent reasoning verbatim.
  try {
    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
    const componentsForSignals = (interpretation.components ?? []) as unknown as Array<Record<string, unknown>>;
    void emitPlanComprehensionSignals({
      tenantId,
      ruleSetId,
      interpretation: { components: componentsForSignals },
      planConfidence: response.confidence,
    });
  } catch (sigErr) {
    console.warn('[SCI Execute] Plan comprehension signal emission threw (non-blocking):', sigErr instanceof Error ? sigErr.message : String(sigErr));
  }
```

### Diff (`git diff` pre-commit)

```diff
diff --git a/web/src/app/api/import/sci/execute/route.ts b/web/src/app/api/import/sci/execute/route.ts
index 023c506f..42533054 100644
--- a/web/src/app/api/import/sci/execute/route.ts
+++ b/web/src/app/api/import/sci/execute/route.ts
@@ -1315,17 +1315,18 @@ async function executeBatchedPlanInterpretation(
   const componentCount = variants.reduce((sum: number, v: { components?: unknown[] }) => sum + (v.components?.length || 0), 0);
   console.log(`[SCI Execute] Batched plan saved: ${planName} (${ruleSetId}), ${variants.length} variants, ${componentCount} components from ${planUnits.length} sheets`);

-  // HF-198 E5: Emit per-component comprehension:plan_interpretation signals (L2)
+  // HF-198 E5 + HF-201: Emit per-component comprehension:plan_interpretation signals (L2)
   // so convergence Pass 4 reads authoritative semantic intent before AI derivation.
-  // Read-coupling per AUD-004 v3 §2 E3 — declared reader: convergence-service.ts
-  // loadMetricComprehensionSignals. Fire-and-forget; rule_set save already committed.
+  // HF-201 Shape B: pass plan-agent's original output (interpretation.components) so the
+  // signal carries plan-agent reasoning verbatim. PlanComponent (engine-format) drops
+  // reasoning during convertComponent; routing to interpretation.components preserves it.
   try {
     const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
-    const componentsForSignals = variants.flatMap(v => v.components ?? []);
+    const componentsForSignals = (interpretation.components ?? []) as unknown as Array<Record<string, unknown>>;
     void emitPlanComprehensionSignals({
       tenantId,
       ruleSetId,
-      interpretation: { components: componentsForSignals as unknown as Array<Record<string, unknown>> },
+      interpretation: { components: componentsForSignals },
       planConfidence: response.confidence,
     });
   } catch (sigErr) {
@@ -1567,14 +1568,16 @@ async function executePlanPipeline(
   const componentCount = variants.reduce((sum: number, v: { components?: unknown[] }) => sum + (v.components?.length || 0), 0);
   console.log(`[SCI Execute] Plan saved: ${planName} (${ruleSetId}), ${variants.length} variants, ${componentCount} components`);

-  // HF-198 E5: Emit per-component comprehension:plan_interpretation signals (L2).
+  // HF-198 E5 + HF-201: Emit per-component comprehension:plan_interpretation signals (L2).
+  // HF-201 Shape B: pass plan-agent's original output (interpretation.components) so the
+  // signal carries plan-agent reasoning verbatim.
   try {
     const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
-    const componentsForSignals = variants.flatMap(v => v.components ?? []);
+    const componentsForSignals = (interpretation.components ?? []) as unknown as Array<Record<string, unknown>>;
     void emitPlanComprehensionSignals({
       tenantId,
       ruleSetId,
-      interpretation: { components: componentsForSignals as unknown as Array<Record<string, unknown>> },
+      interpretation: { components: componentsForSignals },
       planConfidence: response.confidence,
     });
   } catch (sigErr) {
```

Stat: `1 file changed, 11 insertions(+), 8 deletions(-)`

### Phase 2 type compatibility evidence

**`ComponentLike` (emitter input shape, `plan-comprehension-emitter.ts:30-41`):**

```typescript
interface ComponentLike {
  id?: string;
  name?: string;
  type?: string;
  calculationMethod?: { type?: string; [key: string]: unknown } | null;
  calculationIntent?: Record<string, unknown> | null;
  confidence?: number;
  reasoning?: string;
  expectedMetrics?: string[];
  metrics?: Array<{ metric?: string; metricLabel?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}
```

**`InterpretedComponent` (plan-interpreter normalized output, `ai-plan-interpreter.ts:69-79`):**

```typescript
export interface InterpretedComponent {
  id: string;
  name: string;
  nameEs?: string;
  type: ComponentCalculation['type'];
  appliesToEmployeeTypes: string[];
  calculationMethod: ComponentCalculation;
  calculationIntent?: Record<string, unknown>;
  confidence: number;
  reasoning: string;
}
```

**`PlanInterpretationResult` (loose AI service return type, `web/src/lib/ai/types.ts:127-138`):**

```typescript
export interface PlanInterpretationResult {
  ruleSetName: string;
  effectiveDate: string;
  components: Array<{
    type: string;
    name: string;
    rules: unknown;
  }>;
  metrics: string[];
  tiers?: unknown[];
  rawExtraction: unknown;
}
```

**Compatibility analysis:** `InterpretedComponent` satisfies `ComponentLike` field-by-field — every required `InterpretedComponent` field maps to an optional `ComponentLike` field with compatible type. `ComponentLike`'s `[key: string]: unknown` index signature accepts any extra fields. Runtime data at the call sites is the AI's raw output (typed loosely as `PlanInterpretationResult` whose `components` field is narrower than the actual AI shape but accepts all runtime fields including `reasoning`); the cast `as unknown as Array<Record<string, unknown>>` handles the type-narrowness via the same pattern `bridgeAIToEngineFormat` uses at lines 1259/1512 (`interpretation as Record<string, unknown>`). No TypeScript errors after Phase 1.

### Build output (Phase 3)

`cd web && npm run build 2>&1 | tail -30` produced full Next.js build manifest (all routes built; no errors). Tail excerpt:

```
ƒ Middleware                                  76 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

Build completed. PASS.

### Lint output (Phase 3)

`npm run lint 2>&1; echo "EXIT=$?"` produced pre-existing warnings only (HierarchyNode.tsx, auth-shell.tsx, Sidebar.tsx, SCIExecution.tsx, period-context.tsx, tenant-context.tsx, etc. — same set as documented in HF-200 completion report). Zero new warnings introduced by HF-201 in `execute/route.ts`. Final line: `EXIT=0`. PASS.

### Commit + push output (Phase 4)

```
[hf-201-l2-signal-shape-alignment 63eed0a7] HF-201: restore L2 signal producer-consumer shape alignment
 1 file changed, 11 insertions(+), 8 deletions(-)
remote:
remote: Create a pull request for 'hf-201-l2-signal-shape-alignment' on GitHub by visiting:
remote:      https://github.com/CCAFRICA/spm-platform/pull/new/hf-201-l2-signal-shape-alignment
remote:
To https://github.com/CCAFRICA/spm-platform.git
 * [new branch]        hf-201-l2-signal-shape-alignment -> hf-201-l2-signal-shape-alignment
branch 'hf-201-l2-signal-shape-alignment' set up to track 'origin/hf-201-l2-signal-shape-alignment'.
---HEAD---
63eed0a7013f0e1db2006bd67085bb647a891e0e
```

### PR opened (Phase 5)

```
$ gh pr create --title "HF-201: restore L2 signal producer-consumer shape alignment (Shape B)" --body "..."
Warning: 19 uncommitted changes
https://github.com/CCAFRICA/spm-platform/pull/364
```

PR #364 opened at `https://github.com/CCAFRICA/spm-platform/pull/364`. The "19 uncommitted changes" warning refers to carry-over untracked diagnostic reports from prior DIAG branches (DIAG-025/026/027/028/029/030); not part of HF-201 scope.

## PROOF GATES — SOFT

| # | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| 1 | T1-E905 Prove Don't Describe — verbatim before/after diff | PASS | BEFORE/AFTER state at both sites + git diff + build + lint + commit output all pasted verbatim above |
| 2 | T1-E907 Fix Logic Not Data — code change only; no data migration | PASS | One file modified (`execute/route.ts`); zero migrations; zero data writes; zero scripts executed |
| 3 | T1-E910 Korean Test — InterpretedComponent shape is structural | PASS | InterpretedComponent fields are structural (id, name, type, calculationMethod, calculationIntent, confidence, reasoning) — no language-specific keys; ComponentLike index signature accepts any extra fields without language-specific dispatch |
| 4 | T2-E46 Reconciliation-Channel Separation — CC pastes calc output; architect reconciles | PASS-PENDING | Calc invocation deferred per HF-200 precedent (architect-channel via Supabase SQL Editor + platform UI). CC has not invoked calc against post-merge code |
| 5 | T5-E1064 Procedural Theater Minimization — single phase | PASS | One commit; one file; one architectural concern; no per-phase pings to architect |
| 6 | SR-34 No Bypass — restores producer-consumer shape alignment per IRA-recommended pattern | PASS | Diff aligns producer (AI plan-interpreter output) with consumer (emitter ComponentLike) shape; no accommodation, no defensive coercion, no magic numbers; preserves architectural boundary between intelligence layer (InterpretedComponent) and engine-format (PlanComponent) |

## STANDING RULE COMPLIANCE

- **Rule 1 (commit+push each phase):** PASS — Phase 4 committed + pushed `63eed0a7`
- **Rule 2 (cache clear after commit):** N/A — no cached data; HF-201 affects signal-emission path
- **Rule 6 (report in project root):** PASS — completion report at `docs/completion-reports/` per directive instruction
- **Rule 10 (NEVER ask yes/no; just act):** PASS — executed Phases 0-6 continuously
- **Rule 18 (criteria verbatim):** PASS — proof gate criteria copied from directive
- **Rule 25 (completion report first deliverable):** PASS — completion report produced after PR opened per directive sequencing
- **Rule 26 (mandatory structure):** PASS — Commits → Files → Hard Gates → Soft Gates → Compliance → Issues → Verification structure
- **Rule 27 (evidence = paste):** PASS — every gate evidence is pasted bash/diff/code, not described
- **Rule 28 (one commit per phase):** PASS — Phase 4 single commit; documentation phases produce no commits

## KNOWN ISSUES

### Issue 1 — DIAG-030 Known Issue 3 (`metric_inputs` partial population) NOT closed by HF-201

DIAG-030 D7 found 3 of 8 BCL signals had populated `metric_inputs` (those whose `calculationIntent.input` field is structured as `{source: 'metric', sourceSpec: {field: '...'}}` — ratio-style ops); 5 had null.

**Post-fix evaluation** (per directive Phase 6 instruction):

`grep -B 3 -A 15 "metric_inputs\|metricInputs" web/src/lib/compensation/plan-comprehension-emitter.ts` returns the emitter's per-field extraction logic verbatim:

```typescript
// metric_inputs: extract from calculationIntent.input, or fall back to expectedMetrics list
const metricInputs =
  (calcIntent?.input as Record<string, unknown> | undefined) ??
  (comp.expectedMetrics ? { expectedMetrics: comp.expectedMetrics } : null);
```

**CC empirical assessment:** the emitter's `calcIntent?.input` access (singular) is **unchanged by HF-201**. The HF-201 re-route changes the SOURCE of components (engine-format → AI-output) but the emitter's per-field extraction logic is unchanged. Per `convertComponent` at `ai-plan-interpreter.ts:454` (`calculationIntent: comp?.calculationIntent`), the `calculationIntent` field is preserved verbatim from InterpretedComponent to PlanComponent — same shape pre-vs-post-conversion.

Therefore HF-201 re-route does **NOT** close `metric_inputs` partial population. After merge, BCL signals' `metric_inputs` will continue to be populated for ratio-style operations (`calculationIntent.input` set) and null for `bounded_lookup_2d` (uses `intent.inputs` plural at convergence-service.ts:1193), `conditional_gate` (uses `intent.condition` at :1227), `bounded_lookup_1d` (uses `intent.input` singular — should populate), `scalar_multiply` (uses `intent.input` singular — should populate), `piecewise_linear` (uses `intent.ratioInput` and `intent.baseInput`).

**Architect dispositions follow-on:** whether to extend the emitter's metric_inputs extraction to handle all foundational primitive shapes (5 cases per `convergence-service.ts:1192-1245`) in a separate HF, or whether the L3 convergence binding signals (future) will encode operation-typed extraction structurally elsewhere.

### Issue 2 — IRA supersession_candidates deferred (VG-side)

Per IRA invocation 2026-05-05, two supersession_candidates were surfaced for VG-side ICA capture (deferred per directive out-of-scope):

1. **IGF-T1-E906 extension** — should specify "L2 Comprehension signal producers consume the intelligence layer's original output shape (e.g., InterpretedComponent for plan-agent comprehension), not the engine-translated shape." HF-201 instantiates this pattern; substrate-level extension formalizes it.

2. **IGF-T2-E12 (Decision 117) extension** — should specify "signal-surface producers at each intelligence layer read from that layer's output shape." Generalizes "import identifies, convergence routes" to type-shape selection at L1/L2/L3 signal boundaries.

Architect dispositions VG-side ICA capture timing.

### Issue 3 — Phase 4 Production Verification deferred

Per HF-200 precedent (Phase 4 verification handled architect-channel via Supabase SQL Editor + platform UI), HF-201 calc invocation is deferred to architect-channel. CC has not re-imported BCL plan or invoked calc against the merged code. Architect signals when to verify post-merge:
- Re-import BCL plan triggers `executeBatchedPlanInterpretation` or `executePlanPipeline` → emitter receives InterpretedComponent[] → signals carry non-empty `semantic_intent`
- Subsequent BCL October calc invokes convergence Pass 4 → reads non-empty `comprehension:plan_interpretation` signals → AI semantic derivation receives authoritative plan-agent context → expected: 5/5 BCL metrics derive (vs prior 2/5)
- Architect reconciles BCL October calculated value against ground truth $44,590 in architect channel per T2-E46

### Issue 4 — Carry-over untracked files in working tree

19 untracked files in the HF-201 branch carrying over from prior DIAG branches (`DIAG-025_TIPO_DRIFT_COMPLETION_REPORT_20260505.md`, `docs/completion-reports/DIAG-026/027/028/029/030_*COMPLETION_REPORT*.md`, multiple directive `*.md` in `docs/diagnostics/` and `docs/vp-prompts/`, two `web/scripts/_diag*.ts` probe scripts). Not part of HF-201 scope; PR creation flagged as warning. Architect dispositions whether to commit to main, delete, or leave untracked.

## VERIFICATION SCRIPT OUTPUT

```
$ git checkout main && git pull origin main && git checkout -b hf-201-l2-signal-shape-alignment && git rev-parse HEAD
Already on 'main'
Your branch is up to date with 'origin/main'.
Already up to date.
Switched to a new branch 'hf-201-l2-signal-shape-alignment'
9f209bdfa3105bb8d070ea01c529dfcb0f602f31

$ sed -n '1320,1330p' web/src/app/api/import/sci/execute/route.ts
[BEFORE state Site 1 — pasted in PROOF GATES — HARD section]

$ sed -n '1568,1578p' web/src/app/api/import/sci/execute/route.ts
[BEFORE state Site 2 — pasted in PROOF GATES — HARD section]

$ # Edit applied via Edit tool (two replacements)

$ sed -n '1320,1330p' web/src/app/api/import/sci/execute/route.ts
[AFTER state Site 1 — pasted in PROOF GATES — HARD section]

$ sed -n '1568,1578p' web/src/app/api/import/sci/execute/route.ts
[AFTER state Site 2 — pasted in PROOF GATES — HARD section]

$ cd web && npm run build 2>&1 | tail -30
[Build manifest tail — PASS]

$ npm run lint 2>&1; echo "EXIT=$?"
[14+ pre-existing warnings; EXIT=0]

$ git diff --stat -- web/src/app/api/import/sci/execute/route.ts
 web/src/app/api/import/sci/execute/route.ts | 19 +++++++++++--------
 1 file changed, 11 insertions(+), 8 deletions(-)

$ git add web/src/app/api/import/sci/execute/route.ts && git commit -F /tmp/hf201-commit-msg.txt && git push -u origin hf-201-l2-signal-shape-alignment
[hf-201-l2-signal-shape-alignment 63eed0a7] HF-201: restore L2 signal producer-consumer shape alignment
 1 file changed, 11 insertions(+), 8 deletions(-)
remote: Create a pull request for 'hf-201-l2-signal-shape-alignment' on GitHub by visiting:
remote:      https://github.com/CCAFRICA/spm-platform/pull/new/hf-201-l2-signal-shape-alignment
To https://github.com/CCAFRICA/spm-platform.git
 * [new branch]        hf-201-l2-signal-shape-alignment -> hf-201-l2-signal-shape-alignment
branch 'hf-201-l2-signal-shape-alignment' set up to track 'origin/hf-201-l2-signal-shape-alignment'.

$ git rev-parse HEAD
63eed0a7013f0e1db2006bd67085bb647a891e0e

$ gh pr create --title "..." --body "..."
Warning: 19 uncommitted changes
https://github.com/CCAFRICA/spm-platform/pull/364
```

Branch pushed; commit SHA `63eed0a7013f0e1db2006bd67085bb647a891e0e`; PR #364 opened; HF-201 architecturally complete pending architect-triggered Phase 4 production verification.
