# OB-237 COMPLETE: MSP FOR ALL VISUALIZATIONS

**File:** `docs/vp-prompts/OB-237_COMPLETE_ALL_VISUALIZATIONS_DIRECTIVE_20260624.md`
**Branch:** `ob-237-materialized-serving-path` (continue)
**Mode:** ULTRACODE `/effort`
**Standing rules:** `CC_STANDING_ARCHITECTURE_RULES.md` — all active. FP-49 applies.
**Predecessor:** T1 wired 5 Financial modes to `summary_artifacts`, value-matched to deterministic truth ($100,068,158.15 / 263,250 / $12,746,075.01). Pattern proven 5×. Finer-materialization spec delivered (`docs/diagnostics/OB-237_FINER_MATERIALIZATION_SPEC.md`). Intelligence/Compensation already MSP-compliant at invariant level; O(n) JS reduce residual.

---

## OBJECTIVE

Every aggregate visualization across Financial, Intelligence, and Compensation serves from a pre-computed materialization. `fetchRawDataServer` and all raw `aggregate*` functions are deleted. Zero raw aggregate paths remain platform-wide.

---

## TOPOLOGY

```
P0  (CC autonomous)         Schema discovery + conditional metric + leakage wiring
    ── SINGLE ARCHITECT GATE: CREATE summary_artifacts_fine ──
T-FIN ║ T-AGG  (fan-out)    Financial fine-table modes ║ Period-level materialization
T-PROOF (sequential)        All surfaces, all agents, empirical table, zero residuals
```

**File-disjoint contract:**
- **T-FIN owns:** `route.ts` (financial data route), `summary-engine.ts` (population), any financial serving file
- **T-AGG owns:** `intelligence-data.ts`, the lifecycle/calculation service (materialization trigger), any Compensation/Intelligence serving path, any file under `lib/insights/`

---

## P0 — SCHEMA DISCOVERY + CONDITIONAL METRIC + LEAKAGE

### Objectives

1. Query the live `summary_artifacts` table schema (columns, types, sample rows) and paste the result. The architect needs this to model `summary_artifacts_fine`. This is the FP-49 gate — no migration SQL is authored without it.
2. Extend the Summary Engine to compute `cancelled_revenue` = SUM(total) for rows where `cancelado` = 1, and `cancelled_count` = COUNT of same. Store as additional metric keys on the existing (entity, day) `summary_artifacts` rows.
3. Re-materialize Sabor with the extended engine.
4. Wire `leakage` to `summary_artifacts` using the proven pattern (6th application). Delete raw `aggregateLeakage`.

### Constraints

- The conditional metric must resolve the `cancelado` field via `recognize()` or the Summary Engine's existing field-resolution mechanism — not a hardcoded string. Korean Test applies.
- `cancelled_revenue` truth = deterministic SUM of `committed_data.row_data.total` WHERE `row_data.cancelado` = 1, computed with ORDER BY id (no pagination non-determinism). The materialized value must match within $0.01.
- The 5 previously-wired modes must not regress. Spot-check `network_pulse` and `timeline` after re-materialization — grand totals still $100,068,158.15.

### Proof gates

- **PG-SCHEMA:** `summary_artifacts` full column list + types + 2 sample rows pasted in completion report.
- **PG-CANCEL:** `cancelled_revenue` materialized value matches deterministic `committed_data` truth.
- **PG-LEAKAGE:** Leakage mode wired, raw deleted, value-matched. Before-state RAW timing captured (cold, from dev server log) PRIOR to wiring. After-state summary timing captured. Both values + multiplier reported.
- **PG-REGRESS-P0:** `network_pulse` + `timeline` grand totals unchanged after re-materialization.
- **PG-BASELINE:** Before-state RAW timing captured for ALL 5 remaining Financial modes (staff, location_detail, patterns, server_detail, leakage) PRIOR to any wiring in this directive. These are the "before" column in PG-FINAL-2. Once a raw path is deleted, its before measurement is unrecoverable.

### Output to architect

After P0 commits, paste in the completion report:
1. The `summary_artifacts` schema (PG-SCHEMA evidence).
2. The statement: "ARCHITECT GATE: Create `summary_artifacts_fine` (schema modeled on the above, plus `sub_entity_id text`, `hour smallint`). Spec: `docs/diagnostics/OB-237_FINER_MATERIALIZATION_SPEC.md`. The period-level rollup for Intelligence/Compensation is a CC-built write-time materialization (same pattern as Summary Engine) — no architect migration needed."

**HALT — ARCHITECT GATE.** CC stops. Architect creates the table in one SQL Editor paste. CC resumes when instructed.

---

## T-FIN — FINANCIAL FINE-TABLE MODES (after gate clears)

### Objectives

1. Verify `summary_artifacts_fine` exists and is accessible.
2. Populate it for Sabor at (entity, sub_entity, date, hour) grain using the Summary Engine pattern. Include `cancelled_revenue` conditional metric. The `sub_entity_id` column is populated from whatever field `recognize()` resolves as the sub-entity actor for this tenant's data (for Sabor POS: the server/mesero field).
3. Wire `staff`, `location_detail`, `patterns`, `server_detail` — each using the proven pattern. Each reads from `summary_artifacts_fine` grouped at the grain the mode requires (per the finer-materialization spec §1).
4. Delete `fetchRawDataServer` and all remaining raw `aggregate*` functions. Verify zero consumers remain.

### Constraints

- Fine table SUM(metrics.total) across all rows must equal deterministic truth ($100,068,158.15). If not, population is wrong — HALT.
- Value-match each mode's grand totals against truth before deleting raw path.
- After `fetchRawDataServer` deletion, `npm run build` must exit 0 (no orphan references).
- All 6 previously-wired modes must still work. Regression check after raw-path deletion.

### Proof gates

- **PG-FINE-POP:** Fine table populated, SUM matches truth, row count reported.
- **PG-STAFF / PG-LOCDETAIL / PG-PATTERNS / PG-SERVDETAIL:** Each wired, raw deleted, value-matched. After-state summary timing captured. Before-state timing from PG-BASELINE. Both values + multiplier reported per mode.
- **PG-RAW-ZERO:** grep for `fetchRawDataServer` and all raw `aggregate*` returns zero matches.
- **PG-REGRESS-FIN:** All 10 Financial modes render on localhost with real data after raw deletion.

---

## T-AGG — INTELLIGENCE/COMPENSATION PERIOD-LEVEL MATERIALIZATION (after gate clears, parallel with T-FIN)

### Objectives

The analogy: `summary_artifacts` is to `committed_data` what the period rollup is to `entity_period_outcomes`. The Summary Engine writes pre-computed aggregates at import time so no Financial surface ever touches base rows. Apply the identical pattern to the Compensation/Intelligence side: the lifecycle materializer already writes `entity_period_outcomes` (per-entity) at transition time — extend it to also write a period-level rollup at the same trigger. One row per (tenant, period) carrying `total_payout`, `entity_count`, `component_totals`, `lowest_lifecycle_state`. Every Intelligence/Compensation aggregate surface reads this row instead of reducing across per-entity rows.

1. Build the period-level materialization. Write to a lightweight sibling (e.g., `period_outcomes_summary` or equivalent — CC determines the most natural storage, whether a new table created via Supabase service-role client or a sentinel row pattern). The materialization fires on the same trigger that populates `entity_period_outcomes` — the lifecycle transition in the calculation/lifecycle service.
2. Wire every Intelligence/Compensation aggregate path (every `.reduce` over multi-row `entity_period_outcomes`) to read the period-level materialization instead.
3. Value-match against BCL ground truth ($312,033 total, per-period exact: Oct $44,590, Nov $46,291, Dec $61,986, Jan $47,545, Feb $53,215, Mar $58,406).
4. Delete the JS `.reduce` aggregation paths.

### Constraints

- The materialization is write-time, not read-time. No SQL aggregation at query time. No RPC that SUMs at read time. The aggregate is pre-computed and stored, read as one row.
- Per-entity reads (one entity, indexed O(1)) are NOT in scope — only multi-entity rollup paths.
- The trigger must be idempotent — re-running a lifecycle transition re-materializes, never duplicates.
- BCL has 6 periods with calculation results. All 6 period rollups must materialize correctly.

### Proof gates

- **PG-ROLLUP:** Period-level materialization exists for BCL, 6 rows (one per period), totals match ground truth per-period and grand ($312,033).
- **PG-AGG-ZERO:** grep for `.reduce` / multi-row aggregation patterns over `entity_period_outcomes` in serving paths returns zero matches.
- **PG-REGRESS-AGG:** Intelligence and Compensation surfaces render on localhost with correct BCL data.

---

## T-PROOF — FINAL INTEGRATION (after T-FIN + T-AGG)

### Objectives

Prove the MSP invariant holds across every visualization, every agent.

### Proof gates

**PG-FINAL-1 (zero raw):** Platform-wide grep for raw aggregate reads — `fetchRawDataServer`, `from('committed_data')` in any serving route (excluding import/SCI/engine), `.reduce` over multi-row entity_period_outcomes — returns zero matches.

**PG-FINAL-2 (empirical table):** Complete before/after timing table covering all 10 Financial modes + Intelligence/Compensation. Every row: mode name, before RAW timing (ms), after summary timing (ms), improvement multiplier (before ÷ after), truth-match status. The before values for T1 modes come from the P0 baseline; the before values for P1/T-FIN modes come from PG-BASELINE. This table is the headline deliverable — it documents the empirical value OB-237 delivered.

**PG-FINAL-3 (all surfaces render):** Every Financial, Intelligence, and Compensation surface loaded on localhost, non-empty, no errors. Dev server log pasted showing response times.

**PG-FINAL-4 (build clean):** `npm run build` exits 0.

**PG-FINAL-5 (map complete):** `docs/diagnostics/OB-237_MSP_APPLICATION_MAP.md` updated — every surface classified WIRED or BOUNDED. Zero RAW entries.

### Completion report

Update `docs/completion-reports/OB-237_COMPLETION_REPORT.md` with all phases, all commits, all proof gates, the full empirical table, and the statement: **"Zero residuals. Every aggregate visualization serves from a materialization."**

Commit. Update PR #598. Do NOT merge (SR-44).

---

## HALT CONDITIONS

| ID | Trigger | Action |
|---|---|---|
| HALT-GATE | Architect migration (`summary_artifacts_fine`) not yet created | Wait. Resume when instructed. |
| HALT-FINE-MATCH | Fine table SUM ≠ truth | Population bug. Report. |
| HALT-CANCEL-MATCH | cancelled_revenue ≠ truth | Report. Don't wire leakage. |
| HALT-BYTEMATCH | Any mode value-match fails | Stop that mode. Continue others. |
| HALT-RECOGNIZE | recognize() fails for a measure key | Stop that mode. Continue others. |
| HALT-BUILD | npm run build fails | Fix or revert. |
| HALT-REGRESSION | Previously-wired mode breaks | git revert (SR-41). Report. |

---

## SCOPE

**IN:** Every aggregate serving path across all agents. Schema discovery. Summary Engine extension. Fine table population. Period-level materialization (write-time, CC-built — same pattern as Summary Engine). All mode wiring. All raw path deletion. Final proof.
**OUT:** OB-231 (domain-agnosticism). Module-gating. Comprehension labels. OB-234 surfaces. Thermostat. SCHEMA_REFERENCE_LIVE.md re-dump (separate governance task). Calculation engine / import pipeline / SCI.
**GATES:** One. Architect creates `summary_artifacts_fine` in one SQL Editor paste. The period-level materialization is a CC-built write-time pattern (same as Summary Engine), not a migration.

---

*OB-237 Complete · ULTRACODE · P0 → gate → T-FIN ║ T-AGG → T-PROOF*
*Deterministic truth: $100,068,158.15 (Sabor) · $312,033 (BCL)*
*The file IS the prompt. Ends here.*
