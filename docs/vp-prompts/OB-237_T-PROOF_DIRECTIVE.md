# OB-237 T-PROOF: INTEGRATE + FINAL PROOF — ALL VISUALIZATIONS

**Branch:** `ob-237-materialized-serving-path` (continue — do NOT create a new branch)
**Standing rules:** `CC_STANDING_ARCHITECTURE_RULES.md` — all active. Commit + push after every change. Git from repo root.
**Context:** T-FIN and T-AGG fan-out completed in the working tree. T-AGG succeeded (period rollup built, BCL value-matched to $312,033). T-FIN wrote its changes but hit a structured-output retry cap — the code is in the tree but unverified and uncommitted. One lint error at `route.ts:965` (`let` → `const`) blocks the build.

---

## PHASE 1 — FIX + BUILD

Fix the lint error at `web/src/app/api/financial/data/route.ts:965` — change `let arts` to `const arts`. Then build:

```bash
cd ~/spm-platform/web && npm run build
```

Must exit 0 with zero errors. HALT if it doesn't — do not proceed with a broken build.

---

## PHASE 2 — VERIFY BOTH TRACKS

### T-FIN verification

**2a. Fine table populated:**

Query `summary_artifacts_fine` for Sabor (`f7093bcc-e90b-4918-9680-69da7952dd65`). Report row count.

**2b. Fine table truth-match:**

SUM(`metrics.total`) across all `summary_artifacts_fine` rows for Sabor must equal **$100,068,158.15** (deterministic truth) within $0.01. Paste both values.

**2c. `fetchRawDataServer` deleted:**

```bash
grep -n "fetchRawDataServer" web/src/app/api/financial/data/route.ts
```

Must return zero lines. If it still exists, T-FIN did not complete — HALT and report.

**2d. All raw aggregate functions deleted:**

```bash
grep -n "^async function aggregate[A-Z]" web/src/app/api/financial/data/route.ts | grep -v "FromSummaries\|FromFine"
```

Must return zero lines (only `FromSummaries` / `FromFine` variants remain).

### T-AGG verification

**2e. Period rollup exists for BCL:**

Query the period rollup for BCL (`b1c2d3e4-aaaa-bbbb-cccc-111111111111`). Report: number of period-rollup entries, and the per-period totals. Must match: Oct $44,590, Nov $46,291, Dec $61,986, Jan $47,545, Feb $53,215, Mar $58,406. Grand total $312,033.

**2f. JS reduces removed from intelligence-data.ts:**

```bash
grep -n "\.reduce" web/src/lib/insights/intelligence-data.ts
```

Report the count. Any `.reduce` over multi-row `entity_period_outcomes` fetches is a violation. Per-array reduces within a single row's JSONB (e.g., summing a components array) are acceptable.

---

## PHASE 3 — COMMIT BOTH TRACKS

If all Phase 2 verifications pass:

```bash
cd ~/spm-platform && git add -A && \
git commit -m "OB-237 T-FIN+T-AGG: all Financial modes materialized, fetchRawDataServer deleted, period rollup built, Intelligence/Compensation O(1)" && \
git push origin ob-237-materialized-serving-path
```

---

## PHASE 4 — T-PROOF (the final integration proof)

### PG-FINAL-1: Zero raw aggregate paths (platform-wide)

```bash
echo "=== Financial: fetchRawDataServer or raw aggregate functions ==="
grep -rn "fetchRawDataServer\|^async function aggregate[A-Z]" web/src/app/api/financial/ --include="*.ts" | grep -v "FromSummaries\|FromFine"

echo ""
echo "=== Intelligence: multi-row reduces over entity_period_outcomes ==="
grep -n "\.reduce" web/src/lib/insights/intelligence-data.ts | grep -v "components\|breakdown\|JSONB"

echo ""
echo "=== Cross-agent: serving routes reading committed_data for aggregation ==="
grep -rn "from('committed_data')" web/src/app/api/ --include="*.ts" | grep -v "import\|sci\|calculate\|engine\|cheque\|drill\|explorer\|bounded"

echo ""
echo "Expected: zero lines for each section"
```

Paste full output.

### PG-FINAL-2: Empirical performance table

Compile the complete before/after table. Before-state values come from the P0 baseline and PG-BASELINE captures already in the completion report. After-state values: start the dev server, load each Financial surface for Sabor, record the response time from the dev server log.

| Mode | Before (ms) | After (ms) | Speedup | Truth-match | Phase |
|---|---|---|---|---|---|
| network_pulse | 3,277 | | | ✓ | T1 |
| timeline | 58,633 | 1,366 | 43× | ✓ | T1 |
| summary | ~58,000 | 1,379 | 42× | ✓ | T1 |
| performance | ~58,000 | 1,371 | 42× | ✓ | T1 |
| products | ~58,000 | 1,319 | 44× | ✓ | T1 |
| leakage | 57,669 | 1,569 | 37× | ✓ | P1 |
| staff | 55,423 | (measure) | ×? | (Phase 2b) | T-FIN |
| location_detail | ~58,000 | (measure) | ×? | (Phase 2b) | T-FIN |
| patterns | ~58,000 | (measure) | ×? | (Phase 2b) | T-FIN |
| server_detail | ~58,000 | (measure) | ×? | (Phase 2b) | T-FIN |

Include the Intelligence/Compensation RPC conversion result (before: O(n) JS reduce, after: O(1) rollup read).

### PG-FINAL-3: All surfaces render

Start dev server. Load every visualization surface on `localhost:3000`:

**Financial (Sabor):** `/financial` · `/financial/timeline` · `/financial/performance` · `/financial/leakage` · `/financial/staff`

**Intelligence (BCL):** `/stream` · `/insights` (and any sub-pages accessible)

**Compensation (BCL):** `/perform` · `/perform/statements` or `/my-compensation`

Report: each surface rendered with real data (non-empty, non-error), or name the failure. Paste dev server log lines showing response codes and times.

### PG-FINAL-4: Build clean

```bash
cd ~/spm-platform/web && npm run build
```

Must exit 0. Paste last 5 lines.

### PG-FINAL-5: MSP Application Map complete

Update `docs/diagnostics/OB-237_MSP_APPLICATION_MAP.md` — every surface classified WIRED or BOUNDED. Zero RAW entries remain.

---

## PHASE 5 — COMPLETION REPORT + PR

Update `docs/completion-reports/OB-237_COMPLETION_REPORT.md` with:

1. All commits across all phases (P0 through T-PROOF) with SHAs.
2. The full empirical performance table (PG-FINAL-2).
3. All Phase 2 verification evidence (fine table truth-match, raw-path greps, period rollup values).
4. All T-PROOF proof gates (PG-FINAL-1 through PG-FINAL-5) with pasted evidence.
5. The statement: **"Zero residuals. Every aggregate visualization serves from a materialization. `fetchRawDataServer` deleted. Zero raw aggregate paths remain platform-wide."**

Commit:

```bash
cd ~/spm-platform && git add -A && \
git commit -m "OB-237 T-PROOF: final integration proof — all visualizations MSP-compliant, zero raw paths" && \
git push origin ob-237-materialized-serving-path
```

Update PR #598:

```bash
cd ~/spm-platform && gh pr edit 598 \
  --title "OB-237: Materialized Serving Path — all visualizations, all agents, zero raw paths" \
  --body "## OB-237: Materialized Serving Path (MSP) — COMPLETE

### Delivered
Every aggregate visualization across Financial, Intelligence, and Compensation
now serves from a pre-computed materialization. fetchRawDataServer deleted.
Zero raw aggregate paths remain platform-wide.

### Financial Agent (10 modes)
All wired to summary_artifacts / summary_artifacts_fine. Value-matched to
deterministic truth (\$100,068,158.15). Raw paths deleted (AP-17).
Headline: timeline 58.6s → 1.4s (43×).

### Intelligence Agent
Period-level rollup materialization built (write-time, lifecycle-triggered).
getPeriodTotal/getComponentTotals read one row. O(n) JS reduces deleted.
Value-matched to BCL \$312,033.

### Compensation Agent
Same period rollup. Per-entity reads preserved (O(1), indexed).
Aggregate dashboard paths read rollup row.

### Empirical performance table in completion report.
### Proof gates: PG-FINAL-1 through PG-FINAL-5 all PASS.
See docs/completion-reports/OB-237_COMPLETION_REPORT.md"
```

Do NOT merge PR (SR-44).
