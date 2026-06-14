# Performance-Regime Model ADR — OB-207 Increment 2 Pass 2

**Date:** 2026-06-14 · **Governing:** Decision 158 (component grammar), Korean Test (AP-25), DS-008-A2/A3
**Closes:** the regime-blind performance-representation defect (assuming attainment-vs-target universally → empty panels where no target exists)

---

## DECISION

**Performance regime is per-COMPONENT, derived structurally from the component's payout DAG grammar**
(`rule_sets.components[…].metadata.intent` — the Decision-158 per-component DAG).

```
Regime 1 (no target):        the payout DAG computes payout from raw volume/activity/gate metrics —
                             no actual÷target ratio. → represent: relative/temporal (trend, rank,
                             distribution). No target shown.
Regime 2 (non-paying target): the DAG (or metrics) carries an actual÷target ratio that is TRACKED but
                             is NOT a factor in the payout computation. → relative/temporal primary +
                             attainment as management context.
Regime 3 (paying target):    the payout DAG computes an actual÷target ratio (a `divide` node over an
                             actual field and a target field) and that ratio FEEDS a conditional /
                             tier / gate that determines payout. → attainment primary + tier structure.

CLASSIFICATION SOURCE (structural, Korean-Test-clean — zero name/tenant matching):
  Walk the component's metadata.intent DAG:
    - No `divide` op anywhere → Regime 1.
    - A `divide` op whose result is consumed by a `conditional`/`compare` (a payout factor) → Regime 3.
      The divide node's two inputs structurally NAME the {actual, target} fields — the surface reads
      those fields from the persisted `metrics` to compute the attainment VALUE (no name-matching;
      the field identities come from the grammar).
    - A `divide`/ratio present but not consumed by any payout conditional → Regime 2.
  NEVER: assume per tenant, match on component/metric names, or require a target to exist.
```

## BCL classification (worked trace, SR-38) — the premise CORRECTED

The directive assumed BCL is "all Regime 1 (no target)." **The live grammar contradicts that** (HALT-3:
data contradicts premise → report, don't force). Walking each BCL component's `metadata.intent`:

| Component | DAG ops | Field refs | Structural verdict | Regime |
|---|---|---|---|---|
| Colocación de Crédito | `gte`, **`divide`** | colocacion_credito, **meta_colocacion**, calidad_cartera | `divide(colocacion_credito ÷ meta_colocacion)` feeds `gte` tier + quality gate → ratio is a payout factor | **3** |
| Captación de Depósitos | `gte`, **`divide`** | net_new_deposits, **deposit_target** | `divide(net_new_deposits ÷ deposit_target)` feeds `gte` tier → payout factor | **3** |
| Productos Cruzados | `multiply` | productos_cruzados_vendidos | volume × rate; no ratio | **1** |
| Cumplimiento Regulatorio | `eq` | infracciones_regulatorias | compliance gate on a count; no ratio | **1** |

**BCL is MIXED-regime (2× Regime 3, 2× Regime 1)** — which is precisely what the per-component model is
*for* ("each component can be in a different regime within one plan"). This is a stronger demonstration
than the assumed uniform Regime 1. `calculation_results.attainment` is `{overall:0}` — per-component
attainment is **not** persisted there; for the Regime-3 components the attainment ratio is recomputable
from persisted `metrics` (e.g. `Monto_Colocacion ÷ Meta_Colocacion`, and `Cumplimiento_Colocacion` /
`Pct_Meta_Depositos` are the pre-computed ratios already in `metrics`). The divide node tells the surface
**which** metric fields to read — structurally.

## REPRESENTATION MAPPING (pure function: regime → descriptor)

- **Regime 1** → `{ trend, rank, distribution }` (payout distribution + period-over-period + population shape). No target.
- **Regime 2** → `{ trend, rank, distribution, attainmentContext }` (attainment shown, flagged non-paying).
- **Regime 3** → `{ attainmentPrimary, tierStructure }` (attainment from the divide-node fields in metrics + the tier thresholds from the DAG).

This model governs **every** performance surface — Admin distribution (this pass), Manager heatmap,
Rep goal-gradient/component-stack, Acceleration Cards, allocation — each derives representation here,
never re-decides.

## RATIONALE

- **Decision 158:** the grammar already encodes the regime; the classifier READS it.
- **Korean Test:** the signal is the DAG's `divide`-into-conditional structure — not metric names, not
  tenant identity. The OB-206 heatmap's payout encoding was correct *for Regime 1*; its only defect was
  regime-blindness (it would mis-encode a Regime-3 component, where attainment is the axis).
- The "No attainment data" empty panel is regime-blindness — assuming Regime 3 universally.

## REJECTED

- Tenant-level target assumption · attainment as a universal axis · payout-relative as a "fallback" (it
  is the CORRECT Regime-1 representation) · forcing BCL to "all Regime 1" against the grammar.

---

*OB-207 Increment 2 Pass 2 — Performance-Regime Model · 2026-06-14 · vialuce.ai*
