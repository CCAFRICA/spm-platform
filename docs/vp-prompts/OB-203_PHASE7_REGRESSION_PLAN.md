# OB-203 Phase 7 — Clean-Slate Regression Plan (STAGED, ready on holdout pass)

**Purpose:** prove the full OB-203 arc (Phases 1–6) introduced **zero calculation regression** against the
locked anchors. **HALT-9: zero tolerance** — any anchor delta halts; no "close enough."

## Locked anchors (exact)
| Tenant | Anchor(s) |
|---|---|
| **BCL** (Brasa y Maíz lineage) | **$312,033** |
| **Meridian** | **185,063 / 175,585 / 196,337** (the three component outputs) |
| **CRP** | **$364,457.84** |

## Order of operations (NON-NEGOTIABLE)
1. **EXPORT BASELINES FIRST.** Before any clean-slate action, export each tenant's current
   `entity_period_outcomes` / `calculation_results` for the anchor periods to a tsx-readable snapshot.
   Baseline export precedes deletion — never the reverse.
2. **PRESERVE `rule_sets`.** The clean-slate clears committed_data / entities / fingerprints / signals, but
   **rule_sets (plan components, bindings) are preserved** — convergence re-derives input bindings from the
   re-imported data; the plan definition is not re-created.
3. **Re-import** each tenant's source via the SCI pipeline (architect-executed for blind-holdout tenants;
   CC-executed for non-holdout regression tenants per disposition).
4. **Re-calculate** the anchor periods.
5. **Compare** to the exported baselines — **exact** (HALT-9). Paste the diff (expect zero).

## Clean-slate scope (per tenant)
Cleared: `committed_data`, `entities`, `entity_period_outcomes`, `calculation_results`, `import_batches`,
`structural_fingerprints` (sheet + atom), `classification_signals` (the run's). **Preserved:** `tenants`,
`profiles`, `rule_sets`, `periods` (or re-created exactly).

## Phase-6-specific regression watch (the D3 change)
The entity-resolution D3 fix (transaction/target reference_key links, never fabricates) is the highest-risk
change for the anchors. Verify per tenant after re-import:
- `[Entity Resolution] … N spurious entity(ies) suppressed` — N should be **0 for the regression tenants**
  (their reference_keys reference real rosters; nothing spurious to suppress). A non-zero N on a regression
  tenant means a real FK was mis-suppressed → **HALT, refine the gate with graph-overlap evidence**.
- Entity counts per tenant match baseline (no roster entity lost).

## Verification scripts (staged)
- `scripts/ob203-trace.ts <tenant> <session>` — signal timeline, tier distribution, remediation rollup.
- `scripts/ob203-phase6-verify.ts <tenant> [session]` — workbook-graph roles + D3 entity census.
- Per-tenant baseline export + anchor compare: authored at Phase 7 start (tsx; reads
  `entity_period_outcomes` for the anchor periods).

## Gate
Phase 7 passes only when **all anchors match exactly** AND the holdout exit witnesses (Phase 6) passed.
Any delta → HALT-9, root-cause, fix, re-run. No partial acceptance.

**Status: STAGED.** Executes the moment the Brasa y Maíz blind-holdout import (Phase 6 exit witness) passes.
