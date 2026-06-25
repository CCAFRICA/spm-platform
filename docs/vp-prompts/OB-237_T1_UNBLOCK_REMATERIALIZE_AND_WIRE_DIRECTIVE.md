# OB-237 T1 UNBLOCK: RE-MATERIALIZE + WIRE

**Branch:** `ob-237-materialized-serving-path` (continue)
**Predecessor:** OB-237 T1 HALT-BYTEMATCH. The summary is stale — re-materialize, then wire.
**Standing rules:** `CC_STANDING_ARCHITECTURE_RULES.md` — all active. Commit + push after every change. Build clean before completion report. Git from repo root.

---

## ARCHITECT DISPOSITIONS (binding)

1. **Re-materializing `summary_artifacts` is NOT an SR-44 migration.** It is a data operation via the service role key — the same pattern as writing to `committed_data`, `calculation_results`, or `entities`. CC executes this.
2. **The raw path is non-deterministic (no ORDER BY) and its output ($102.75M) is WRONG.** The byte-match must compare summary output against a **deterministic SQL aggregate of `committed_data`** (the source of truth), NOT against the raw-path served response. The raw path is the buggy one. After T1 proves the summary matches truth, the raw path is deleted and the bug dies with it.
3. **The raw-path ORDER BY fix is a separate HF.** Do NOT fix it in this OB. It dies when the raw path is deleted.

---

## PHASE 0: RE-MATERIALIZE SUMMARY_ARTIFACTS FOR SABOR

### Step 1 — Locate the Summary Engine

Find the OB-229 Summary Engine — the function that computes `summary_artifacts` from `committed_data` at import time. It uses `jsonb_each` + `jsonb_typeof = 'number'` domain-agnostic aggregation to produce per-(entity, day) summary rows with `metrics` JSONB carrying every numeric field.

```bash
echo "=== Locate Summary Engine ==="
grep -rn "summary_artifacts\|computeSummary\|buildSummary\|aggregateSummary\|SummaryEngine\|import.*summary\|summary.*import" web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next" | head -30

echo ""
echo "=== The import-time hook that fires the engine ==="
grep -rn "summary_artifacts" web/src/app/api/import/ --include="*.ts" | head -10

echo ""
echo "=== The aggregation function itself ==="
grep -rn "jsonb_each\|jsonb_typeof\|financial_summary\|summary_artifacts.*insert\|summary_artifacts.*upsert" web/src/ --include="*.ts" | grep -v node_modules | head -20
```

Read the function end-to-end. Understand its inputs (tenant_id, committed_data rows) and outputs (summary_artifacts rows with entity, date, metrics JSONB).

### Step 2 — Delete stale summaries

```bash
cd ~/spm-platform/web && npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';
  const { count: before } = await sb.from('summary_artifacts').select('*', { count: 'exact', head: true }).eq('tenant_id', SABOR);
  console.log('Sabor summary_artifacts BEFORE delete: ' + before);
  const { error } = await sb.from('summary_artifacts').delete().eq('tenant_id', SABOR);
  if (error) { console.error('Delete failed:', error.message); return; }
  const { count: after } = await sb.from('summary_artifacts').select('*', { count: 'exact', head: true }).eq('tenant_id', SABOR);
  console.log('Sabor summary_artifacts AFTER delete: ' + after + ' (should be 0)');
}
run();
"
```

Paste output. Must show 0 rows after delete.

### Step 3 — Re-run the Summary Engine

Write a script that calls the Summary Engine's aggregation function for Sabor. The script must:

1. Read all `committed_data` for Sabor (tenant_id `f7093bcc-e90b-4918-9680-69da7952dd65`, data_type `pos_cheque`).
2. Call the same aggregation function that the import pipeline calls.
3. Write the fresh `summary_artifacts` rows.

If the Summary Engine function is tightly coupled to the import pipeline (expects import-time context), extract its aggregation logic into a standalone re-materialization call. The aggregation is: group `committed_data` by (entity_id, source_date or day), for each group `jsonb_each` over `row_data`, keep every key where `jsonb_typeof = 'number'`, SUM the values. Write as `summary_artifacts` rows with `metrics` JSONB.

```bash
cd ~/spm-platform/web && npx tsx scripts/ob237-rematerialize-sabor.ts
```

Paste output showing row count written.

### Step 4 — Verify re-materialization matches truth

```bash
cd ~/spm-platform/web && npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';

  // Truth: SUM of committed_data row_data numeric fields
  const { data: raw } = await sb.from('committed_data').select('row_data').eq('tenant_id', SABOR).eq('data_type', 'pos_cheque');
  let rawTotal = 0;
  for (const r of raw) {
    const v = r.row_data?.total ?? r.row_data?.Total ?? 0;
    rawTotal += Number(v);
  }
  console.log('committed_data SUM(total): $' + rawTotal.toFixed(2));

  // Summary: SUM of summary_artifacts metrics.total (lowercase)
  const { data: sums, count } = await sb.from('summary_artifacts').select('metrics', { count: 'exact' }).eq('tenant_id', SABOR);
  let sumTotal = 0;
  for (const s of sums) {
    const m = s.metrics || {};
    // The key should now be lowercase 'total' matching committed_data
    sumTotal += Number(m.total ?? m.Total ?? 0);
  }
  console.log('summary_artifacts SUM(total): $' + sumTotal.toFixed(2));
  console.log('summary_artifacts row count: ' + count);
  console.log('Match: ' + (Math.abs(rawTotal - sumTotal) < 0.01 ? 'YES ✓' : 'NO ✗ — HALT'));
}
run();
"
```

**HALT-REMAT:** If the totals don't match within $0.01, the re-materialization produced incorrect results. Report both numbers. Do NOT proceed to wiring.

Commit: `"OB-237 T1: re-materialize summary_artifacts for Sabor — stale data rebuilt"`

---

## PHASE 1: COMPUTE TRUTH BASELINE PER MODE

The byte-match procedure is corrected: compare summary output against a **deterministic ground-truth aggregate**, not against the raw-path served response (which is non-deterministic due to missing ORDER BY).

For each of the 5 modes, compute the ground-truth answer from `committed_data` using a deterministic full-dataset aggregate (no pagination, no ORDER BY dependency). Save as JSON:

```bash
# Example for timeline — compute the true per-date revenue from committed_data
cd ~/spm-platform/web && npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';
  const { data } = await sb.from('committed_data').select('row_data, source_date').eq('tenant_id', SABOR).eq('data_type', 'pos_cheque');
  // Aggregate by date — deterministic
  const byDate = {};
  for (const r of data) {
    const d = r.source_date || 'unknown';
    if (!byDate[d]) byDate[d] = { revenue: 0, count: 0 };
    byDate[d].revenue += Number(r.row_data?.total ?? 0);
    byDate[d].count++;
  }
  const sorted = Object.entries(byDate).sort(([a],[b]) => a.localeCompare(b));
  const grandRevenue = sorted.reduce((s, [,v]) => s + v.revenue, 0);
  const grandCount = sorted.reduce((s, [,v]) => s + v.count, 0);
  console.log('TRUTH timeline: ' + sorted.length + ' dates, grand revenue=$' + grandRevenue.toFixed(2) + ', grand count=' + grandCount);
  require('fs').writeFileSync('/tmp/ob237_timeline_truth.json', JSON.stringify({ dates: sorted.length, grandRevenue, grandCount }, null, 2));
}
run();
" 
```

The truth baseline for each mode captures the aggregate dimensions that mode displays (per-date for timeline, per-brand for summary, per-entity for location_detail, per-location for performance, per-location for leakage). CC determines the appropriate aggregation per mode based on what the mode's response shape contains.

---

## PHASE 2: WIRE EACH MODE (per the original T1 directive procedure)

For each of the five modes — `timeline` → `summary` → `location_detail` → `performance` → `leakage` — execute this sequence completely before moving to the next:

**Step A — Wire the summary path.** Create `aggregate<Mode>FromSummaries` mirroring the `network_pulse` template. Add the summary-primary early-return before the raw path. The `aggregateTimelineFromSummaries` code from the reverted attempt is correct and can be re-applied for timeline.

**Step B — Capture summary output.**

```bash
curl -s -X POST http://localhost:3000/api/financial/data \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"f7093bcc-e90b-4918-9680-69da7952dd65","mode":"timeline"}' \
  > /tmp/ob237_timeline_new.json
```

Record response time from dev server log.

**Step C — Value-match against truth (NOT against raw path).**

Compare the summary output's grand totals against the Phase 1 truth baseline. The key values must match within $0.01 (floating-point tolerance). Structural shape (number of dates/brands/entities) must match exactly.

**If match PASSES:** proceed to Step D.
**If match FAILS:** HALT this mode. Report both values. Do NOT delete the raw path. Continue other modes.

**Step D — Remove the raw fallback for this mode.** Delete the raw-aggregate code path. AP-17: single code path.

**Step E — Build clean + timing.**

```bash
cd ~/spm-platform/web && npm run build
```

Must exit 0. Restart dev server, re-call the mode, record timing.

**Step F — Commit.**

```bash
cd ~/spm-platform && git add -A && \
git commit -m "OB-237 T1: wire <mode> to summary_artifacts — truth-matched, raw path removed" && \
git push origin ob-237-materialized-serving-path
```

---

## PHASE 3: EMPIRICAL PERFORMANCE TABLE + COMPLETION REPORT

After all five modes are wired, compile:

| Mode | Raw baseline (ms) | Summary (ms) | Improvement | Truth-match |
|---|---|---|---|---|
| timeline | 63,684 (P0) / 58,633 (T1 attempt) | (Phase 2 timing) | ×? | PASS/FAIL |
| summary | (Phase 2 Step B timing before wire) | (Phase 2 Step E timing) | ×? | PASS/FAIL |
| location_detail | ... | ... | ×? | PASS/FAIL |
| performance | ... | ... | ×? | PASS/FAIL |
| leakage | ... | ... | ×? | PASS/FAIL |

Run the regression check from the original T1 directive (load all Financial pages on localhost, verify non-empty rendering, verify coverage-gap modes still work on their raw paths).

Update `docs/completion-reports/OB-237_COMPLETION_REPORT.md` with:
1. Re-materialization evidence (Phase 0 Step 4 match verification)
2. Per-mode truth baselines (Phase 1)
3. Empirical performance table (Phase 3)
4. Proof gates PG-1/2/5/6/7
5. Regression check evidence

Commit and push. Update PR #598 description. Do NOT merge (SR-44).

---

## HALT CONDITIONS

| ID | Trigger | Action |
|---|---|---|
| HALT-REMAT | Re-materialized summary_artifacts SUM doesn't match committed_data SUM | Report both. Do NOT proceed to wiring. The aggregation logic may have a bug. |
| HALT-BYTEMATCH | Truth-match fails for any mode (summary grand totals ≠ committed_data truth ± $0.01) | Stop that mode. Report values. Continue other modes. |
| HALT-RECOGNIZE | `recognize()` fails to resolve measure keys for a mode | Stop that mode. Report which keys. Continue other modes. |
| HALT-REGRESSION | Coverage-gap mode breaks after T1 changes | `git revert` the breaking commit (SR-41). Report. |
| HALT-BUILD | `npm run build` fails | Fix or revert. |

---

## SCOPE — HARD LIMITS

**IN SCOPE:** Re-materialization of `summary_artifacts` for Sabor. Wiring 5 modes in `route.ts`. Nothing else.

**OUT OF SCOPE:**
- Raw-path ORDER BY fix (separate HF — the raw path is deleted after T1)
- Coverage-gap modes (staff/server_detail/patterns/products)
- Intelligence/Compensation surfaces (already MSP-compliant per P0)
- Any migration, RPC creation, or schema change
- Any file outside `route.ts` unless strictly required for wiring (justify in commit message)
