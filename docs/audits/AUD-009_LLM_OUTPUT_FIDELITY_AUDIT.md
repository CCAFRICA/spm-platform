# AUD-009: LLM Output Fidelity Audit -- Registry and Cherry-Pick Pattern Detection

**Type:** Comprehensive read-only audit
**Predecessors:** AUD-008 (calculationIntent consumers -- nested operation tree readiness), DIAG-036 (metric population path -- seven surfaces), DIAG-047 (CRP filter provenance -- four pipeline stages), AUD-002 v2 (signal surface integrity)
**Purpose:** AUD-008 found the registry/cherry-pick pattern in calculationIntent consumers (functions that assume flat input sources). DIAG-047 found the same pattern in the signal emission pipeline (plan-comprehension-emitter cherry-picks known fields from LLM output, discarding filter comprehension). This audit finds every instance of the pattern across the FULL pipeline from LLM output through signal emission through convergence consumption through derivation construction through engine application.

**Defect class being searched:** A function receives rich input (LLM output, signal content, AI response) and produces a downstream artifact by selecting specific known fields into a new object, silently discarding everything else. When the input contains information the function didn't anticipate (filters, nested operations, new field names), that information is lost.

**Carry Everything Express Contextually test:** For each function found, does it carry the full input and let downstream consumers read what they need? Or does it construct a new object from enumerated fields, destroying anything not enumerated?

**Output:** Single consolidated file at `docs/audits/AUD-009_LLM_OUTPUT_FIDELITY_AUDIT_OUTPUT.md`
**Scope:** Read-only. Zero code changes. Zero fixes. Zero proposals. CC enumerates, reads, and pastes. Architect dispositions.

## Standing rules (read first, every CC turn)

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. All rules apply.

Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act. Execute every phase sequentially. Commit after each phase. Push after each commit.

## Phase 0 -- Repo orientation and output file scaffold

Confirm working directory is VP repo root (`spm-platform`). Confirm on main.

```bash
pwd
git checkout main
git pull origin main
git log --oneline -5
git rev-parse HEAD
```

Create output file scaffold at `docs/audits/AUD-009_LLM_OUTPUT_FIDELITY_AUDIT_OUTPUT.md`:

```markdown
# AUD-009 -- LLM Output Fidelity Audit Output

**Date:** [CC inserts]
**Branch:** [CC inserts]
**HEAD commit:** [CC inserts]
**Scope:** Every function that transforms, reduces, or gates LLM output or signal content across the full pipeline.

Defect class: function cherry-picks known fields from rich input, silently discarding unenumerated content.

CC pastes verbatim code at every section. No interpretation. No PASS/FAIL. No fix proposals.
```

```bash
git checkout -b aud-009-llm-output-fidelity
mkdir -p docs/audits
git add docs/audits/AUD-009_LLM_OUTPUT_FIDELITY_AUDIT_OUTPUT.md
git commit -m "AUD-009 Phase 0: output file scaffold"
git push origin aud-009-llm-output-fidelity
```

Paste `git log -1 --oneline` verbatim.

## Phase 1 -- Pipeline inventory: every LLM-to-engine transformation function

Before reading any function, inventory every function in the pipeline that transforms data between stages.

### 1.1 LLM output consumers (plan interpretation)

```bash
grep -rn "interpretation\.\|response\.\|rawResult\.\|aiResult\.\|llmResult\.\|planResult\." \
  web/src/lib/compensation/ web/src/lib/ai/ web/src/app/api/import/sci/execute/ \
  --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -v "test\|spec" | \
  grep -v "console\.\|addLog\|warn\|error\|comment" | head -60
```

### 1.2 Signal writers (anything that calls persistSignal or writeSignalBatch)

```bash
grep -rn "persistSignal\|writeSignalBatch\|persistSignalBatch\|classification_signals.*insert" \
  web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -30
```

### 1.3 Signal consumers (anything that reads from classification_signals)

```bash
grep -rn "classification_signals.*select\|loadMetricComprehension\|\.from.*classification_signals" \
  web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -20
```

### 1.4 Derivation constructors (anything that pushes to derivations[] or constructs MetricDerivationRule)

```bash
grep -rn "derivations\.push\|MetricDerivationRule\|filters:\s*\[\]" \
  web/src/lib/intelligence/convergence-service.ts | head -30
```

### 1.5 AI response parsers (convergence Pass 4, any other AI call that produces structured output)

```bash
grep -rn "aiResult\|aiResponse\|aiMapping\|parseAI\|AI.*mapping\|mapping.*AI" \
  web/src/lib/intelligence/convergence-service.ts | head -20
```

### 1.6 Bridge functions (LLM output to engine format)

```bash
grep -rn "bridgeAIToEngineFormat\|interpretationToPlanConfig\|convertComponent\|normalizeIntent" \
  web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -20
```

Deduplicate all results into a function inventory table. Append under `## Phase 1 -- Pipeline inventory`.

```bash
git add docs/audits/AUD-009_LLM_OUTPUT_FIDELITY_AUDIT_OUTPUT.md
git commit -m "AUD-009 Phase 1: pipeline function inventory"
git push origin aud-009-llm-output-fidelity
```

## Phase 2 -- Signal emission stage

### 2.1 plan-comprehension-emitter.ts (DIAG-047 confirmed cherry-pick)

Already read in full in DIAG-047 Phase 1.1 (134 lines). Re-read on current HEAD to confirm unchanged:

```bash
cat web/src/lib/compensation/plan-comprehension-emitter.ts
```

Paste verbatim. For the `signalValue` construction block (around lines 111-123), document every field that IS included and note: does it spread the input component or construct a new object from enumerated fields?

### 2.2 Any other signal writers

From Phase 1.2 results, for each signal writer that is NOT plan-comprehension-emitter, read the function body. For each, document: does it carry the full input or cherry-pick fields?

Append under `## Phase 2 -- Signal emission stage`.

```bash
git add docs/audits/AUD-009_LLM_OUTPUT_FIDELITY_AUDIT_OUTPUT.md
git commit -m "AUD-009 Phase 2: signal emission stage"
git push origin aud-009-llm-output-fidelity
```

## Phase 3 -- Signal consumption and derivation construction stage

### 3.1 Convergence signal consumption

From Phase 1.3 results, read every function that queries `classification_signals` and consumes the result. For each, document: which fields from `signal_value` does it read? Does it ignore fields it doesn't recognize?

### 3.2 Derivation construction

For every `derivations.push` site found in Phase 1.4, read 30 lines of context. For each push, document:
- Where does the `filters` field value come from?
- Is it `[]` (hardcoded empty array)?
- Is it read from a signal, from an AI response, or from a data capability?
- If filters is always `[]`, is there any code path where filters could be populated?

### 3.3 generateFilteredCountDerivations

This function was referenced in DIAG-047 Phase 2.3 as the only path that might produce non-empty filters. Read it in full:

```bash
grep -n "function generateFilteredCountDerivations" web/src/lib/intelligence/convergence-service.ts
```

Read the full function body. Paste verbatim. Does it produce filters? If yes, what triggers it? Does it apply to sum operations or only count operations?

### 3.4 generateAISemanticDerivations

This function calls the convergence Pass 4 AI and parses the response. The AI response is pushed to derivations at line 624: `derivations.push(...aiResult.derivations)`.

```bash
grep -n "function generateAISemanticDerivations" web/src/lib/intelligence/convergence-service.ts
```

Read the full function body. Paste verbatim. Critical questions:
- What response schema does the AI prompt request? Does it ask for `filters` in the response?
- How does the function parse the AI response into `MetricDerivationRule[]`?
- Does the parsing carry filters from the AI response, or does it construct rules with `filters: []`?

Append under `## Phase 3 -- Signal consumption and derivation construction stage`.

```bash
git add docs/audits/AUD-009_LLM_OUTPUT_FIDELITY_AUDIT_OUTPUT.md
git commit -m "AUD-009 Phase 3: signal consumption and derivation construction"
git push origin aud-009-llm-output-fidelity
```

## Phase 4 -- Bridge and transformation stage

### 4.1 bridgeAIToEngineFormat

Already read in DIAG-036 Surface 6 (lines 559-583). Re-read on current HEAD:

```bash
grep -n "function bridgeAIToEngineFormat\|export function bridgeAIToEngineFormat" web/src/lib/compensation/ai-plan-interpreter.ts
```

Read the full function body. Paste verbatim. Documents: does it carry the full LLM output through to `inputBindings`, or does it return `inputBindings: {}`?

### 4.2 interpretationToPlanConfig

```bash
grep -n "function interpretationToPlanConfig\|export function interpretationToPlanConfig" web/src/lib/compensation/ai-plan-interpreter.ts
```

Read the full function body. Paste verbatim. This transforms the LLM's raw output into engine-compatible components. Does it carry everything or cherry-pick?

### 4.3 convertComponent (intent-transformer.ts)

The transformer was fixed in HF-223 for modifiers. But does it carry other fields from the LLM's raw component output?

```bash
grep -n "function convertComponent\|function transformFromMetadata" web/src/lib/calculation/intent-transformer.ts
```

Read each function body. For each, document: what fields does it read from the input? Does it construct a new object from enumerated fields or spread/carry the input?

Append under `## Phase 4 -- Bridge and transformation stage`.

```bash
git add docs/audits/AUD-009_LLM_OUTPUT_FIDELITY_AUDIT_OUTPUT.md
git commit -m "AUD-009 Phase 4: bridge and transformation stage"
git push origin aud-009-llm-output-fidelity
```

## Phase 5 -- AI response parsing stage

### 5.1 Convergence Pass 4 AI prompt response format

Read the AI prompt template that convergence sends to the LLM for column mapping. The prompt defines the response schema the AI must follow. Does the schema include a `filters` field?

```bash
grep -n "JSON.*response\|response.*format\|Return.*JSON\|respond.*with\|schema.*response" \
  web/src/lib/intelligence/convergence-service.ts | head -15
```

For each hit, read 40 lines of context. Paste verbatim.

### 5.2 AI response parser

After the AI responds, how does convergence parse the response into derivation rules? Read the parsing function:

```bash
grep -n "parse.*response\|JSON\.parse\|aiResult\.\|mapping\[" \
  web/src/lib/intelligence/convergence-service.ts | head -20
```

For each parsing site, read 30 lines of context. Paste verbatim. Does the parser carry filters from the AI response or construct rules with `filters: []`?

### 5.3 What does the AI actually return?

The CRP Plan 1 convergence log showed: `HF-114 AI mapping: {"period_equipment_revenue":"total_amount"}`. This is the AI's column-mapping response. It maps metric names to column names. There is no filter information in this response. Does the AI prompt even ask for filters?

Read the full AI prompt construction function. Paste verbatim.

Append under `## Phase 5 -- AI response parsing stage`.

```bash
git add docs/audits/AUD-009_LLM_OUTPUT_FIDELITY_AUDIT_OUTPUT.md
git commit -m "AUD-009 Phase 5: AI response parsing stage"
git push origin aud-009-llm-output-fidelity
```

## Phase 6 -- Engine consumption stage

### 6.1 applyMetricDerivations filter application (verify HF-172 survival)

Already read in DIAG-047 Phase 3. Re-verify on current HEAD:

```bash
grep -n "function applyMetricDerivations" web/src/lib/calculation/run-calculation.ts
```

Read the full function body. Paste verbatim. Confirm `rowMatchesFilters` is called in the `sum` branch.

### 6.2 resolveMetricsFromConvergenceBindings

Already read in DIAG-036 Surface 2.2 (lines 1178-1286 at that commit). Re-read on current HEAD. This function resolves metrics from convergence bindings. Does it apply any filtering? Does it read `filters` from any source?

```bash
grep -n "function resolveMetricsFromConvergenceBindings" web/src/app/api/calculation/run/route.ts
```

Read the full function body. Paste verbatim.

### 6.3 resolveColumnFromBatch

Already read in DIAG-036 Surface 2.2.1. This function sums a column across all rows for an entity. It has NO filter parameter. It sums everything.

```bash
grep -n "function resolveColumnFromBatch" web/src/app/api/calculation/run/route.ts
```

Read the full function body. Paste verbatim. Confirm: no filter parameter, no category filtering, sums all rows.

Append under `## Phase 6 -- Engine consumption stage`.

```bash
git add docs/audits/AUD-009_LLM_OUTPUT_FIDELITY_AUDIT_OUTPUT.md
git commit -m "AUD-009 Phase 6: engine consumption stage"
git push origin aud-009-llm-output-fidelity
```

## Phase 7 -- Summary table

Append a summary table to the output file:

```markdown
## Phase 7 -- Function-by-function readiness summary

| Function | File | Stage | Carries full input? | Cherry-picks fields? | filters handled? | Details |
|---|---|---|---|---|---|---|
| emitPlanComprehensionSignals | plan-comprehension-emitter.ts | Signal Write | | | | |
| bridgeAIToEngineFormat | ai-plan-interpreter.ts | Bridge | | | | |
| interpretationToPlanConfig | ai-plan-interpreter.ts | Bridge | | | | |
| convertComponent / transformFromMetadata | intent-transformer.ts | Bridge | | | | |
| loadMetricComprehensionSignals | convergence-service.ts | Signal Read | | | | |
| metricComprehension consumption sites | convergence-service.ts | Signal Read | | | | |
| generateDerivationsForMatch | convergence-service.ts | Derivation | | | | |
| generateFilteredCountDerivations | convergence-service.ts | Derivation | | | | |
| generateAISemanticDerivations | convergence-service.ts | AI Parse | | | | |
| AI column-mapping prompt | convergence-service.ts | AI Prompt | | | | |
| applyMetricDerivations | run-calculation.ts | Engine | | | | |
| resolveMetricsFromConvergenceBindings | route.ts | Engine | | | | |
| resolveColumnFromBatch | route.ts | Engine | | | | |

For each function, CC fills in: does it carry full input or cherry-pick? Does it handle/carry/produce filters?
```

```bash
git add docs/audits/AUD-009_LLM_OUTPUT_FIDELITY_AUDIT_OUTPUT.md
git commit -m "AUD-009 Phase 7: summary table"
git push origin aud-009-llm-output-fidelity
```

## Phase 8 -- Completion

Append to the output file:

```markdown
## Phase 8 -- AUD-009 Complete

All six pipeline stages audited for the registry/cherry-pick pattern:
- Signal emission (plan-comprehension-emitter, other signal writers)
- Signal consumption (loadMetricComprehensionSignals, all consumption sites)
- Derivation construction (all derivations.push sites, generateFilteredCountDerivations, generateAISemanticDerivations)
- Bridge/transformation (bridgeAIToEngineFormat, interpretationToPlanConfig, convertComponent)
- AI response parsing (Pass 4 prompt schema, response parser)
- Engine consumption (applyMetricDerivations, resolveMetricsFromConvergenceBindings, resolveColumnFromBatch)

Per-function documentation: carries full input or cherry-picks? Handles filters or hardcodes []?

CC does not interpret findings. Architect dispositions in architect channel.
```

```bash
git add docs/audits/AUD-009_LLM_OUTPUT_FIDELITY_AUDIT_OUTPUT.md
git commit -m "AUD-009 Phase 8: complete"
git push origin aud-009-llm-output-fidelity
```

Paste `git log -8 --oneline` verbatim.

Create the PR:

```bash
gh pr create --base main --head aud-009-llm-output-fidelity \
  --title "AUD-009: LLM output fidelity audit -- registry and cherry-pick pattern detection" \
  --body "Comprehensive read-only audit. Traces every function in the LLM-to-engine pipeline for the registry/cherry-pick pattern: does the function carry full input or construct a new object from enumerated fields, silently discarding unenumerated content? Covers signal emission, signal consumption, derivation construction, bridge/transformation, AI response parsing, and engine consumption. No code changes."
```

Paste the PR URL verbatim.

Kill dev server. `rm -rf .next`. `npm run build`. `npm run dev`. Confirm localhost:3000.

End of audit.
