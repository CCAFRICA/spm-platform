# Phase 4 Audit — Cluster C (Calculation Engine Discipline) Evidence

**Audit:** DS-021 v1.0 / DIAG-DS021-Phase4 / Plan v1.1
**Branch:** `ds021-substrate-audit`
**Scope:** Code-and-Schema only. Runtime probes deferred per environment scope.
**Date:** 2026-04-30

---

## 7.C — PF-05 Probes (G9 Calculation Engine Discipline)

### Probe ID: S-CODE-G9-01 (AI/math code organization)

**Subject:** Verify code organization separates AI-call code from math code.

**Execution:**
```bash
ls web/src/lib/calculation/
grep -rnE "import.*['\"]@anthropic|getAIService|@/lib/ai|anthropic-adapter|claude-|openai|getAI\\(" web/src/lib/calculation/
grep -n "import" web/src/lib/calculation/{engine,intent-executor,run-calculation}.ts
```

**Output:**

`web/src/lib/calculation/` contents (18 files):
```
anomaly-detector.ts, calculation-lifecycle-service.ts, decimal-precision.ts,
engine.ts, flywheel-pipeline.ts, index.ts, intent-executor.ts,
intent-transformer.ts, intent-types.ts, intent-validator.ts, lifecycle-utils.ts,
pattern-signature.ts, primitive-registry.ts, results-formatter.ts,
run-calculation.ts, synaptic-density.ts, synaptic-surface.ts, synaptic-types.ts
```

AI imports inside `web/src/lib/calculation/`:
```
web/src/lib/calculation/calculation-lifecycle-service.ts:13:
  import { persistSignal } from '@/lib/ai/signal-persistence';
```

**Single match.** `persistSignal` writes to `classification_signals` table; it does NOT invoke an LLM. The function imports from `@/lib/ai/*` but is a signal-persistence utility, not an AI provider call.

`intent-executor.ts` imports (verified):
```
import type { ... } from './intent-types';
import { isIntentOperation } from './intent-types';
import { Decimal, toDecimal, toNumber, ZERO } from './decimal-precision';
```
Pure math — zero AI imports.

`run-calculation.ts` imports (relevant subset):
```
import { createClient } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/database.types';
import type { PlanComponent } from '@/types/compensation-plan';
import { executeOperation, type EntityData } from '@/lib/calculation/intent-executor';
import { isIntentOperation, type IntentOperation } from '@/lib/calculation/intent-types';
import { toNumber, roundComponentOutput, inferOutputPrecision } from '@/lib/calculation/decimal-precision';
```
Math + DB I/O. Zero AI imports.

`engine.ts` (legacy / utility module): pure math (`calculateTieredPayout`, `calculateQuotaAttainment`, `applyAccelerator`). Used only by `lib/validation/ob02-validation.ts`. Zero AI imports.

API route `web/src/app/api/calculation/run/route.ts` (the active orchestrator, 2154 lines) imports (lines 18-59):
```
@/lib/calculation/run-calculation        — math
@/lib/orchestration/metric-resolver      — math
@/lib/calculation/intent-transformer     — math
@/lib/calculation/intent-executor        — math
@/lib/calculation/decimal-precision      — math
@/lib/intelligence/convergence-service   — AI (calls LLM via getAIService)
@/lib/ai/signal-persistence              — signal write (no LLM)
@/lib/calculation/synaptic-density       — math (DB-backed flywheel)
@/lib/calculation/synaptic-surface       — math
@/lib/calculation/pattern-signature      — math
@/lib/agents/agent-memory                — flywheel reads
@/lib/domain/domain-dispatcher           — domain agent dispatch
@/lib/agents/insight-agent               — agent surface (may invoke LLM)
@/lib/calculation/flywheel-pipeline      — math (DB-backed flywheel)
```

Direct LLM invocation paths from the route:
- `convergeBindings()` at line 134 (calls `getAIService` from convergence-service)
- `generateFullAnalysis()` from insight-agent (post-calculation insight generation)

**CC observation:** The `web/src/lib/calculation/` directory is AI-clean as a math layer — only one import from `@/lib/ai/*` exists, and it is the signal-persistence utility (not an LLM provider call). The API route at `/api/calculation/run/route.ts` is the orchestration layer that mixes AI invocation (convergence + insights) with math invocation (`evaluateComponent`, `executeOperation`). The math engine itself does not embed AI calls.

---

### Probe ID: S-CODE-G9-02 (calculation engine plan-loading lifecycle)

**Subject:** Inspect calculation engine entry point. Verify plan-load-once-at-run-start pattern.

**Execution:**
```bash
grep -nB1 -A2 "from('rule_sets')" web/src/app/api/calculation/run/route.ts
grep -nE "from\\('rule_sets'\\)|UPDATE.*rule_sets|update.*rule_sets" web/src/lib/calculation/run-calculation.ts web/src/lib/intelligence/convergence-service.ts
```

**Output:**

Active orchestrator `web/src/app/api/calculation/run/route.ts` rule_set DB operations:

| Line | Operation | Purpose |
|---|---|---|
| 80 | `.from('rule_sets').select(...).eq('id', ruleSetId).single()` | Initial load at run-start |
| 154 | `.from('rule_sets').update({ input_bindings: updatedBindings }).eq('id', ruleSetId)` | Mid-run UPDATE — persists convergence output back to plan |
| 160 | `.from('rule_sets').select('input_bindings').eq('id', ruleSetId).single()` | Mid-run RE-READ after the update |
| 166 | `(ruleSet as Record<string, unknown>).input_bindings = updatedRS.input_bindings;` | Mid-run in-memory mutation |
| 198 | `.from('rule_sets').select('id, input_bindings').eq('tenant_id', tenantId).neq('id', ruleSetId)` | OB-186 cross-plan: load OTHER plans' input_bindings for cross-plan metric resolution |

**Mid-run mutation pattern (route.ts:122-183):** Comment block lines 122-125: "HF-165: Calc-time convergence (completes OB-182 deferred architecture). OB-182 removed convergence from the bulk import path to eliminate sequence dependency. At calculation time, both plans AND data are guaranteed to exist. If input_bindings is empty, run convergence now to generate derivation rules."

The pattern executes:
```typescript
// L131:
if (!hasMetricDerivations && !hasConvergenceBindings) {
  addLog('HF-165: input_bindings empty — running calc-time convergence');
  const convResult = await convergeBindings(tenantId, ruleSetId, supabase);
  // ...
  if (derivationCount > 0 || bindingCount > 0) {
    // L153: persist back to rule_set
    await supabase.from('rule_sets').update({ input_bindings: updatedBindings }).eq('id', ruleSetId);
    // L159: re-read freshly-written values
    const { data: updatedRS } = await supabase.from('rule_sets').select('input_bindings').eq('id', ruleSetId).single();
    // L165-167: mutate in-memory
    if (updatedRS) {
      (ruleSet as Record<string, unknown>).input_bindings = updatedRS.input_bindings;
    }
  }
}
```

**Conditional mid-run mutation:** mid-run UPDATE+RE-READ+in-memory mutation occurs ONLY when `input_bindings` is empty at run-start (first calc-time convergence). Subsequent runs (where input_bindings is already populated) skip this block — the plan is loaded once at line 80 and not modified.

**`runCalculation` (legacy path in `run-calculation.ts:783-794`):** loads rule_set at line 791, no mid-run mutation. Per `web/src/app/admin/launch/calculate/page.tsx:317` comment: "HF-079: Call API route (service role) instead of client-side runCalculation()." The `runCalculation` function is no longer the active entry point; the API route is.

**`convergence-service.ts:132`:** loads rule_set at the start of the convergence operation:
```
.select('id, name, components, input_bindings')
.eq('id', ruleSetId)
```
A second load of the same rule_set (the convergence service receives the route's `supabase` client and `ruleSetId` and re-reads — independent of the route's L80 read).

**Total rule_set DB-load count per single calculation run:**
- Empty-bindings path (first run): **2-3 loads** (L80 + convergence-service:132 + L160 reload), **1 update** (L154), **1 in-memory mutation** (L166), **1 OB-186 cross-plan load** (L198 of all other tenant plans, only if metricDerivations.length === 0).
- Populated-bindings path (subsequent runs): **1 load** (L80), no mutation, **possibly 1 OB-186 load** if metricDerivations still empty.

**CC observation:** The plan-load-once-at-run-start pattern is **conditionally honored**:
- **Honored** on subsequent runs after convergence has already populated input_bindings.
- **Violated** on the first calc-time convergence path: rule_set is loaded, mutated mid-run via DB UPDATE, re-read, and in-memory representation is replaced. This is a single-shot mutation (only happens once per plan), but it is mid-run mutation by definition.
- Independently, `convergence-service.ts:132` performs a second load of the same rule_set within the same run (the route's supabase client is passed to the service, which re-reads the row). This is duplicative but not state-changing.
- OB-186 cross-plan loading at L198 reads OTHER plans' input_bindings during the run when current plan has no derivations. This is not a reload of the active plan but does introduce dependence on other plans' state during a calculation run.

---

### Probe ID: S-RUNTIME-G9-01 — DEFERRED

**Status:** DEFERRED — environment scope
**Reason:** Per directive Section 0, runtime test infrastructure for mid-run plan modification is not present in this environment. Verification of "what happens if a plan is modified mid-run" requires a runnable calculation against populated `committed_data` (currently 0 rows) and rule_sets (currently 0 rows).
**Re-execution requires:** populated `committed_data` and `rule_sets`, plus a test harness that mutates rule_set during a calculation run and observes whether the engine picks up the mutation.

---

### Probe ID: S-RUNTIME-G9-02 — DEFERRED

**Status:** DEFERRED — environment scope
**Reason:** Per directive Section 0 and Plan v1.1, S-RUNTIME-G9-02 reconciliation requires CRP committed_data; absent in this environment. The probe targets reconciliation behavior between calculation_results and a configured reconciliation profile.
**Re-execution requires:** populated CRP fixture data + populated calculation_results from a runnable calculation.

---

## Summary — Cluster C factual inventory

**G9-01 (AI/math separation):**
- `web/src/lib/calculation/` directory is AI-clean as a math layer; zero LLM-invocation imports in any of its 18 files. The single `@/lib/ai/*` import is the signal-persistence utility (DB-write, not LLM call).
- Math primitives (`intent-executor.ts`, `run-calculation.ts`, `engine.ts`, `decimal-precision.ts`) carry no AI imports.
- The orchestration layer (`/api/calculation/run/route.ts`) calls AI services (convergence, insight-agent) explicitly outside the math directory boundary.

**G9-02 (plan-loading lifecycle):**
- Active orchestrator is the API route `/api/calculation/run/route.ts`, not the `runCalculation` function in `run-calculation.ts`.
- Plan-load-once-at-run-start pattern is conditionally honored:
  - First-run path with empty `input_bindings`: loaded → convergence → DB UPDATE → re-read → in-memory replacement. Mid-run mutation occurs.
  - Subsequent-run path: loaded once, not mutated.
- `convergence-service.ts:132` independently reloads the same rule_set within the same run (duplicative load).
- OB-186 cross-plan resolution loads OTHER plans' input_bindings during a run (route.ts:198) when current plan has no derivations.

CC reports findings. CC does NOT disposition magnitude.
