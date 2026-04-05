# HF-191 Completion Report: Plan Intelligence Forward — Seed Derivations

## Implements Decision 147

## Commits
1. `98408eb9` — Phase 0: Architecture Decision Gate
2. `70aba6bc` — Phase A: Plan agent outputs metricSemantics, stored as plan_agent_seeds
3. `3a31bdea` — Phase B: Convergence reads and validates plan agent seeds
4. (This commit) — Phase 3: Build verification + completion report

## Files Changed
| File | Changes |
|------|---------|
| `web/src/lib/ai/providers/anthropic-adapter.ts` | A1: metricSemantics in system prompt, A2: in user prompt template |
| `web/src/lib/compensation/ai-plan-interpreter.ts` | A3: Extract metricSemantics from rawResult in bridgeAIToEngineFormat |
| `web/src/lib/intelligence/convergence-service.ts` | B1: Seed consumption + validation, B2: Gap skip logging |
| `web/src/app/api/import/sci/execute/route.ts` | A4: Preserve plan_agent_seeds in convergence overwrite |
| `web/src/app/api/calculation/run/route.ts` | A4: Preserve plan_agent_seeds in calc-time convergence |
| `web/src/app/api/import/commit/route.ts` | A4: Preserve plan_agent_seeds in commit-time convergence |
| `web/src/app/api/import/sci/execute-bulk/route.ts` | A4: Preserve seeds across 3 convergence invalidation clears |

## Architecture Decision Gate

### 1. File Existence
All 3 files verified (adapter at `providers/` subdir, not root `ai/`).

### 2. File Currency
```
anthropic-adapter.ts: c165ddea (OB-186), 43c07ac8 (HF-171), 4a4e1447 (HF-162)
ai-plan-interpreter.ts: a69cf62f (HF-161), ed6b1946 (HF-160), 03ed3795 (HF-159)
convergence-service.ts: fc6422fe (OB-191), c6f13105 (OB-185), c19a042c (OB-185)
```

### 3. convergeBindings Call Sites
- `execute/route.ts:198` — post-import convergence
- `commit/route.ts:998` — commit-time convergence
- `run/route.ts:134` — calc-time convergence
- `converge/route.ts:49` — manual convergence
- `wire/route.ts:361` — wire convergence

### 4. bridgeAIToEngineFormat
Confirmed `inputBindings: {}` at line 747 (BEFORE fix). Now returns `{ plan_agent_seeds: validSemantics }` when seeds present.

### 5. Plan Interpretation Prompt
SCOPE AGGREGATE example confirmed present (HF-160). metricSemantics section added between CRITICAL line and "Return your analysis" line.

## Hard Gates

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| G1 | metricSemantics in system prompt | PASS | Inserted 40-line block between "CRITICAL: Every component" and "Return your analysis as valid JSON" |
| G2 | metricSemantics in user prompt template | PASS | Added between requiredInputs and workedExamples in response JSON template |
| G3 | bridgeAIToEngineFormat extracts from rawResult | PASS | `rawResult.metricSemantics` extracted (not `normalized`) — validated with operation check |
| G4 | plan_agent_seeds in inputBindings | PASS | `inputBindings: validSemantics.length > 0 ? { plan_agent_seeds: validSemantics } : {}` |
| G5 | Seeds preserved in execute/route.ts | PASS | `if (currentBindings.plan_agent_seeds) updatedBindings.plan_agent_seeds = ...` |
| G6 | Seeds preserved in run/route.ts | PASS | `if (rawBindings?.plan_agent_seeds) updatedBindings.plan_agent_seeds = ...` |
| G7 | Seeds preserved in commit/route.ts | PASS | `if (rsBindings.plan_agent_seeds) commitBindings.plan_agent_seeds = ...` |
| G8 | Seeds preserved in execute-bulk/route.ts x3 | PASS | All 3 clear operations read seeds first, write back with seeds |
| G9 | Convergence reads seeds | PASS | `planAgentSeeds` extracted from `ruleSet.input_bindings` at convergeBindings start |
| G10 | Seeds validated against capabilities | PASS | Filter fields checked against categoricalFields, source_field against columnStats |
| G11 | Valid seeds promoted to MetricDerivationRule | PASS | Pushed to `derivations[]` with `source_pattern: '.*'` |
| G12 | Gap detection skips seeded metrics | PASS | `finalResolvedMetrics` built from `derivations` which includes seeds — automatic |
| G13 | Pass 4 AI skips seeded metrics | PASS | `allResolvedMetrics` built from `derivations` which includes seeds — automatic |
| G14 | `npx tsc --noEmit` | PASS | Exit code 0 |
| G15 | `npx next lint` | PASS | Exit code 0 (warnings pre-existing) |
| G16 | `npm run build` | PASS | Exit code 0 |

## Soft Gates

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| S1 | Korean Test — no hardcoded field names | PASS | Seeds come from AI, validation checks against runtime data capabilities |
| S2 | No domain language in convergence | PASS | Validation is structural (categorical fields, numeric fields) |
| S3 | rawResult used for extraction | PASS | `rawResult.metricSemantics` not `normalized.metricSemantics` |
| S4 | Existing convergence preserved as fallback | PASS | Seeds add to derivations before Passes 1-4, not replace them |

## Standing Rule Compliance
- Rule 25: Report created BEFORE final build verification commit
- Rule 26: Mandatory structure followed
- Rule 27: Evidence is pasted code/output
- Rule 28: One commit per phase
- Rule 36: No unauthorized behavioral changes
- Rule 48: Completion report file created
- Rule 51v2: tsc --noEmit and next lint run on committed code

## Post-Merge Required
1. Re-import CRP Plan 4 PDF to generate metricSemantics → plan_agent_seeds
2. Re-import CRP data files (seeds preserved across data import)
3. Calculate Plan 4 → verify convergence logs show seed validation
4. Verify scope_aggregate calculations produce correct values
5. Regression check Plans 1-3 and BCL

## Issues
None. Clean implementation across 7 files.
