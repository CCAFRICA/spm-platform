# OB-237 RESIDUAL: WRITE-TIME ROLLUP MATERIALIZATION — STAFF + PATTERNS

**File:** `docs/vp-prompts/OB-237_ROLLUP_MATERIALIZATION_DIRECTIVE_20260624.md`
**Branch:** `ob-237-materialized-serving-path` (continue)
**Mode:** ULTRACODE `/effort`
**Standing rules:** `CC_STANDING_ARCHITECTURE_RULES.md` — all active. FP-49 applies. Korean Test applies (no domain/language-specific column names). Commit + push after every change. Git from repo root.
**Predecessor:** OB-237 T-PROOF complete. All 10 Financial modes materialized. `fetchRawDataServer` deleted. Staff and patterns read `summary_artifacts_fine` (88,459 rows) and JS-reduce the result — MSP-compliant (no raw path) but ~19s because 88K rows of JSONB fetched and reduced in JavaScript. This is the same disease at a smaller scale.

---

## THE PRINCIPLE (already proven — apply it one more time)

`summary_artifacts` is to `committed_data` what the staff/patterns rollup is to `summary_artifacts_fine`. The Summary Engine already writes two materialization tiers at import time. Extend it to write two more — pre-aggregated at the grain each surface actually reads. The surface reads a small filtered set. No JS reduce over 88K rows. No RPC. No SQL aggregation at query time. Pre-computed, stored, served.

---

## OBJECTIVE

Extend the Summary Engine's write-time materialization to produce two additional rollup tiers from the fine table's data:

**Staff rollup** — one row per (tenant, sub_entity) carrying the pre-aggregated totals across all entities, all dates, all hours. For Sabor: ~40 rows (one per server). The staff surface reads ~40 rows instead of 88,459.

**Patterns rollup** — one row per (tenant, entity, day_of_week, hour) carrying the pre-aggregated heatmap cell. For Sabor: 20 entities × 7 days × ~16 active hours ≈ ~2,240 rows. The patterns surface reads ~2,240 rows instead of 88,459.

Both are computed from the same base data the fine table already carries. The Summary Engine's import-time materializer (the same code path that writes `summary_artifacts` and `summary_artifacts_fine`) also writes these rollups. One trigger, three tiers, same data.

---

## CONSTRAINTS

- **Write-time, not read-time.** The rollup is pre-computed when the Summary Engine fires (import time or re-materialization). No SQL SUM at query time. No RPC. No JS reduce. The surface reads pre-computed rows.
- **Korean Test.** Any new columns or storage keys use structural vocabulary (`sub_entity_id`, `day_of_week`, `hour`) — never domain or language-specific terms.
- **Value-match.** Staff rollup: SUM(metrics.total) across all staff rollup rows must equal the deterministic truth ($100,068,158.15 minus cancelled rows if staff excludes cancelled, or $99,555,426.88 as verified in T-PROOF). Patterns rollup: SUM across all heatmap cells must equal the same total. Both must match what the current 88K-row JS reduce produces — same data, same answer, fewer rows.
- **No regression.** The 8 previously-wired modes (network_pulse, timeline, summary, performance, products, leakage, location_detail, server_detail) must continue to return identical results. The Summary Engine extension must not alter the existing `summary_artifacts` or `summary_artifacts_fine` rows.
- **Storage:** CC determines the cleanest storage — additional rows in `summary_artifacts_fine` with a grain marker, rows in `summary_artifacts` at a different grain, or a lightweight structure CC creates via service-role client. The constraint is: the surface reads a small set of pre-computed rows at a grain that matches its display, not 88K rows at a grain finer than it needs.
- **The materializer is idempotent.** Re-running produces identical rollups. Delete + rebuild, same as the existing tiers.

---

## PROOF GATES

**PG-STAFF-ROLLUP:** Staff rollup rows exist for Sabor. Row count reported (~40). SUM(metrics.total) matches the staff surface's current JS-reduce output exactly.

**PG-PATTERNS-ROLLUP:** Patterns rollup rows exist for Sabor. Row count reported (~2,240). SUM(metrics.total) matches the patterns surface's current JS-reduce output exactly.

**PG-STAFF-TIMING:** Staff surface before (from PG-BASELINE: 55,423ms cold / ~19s warm) and after timing captured. Target: under 3 seconds. Both values + multiplier reported.

**PG-PATTERNS-TIMING:** Patterns surface before (~19s) and after timing captured. Target: under 3 seconds. Both values + multiplier reported.

**PG-STAFF-WIRED:** Staff mode reads the rollup rows, not the 88K fine table. The 88K-row fetch + JS reduce for staff is deleted. AP-17: single code path.

**PG-PATTERNS-WIRED:** Same for patterns.

**PG-REGRESS:** All 8 previously-wired modes return identical results. Spot-check network_pulse ($100,068,158.15) and timeline grand totals unchanged.

**PG-BUILD:** `npm run build` exits 0.

---

## HALT CONDITIONS

| ID | Trigger | Action |
|---|---|---|
| HALT-ROLLUP-MATCH | Rollup SUM ≠ current JS-reduce output | Report both values. Do not wire the surface. |
| HALT-REGRESSION | Any previously-wired mode changes output | `git revert` (SR-41). Report. |
| HALT-BUILD | `npm run build` fails | Fix or revert. |

---

## COMPLETION

Update `docs/completion-reports/OB-237_COMPLETION_REPORT.md` with:
1. Rollup materialization design (how stored, how triggered, row counts).
2. PG-STAFF-ROLLUP and PG-PATTERNS-ROLLUP evidence (row counts + truth-match values).
3. Before/after timing table for staff and patterns (the final two rows in the OB-237 empirical table).
4. Regression check evidence.
5. Updated statement: **"Zero residuals. Every aggregate visualization serves from a pre-computed materialization at its display grain. Zero JS reduces over multi-thousand-row fetches remain."**

Commit + push. Update PR #598. Do NOT merge (SR-44).

---

## SCOPE

**IN:** Summary Engine extension for staff and patterns rollup tiers. Wiring those two modes to the rollups. Deleting the 88K-row fine-table fetch + JS reduce for those modes.
**OUT:** Everything else. The other 8 modes are done. Intelligence/Compensation is done. No new tables requiring architect migration. No RPCs.

---

*OB-237 Residual · ULTRACODE · Write-time rollup · Same principle, last two modes.*
*The file IS the prompt. Ends here.*
