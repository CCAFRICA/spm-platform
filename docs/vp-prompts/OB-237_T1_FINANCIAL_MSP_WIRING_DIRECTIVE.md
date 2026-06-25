# OB-237 T1: FINANCIAL MSP WIRING — MIGRATION-FREE MODES

**Branch:** `ob-237-materialized-serving-path` (continue — do NOT create a new branch)
**Predecessor:** OB-237 P0 is complete. Read `docs/diagnostics/OB-237_MSP_APPLICATION_MAP.md` and `docs/completion-reports/OB-237_COMPLETION_REPORT.md` in their entirety before proceeding. P0's findings are authoritative.
**Standing rules:** `CC_STANDING_ARCHITECTURE_RULES.md` — read in full. AP-17 (single code path), AP-21 (single data source), SR-34 (no workaround), Rules 25–28 (completion report). Commit + push after every change. Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000` before completion report. Git from repo root (`spm-platform`), NOT `web/`.

---

## CONTEXT (do not re-discover — P0 is done)

P0 established three facts:

1. The Financial materialization is `summary_artifacts` (NOT `financial_summary_daily` — that table does not exist). Sabor has 2,520 rows. Grained at (entity, day) with `metrics` JSONB carrying every numeric field.
2. `network_pulse` mode is already wired to `summary_artifacts` via `aggregateNetworkPulseFromSummaries` (route.ts, near line 327 and the early-return block near lines 1415–1424). This is the template for all other modes.
3. Five modes are RAW and wirable to `summary_artifacts` without migration: `timeline`, `summary`, `location_detail`, `performance`, `leakage` (location-level). Four modes have coverage gaps (staff, server_detail, patterns, products) — those are OUT OF SCOPE for this directive.

The single file in scope is `web/src/app/api/financial/data/route.ts`. No other file is modified.

---

## PHASE 1: UNDERSTAND THE TEMPLATE

Read the existing `network_pulse` wired path end-to-end. Understand:

1. How `getSummaryArtifacts(sb, tenant, {dataType:'pos_cheque'})` fetches the summary rows.
2. How `recognize()` resolves measure keys from the summary's `metrics` JSONB to the semantic roles the mode needs (revenue, tips, discounts, etc.) — this is the HF-337 Surface Binding Recognition path.
3. How the early-return block (near lines 1415–1424) checks for summary availability and returns the summary-derived result, falling back to raw only when summaries don't exist.
4. How `aggregateNetworkPulseFromSummaries` groups and rolls up the summary rows into the response shape the page expects.

Do NOT modify anything in this phase. Commit nothing. This is comprehension.

---

## PHASE 2: WIRE EACH MODE (one at a time, byte-matched)

For each of the five modes below, execute this sequence **completely** before moving to the next mode. Do not batch — each mode is independently byte-matched and committed.

**Modes in order:** `timeline` → `summary` → `location_detail` → `performance` → `leakage`

### Per-mode procedure:

**Step A — Capture old-path output.** Call the route with Sabor's tenant_id (`f7093bcc-e90b-4918-9680-69da7952dd65`) and the mode's default parameters. Save the full JSON response to a temporary file:

```bash
# Example for timeline — adapt mode/params per mode
curl -s -X POST http://localhost:3000/api/financial/data \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"f7093bcc-e90b-4918-9680-69da7952dd65","mode":"timeline"}' \
  > /tmp/ob237_timeline_old.json
echo "Old path captured: $(wc -c < /tmp/ob237_timeline_old.json) bytes"
```

Also record the response time from the dev server log (`POST /api/financial/data 200 in Xms`).

**Step B — Build the summary-read path for this mode.** Mirror the `network_pulse` pattern:

1. Create a function `aggregate<Mode>FromSummaries` that takes the summary rows and produces the same response shape as the existing raw-path aggregation for this mode. The summary rows carry `metrics` JSONB with every numeric field per (entity, day). The function groups/rolls up by whatever dimension this mode needs (date for timeline, brand for summary, entity for location_detail, etc.).
2. In the mode's handler block, add an early-return that calls `getSummaryArtifacts` → `recognize()` → `aggregate<Mode>FromSummaries` → return. Place it BEFORE the existing raw-path code, matching the network_pulse pattern.
3. The raw path remains as fallback (for now — Step D removes it after byte-match passes).

**Step C — Capture new-path output and byte-match.**

```bash
curl -s -X POST http://localhost:3000/api/financial/data \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"f7093bcc-e90b-4918-9680-69da7952dd65","mode":"timeline"}' \
  > /tmp/ob237_timeline_new.json
echo "New path captured: $(wc -c < /tmp/ob237_timeline_new.json) bytes"

# Compare
diff <(python3 -m json.tool /tmp/ob237_timeline_old.json) \
     <(python3 -m json.tool /tmp/ob237_timeline_new.json)
```

**If diff is empty (byte-match PASS):** proceed to Step D.

**If diff shows differences:** examine. Minor numeric precision differences (floating point) in the 4th+ decimal place are acceptable if the integer/cent values match. Structural differences (missing fields, different array lengths, different keys) are NOT acceptable — **HALT. Do not proceed. Report the diff output verbatim and stop this mode.**

**Step D — Remove the raw fallback for this mode.** Delete the raw-aggregate code path for this mode. After removal, the mode has ONE path: summary-read. This is AP-17 compliance.

**Step E — Verify build + timing.**

```bash
cd ~/spm-platform/web && npm run build
```

Must exit 0. Then restart dev server, re-call the mode, and record the new timing from the dev server log.

**Step F — Commit.**

```bash
cd ~/spm-platform && git add -A && \
git commit -m "OB-237 T1: wire <mode> to summary_artifacts — byte-match verified, raw path removed" && \
git push origin ob-237-materialized-serving-path
```

**Then proceed to the next mode.**

---

## PHASE 3: EMPIRICAL PERFORMANCE TABLE

After all five modes are wired, compile the before/after timing table:

| Mode | Before (ms) | After (ms) | Improvement | Byte-match |
|---|---|---|---|---|
| timeline | (from P0 baseline: 63,684) | (Step E timing) | ×? | PASS/FAIL |
| summary | (Step A timing) | (Step E timing) | ×? | PASS/FAIL |
| location_detail | (Step A timing) | (Step E timing) | ×? | PASS/FAIL |
| performance | (Step A timing) | (Step E timing) | ×? | PASS/FAIL |
| leakage | (Step A timing) | (Step E timing) | ×? | PASS/FAIL |

This table is the headline deliverable.

---

## PHASE 4: REGRESSION CHECK

Load the following Sabor Financial pages on `localhost:3000` and confirm they render with real data (not empty, not error):

1. `/financial` (Network Pulse) — revenue cards, location grid. Must show non-zero revenue.
2. `/financial/timeline` — multi-period chart. Must show data points across periods.
3. `/financial/performance` — location benchmarks table. Must show ranked locations.
4. `/financial/leakage` — leakage summary. Must show metrics.
5. `/financial/staff` — **this mode was NOT converted** (coverage gap, out of scope). Verify it still renders via its existing raw path. If it breaks because of T1 changes, that is a regression — HALT and revert.

Paste the dev server log showing all five page loads with response times.

---

## PHASE 5: COMPLETION REPORT UPDATE + PR

Update `docs/completion-reports/OB-237_COMPLETION_REPORT.md` to include:

1. **T1 commits** — SHA, message, files per commit (one per mode).
2. **Empirical performance table** (Phase 3).
3. **Byte-match evidence** — per mode, file sizes and diff result.
4. **Regression check** — Phase 4 page loads with timings.
5. **Proof gates update:**
   - PG-1 (zero raw aggregate paths for wired modes): run the grep from the directive's T4 section, paste result.
   - PG-2 (Financial sub-second): paste response times. Target: every wired mode under 5 seconds (3.3s is the network_pulse benchmark; under 5s is the acceptance threshold).
   - PG-5 (empirical comparison): the Phase 3 table.
   - PG-6 (build clean): paste last 10 lines of `npm run build`.
   - PG-7 (no regression): Phase 4 evidence.
6. **Updated residuals:**
   - Coverage-gap modes (staff/server_detail/patterns/products) remain RAW — named, not silently dropped.
   - Aggregation-RPC migration (architect) — pending.
   - Finer Financial materialization (architect) — pending.

Commit the updated completion report:

```bash
cd ~/spm-platform && git add -A && \
git commit -m "OB-237 T1: completion report — 5 modes wired, empirical table, regression clean" && \
git push origin ob-237-materialized-serving-path
```

Update the PR description:

```bash
cd ~/spm-platform && gh pr edit 598 \
  --title "OB-237: Materialized Serving Path — P0 discovery + T1 Financial wiring (5 modes)" \
  --body "## OB-237: Materialized Serving Path (MSP)

### P0: Discovery (complete)
- MSP Application Map: every aggregate surface classified
- 3 premise-corrections surfaced and architect-dispositioned
- Baseline timing: timeline 63,684ms (RAW) vs network_pulse 3,277ms (WIRED)
- BCL ground truth verified: \$312,033 exact

### T1: Financial MSP Wiring (this increment)
- 5 modes wired to summary_artifacts: timeline, summary, location_detail, performance, leakage
- Byte-match verified per mode on Sabor
- Raw aggregate paths removed (AP-17: single code path)
- Empirical performance table in completion report

### Out of scope (named residuals)
- Coverage-gap modes (staff/server_detail/patterns/products): need finer materialization (architect)
- Aggregation-RPC migration for O(1) Intelligence/Compensation: architect (SR-44)
- Intelligence/Compensation: MSP invariant already satisfied (P0 finding)

### Proof Gates: 8 (PG-1/2/5/6/7 now closable)
See docs/completion-reports/OB-237_COMPLETION_REPORT.md"
```

**Do NOT merge the PR. SR-44: architect merges.**

---

## SCOPE BOUNDARIES — HARD LIMITS

**IN SCOPE:** The five wirable Financial modes in `route.ts`. Nothing else.

**OUT OF SCOPE — DO NOT TOUCH:**
- Coverage-gap modes (staff, server_detail, patterns, products) — leave their existing raw paths intact.
- `intelligence-data.ts` or any Intelligence surface — already materialization-backed per P0.
- Any Compensation surface — already materialization-backed per P0.
- The calculation engine, import pipeline, SCI, convergence layer.
- Any Supabase migration, RPC creation, or schema change (SR-44).
- `summary_artifacts` write path (OB-229 import-time materialization) — read only.
- Any file outside `web/src/app/api/financial/data/route.ts` unless strictly required for the summary-read wiring (e.g., importing an existing utility). If you must touch another file, name it in the commit message and justify.

---

## HALT CONDITIONS

| ID | Trigger | Action |
|---|---|---|
| HALT-BYTEMATCH | Diff shows structural differences between old-path and new-path output for any mode | Stop that mode. Report the diff verbatim. Do not delete the raw path. Continue other modes. |
| HALT-RECOGNIZE | `recognize()` fails to resolve measure keys for a mode (no semantic binding exists in `summary_artifacts` for the fields this mode needs) | Stop that mode. Report which keys failed. The mode may need new surface bindings (HF-337 class). Continue other modes. |
| HALT-REGRESSION | A coverage-gap mode (staff/patterns/products) that was NOT converted breaks after T1 changes | `git revert` the breaking commit (SR-41). Report the regression. |
| HALT-BUILD | `npm run build` fails after any mode conversion | Fix the build error before proceeding. If unfixable, `git revert` and report. |
