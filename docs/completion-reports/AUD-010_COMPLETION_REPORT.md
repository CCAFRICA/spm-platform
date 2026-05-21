# AUD-010 — Full Pipeline Trace: Completion Report

## Date
2026-05-19

## PR
https://github.com/CCAFRICA/spm-platform/pull/417 (open; branch `aud-010-full-pipeline-trace`).

## Commit

| Hash | Description |
|---|---|
| `77454cf8` | AUD-010: Full pipeline trace (convergence → intent → execution) at 9c5147e4 |
| (this commit) | AUD-010: completion report per Rule 25 |

## Files created

| Path | Lines | Purpose |
|---|---|---|
| `docs/audits/AUD-010_FULL_PIPELINE_TRACE_9c5147e4.md` | 1053 | Single audit trace document. Five stages plus CRP-specific Plan 2 / Plan 4 traces plus path-level findings. Every sub-question carries verbatim code paste at cited line numbers in the production HEAD `9c5147e4`. |
| `docs/completion-reports/AUD-010_COMPLETION_REPORT.md` | (this file) | Rule 25 / Rule 26 report. |

No source files modified. Read-only audit per directive §0.

## Stage summary

| Stage | Scope | Key finding |
|---|---|---|
| **Stage 1 — Convergence pipeline** (`convergence-service.ts`) | Entry point, pass sequence, filter production, role binding, output shape, the spurious `actual → unit_price` binding | 5 operative passes identified. **Filters produced exclusively in Pass 5** (`generateAISemanticDerivations`) post-HF-234; binding-attached filters at Call 1 now always `[]` (defensive parsing retained). **HF-222 distribution-distinct fallback** at `convergence-service.ts:2360-2391` is the origin of the spurious `actual → unit_price` binding — fires when AI did not map the role AND `distinctEnoughToBind` returns true on the remaining candidate scores; binding written with `match_pass: 3, confidence ≈ 0.263`. |
| **Stage 2 — Intent transformation** (`intent-transformer.ts`, `ai-plan-interpreter.ts`, `intent-types.ts`) | `transformFromMetadata`, PiecewiseLinearOp shape, ConditionalGateOp shape, ScopeAggregateOp existence, `convertComponent` | `transformComponent` dispatches all primitives through `transformFromMetadata` (single-arm switch). `PiecewiseLinearOp` shape: `ratioInput` + `baseInput` + optional `targetValue` + `segments` (no `actual` field — the executor reads by metric name, not role). **No standalone `ScopeAggregateOp` interface** exists — `scope_aggregate` is an `IntentSource` only (`intent-types.ts:37-41`); plans using it must wrap in `scalar_multiply { input.source: 'scope_aggregate' }` per `primitive-registry.ts:41`. |
| **Stage 3 — Data resolution at calc time** (`api/calculation/run/route.ts`) | `usedConvergenceBindings` fork, `resolveMetricsFromConvergenceBindings`, scope aggregate, OB-186 cross-plan resolution | **Sheet-matching fallback retired at HF-220 R1** (`route.ts:2191-2227`). Current code: `usedConvergenceBindings ? convergence_bindings : metrics={}` (component → $0). "Sheet-matching (fallback)" log line preserved but now reports the zero-fallback path. Scope-aggregation at `route.ts:2345-2397` correctly iterates sibling entities by `entityMetadata.district`/`region`; excludes the current entity from its own scope sum (line 2363). OB-186 cross-plan resolution (`route.ts:318-337`) fires when `metricDerivations.length === 0` and pulls all sibling plans' derivations. |
| **Stage 4 — Primitive execution** (`intent-executor.ts`) | Dispatch table, `resolveSource`/`resolveValue`, PiecewiseLinear/ConditionalGate/LinearFunction evaluation | 11 dispatch cases at `executeOperation:506-528`. `resolveSource` handles 8 source types including `ratio` (HF-187 confirmed shipped at line 94), `aggregate`, `cross_data`, `scope_aggregate`. `executePiecewiseLinear:549-580` carries OB-186 `targetValue` fallback (`ratio = baseValue / targetValue` when denominator missing). `executeConditionalGate:326-348` resolves `condition.left`/`condition.right` via `resolveSource` (not `resolveValue` — leaves cannot be nested ops). `executeLinearFunction:534-543` is the Plan 1 reference: `y = inputValue × slope + intercept`. |
| **Stage 5 — CRP-specific traces** | Plan 2 (Consumables piecewise_linear) and Plan 4 (District Override scope_aggregate) end-to-end traces | **Plan 2 $3,244.03 January delta** consistent with unfiltered numerator (DIAG-049 snapshot showed `filters=[]` on metric_derivations); should close post-HF-236 if Pass 5 emits the categorical filter consistently. The spurious `actual → unit_price` binding does NOT affect Plan 2's commission because the piecewise executor reads by metric name (`consumable_revenue`, `monthly_quota`), not by `actual` role. **Plan 4 every-entity $0** has three distinct failure surfaces enumerated: (a) `entityMetadata.district` null/undefined → `aggregateScopeRows` never invoked; (b) intent doesn't reference `scope_aggregate` source inside `scalar_multiply`; (c) cross-plan derivation metric-name keys don't match Plan 4's intent's metric-name reads. Audit cannot identify which is operative without live Plan-4 `calculationIntent` JSON + sample DM entity metadata. |

## Standing rule compliance

- **Rule 1 (commit + push each phase):** PASS — single audit commit (`77454cf8`) plus this completion-report commit; both pushed to `aud-010-full-pipeline-trace`.
- **Rule 6 (report in standard path):** PASS — `docs/completion-reports/AUD-010_COMPLETION_REPORT.md`.
- **Rule 18 (criteria verbatim):** PASS — every Stage 1-4 sub-question in the audit document quotes the directive §2-§5 paste-evidence requirements verbatim, with code citations at the exact line numbers in the production HEAD `9c5147e4`.
- **Rule 27 (evidence = paste, not describe):** PASS — every claim in the audit document is backed by verbatim code paste with file path and line numbers. Where the audit reasons (Stage 5 traces), the reasoning is structured around the pasted code, not in lieu of it.
- **Rule 41 (read actual code before acting):** PASS — every file in the directive's §2-§6 scope was opened and read at HEAD `9c5147e4` before any finding was written. No content was inferred from memory of prior session work or prior audits.

## Known issues

- **Directive specified path `web/src/app/api/calculate/run/route.ts`** (`calculate/`). Actual path is `web/src/app/api/calculation/run/route.ts` (`calculation/`). The audit document cites the actual path throughout; the discrepancy is noted in the audit doc's Phase 0 section.
- **Direct push to main was rejected** by branch protection (`Changes must be made through a pull request`). The audit commit was rebased onto a feature branch (`aud-010-full-pipeline-trace`) and PR #417 was opened. The directive's §7 told CC to `git push origin main`; CC adapted to the repo's PR convention, consistent with all prior CCAFRICA/spm-platform diagnostic + HF dispatches (PRs #413, #415, #416 all routed through PR per same branch-protection rule). The audit content and structure are unchanged by the path adaptation.
- **No other deviations.** All five stages were completed against HEAD `9c5147e4` per directive scope. Read-only invariant held — no source files in `web/src/` modified. The audit doc itself is the only new artifact in `web/` namespace (it's in `docs/`, not `web/`).

## Architect dispositions (no next steps from CC)

Per directive §7, the audit halts at trace + commit. No follow-on HF/OB/IRA dispatch proposed.

Open architectural questions surfaced (carried over from audit doc's "Open questions" section) for architect channel:

1. Does Plan 4's `calculationIntent` reference `scope_aggregate` as a source inside a `scalar_multiply`, or some other shape? Determines which of Stage 5B's three trigger surfaces is operative.
2. Do the CRP entity rows for District Managers carry `metadata.district` populated post-HF-236 re-import? Affects whether `aggregateScopeRows` fires at all for the DM.
3. After HF-236 + fresh-LLM HC re-emission on CRP, does Pass 5 reliably emit `filters` on revenue / count derivations across re-imports (idempotency over LLM noise)? Determines whether HF-236 closes Plans 1-3 reconciliation.

Architect reads the full trace document in architect channel via VG / VP commit `77454cf8` and dispositions whether to escalate to IRA, draft an HF, or capture observations to substrate.
