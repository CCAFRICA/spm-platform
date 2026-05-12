# DIAG-030_EMPTY_SEMANTIC_INTENT — Plan-Comprehension Producer-Side Root Cause

**Sequence:** 030 (DIAG-025/026/027/028/029 assigned this session)
**Type:** Read-only forensic diagnostic
**Question answered:** Why are BCL's 8 `comprehension:plan_interpretation` signals all carrying empty `semantic_intent`? Specifically: does `plan-comprehension-emitter.ts` receive intent and drop it (capture-side defect), OR does the upstream plan interpretation step not produce per-metric intent at all (producer-side defect)?
**Decides:** Scope of remediation HF (small emitter fix vs. substrate-extending plan-interpreter prompt extension)
**Substrate authority:**
- **Decision 109 (WITHDRAWN — empirically unfounded thresholds):** developer-set thresholds without empirical basis are non-operative. HF-199 γ's `BOUNDARY_FALLBACK_MIN_SCORE = 0.50` is itself a Decision 109 candidate violation; remediation must NOT introduce another magic number.
- **Decision 124 (Research-Derived Design — Governing Principle):** Every decision derived from proven research in the applicable discipline. Convergence binding correctness must derive from semantic match grounded in plan-agent intent, not score-threshold heuristics.
- **HF-198 α architectural intent:** "convergence Pass 4 reads `metric_comprehension` signals from canonical surface BEFORE AI semantic derivation." Read-before-derive is the architectural shape; empty intent means the read produces nothing useful.
- **AUD-004 v3 §E5:** "Any service writing to the signal surface shall read the signal surface before invoking AI semantic derivation. Plan-agent comprehension flows to convergence as Level 2 Comprehension signals; convergence reads before deriving."
**Predecessor:** DIAG-029 established 8 BCL signals exist with `metric_label` populated and `semantic_intent = ''` empty.

## IRA invocation assessment

NOT NEEDED. DIAG-030 is empirical (read code, trace data flow). Substrate primitives already locked — no coherence question to surface. IRA defers to post-DIAG-030 remediation if scope-coherence ambiguity arises in remediation HF drafting.

---

## CC PASTE BLOCK

```markdown
# DIAG-030_EMPTY_SEMANTIC_INTENT

**Repo:** `~/spm-platform`
**Branch:** create `diag-030-empty-semantic-intent` from main HEAD
**Type:** READ-ONLY. No code modifications. No commits. No SQL writes.
**Bindings:**
- T1-E905 (Prove Don't Describe) — verbatim code + verbatim git output
- T1-E953 (Decision-Implementation Gap) — empirical evidence per claim
- T2-E46 (Reconciliation-Channel Separation) — facts only; architect interprets
- T5-E1064 (Procedural Theater Minimization) — single statement per phase
- Decision 109 + Decision 124 — substrate authority for remediation framing

## TASK

Determine whether `plan-comprehension-emitter.ts` is dropping intent it receives (capture-side defect) OR the upstream plan interpretation step does not produce per-metric `semantic_intent` (producer-side defect).

## DIMENSION 1 — EMITTER VERBATIM

```bash
cd ~/spm-platform
git checkout main
git pull origin main
git checkout -b diag-030-empty-semantic-intent
git rev-parse HEAD
```

PASTE output.

```bash
cat web/src/lib/compensation/plan-comprehension-emitter.ts
```

PASTE entire file content verbatim. This is the emitter HF-198 α introduced.

```bash
git log --oneline -- web/src/lib/compensation/plan-comprehension-emitter.ts
```

PASTE output.

## DIMENSION 2 — EMITTER INPUT TYPE / SCHEMA

Identify the data shape `plan-comprehension-emitter.ts` consumes:

```bash
grep -n "function\|interface\|type\|export" web/src/lib/compensation/plan-comprehension-emitter.ts
```

PASTE output. Then for the main exported function (typically `emitPlanComprehensionSignals` or similar):

```bash
grep -B 2 -A 30 "export.*function\|export.*const.*=.*async" web/src/lib/compensation/plan-comprehension-emitter.ts
```

PASTE output. Capture the function signature + parameter types verbatim.

## DIMENSION 3 — EMITTER CALLER (upstream of emitter)

Find every site that invokes the emitter:

```bash
grep -rn "plan-comprehension-emitter\|emitPlanComprehension\|PlanComprehensionEmitter" web/src/ --include="*.ts" --include="*.tsx"
```

PASTE output. For each caller, capture the invocation context (5 lines before, 30 lines after):

```bash
# CC iterates per call site
grep -B 5 -A 30 "<function-name-from-D2>" <caller-file>
```

PASTE output for each caller.

## DIMENSION 4 — PLAN INTERPRETER OUTPUT SHAPE

Per HF-198 α commit message, emitter is invoked from `executeBatchedPlanInterpretation` and `executePlanPipeline` at `web/src/app/api/import/sci/execute/route.ts`. Read those functions:

```bash
grep -n "executeBatchedPlanInterpretation\|executePlanPipeline" web/src/app/api/import/sci/execute/route.ts
```

PASTE output. Then capture each function body verbatim:

```bash
# CC iterates per function start line
grep -B 2 -A 80 "<function-name>" web/src/app/api/import/sci/execute/route.ts
```

PASTE output for each function.

## DIMENSION 5 — PLAN INTERPRETER CORE — output structure

Trace where plan interpretation output originates. Per AUD-001 it's `ai-plan-interpreter.ts:interpretPlan` or similar:

```bash
grep -n "function interpretPlan\|export.*interpretPlan\|interpretPlan\s*=" web/src/lib/compensation/ai-plan-interpreter.ts | head -10
```

PASTE output. Then capture the return type / output structure:

```bash
grep -B 5 -A 60 "interface PlanInterpretation\|type PlanInterpretation\|return.*planInterpretation\|return.*{ variants\|interpretationToPlanConfig" web/src/lib/compensation/ai-plan-interpreter.ts | head -150
```

PASTE output. Specifically: does the interpreter output schema include a per-metric semantic_intent field? Does the AI prompt request semantic_intent per metric?

```bash
grep -n "semantic_intent\|semanticIntent\|metric_intent\|metricIntent" web/src/lib/compensation/ai-plan-interpreter.ts
```

PASTE output. Count and list every reference.

## DIMENSION 6 — AI PLAN INTERPRETATION SYSTEM PROMPT

The plan interpreter calls AI via system_prompt. Read the prompt to determine if it requests semantic_intent per metric:

```bash
grep -n "ai_plan_interpretation\|plan_interpretation\|SYSTEM_PROMPTS\[.plan" web/src/lib/ai/providers/anthropic-adapter.ts web/src/lib/ai/ -r --include="*.ts" 2>/dev/null
```

PASTE output. For each system_prompt definition for plan interpretation, capture verbatim:

```bash
# CC iterates per system_prompt location
grep -B 3 -A 80 "<system_prompt-key>" <file>
```

PASTE output. Specifically: does the system_prompt instruct AI to produce a `semantic_intent` field per metric in its JSON output?

## DIMENSION 7 — EMPTY-INTENT FORENSICS

DIAG-029 found 3 of 8 BCL signals have `metric_inputs` populated; 5 have null. Map which 3:

| Signal label | metric_inputs populated | semantic_intent populated |
|---|---|---|
| Colocación de Crédito - Ejecutivo Senior | NO | NO |
| Captación de Depósitos - Ejecutivo Senior | YES (cumplimiento_depositos) | NO |
| Productos Cruzados - Ejecutivo Senior | NO | NO |
| Cumplimiento Regulatorio - Ejecutivo Senior | NO | NO |
| Colocación de Crédito - Ejecutivo | NO | NO |
| Captación de Depósitos - Ejecutivo | YES (cumplimiento_depositos) | NO |
| Productos Cruzados - Ejecutivo | YES (productos_cruzados_vendidos) | NO |
| Cumplimiento Regulatorio - Ejecutivo | NO | NO |

CC trace: for the 3 with populated `metric_inputs` but empty `semantic_intent` — does the emitter receive intent for those signals and drop it, OR does the emitter receive empty intent for those signals from upstream?

Identify the field name in plan-interpreter output that maps to signal_value.semantic_intent. Then:

```bash
grep -B 3 -A 5 "semantic_intent\|intent.*:\|intent =" web/src/lib/compensation/plan-comprehension-emitter.ts
```

PASTE output. Confirm the emitter does (or does not) attempt to map an upstream field into `signal_value.semantic_intent`.

## DIMENSION 8 — EMPIRICAL FINDINGS

CC writes 5-7 single-sentence facts:

- Emitter file content: <PRESENT/ABSENT>; lines: <count>; introducing commit: <SHA>
- Emitter input shape: <list of fields the emitter consumes from upstream>
- Emitter writes `semantic_intent` from upstream field: <field name OR `EMPTY HARDCODED`>
- Plan-interpreter output schema includes per-metric semantic_intent: <YES/NO with citation>
- AI plan-interpretation system prompt requests semantic_intent per metric: <YES/NO with citation>
- Defect localization: <CAPTURE-SIDE (emitter drops received intent) / PRODUCER-SIDE (upstream does not produce intent) / BOTH / OTHER>
- For 3 signals with populated metric_inputs: are they BCL components where AI plan-interpretation is more likely to produce semantic_intent (e.g., simpler operations like ratio for cumplimiento_depositos), or random?

NO interpretation of remediation. NO recommendations. NO disposition options. Architect interprets.

## REPORT

Write evidence document to `/tmp/DIAG_030_EMPTY_SEMANTIC_INTENT_REPORT_<YYYYMMDD>.md` with sections corresponding to Dimensions 1-8.

Write completion report to `docs/completion-reports/DIAG-030_EMPTY_SEMANTIC_INTENT_COMPLETION_REPORT_<YYYYMMDD>.md` per Rule 26 mandatory structure.

PASTE both file paths + ls -la verification + completion report content in chat.

NO commits. Branch left untracked for architect disposition.
```
