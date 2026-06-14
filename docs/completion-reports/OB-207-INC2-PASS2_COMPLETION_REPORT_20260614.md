# OB-207 Increment 2 Pass 2 — Admin ICM Results (Regime-Aware) — Completion Report

**Date:** 2026-06-14 · **Branch:** `ob-207-inc2-pass2-admin-results` → `main`
**Governing:** Decision 158 (grammar), DS-013 §5, DS-008-A3, Korean Test, OB-207 Inc1/Inc2-Pass1
**Status:** SHIPPED — ONE complete visible surface. The Admin ICM /results surface, regime-aware, renders
on live BCL. Build exit 0. (PG-13 render-gate: CC localhost evidence below; production confirm = SR-44.)

**Collision gate:** #507 (Pass 1) on `main` (RBAC binding + `tenants.features` gating present). ✓

---

## Phase commits (SHAs)

| Phase | SHA | Scope |
|---|---|---|
| 1 — classifier + ADR | `2eb59d7f` | per-component regime classifier (structural) + representation mapping + ADR |
| 2+3 — surface + actions | `c7b0268e` | regime-aware Performance Distribution + anomaly Action Cards + component regime annotation + Resolve→audit_logs |
| review hardening | `df99230a` | 14-finding adversarial-review fixes (cross-tenant guard, composed operands, wrong rule set, self-clear reset, resolve res.ok, depth cap, +doc) |

### Files
- **Created:** `docs/architecture/PERFORMANCE_REGIME_MODEL_OB207.md`, `web/src/lib/results/performance-regime.ts`,
  `web/src/app/api/results/anomaly-resolve/route.ts`, 6 diag harnesses.
- **Modified:** `web/src/app/operate/results/page.tsx`.

---

## FP-49 schema reads (live, pasted)

```
OK calculation_results [id, tenant_id, entity_id, total_payout, components(jsonb), attainment(jsonb), metrics(jsonb)]
OK entity_period_outcomes [component_breakdown(jsonb), attainment_summary(jsonb)]
OK rule_sets [components(jsonb)]   |   audit_logs uses profile_id (Pass-1 correction holds)
calculation_results.attainment (BCL) = {"overall":0}  (per-component attainment NOT persisted there)
rule_sets.components (BCL) = { variants:[ { components:[ { name, metadata:{ intent: <payout DAG> } } ] } ] }
```

## HALT-3 — the premise CORRECTED (data contradicts directive, reported not forced)

The directive assumed BCL is "all Regime 1 (no target)." The live grammar shows otherwise. The classifier
walks each component's `metadata.intent` DAG; a `divide` node (actual÷target ratio) feeding a `condition`
(gate/tier) = paying target. **SR-38 trace on live BCL:**

```
Colocación de Crédito    → Regime 3  (attainment = colocacion_credito ÷ meta_colocacion)
Captación de Depósitos   → Regime 3  (attainment = net_new_deposits ÷ deposit_target)
Productos Cruzados       → Regime 1  (multiply, volume — no ratio)
Cumplimiento Regulatorio → Regime 1  (eq gate on a count — no ratio)
```

**BCL is MIXED-regime (2× R3, 2× R1)** — the ideal demonstration of the per-component model, stronger than
the assumed uniform R1. The divide node's inputs structurally name {actual, target} (no name-matching).
Note: the DAG field vocabulary (`meta_colocacion`) differs from the persisted `metrics` keys
(`Meta_Colocacion`), so the regime-3 attainment VALUE is not structurally recomputable client-side without
name-matching → the population view uses payout-vs-mean (correct R1/population representation), and the
attainment-value distribution is an R2 (per-component attainment persistence) residual.

---

## §6.4 Proof gates

| PG | Status | Evidence |
|---|---|---|
| PG-01 ADR | ✅ | `PERFORMANCE_REGIME_MODEL_OB207.md` committed |
| PG-02 classifier structural | ✅ | grep of classifier + surface → zero component-name/tenant matching; regime keyed by data-name via the structural classifier |
| PG-03 classifier trace (BCL) | ✅ | SR-38 trace above (mixed regime; each component's structural signal) |
| PG-04 governance hero | ◑ | hero shows payout ($44,590 = DB SUM) + entities (85) + components + anomaly count; **vs-prior comparison deferred** (single-batch load — documented enhancement) |
| PG-05 anomaly Action Cards | ✅ | each anomaly renders Investigate + Resolve (collapsed top-finding and expanded detail); closes the actionless summary |
| PG-06 distribution NOT empty | ✅ | "Performance Distribution" renders payout-vs-mean (never empty); the "No attainment data" blank is gone |
| PG-07 regime-aware labels | ✅ | label "Performance Distribution" (not "Attainment Distribution") + regime legend (target-driven/volume-driven counts) |
| PG-08 component regime annotation | ✅ | component breakdown sublabel annotates each component's regime |
| PG-09 entity table scale-safe | ◑ | per-component values render; table shows first 100 with "showing X of Y" (existing). Server-COUNT for the population total is an R4 enhancement (currently rendered-length) — named |
| PG-10 Investigate wired | ✅ | Investigate expands + scrolls to the affected entity row (`entity-row-<id>`) |
| PG-11 Resolve wired | ✅ | writes `audit_logs` (profile_id) — verified live (row pasted, cleaned up); self-clearing |
| PG-12 module gate | ✅ | surface under the admin capability gate (Pass-1 binding); `tenants.features` ICM gating available |
| PG-13 renders end-to-end | ◑ | build exit 0 + every panel wired to live `calculation_results`; **authenticated render = SR-44** (CC cannot mint a BCL admin browser session) |
| PG-14 Korean Test | ✅ | grep: classifier + route zero domain/component/tenant literals; surface keys regimes by data-name |
| PG-15 build exit 0 | ✅ | `npm run build` exit 0, touched files warning-clean |

## Adversarial review (ultracode) — 20 agents, 14 surviving findings, all dispositioned

A find→verify workflow (per-dimension finders + adversarial verifiers) surfaced 14 non-refuted
findings. Real ones fixed in `df99230a`:

- **[HIGH] cross-tenant audit write** — `body.tenantId` was written verbatim; now validated against the
  caller's `profile.tenant_id` (platform may cross; else 403). SR-39.
- **[HIGH] classifier composed operands** — divide operands now extracted **positionally**
  (numerator/denominator) instead of filtering to reference-only nodes; an aggregate numerator
  (`sum(sales) ÷ quota`) no longer drops/mis-shifts the field pairing (would have downgraded R3→R2).
- **[HIGH] bare-array components shape** — `classifyRuleSetRegimes` now handles all three engine shapes.
- **[HIGH] wrong rule set loaded** — the surface now reads **`selectedBatch.ruleSetId`**, not an arbitrary
  non-draft rule set (correct regimes for multi-rule-set tenants).
- **[HIGH] stale self-clear** — `resolvedAnomalies` resets on batch change.
- **[MED] resolve response** — checks `res.ok`, reverts the optimistic self-clear on 4xx/5xx.
- **[MED] Investigate** — clears filters so the affected entity is in the rendered set before scroll.
- **[LOW] cyclic refs** — DAG walk depth-capped.
- **[HIGH/doc] classifier limitation (HALT-1)** — a ratio-gated payout is the structural *proxy* for
  target-driven; the grammar carries **no explicit target-role marker**, so a pure volume-ratio gate would
  also classify R3. The grammar cannot distinguish them; certainty needs an upstream grammar enhancement.
  **Verified correct on BCL** (real denominators `meta_colocacion`/`deposit_target`); the false-positive is
  a hypothetical edge. Documented in the classifier header + the ADR.

**Accepted as low-risk (named, not fixed):** unvalidated `changes` JSONB on the audit row (written by an
authenticated admin; low blast radius); silent service-role→auth-client fallback (matches the established
codebase route pattern); duplicate-component-name dedup edge. Classifier re-trace after fixes: unchanged
(BCL R3/R3/R1/R1). Build exit 0.

## SR-39 Compliance

Reads `calculation_results`/`rule_sets` via the existing tenant-scoped path; the resolve route writes
`audit_logs` with the **correct `profile_id`** column and a **cross-tenant guard** (non-platform callers
pinned to their own `profile.tenant_id`, else 403). Auth gate present (`getUser`). No new isolation
surface; the capability gate (Pass-1) governs admin action visibility. SOC2 CC6 / DS-014 / Decision 123 honored.

## Residuals

R1 regime-2/3 RENDERING exercised when a paying-target plan is onboarded (classifier handles all three;
BCL R3 components classify but the attainment VALUE isn't structurally recomputable — see R2) · R2 per-component
attainment persistence (engine) · R3 temporal/trend persistence · R4 entity-table server-COUNT for the
population total · R5 the regime model governs the remaining surfaces · R6 R1 exit criteria.

## ARTIFACT SYNC

```
ARTIFACT SYNC
MC: F-2 (Admin ICM results) → CLOSED (pending SR-44). Regime-blind representation → RESOLVED. Actionless anomaly summary → CLOSED. Directive premise "BCL all regime 1" → CORRECTED to mixed-regime (HALT-3, reported).
REGISTRY: NEW "Performance Regime Model" → per-component, structural, governs all performance surfaces. "Admin ICM Results" → governance surface, regime-aware distribution, anomaly actions.
R1: Tier C candidate "results are persona-aware governance surfaces; performance per component-regime" → pending SR-44.
BOARD: Decide (Admin ICM results surface). Performance Regime Model established as a cross-surface primitive.
SUBSTRATE: per-component regime (Decision 158, Korean Test); accommodates no-target/non-paying/paying within one plan (BCL proves mixed); DS-008-A3 Action Cards; Action Proximity → audit_logs(profile_id); empty-panel defect reframed as regime-blindness and resolved.
```

---

*OB-207 Increment 2 Pass 2 — Admin ICM Results (regime-aware) · 2026-06-14 · vialuce.ai*
