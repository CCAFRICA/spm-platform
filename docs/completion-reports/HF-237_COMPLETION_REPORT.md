# HF-237 — CRP Plan 2 Quota Resolution + Plan 4 Scope Aggregate Closure: Completion Report

## Date
2026-05-19

## PR
To be opened (branch `hf-237-plan2-plan4-closure`).

## Commits

| Hash | Phase | Description |
|---|---|---|
| `6a83de53` | Phase 1 + Phase 0 probe | HF-237: plan-interpretation prompt fixed for scope_aggregate source (D1+D2 closure) |
| (this commit) | Phase 6 | HF-237: completion report per Rule 25 |

## Files modified

| Path | Phase | Change shape |
|---|---|---|
| `web/src/lib/ai/providers/anthropic-adapter.ts` | Phase 1 | Lines 617-668: replaced two `aggregate`-source examples (Manager override + Tiered override) with canonical `scope_aggregate`-source examples carrying typed `{field, aggregation, scope}` sourceSpec keys. Removed the explicit prohibition `"Do NOT use 'scope_aggregate' or any other compound operation name"`. Added a "WHEN TO USE" disambiguation block enumerating `metric` vs `aggregate` vs `scope_aggregate` source choice criteria. Added engine-recognized scope values (`'district'`, `'region'`) with structured-failure guidance for unrecognized hierarchies. |
| `web/scripts/hf237-phase0-plan2-quota-diag.ts` | Phase 0 | NEW throwaway probe script. Dumps Plan 2 `metric_derivations`, `components.calculationMethod`, and `committed_data` rows with `data_type='target'` for the CRP tenant. Read-only. |

## Phase 0 diagnostic findings (Plan 2 quota)

**Plan 2 metric_derivations are structurally correct:**
```
{"metric":"consumable_revenue","filters":[{"field":"product_category","value":"Consumables","operator":"eq"}],"operation":"sum","source_field":"total_amount","source_pattern":"transaction"}
{"metric":"monthly_quota","filters":[],"operation":"sum","source_field":"monthly_quota","source_pattern":"target"}
```

**Plan 2 quota values are correctly persisted in `committed_data`:**
- 24 rows in `data_type='target'` for the CRP tenant.
- Each row carries `entity_id`, `role` (`Rep` / `Senior Rep`), `monthly_quota` (`18000` / `25000`), `effective_date`.
- Distribution: 16 Reps × $18K, 8 Senior Reps × $25K. Matches the plan reference.

**Plan 2 piecewise segments — boundary anomaly identified:**
```
seg 1: { min: 0,    max: 0.9999, rate: 0.03, maxInclusive: true, minInclusive: true }
seg 2: { min: 1.0,  max: 1.1999, rate: 0.05, maxInclusive: true, minInclusive: true }
seg 3: { min: 1.2,  max: null,   rate: 0.08, maxInclusive: true, minInclusive: true }
```

The executor at `intent-executor.ts:572` uses strict half-open `ratio < seg.max` and **ignores `maxInclusive`**:

```typescript
572     const inRange = ratio >= seg.min && (seg.max === null || ratio < seg.max);
```

Net effect: ratios in `(0.9999, 1.0)` and `(1.1999, 1.2)` (narrow gaps of width 0.0001) match NO segment and pay `$0`. Plan-agent emitted `maxInclusive: true` intending boundary-inclusive tier 1 cap at 99.99%, but the executor's half-open semantics drop that intent. Unlikely $3,244.03 source given the gap width, but a real defensive-correctness gap worth a separate HF.

**Plan 2 $3,244.03 January delta source remains uncertain.** The quota data is correct; the derivation has the right filter; the merge order honors derivation overlay (per DIAG-051 Probe 1A). Without per-entity reconciliation evidence, the delta source is not localizable. **Carry forward per directive §5.**

## Substrate citation

Wave 1 amendments locked 2026-05-18 (VG `e2fbcc4`):

| Substrate entry | Version | Operative clause for HF-237 |
|---|---|---|
| `IGF-T1-E902` v2 | Carry Everything | Persistence scope: data persists at import without filter/projection by AI classification. **Operative for the Plan 4 prompt fix:** scope value MUST be carried in the operation (the LLM's plan-text comprehension of "district revenue" vs "region revenue") — the data binding layer cannot infer hierarchy from operation alone. The pre-HF-237 prompt's claim that scope is "resolved by the data binding layer" was structurally incorrect. |
| `IGF-T1-E910` v2 | Korean Test | Structural primitives in one canonical declaration; structured failure on unrecognized identifiers. **Operative for the prompt edit:** the `scope_aggregate` source vocabulary and the scope hierarchy enumeration (`'district' \| 'region'`) are engine capability labels declared in `intent-types.ts:37-41`, not customer field-name vocabulary. The prompt now references these labels directly. The "structured failure" pattern is preserved at `convertComponent` (`ai-plan-interpreter.ts:476-485`) which throws `UnconvertibleComponentError` on unrecognized primitives — defensive against future LLM emissions outside the registry. |
| `IGF-T2-E06` v2 | HC Override Authority | HC observations persist irrespective of claim type. **Preserved:** HF-237 touches only the plan-interpretation prompt layer, not the HC binding layer; HC remains the authority on per-column field-role assignment. |

## Proof gates

| # | Phase | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|---|
| §1 | Phase 0 | Branch + diagnostic complete | PASS | Branch `hf-237-plan2-plan4-closure` created off main `3894701b`. Diagnostic produced 24 target rows + components shape + metric_derivations enumeration verbatim. |
| §2 | Phase 1 | Prompt vocabulary updated; LLM no longer told to emit `source: 'aggregate'` with non-canonical sourceSpec keys for cross-entity aggregation | PASS | `git diff main...HEAD -- web/src/lib/ai/providers/anthropic-adapter.ts \| head -80` shows the two examples replaced. `grep -c "source\": \"aggregate\"" anthropic-adapter.ts` = 0 in the Manager/Tiered override blocks (the remaining `aggregate` source mentions are in the "WHEN TO USE" disambiguation, distinguishing it from `scope_aggregate`). `grep -c "Do NOT use \"scope_aggregate\"" anthropic-adapter.ts` = 0 (prohibition removed). |
| §2 | Phase 1 | `convertComponent` handles `scope_aggregate` | PASS | `ai-plan-interpreter.ts:467` already has `case 'scope_aggregate':` (no edit needed — top-level dispatch passes through). The actual translation surface (LLM → engine) is `normalizeIntentInput` at `intent-transformer.ts:122-126` which already accepts `source: 'scope_aggregate'`. |
| §2 | Phase 1 | Structured failure path exists | PASS | `ai-plan-interpreter.ts:481-485` default branch throws `UnconvertibleComponentError` for unrecognized primitives; `intent-types.ts:23-43` IntentSource union acts as compile-time constraint; `intent-transformer.ts:128` explicit `return { source: 'constant', value: 0 }` for unrecognized source shapes. |
| §3 | Phase 2 | Verify metric_derivations persist on convergence write-back | PASS (already correct) | `route.ts:266-268` unconditionally writes `metric_derivations` to `input_bindings` when `derivationCount > 0`. The Plans 1/3/4 zero-derivations state observed in DIAG-051 is NOT a write-back defect — it is upstream: Pass 5 LLM at `convergence-service.ts:2622-2868` returns `gaps` instead of `derivations` for those plans. The write-back faithfully persists whatever Pass 5 produces (which for Plan 2 is 2 derivations; for Plans 1/3/4 is zero). No edit needed for HF-237 scope. |
| §4 | Phase 3 | Re-import plan PDF | DEFERRED to architect | The pre-HF-237 stored intent for the District Override Plan must be regenerated through the updated prompt + `convertComponent`. CRP plan PDF re-import is a UI / operator action, not a CC code change. Note for architect channel. |
| §5 | Phase 4 | Plan 2 fix | CARRIED FORWARD per directive §5 | Phase 0 evidence: quota data correct + derivation filter correct + merge order correct. The $3,244.03 delta source is not localizable without per-entity reconciliation. Documented in "Phase 0 diagnostic findings" above. |
| §6 | Phase 5 | Final build clean | PASS | `npm run build` exit 0. tsc + eslint clean. |

## Standing rule compliance

- **Rule 1 (commit + push each phase):** PASS — single Phase 1 commit (combined with Phase 0 probe artifact) pushed before this completion-report commit; this report is the final commit.
- **Rule 6 (report in standard path):** PASS — `docs/completion-reports/HF-237_COMPLETION_REPORT.md`.
- **Rule 18 (criteria verbatim):** PASS — proof-gate criteria quote directive §1-§6 verbatim.
- **Rule 27 (evidence = paste):** PASS — Phase 0 quota data, Plan 2 component shape, and Plan 2 segment boundary anomaly all backed by verbatim diagnostic output.
- **Rule 41 (read actual contracts):** PASS — `intent-types.ts:23-43` (IntentSource union), `intent-executor.ts:113-167` (resolveSource branches), `intent-transformer.ts:122-126` (normalizeIntentInput), `route.ts:266-268` (write-back), `convergence-service.ts:2622-2868` (Pass 5) all opened and read at HEAD `3894701b` before any finding was authored.
- **AP-25 (Korean Test):** PASS — the prompt edit uses only structural vocabulary (`scope_aggregate`, `district`, `region`) declared in `intent-types.ts:37-41`. No customer field-name literals introduced. The scope hierarchy values are engine capability labels.
- **T2-E04 (Vertical Slice):** PASS — single PR. Engine machinery for `scope_aggregate` already complete (intent-types, executor, transformer, scope-aggregation pre-computation at `route.ts:2345-2397`); HF-237 closes the prompt-layer gap that prevented the LLM from emitting the shape the engine has been ready to receive since OB-181.

## Known issues

1. **DIAG-051 D3 (Plan 1 zero `metric_derivations`) is not closed by HF-237.** HF-237 corrects the prompt for Plan 4-style cross-entity-aggregation operations. Plan 1's missing `period_equipment_revenue → sum(total_amount) WHERE Capital Equipment` derivation is a Pass 5 emission issue (LLM returning `gaps` instead of `derivations`), not a write-back issue. Plan 4 cannot resolve `scope_aggregate { field: equipment_revenue }` until Plan 1 produces that derivation via Pass 5. Separate HF needed to close the Pass 5 prompt issue.
2. **Plan 2 $3,244.03 January delta source uncertain.** Diagnostic confirmed quota correctness + filter correctness + merge order correctness. Carrying forward; needs per-entity reconciliation data to localize.
3. **Piecewise segment boundary defect identified but not fixed in HF-237.** Executor at `intent-executor.ts:572` ignores `maxInclusive` on segments; ratios in (0.9999, 1.0) and (1.1999, 1.2) gaps pay $0. Narrow gaps unlikely to affect production volume but a real defensive-correctness defect. Separate HF candidate.

## Next steps

CC halts at PR creation. Architect:

1. **Re-import the District Override Plan PDF** via the UI / `execute-bulk` path. Pre-HF-237 stored `calculationIntent` will be replaced by the LLM's regenerated emission using the corrected prompt.
2. **Verify Plan 4 entity output is non-zero** after re-import + calculation. Plan 4's resolution depends on Plan 1's `equipment_revenue` derivation existing — if Plan 1 still has zero derivations, Plan 4 will still pay $0 but for a different reason (D3 unclosed).
3. **Investigate Plan 2 $3,244.03 delta** with per-entity reconciliation against the plan reference.
4. **Disposition separate HFs** for D3 (Pass 5 emission reliability) and the piecewise segment-boundary maxInclusive defect.

After Plan 4 closes via prompt correction + Plan 1 derivation production, the CRP reconciliation against $566,728.97 pre-clawback can advance.
