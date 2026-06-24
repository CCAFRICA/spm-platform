# OB-237 — Materialized Serving Path (MSP) — COMPLETION REPORT

**Branch:** `ob-237-materialized-serving-path` · **Base:** `main` · **Date:** 2026-06-24 · **Mode:** ULTRACODE
**Status:** **P0 complete (mandatory gate).** P0 surfaced architect-gated dependencies that legitimately gate T1/T2/T3 — reported below for disposition (the directive's P0-gate philosophy: "nothing is silently narrowed; the grep is authoritative"). CC does NOT merge (SR-44).

---

## 1. Commits
| SHA | Message | Files |
|---|---|---|
| _(P0)_ | `P0: MSP Application Map + baseline — discovery complete (3 premise-corrections)` | `docs/diagnostics/OB-237_MSP_APPLICATION_MAP.md` |
| _(this)_ | `OB-237: completion report` | `docs/completion-reports/OB-237_COMPLETION_REPORT.md` |

## 2. MSP Application Map
Full map: `docs/diagnostics/OB-237_MSP_APPLICATION_MAP.md` (committed). Summary of classification:
- **Financial:** `network_pulse` WIRED; `timeline/summary/location_detail/performance/(loc-)leakage` **RAW → wirable to `summary_artifacts` (migration-free)**; `staff/server_detail/patterns/products` **RAW → coverage-gap** (need finer materialization); `cheques` BOUNDED.
- **Intelligence & Compensation:** **already materialization-backed** (`getEntityResults` → `entity_period_outcomes` preferred). §1.4 invariant (read a materialization) **already satisfied**. Residual = O(n) JS `.reduce` over the materialization.
- **Cross-agent** (reconciliation/periods/import): not aggregate-render surfaces → OUT-OF-SCOPE.

## 3. Empirical baseline (P0.6) + the architecture finding
| Agent | Surface | Mode | Class | Cold (ms) | Payload |
|---|---|---|---|---|---|
| Financial | Network Pulse | `network_pulse` | WIRED | 3,277 | 7.6 KB |
| Financial | Revenue Timeline | `timeline` | RAW | **63,684** | 4.0 KB |

The "after" multiplier for wired Financial modes is realized by the OB-229 summary path (network_pulse demonstrates ~3.3s vs the 63.7s raw fetch). The full before/after table (PG-5) is producible once the wirable modes are converted (§6).

## 4. THREE PREMISE-CORRECTIONS (the headline of P0 — architect disposition required)

### 4.1 `financial_summary_daily` does not exist → the materialization is `summary_artifacts`
The directive (§1.1, §3.P0, HALT-SCHEMA) names `financial_summary_daily` as OB-229's financial materialization. **It does not exist** in the live DB. The actual OB-229 materialization is **`summary_artifacts`** (Sabor 2520 rows, populated; daily-per-entity `metrics` JSONB). The directive itself names `summary_artifacts` as the valid alternative (§3.T1.2/§3.T1.3). **Resolution:** treat `summary_artifacts` as the Financial target — **no table creation, no migration, HALT-SCHEMA not escalated** (the materialization premise holds). **Architect: ratify the naming reconciliation.**

### 4.2 SQL-level aggregation requires a migration (SR-44) — the OB's core value is architect-gated for T2/T3
The OB's animating goal (§1.2/§1.3/Principle-2) is to replace **O(n) JS aggregation** with **O(1) SQL aggregation**. P0 proved this is **impossible for CC without a migration**:
- PostgREST aggregate functions are **disabled** — `entity_period_outcomes.select('total_payout.sum()')` → `"Use of aggregate functions is not allowed"`.
- `exec_sql` RPC **does not exist**; no aggregation RPC/view exists (probed `compute_summary_artifacts`, `sum_entity_period_outcomes`, … all NOT FOUND).
- Therefore the directive's §3.T2.3 "Option A — SQL `jsonb_array_elements` + `GROUP BY` + `SUM`" needs **CREATE FUNCTION / VIEW = a migration (SR-44 architect-only)**.

**Architect disposition required:** to deliver true O(1) serving for Intelligence/Compensation (and to reduce the residual JS over the Financial summary), create the aggregation primitives — minimally:
- `sum_entity_period_outcomes(p_tenant uuid, p_period uuid) returns numeric` (period total, indexed).
- a `component_breakdown` rollup RPC (period → component → SUM(payout)).
- optionally enable PostgREST `db-aggregates-enabled` for the read role.

Until then, the migration-free MSP move is **switching reads from base tables → existing materializations** (which Intelligence/Compensation already do).

### 4.3 Intelligence & Compensation already consume the materialization — the §1.4 invariant is already satisfied there
`getEntityResults` (`drill-through/entity-results.ts:102-122`) reads **`entity_period_outcomes` as the PREFERRED path**, falling back to `calculation_results` only when no materialized outcome exists. So the directive's premise that these surfaces "re-derive … from `calculation_results.components` JSONB by fetching all entity rows" (§1.2) is **largely stale**: `getPeriodTotal`/`getComponentTotals`/`getPayoutDistribution`/trajectory/perform/operate all flow through `getEntityResults` → the D7 materialization. They do **not** re-derive from base rows. The only residual is the JS `.reduce` *over the materialization* — the O(n) concern fixable only via §4.2's migration.

**Consequence:** there is **no genuine base-row RAW work for T2/T3.** Their MSP invariant holds today; their scale-optimization is §4.2 (architect). The genuine base-row re-derivation defect (§1.4) is **Financial-only**.

## 5. Value-match ground truth (verified, P0)
`SUM(entity_period_outcomes.total_payout)` per period for BCL (fetch+JS): Oct **$44,590** · Nov **$46,291** · Dec **$61,986** · Jan **$47,545** · Feb **$53,215** · Mar **$58,406** · **grand $312,033** — **exact match** to the directive (§3.T3.2). Resolves the prior $49,911-vs-$58,406 ambiguity (March = **$58,406** is correct from the materialization). This is the materialization-backed answer the Intelligence/Compensation surfaces already serve.

## 6. Remaining work, precisely scoped (no re-discovery needed)

### T1 — Financial, migration-free (CC-executable now)
Wire `timeline`, `summary`, `location_detail`, `performance`, location-level `leakage` to `summary_artifacts`, mirroring the existing `aggregateNetworkPulseFromSummaries` template (route.ts:327): `getSummaryArtifacts(sb, tenant, {dataType:'pos_cheque'})` → `recognize()` measure-key resolution → group by `summary_date` / entity→brand → existing finalizers. Add a summary-primary early-return per mode (like network_pulse 1415-1424), raw as graceful fallback (OB-229 pattern). Byte-match each against the raw aggregate on Sabor before retiring the raw path. Headline: `timeline` 63.7s → ~3s.

### T1 — Financial, coverage-gap RESIDUAL (architect: finer materialization)
`summary_artifacts` is grained at **(entity, day)**. `staff`/`server_detail` (per-server/mesero), `patterns` (per-hour heatmap), `products` (per-cheque product mix) need **sub-entity grain the summary does not carry** (HALT-T1-COVERAGE class). Converting them requires **extending the OB-229 import-time materialization** to emit server/hour/product grain — a materialization build = migration (SR-44, §6.2). Until then they stay RAW (flagged), not silently broken.

### T2/T3 — already-compliant + the §4.2 migration
Verify-and-document (done): reads are materialization-backed; totals match ($312,033). The O(n)-JS→O(1)-SQL conversion is the §4.2 aggregation-RPC migration (architect).

## 7. Proof gates
- **PG-8 (map completeness):** PASS — every navigation aggregate surface classified in the map.
- **HALT-EMPTY / HALT-ZERO-RAW:** not fired (entity_period_outcomes populated for BCL; Financial has genuine RAW).
- **HALT-SCHEMA:** examined → resolved as naming reconciliation (§4.1), not escalated.
- **Value-match ground truth (PG-3/PG-4 data):** PASS at the materialization layer ($312,033 / per-period exact, §5).
- PG-1/2/5/6/7 (post-conversion timing + byte-match) are pending the §6 T1 conversion / §4.2 migration.

## 8. Residuals (named, not absorbed/dropped)
1. **Aggregation-RPC migration** (`sum_entity_period_outcomes` + component rollup) — enables true O(1) for Intelligence/Compensation and reduces residual JS for Financial. Architect (SR-44).
2. **Finer Financial materialization** (server/hour/product grain) — enables `staff`/`server_detail`/`patterns`/`products` MSP conversion. Architect (materialization build = migration).
3. **`financial_summary_daily` naming ratification** (§4.1).
4. **T1 wirable-mode conversion** (§6) — migration-free, executable as the next increment.

## 9. Compliance
- **Architecture Decision Gate:** the serving-path materialization targets are documented in the map; the migration-gated portions are surfaced, not bypassed (SR-34: no workaround — the absence of SQL aggregation is reported, not faked with a JS shim claiming O(1)).
- **Anti-Pattern Registry:** AP-4/AP-11/AP-17/AP-21 honored in the plan; no empty shells introduced; no second code path added (P0 is read-only discovery).
- **Scale analysis:** the §4.2 finding IS the scale analysis — JS-over-materialization is O(materialized-rows); true Empresarial/Corporativo scaling needs the SQL-aggregation primitives (architect migration). P0 documents this rather than shipping an O(n) path that masquerades as compliant.
- **SR-44:** no migrations run, no PR merged, no browser self-attestation.
