# HF-235 COMPLETION REPORT

## Date
2026-05-18

## Branch
`hf-235-pass4-remove-sample-rows` (off main `241c60af`; PR target: main).

## Execution Time
Single session, 2026-05-18 PDT. Three phase commits (Phase 0 directive + diagnostic; Phase 1 sample removal; Phase 2 CRP clear + report).

## COMMITS (in order)

| Hash | Phase | Description |
|---|---|---|
| `e406c496` | Phase 0 | HF-235 Phase 0: diagnostic — sample rows in Pass 4 prompt |
| `81b56d36` | Phase 1 | HF-235 Phase 1: remove non-deterministic sample rows from Pass 4 prompt |
| (this commit) | Phase 2 | HF-235: completion report + CRP binding clear |

`git log main..HEAD --oneline` (before this commit):

```
81b56d36 HF-235 Phase 1: remove non-deterministic sample rows from Pass 4 prompt
e406c496 HF-235 Phase 0: diagnostic — sample rows in Pass 4 prompt
```

## FILES CREATED

| Path | Purpose |
|---|---|
| `docs/vp-prompts/HF-235_DIRECTIVE_20260518.md` | Persistence record of the HF-235 directive at the time of work, per standing rule 5. |
| `docs/completion-reports/HF-235_COMPLETION_REPORT.md` | This report. |

## FILES MODIFIED

`git diff main...HEAD --stat` (before this commit):

```
 docs/vp-prompts/HF-235_DIRECTIVE_20260518.md    | 26 ++++++++
 web/src/lib/intelligence/convergence-service.ts | 45 ++++++++--------
 2 files changed, 46 insertions(+), 25 deletions(-)
```

Per-file change summary:

| Path | Change |
|---|---|
| `web/src/lib/intelligence/convergence-service.ts` | Three edits inside `generateAISemanticDerivations`: (1) deleted the sample-row fetch block (the dynamic import of `fetchSupersededBatchIds` + 14-line `.limit(3)` query that previously populated `sampleData`); (2) deleted the `${sampleData}` injection inside the user prompt template; (3) dropped the `supabase` and `tenantId` parameters from the function signature (they were consumed only by the deleted sample block; the call site at `convergence-service.ts:675` is updated to match). The companion section-numbering comments inside the function were renumbered 4→3 / 5→4 / 6→5 to remain consecutive. No other change to the function. No change to any other function. |

## PROOF GATES — HARD

### Phase 0 — Diagnostic

| Check | PASS/FAIL | Evidence |
|---|---|---|
| Sample query location identified | PASS | Phase 0 commit `e406c496` body pastes the 14-line block (`convergence-service.ts:2650-2663` pre-edit) verbatim: the `fetchSupersededBatchIds2` dynamic import, the `q3` query construction with `.limit(3)` at line 2659, and the `sampleData` mapping at line 2663. |
| Prompt injection location identified | PASS | Phase 0 commit `e406c496` body pastes the two-line block at `convergence-service.ts:2748-2749` pre-edit: `Data sample (first ${sampleData.length} rows):` followed by `${JSON.stringify(sampleData, null, 2)}`. |
| `columnDescriptions` built from `capabilities`, not `sampleData` | PASS | `convergence-service.ts:2635-2648` pre-edit reads only from `for (const cap of capabilities)`, then pushes one description string per `cap.numericFields`, `cap.categoricalFields`, `cap.booleanFields` entry. No reference to `sampleData` / `sampleRows` in the construction. |

### Phase 1 — Sample Rows Removed

| Check | PASS/FAIL | Evidence |
|---|---|---|
| Sample query block removed | PASS | `git diff main...HEAD -- web/src/lib/intelligence/convergence-service.ts` shows the 14-line deletion at the old `2650-2663` location, replaced by a 10-line comment beginning `// HF-235: Sample rows REMOVED from Pass 4 prompt.` (now occupies `convergence-service.ts:2647-2656` post-edit). |
| Sample data removed from prompt template | PASS | The user-prompt template (which previously closed with `Data sample (first ${sampleData.length} rows):\n${JSON.stringify(sampleData, null, 2)}\n\nGenerate derivation rules ...`) now closes immediately after `Available data columns:\n${columnDescriptions.join('\n')}\n\nGenerate derivation rules ...`. |
| Zero remaining references to `sampleData` / `sampleRows` | PASS | `grep -nE 'sampleData\|sampleRows\|fetchSupersededBatchIds2\|supersededIds3\|Data sample \(first' web/src/lib/intelligence/convergence-service.ts` exits 1 (no matches). |
| `npm run build` exits 0 | PASS | Phase 1 build (`rm -rf .next && npm run build`) compiled. Pre-existing React-hook / img / dynamic-route warnings unrelated to HF-235. |

### Phase 2 — CRP Cleared + Build + Report + PR

| Check | PASS/FAIL | Evidence |
|---|---|---|
| CRP `input_bindings` cleared | PASS | `npx tsx scripts/hf231-clear-crp-bindings.ts` (Phase 2A) output: `Cleared input_bindings on 4 rule_sets for tenant e44bbcb1-2710-4880-8c7d-a1bd902720b7: 92aeb8a0 [active] Cross-Sell Bonus Plan; 95173432 [active] Capital Equipment Commission Plan; ff6f71d4 [active] District Override Plan; 8ac87f37 [active] Consumables Commission Plan`. All four CRP plans cleared — next calc-time access will trigger fresh convergence under HF-235's deterministic Pass-4 prompt. |
| Final `npm run build` exits 0 | PASS | Phase 1 build compiled successfully; no additional code changes since. |
| Completion report written | PASS | This file. |
| PR opened | TO BE DONE on this commit | `gh pr create` invoked after this report commit. |

## ARCHITECTURE INVARIANTS HELD

- **Decision 111 (single structural output):** unchanged. `convergence_bindings` and `metric_derivations` written by the route.ts caller; HF-235 touches only the Pass-4 prompt construction.
- **Decision 153 LOCKED:** unchanged. No new parallel paths.
- **Decision 154 LOCKED (Korean Test):** preserved. The deleted block contained `JSON.stringify(sampleData)` which serialised customer field values into the prompt; column descriptions retain the field-NAME and per-column-statistics paths, which were already present and runtime-derived. No new domain vocabulary introduced; one prior source of accidental vocabulary leakage (raw row JSON) eliminated.
- **HF-234 separation of concerns:** strengthened. Call 1 (column mapping) and Pass 4 (filter derivation) both now operate on the same `capabilities`-derived metadata surface. Neither reads raw row data at convergence time.
- **HF-228 schema-coverage extension at `inventoryData`:** unaffected — still seeds `cap.categoricalFields` from the broader committed_data sample at line 1010+.
- **HF-227 binding-filter parsing:** unaffected — the defensive object-form parsing in `generateAllComponentBindings` is retained.

## VERIFICATION (paper trace, extending HF-234)

| Tenant / Plan | Pass-4 inputs to AI | Output expected |
|---|---|---|
| Meridian (single-measure plans) | metric descriptions + columns (Meridian capabilities have 0 categorical fields → `hasCategoricalData=false` per HF-234 → Pass-4 fires only for unresolved metrics with no filter requirement) | filter-less sum derivations or no-op |
| CRP Plan 1 (Capital Equipment Commission) | metric descriptions for all expected metrics + columns including `product_category: categorical (values: Capital Equipment, Consumables)` and `total_amount: numeric` | Pass 4 reads the categorical-values line and emits `sum(total_amount) WHERE product_category = "Capital Equipment"` — DETERMINISTICALLY, identical prompt → identical output across runs |
| CRP Plan 2 (Consumables Commission) | same column metadata, different metric labels | analogous filter on `"Consumables"` |
| CRP Plan 3 (Cross-Sell Bonus) | `order_type: categorical (values: New Sale, Cross-Sell)` available | filter on `order_type = "Cross-Sell"` |
| CRP Plan 4 (District Override) | scope:district + the relevant role filter | filter via the per-component metric scope |

## KNOWN ISSUES

None. The Phase 0 grep + Phase 1 grep together demonstrate that no other code path in the file referenced `sampleData` / `sampleRows`. The function-signature reduction (dropping `supabase` and `tenantId`) is propagated to its single call site in the same commit.

## NEXT STEPS (for architect)

Per directive closing: HALT after PR creation. Architect calculates all four CRP plans across all periods. With the Pass-4 prompt now deterministic given `(metricContexts, capabilities)`, identical inputs produce identical derivations on every run — eliminating the non-determinism observed post-HF-234.

Any drift indicates either:
1. `capabilities` changed between runs (re-import would change `categoricalFields`); inspect `[Convergence] OB-185 Pass 4: N metrics for AI semantic derivation (hasCategoricalData=true)` log line on each run.
2. AI temperature non-zero or model-variance; the call uses `{ responseFormat: 'json', maxTokens: 4096, temperature: 0 }` per `convergence-service.ts:2752` post-edit — temperature 0 holds.
3. The capability has no categorical field for the relevant metric — Pass 4 cannot derive a filter from metadata that doesn't exist. Verify with `web/scripts/diag049-probe.ts` against the CRP tenant.
