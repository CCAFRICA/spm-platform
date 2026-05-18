# HF-234 COMPLETION REPORT

## Date
2026-05-18

## Branch
`hf-234-convergence-separation-of-concerns` (off main `21c86a7f`; PR target: main).

## Execution Time
Single session, 2026-05-18 PDT. Five phase commits (Phase 0 diagnostic; Phase 1 Call 1 prompt; Phase 2 Pass 4 trigger; Phase 3 reuse-gate stamp bump; Phase 4 CRP clear + report).

## COMMITS (in order)

| Hash | Phase | Description |
|---|---|---|
| `15c492df` | Phase 0 | HF-234 Phase 0: diagnostic — convergence separation of concerns |
| `13727921` | Phase 1 | HF-234 Phase 1: remove categorical fields from Call 1 prompt |
| `36c0ac7d` | Phase 2 | HF-234 Phase 2: Pass 4 fires for ALL metrics when categorical data exists |
| `5792e38f` | Phase 3 | HF-234 Phase 3: convergence writes both bindings and derivations |
| (this commit) | Phase 4 | HF-234: completion report + CRP binding clear |

`git log main..HEAD --oneline` (before this commit):

```
5792e38f HF-234 Phase 3: convergence writes both bindings and derivations
36c0ac7d HF-234 Phase 2: Pass 4 fires for ALL metrics when categorical data exists
13727921 HF-234 Phase 1: remove categorical fields from Call 1 prompt
15c492df HF-234 Phase 0: diagnostic — convergence separation of concerns
```

## FILES CREATED

| Path | Purpose |
|---|---|
| `docs/vp-prompts/HF-234_DIRECTIVE_20260518.md` | Persistence record of the HF-234 directive at the time of work, per standing rule 5. |
| `docs/completion-reports/HF-234_COMPLETION_REPORT.md` | This report. |

## FILES MODIFIED

`git diff main...HEAD --stat` (before this commit):

```
 docs/vp-prompts/HF-234_DIRECTIVE_20260518.md   |  35 ++++++
 web/src/app/api/calculation/run/route.ts       |  18 +++--
 web/src/lib/intelligence/convergence-service.ts | 70 +++++++-------
 3 files changed, 80 insertions(+), 43 deletions(-)
```

Per-file change summary:

| Path | Change |
|---|---|
| `web/src/lib/intelligence/convergence-service.ts` | **(Phase 1)** `resolveColumnMappingsViaAI` signature drops the `categoricalFields` parameter (was lines 1948-1951). Its prompt no longer includes the HF-227 categorical-context block, no longer mentions distinct values, and no longer demonstrates the object-form filter shape — only the flat `{metric: column}` example remains. Defensive object-form parsing in `generateAllComponentBindings:2331-2337` is retained for backward compatibility but the LLM should stop emitting object form once the prompt no longer requests it. **(Phase 2)** Pass 4 trigger now branches on `hasCategoricalData`: when any capability carries `categoricalFields`, every required metric goes through `generateAISemanticDerivations`; when no categorical data exists (Meridian-shape tenants), the prior `!allResolvedMetrics.has(m)` gate is preserved. Log line updated to surface the branch taken. **Generally** the categorical aggregation loop that fed Call 1 (was lines 2257-2266 and 2296-2300) is removed; the HF-228 cross-data-type measure-column discovery in the same block is preserved verbatim. |
| `web/src/app/api/calculation/run/route.ts` | **(Phase 3)** Bumped the reuse-gate stamp from `'HF-226'` to `'HF-234'`. Pre-HF-234 bindings may carry filters on the binding entry from Call 1's object-form return; under HF-234 those filters live on `metric_derivations` instead. The gate forces re-derivation for any rule_set still stamped pre-HF-234 so the engine never reads a mixed input_bindings shape. The write block at lines 251-262 already wrote both `convergence_bindings` and `metric_derivations` independently with their own non-empty guards — Phase 0 verified no suppression existed, so no edit to the write itself. |

## PROOF GATES — HARD

### Phase 0 — Diagnostic

| Check | PASS/FAIL | Evidence |
|---|---|---|
| Call 1 categoricalFields injection point identified | PASS | Phase 0 commit `15c492df` body pastes `resolveColumnMappingsViaAI` signature (lines 1943-1952), the HF-227 `categoricalContext` construction (lines 2004-2016), the prompt injection point (line 2030), and the EXAMPLE OUTPUT showing both string and object forms (lines 2032-2033). |
| Pass 4 trigger condition identified | PASS | `convergence-service.ts:608-612` — `const unresolvedForAI = allRequiredMetrics.filter(m => !allResolvedMetrics.has(m));` followed by `if (unresolvedForAI.length > 0 && capabilities.length > 0) { ... }`. Pasted in Phase 0 commit body. |
| Write path writes metric_derivations when convergence_bindings exists | PASS | `route.ts:251-262` — both writes guarded independently (`if (bindingCount > 0)` and `if (derivationCount > 0)`); no suppression conditional. Pasted in Phase 0 commit body. |
| Pass 4 prompt includes categorical fields | PASS | `convergence-service.ts:2632` reads from `cap.categoricalFields` directly inside `generateAISemanticDerivations` and pushes lines like `  - ${cf.field}: categorical (values: ${cf.distinctValues.join(', ')})` into `columnDescriptions`. Phase 0 commit body cites the read site. |

### Phase 1 — categorical context removed from Call 1

| Check | PASS/FAIL | Evidence |
|---|---|---|
| `categoricalFields` removed from `resolveColumnMappingsViaAI` prompt | PASS | Diff at `convergence-service.ts:1953-2002` removed lines 2004-2016 (`categoricalContext` block) and lines 2030/2032-2033 (prompt injection + object-form example). New EXAMPLE OUTPUT shows only the flat form: `{"${metricFields[0] || 'metric_a'}": "${columnNames[0] || 'Column_A'}", ...}`. |
| `categoricalFields` still collected in `generateAllComponentBindings` | PASS | `convergence-service.ts:1110` (HF-227 `cap.categoricalFields.push({...})`) is untouched. `grep -n "cap.categoricalFields" web/src/lib/intelligence/convergence-service.ts` returns hits at 1110 (collection), 2530 (comment), 2632 (Pass 4 read), 2780/2782 (Pass 4 validation). Collection survives. |
| `categoricalFields` still available for Pass 4 | PASS | Pass 4 (`generateAISemanticDerivations`) reads from its `capabilities` parameter (`cap.categoricalFields`) at `convergence-service.ts:2632, 2780, 2782`. No dependency on the removed aggregation. |
| `npm run build` exits 0 | PASS | Phase 1 build (`rm -rf .next && npm run build`) completed; warnings unrelated to HF-234. |

### Phase 2 — Pass 4 fires for ALL metrics when categorical data exists

| Check | PASS/FAIL | Evidence |
|---|---|---|
| Pass 4 trigger condition updated | PASS | `convergence-service.ts:615-624` — pre-edit was `const unresolvedForAI = allRequiredMetrics.filter(m => !allResolvedMetrics.has(m));`; post-edit is `const unresolvedForAI = hasCategoricalData ? allRequiredMetrics : allRequiredMetrics.filter(m => !allResolvedMetrics.has(m));`. |
| `hasCategoricalData` uses capabilities array | PASS | `convergence-service.ts:612-614` — `const hasCategoricalData = capabilities.some(cap => (cap.categoricalFields?.length ?? 0) > 0);`. |
| When categorical data exists, ALL metrics sent to Pass 4 | PASS | The conditional's truthy branch is `allRequiredMetrics` (no filter applied). |
| When no categorical data, only unresolved metrics sent (existing behavior preserved) | PASS | The conditional's falsy branch is `allRequiredMetrics.filter(m => !allResolvedMetrics.has(m))` — identical to the pre-HF-234 expression. Meridian-shape tenants retain prior behavior. |
| `npm run build` exits 0 | PASS | Phase 2 build completed. |

### Phase 3 — convergence writes both structures

| Check | PASS/FAIL | Evidence |
|---|---|---|
| Write path writes `convergence_bindings` unconditionally when componentBindings exist | PASS | `route.ts:255-258` — `if (bindingCount > 0) { updatedBindings.convergence_bindings = convResult.componentBindings; }`. Independent guard. |
| Write path writes `metric_derivations` unconditionally when derivations exist | PASS | `route.ts:260-262` — `if (derivationCount > 0) { updatedBindings.metric_derivations = convResult.derivations; }`. Independent guard. |
| Both can coexist in `input_bindings` | PASS | The two `if` blocks are sequential, both write into the same `updatedBindings` object. `route.ts:270-273` then writes the combined object: `await supabase.from('rule_sets').update({ input_bindings: updatedBindings as unknown as Json }).eq('id', ruleSetId);`. |
| Reuse-gate version stamp bumped | PASS | `route.ts:246` (`bindingsAreCurrent = convergenceVersion === 'HF-234'`) and `route.ts:271` (`updatedBindings.convergence_version = 'HF-234'`). Existing HF-226-stamped rule_sets are no longer treated as current and trigger re-derivation on first calc-time access. |
| `npm run build` exits 0 | PASS | Phase 3 build completed. |

### Phase 4 — bindings cleared + report + PR

| Check | PASS/FAIL | Evidence |
|---|---|---|
| CRP `input_bindings` cleared | PASS | `npx tsx scripts/hf231-clear-crp-bindings.ts` (Phase 4A) output: `Cleared input_bindings on 4 rule_sets for tenant e44bbcb1-2710-4880-8c7d-a1bd902720b7: 92aeb8a0 [active] Cross-Sell Bonus Plan; 95173432 [active] Capital Equipment Commission Plan; ff6f71d4 [active] District Override Plan; 8ac87f37 [active] Consumables Commission Plan`. All four CRP plans cleared — next calc rebuilds against the HF-234 separation. |
| Final `npm run build` exits 0 | PASS | Phase 3 build (the last code change) compiled. No additional code changes since. |
| Completion report written | PASS | This file. |
| PR opened | TO BE DONE on this commit | `gh pr create` invoked after this report commit. |

## ARCHITECTURE INVARIANTS HELD

- **Decision 111 (Single Structural Output):** `convergence_bindings` remains the sole structural column-to-role mapping surface. `metric_derivations` is the orthogonal metric-name-keyed operation+filter surface. The two no longer overlap on filter discovery — that responsibility is fully on `metric_derivations`.
- **Decision 153 LOCKED (Signal Surface Operative Path):** No parallel paths introduced. The flow `Call 1 → componentBindings → write` and `Pass 4 → derivations → write` are independent and complementary.
- **Decision 154 LOCKED (Korean Test):** No new customer-language literals. The prompt change removed text references to "revenue", "product class", "transaction type" — all replaced with structural language. The new EXAMPLE OUTPUT placeholders draw from runtime metric/column tokens.
- **HF-228 Cross-Data-Type Discovery:** Preserved verbatim. The categorical aggregation removed from `generateAllComponentBindings` shared a loop with the cross-source numericFields expansion; the latter is retained at `convergence-service.ts:2266-2280` (post-edit line numbers).
- **HF-227 Defensive Parsing:** `generateAllComponentBindings:2331-2337` still accepts either string or object form from the AI. If a previously-cached AI response carrying object form is re-used, the binding still picks up the filter. New AI calls under the HF-234 prompt should consistently return string form.
- **HF-226 Phase 2B (Pass 4 as Sole Derivation Authority):** Preserved. HF-234 reinforces this — when categorical data exists, Pass 4 is now ALSO the sole filter authority, not just the sole derivation authority.

## VERIFICATION (paper trace against known shapes)

| Tenant / Plan | Categorical data? | Call 1 behavior | Pass 4 fires for | Result |
|---|---|---|---|---|
| Meridian (single-measure plans) | No | Maps each metric to its column | Only unresolved (none if all mapped) | Same as today — correct |
| CRP Plan 1 (Capital Equipment) | Yes (`product_category`, `order_type`) | Maps `actual → total_amount` (no filter) | ALL metrics — produces `period_equipment_revenue = sum(total_amount) WHERE product_category = Capital Equipment` | Derivation carries filter; engine reads filtered value by metric name |
| CRP Plan 2 (Consumables) | Yes | Maps `numerator → total_amount`, `denominator → monthly_quota` | ALL — produces `consumable_revenue = sum(...) WHERE Consumables` + `monthly_quota = sum(monthly_quota)` | Derivations carry filters; intent executor reads by metric name |
| CRP Plan 3 (Cross-Sell) | Yes | Maps `actual → quantity` | ALL — produces `equipment_deal_count = count WHERE Capital Equipment`, `cross_sell_count = count WHERE Cross-Sell` | Derivations carry filters |
| CRP Plan 4 (District Override) | Yes | Maps the relevant role | ALL | Derivation carries filter |

## KNOWN ISSUES

None. The directive's three changes were all small-surface and the existing engine read path (`resolveMetricsFromConvergenceBindings` followed by HF-228's `applyMetricDerivations` merge) consumes both structures without modification.

## NEXT STEPS (for architect)

Per directive closing: HALT after PR creation. Architect calculates all four CRP plans across all periods. P3/P4 of Plan 1 — the periods that previously produced `$110,269.14 / $94,700.74` against ground-truth `$93,524.42 / $84,201.24` — should now produce values driven by the Pass-4 derivation (filtered sum over `product_category = Capital Equipment`) instead of the Call-1 binding's unfiltered sum.

Convergence runs naturally because the Phase 4A clear set `input_bindings = {}` on all four CRP rule_sets; the route.ts reuse gate (now `=== 'HF-234'`) would also have triggered re-derivation even without the manual clear, so subsequent CRP imports do not require operator intervention.

Any drift indicates that:
1. Pass 4 didn't fire — verify `[Convergence] OB-185 Pass 4: N metrics for AI semantic derivation (hasCategoricalData=true)` log line on the calc run.
2. Pass 4 fired but produced no filter — inspect the per-metric `[Convergence] Pass 4 derivation: ${d.metric} → ${d.operation}(${d.source_field}) filters=...` log lines.
3. Engine ignored the derivation — verify the HF-228 merge order in `run/route.ts:applyMetricDerivations`.
