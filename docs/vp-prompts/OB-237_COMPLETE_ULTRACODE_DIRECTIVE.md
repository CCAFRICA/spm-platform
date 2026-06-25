# OB-237 COMPLETE: MSP FOR ALL VISUALIZATIONS

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
    ── SINGLE ARCHITECT GATE ──
T-FIN ║ T-AGG  (fan-out)    Financial fine-table modes ║ Intelligence/Compensation O(1)
T-PROOF (sequential)        All surfaces, all agents, empirical table, zero residuals
```

**File-disjoint contract:**
- **T-FIN owns:** `route.ts` (financial data route), `summary-engine.ts` (population), any financial serving file
- **T-AGG owns:** `intelligence-data.ts`, any Compensation/Intelligence serving path, any file under `lib/insights/`

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
2. The statement: "ARCHITECT GATE: Create `summary_artifacts_fine` (schema modeled on the above, plus `mesero_id text`, `hour smallint`) AND aggregation RPCs (`sum_entity_period_outcomes`, component rollup). Both needed. Spec: `docs/diagnostics/OB-237_FINER_MATERIALIZATION_SPEC.md`."

**HALT — ARCHITECT GATE.** CC stops. Architect creates both artifacts in one SQL Editor session. CC resumes when instructed.

---

## T-FIN — FINANCIAL FINE-TABLE MODES (after gate clears)

### Objectives

1. Verify `summary_artifacts_fine` exists and is accessible.
2. Populate it for Sabor at (entity, mesero, date, hour) grain using the Summary Engine pattern. Include `cancelled_revenue` conditional metric.
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

## T-AGG — INTELLIGENCE/COMPENSATION O(1) (after gate clears, parallel with T-FIN)

### Objectives

1. Verify aggregation RPCs exist and return correct values for BCL.
2. Replace every JS `.reduce` / `.map` / `.forEach` aggregation over multi-row `entity_period_outcomes` fetches with the corresponding RPC call.
3. Value-match against BCL ground truth ($312,033 total, per-period exact).

### Constraints

- Per-entity reads (one entity, one row, indexed O(1)) are NOT in scope — only multi-row aggregation paths.
- `intelligence-data.ts` functions that already return correct values must continue to return the same values — the conversion changes the mechanism, not the answer.
- Zero `.reduce` over multi-row entity_period_outcomes fetches remain after T-AGG.

### Proof gates

- **PG-RPC:** Each RPC call returns the expected value for BCL (paste evidence).
- **PG-AGG-ZERO:** grep for `.reduce` / multi-row aggregation patterns in `intelligence-data.ts` returns zero matches.
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
| HALT-GATE | Architect migrations not yet created | Wait. Resume when instructed. |
| HALT-FINE-MATCH | Fine table SUM ≠ truth | Population bug. Report. |
| HALT-CANCEL-MATCH | cancelled_revenue ≠ truth | Report. Don't wire leakage. |
| HALT-BYTEMATCH | Any mode value-match fails | Stop that mode. Continue others. |
| HALT-RECOGNIZE | recognize() fails for a measure key | Stop that mode. Continue others. |
| HALT-BUILD | npm run build fails | Fix or revert. |
| HALT-REGRESSION | Previously-wired mode breaks | git revert (SR-41). Report. |

---

## SCOPE

**IN:** Every aggregate serving path across all agents. Schema discovery. Summary Engine extension. Fine table population. All mode wiring. All raw path deletion. O(1) RPC conversion. Final proof.
**OUT:** OB-231 (domain-agnosticism). Module-gating. Comprehension labels. OB-234 surfaces. Thermostat. SCHEMA_REFERENCE_LIVE.md re-dump (separate governance task). Calculation engine / import pipeline / SCI.
**GATES:** One. Architect creates both `summary_artifacts_fine` and aggregation RPCs in one SQL Editor session.

---

*OB-237 Complete · ULTRACODE · P0 → gate → T-FIN ║ T-AGG → T-PROOF*
*Deterministic truth: $100,068,158.15 (Sabor) · $312,033 (BCL)*
*The file IS the prompt. Ends here.*
