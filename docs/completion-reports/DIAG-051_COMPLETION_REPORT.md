# DIAG-051 — Completion Report

## Date
2026-05-19

## PR
To be opened at end of this push (branch `diag-051-crp-plan2-plan4`).

## Commits

| Hash | Description |
|---|---|
| (Phase 0) | branch creation only — no commit |
| (this section's commit) | DIAG-051: CRP Plan 2 + Plan 4 failure surface diagnostic |
| (next commit) | DIAG-051: completion report per Rule 25 |

The diagnostic document + the two throwaway probe scripts go in the first commit; this completion report goes in the second commit.

## Files created

| Path | Lines | Purpose |
|---|---|---|
| `docs/diagnostics/DIAG-051_CRP_PLAN2_PLAN4_FAILURE_SURFACE_20260519.md` | 200 | Full diagnostic document. Six probes (1A/1B/1C + 2A/2B/2C), verbatim code + DB output paste, defect disambiguation table for Plan 4. |
| `web/scripts/diag051-probe1-plan2.ts` | 47 | Read-only probe of `rule_sets` for Plan 2 (`Consumables Commission Plan`). Dumps `input_bindings.metric_derivations` + `input_bindings.convergence_bindings` + observable column inventory. |
| `web/scripts/diag051-probe2-plan4.ts` | 80 | Read-only probe of Plan 4 (`District Override Plan`) `components` + `input_bindings`; entity table query for DM-candidate metadata; cross-plan derivation harvest. |
| `docs/completion-reports/DIAG-051_COMPLETION_REPORT.md` | (this file) | Rule 25 / Rule 26 report. |

No source files in `web/src/` modified. Read-only diagnostic.

## Probe results summary

| Probe | Question | Finding |
|---|---|---|
| **1A** | Does `applyMetricDerivations` apply the `filters` array from each rule? | **YES.** `run-calculation.ts:153` (`if (!rowMatchesFilters(rd, rule.filters)) continue;`) gates each row inclusion on the rule's filter array. Empty/missing filters short-circuit to `true` per `rowMatchesFilters:103` ("`if (!filters || filters.length === 0) return true;`"). The merge order at `route.ts:2301-2303` overlays derivation-derived values onto binding-derived values for identical metric keys ("derivation outputs overlay so a derivation rule for a given metric name takes precedence"). |
| **1B** | Does CRP Plan 2's live `input_bindings.metric_derivations` carry the `product_category=Consumables` filter? | **YES.** Live `metric_derivations[0]`: `{metric: 'consumable_revenue', operation: 'sum', source_field: 'total_amount', filters: [{field: 'product_category', operator: 'eq', value: 'Consumables'}], source_pattern: 'transaction'}`. The filter is structurally correct and operatively applied. |
| **1C** | Are `convergence_bindings.numerator` filters also populated? | **NO** (and irrelevant to outcome). Plan 2's `convergence_bindings.component_0.numerator.filters = []`. The binding path resolves `consumable_revenue` to an unfiltered `total_amount` sum, but this value is OVERWRITTEN by the derivation overlay at `route.ts:2301-2303` before the executor reads it. Plan 2's $3,244.03 January delta is **not** explained by a missing filter at this layer. |
| **2A** | What is Plan 4's `calculationIntent` shape? | **`scalar_multiply` with `input.source: 'aggregate'`** (NOT `scope_aggregate`), with `sourceSpec: {metric: 'equipment_revenue', function: 'sum'}` (NOT `{field, aggregation, scope}`). Two compounding defects: (D1) wrong source discriminator routes to `intent-executor.ts:113` aggregate case instead of :159 scope_aggregate case; (D2) non-canonical sourceSpec keys (`metric` instead of `field`, `function` instead of `aggregation`) — the aggregate case at `intent-executor.ts:118` reads `src.sourceSpec?.field`, gets `undefined`, coerces to `''`, returns `data.metrics[''] = 0`. Result: every entity's component returns `0 × 0.015 = $0`. |
| **2B** | Do CRP DM entities carry `metadata.district`? | **YES** for all 4 DMs (`CRP-6003`/`-6004`/`-6005`/`-6006`) and `metadata.region` for both VPs (`CRP-6001`/`-6002`). The scope-aggregation pre-computation at `route.ts:2345-2397` WOULD compute correctly if invoked. **AUD-010 §5B hypothesis 1 (DISPROVED).** |
| **2C** | Do sibling plans' `metric_derivations` provide an `equipment_revenue` metric? | **NO.** Probe enumerates all 4 CRP plans: Consumables has 2 derivations (`consumable_revenue`, `monthly_quota`); Capital Equipment, Cross-Sell, and District Override each have **zero** derivations. Plan 4's OB-186 cross-plan resolution harvests Plan 2's 2 derivations — `equipment_revenue` is not among them. Even if D1 + D2 were corrected, Plan 4's executor lookup of `equipment_revenue` would still miss. **AUD-010 §5B hypothesis 3 (CONFIRMED as secondary defect).** Plan 1 carrying zero `metric_derivations` is itself a separate finding worth architect attention. |

## Standing rule compliance

- **Rule 1 (commit + push each phase):** PASS — diagnostic commit + completion-report commit; both pushed to `diag-051-crp-plan2-plan4` before PR creation.
- **Rule 6 (report in standard path):** PASS — `docs/completion-reports/DIAG-051_COMPLETION_REPORT.md`.
- **Rule 18 (criteria verbatim):** PASS — each probe in the diagnostic document quotes the §2/§3 paste-evidence requirements verbatim; the disambiguation table cites AUD-010 §5B's three hypotheses by their exact names.
- **Rule 27 (evidence = paste, not describe):** PASS — every Probe 1 / Probe 2 finding is backed by verbatim code paste (with file path + line numbers) or verbatim probe-script JSON output. The defect-disambiguation table at Probe 2D refers only to evidence already pasted in the preceding probes; no new claims introduced at synthesis layer.
- **Rule 41 (read actual code before acting):** PASS — `applyMetricDerivations`, `rowMatchesFilters`, the engine's metric-merge order, and `intent-executor.ts:113-167` resolveSource branches were all opened and read at HEAD `1f54ad57` before any finding was authored. Live DB state was queried via service-role Supabase client; no values inferred from prior session memory.

## Known issues

None. The directive's `§3` probe 1B query string used `single()` against `name=Consumables Commission Plan` and worked first-attempt — same for Plan 4 in `§3` probe 2A. The 2B query for entities used the `external_id` IN-list as specified and worked. No path corrections or schema adaptations needed (in contrast to AUD-010's `calculate/` vs `calculation/` typo).

## Architect dispositions (no CC next steps)

Per directive §4, CC halts at trace + completion-report commit + PR creation. No follow-on HF/OB/IRA dispatch proposed.

Open architectural questions surfaced (carried to architect channel):

1. **Plan 2's $3,244.03 January delta** has a non-filter origin. Candidates: denominator (`monthly_quota`) sourcing, piecewise segment boundaries/rates, Decimal precision at executor output boundary, `targetValue` fallback at `intent-executor.ts:561`. Diagnostic out of scope.
2. **Plan 4's three-defect closure path.** D1 (intent `aggregate` → `scope_aggregate`) is a plan-agent emission shape correction. D2 (sourceSpec key names) is also plan-agent. D3 (`equipment_revenue` missing from any plan's `metric_derivations`) implicates Plan 1 having zero derivations — which raises the question of how Plan 1 reconciles today (per AUD-010, Plan 1 is the "reference"). Architect dispositions whether Plan 1's reconciliation is empirically clean or is itself benefiting from a different code path (e.g., binding-direct read with a filter on the binding entry).
3. **Plan 1 / Plan 3 zero derivations.** All three non-Consumables plans carry zero `metric_derivations`. The expectation from AUD-010's analysis was that Pass 5 of convergence would produce filtered derivations for each plan's principal revenue / count metric. The live state shows it has not, for three of four plans, even after the HF-236 + post-HF-235 fresh-LLM HC paths. This implicates Pass 5's non-determinism or a gate that prevents the AI from emitting derivations when the binding path alone is sufficient.
