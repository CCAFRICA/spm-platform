# OB-237 T1 CONTINUATION: WIRE REMAINING 4 MODES

**Branch:** `ob-237-materialized-serving-path` (continue)
**Predecessor:** Timeline wired and value-matched ($100,068,158.15 / 263,250 / $12,746,075.01 = deterministic truth). network_pulse re-fixed. Pattern proven.
**Standing rules:** All active. Commit + push after every change. Build clean before completion report. Git from repo root.

---

## CONTEXT (do not re-discover)

The proven procedure (timeline conversion) is:

1. Build `aggregate<Mode>FromSummaries` reading `summary_artifacts` with `field_name` measure resolution (NOT `display_label` — the re-key correction from the timeline conversion).
2. Wire as summary-primary early-return in the mode's handler block.
3. Value-match grand totals against deterministic truth ($100,068,158.15 revenue / 263,250 checks / $12,746,075.01 tips).
4. Delete raw aggregate path (AP-17).
5. `npm run build` — must exit 0.
6. Commit + push.

Deterministic truth is established. `recognize()` measure resolution via `field_name` is proven. `getSummaryArtifacts` call pattern is proven. Repeat for each mode.

---

## EXECUTE: 4 MODES, ONE AT A TIME

### Mode order: `summary` → `location_detail` → `performance` → `leakage`

For each mode, execute the full procedure (build → wire → value-match → delete raw → build clean → commit) completely before starting the next.

**Per-mode specifics CC must determine from reading the raw-path handler:**

- **`summary`**: groups by brand. The summary-path groups `summary_artifacts` by entity → brand (from `entities` or the summary's entity metadata). Grand totals must match truth.
- **`location_detail`**: scopes to one entity (location). The summary-path filters `summary_artifacts` by `entity_id`. Grand totals for that entity must be internally consistent (sum of daily = entity total).
- **`performance`**: per-location comparison (revenue, tips, food, bev, discounts, comps + weekly buckets + brand benchmarks). The summary-path groups by entity and computes per-entity metrics from `summary_artifacts.metrics`. Grand total across all entities must match truth.
- **`leakage`**: discount/comp/cancellation metrics. May need `recognize()` to resolve `discount`, `comp`, `cancel` measure keys. **If a required measure key does not resolve (HALT-RECOGNIZE):** report which key failed, skip this mode, commit the other 3, and report the missing binding as a residual. Do NOT fabricate a binding.

### HALT conditions (same as the unblock directive)

| ID | Trigger | Action |
|---|---|---|
| HALT-BYTEMATCH | Grand totals from summary path ≠ deterministic truth (± $0.01) | Stop that mode. Report values. Continue other modes. |
| HALT-RECOGNIZE | `recognize()` fails to resolve a measure key for a mode | Stop that mode. Report which key. Continue other modes. |
| HALT-REGRESSION | A previously-wired mode or coverage-gap mode breaks | `git revert` (SR-41). Report. |
| HALT-BUILD | `npm run build` fails | Fix or revert. |

---

## AFTER ALL 4 (or as many as pass): COMPLETION

### Empirical performance table

Compile the full before/after table including timeline + all newly wired modes:

| Mode | Raw baseline (ms) | Summary (ms) | Speedup | Truth-match |
|---|---|---|---|---|
| network_pulse | (P0: 3,277 already wired) | (current) | — | PASS |
| timeline | 58,633 | 1,366 | 43× | PASS |
| summary | (capture before wire) | (after wire) | ×? | PASS/FAIL |
| location_detail | ... | ... | ×? | PASS/FAIL |
| performance | ... | ... | ×? | PASS/FAIL |
| leakage | ... | ... | ×? | PASS/FAIL |

### Regression check

Load all Financial pages on `localhost:3000` for Sabor:
1. `/financial` (Network Pulse) — non-zero revenue
2. `/financial/timeline` — multi-period chart with data
3. `/financial/performance` — location benchmarks table
4. `/financial/leakage` — leakage metrics
5. `/financial/staff` — still renders via raw path (NOT converted, coverage-gap)

Paste dev server log with response times.

### Zero-raw-path verification

```bash
echo "=== Remaining raw aggregate reads in financial route ==="
grep -n "aggregateTimeline\b\|aggregateSummary\b\|aggregateLocationDetail\b\|aggregatePerformance\b\|aggregateLeakage\b" web/src/app/api/financial/data/route.ts
echo "(should be zero — all replaced by FromSummaries versions)"
```

### Update completion report

Update `docs/completion-reports/OB-237_COMPLETION_REPORT.md` with:
1. Per-mode commits (SHA + message)
2. Full empirical performance table
3. Truth-match evidence per mode
4. Regression check evidence
5. Zero-raw-path grep output
6. Any HALT-RECOGNIZE residuals (leakage bindings)

Commit + push. Update PR #598. Do NOT merge (SR-44).

---

## SCOPE — HARD LIMITS (unchanged)

IN SCOPE: 4 remaining wirable modes in `route.ts`.
OUT OF SCOPE: coverage-gap modes, Intelligence/Compensation, migrations, any file outside `route.ts` unless strictly required.
