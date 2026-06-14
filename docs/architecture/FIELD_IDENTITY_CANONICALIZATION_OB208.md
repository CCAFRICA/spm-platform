# Field-Identity Canonicalization ADR — OB-208 (D-1)

**Date:** 2026-06-14 · **Governing:** Korean Test (T1-E910 v2), Decision 158, OB-207 Performance Regime ADR

---

## PROBLEM

The DAG grammar references a field by one name; the engine persists the resolved metric under another:

```
DAG field (rule_sets.components.metadata.intent)   →   persisted metrics key (calculation_results.metrics)
  meta_colocacion                                   →   Meta_Colocacion          (casing only)
  colocacion_credito                                →   Monto_Colocacion         (DIFFERENT word)
  net_new_deposits                                  →   Depositos_Nuevos_Netos   (DIFFERENT language)
  deposit_target                                    →   Meta_Depositos           (DIFFERENT word)
```

Two independent strings for one field. The Korean Test (T1-E910 v2) requires **one canonical declaration
from which every boundary derives**. Because field identity had two sources, regime-3 attainment
(actual ÷ target) was uncomputable without name-matching (which the Korean Test forbids) — so Colocación
and Captación classified as "target-driven" but could not render the attainment number.

## DECISION

**The canonical declaration already exists** — no new registry needed (HALT-1 not triggered):
`rule_sets.input_bindings.convergence_bindings` (HF-234) maps, per component, each DAG field name → its
persisted `column` plus a semantic `field_identity.contextualIdentity` / `structuralType`:

```json
"meta_colocacion": { "column": "Meta_Colocacion", "field_identity": { "contextualIdentity": "loan_placement_target", "structuralType": "measure" } }
```

Field identity is resolved **through this one declaration** (`buildFieldBindingMap` →
`resolveAttainmentPct` in `web/src/lib/results/field-identity.ts`). The DAG field name resolves to the
metrics column via the binding; the attainment ratio reads the two columns from persisted metrics. No
hardcoded pair, no per-tenant/domain list, no surface name-matching.

## RESULT (SR-38 trace, live BCL)

```
Colocación de Crédito:  colocacion_credito→Monto_Colocacion=103200 ÷ meta_colocacion→Meta_Colocacion=120000 = 86.0%
Captación de Depósitos: net_new_deposits→Depositos_Nuevos_Netos=31500 ÷ deposit_target→Meta_Depositos=35000 = 90.0%
```

Both computed values **independently match** the persisted pre-computed ratios (`Cumplimiento_Colocacion`
= 0.86; `Pct_Meta_Depositos` = 0.9), validating the canonical-binding resolution. The regime-3 attainment
VALUE is now renderable on the surface — closing the OB-207 R2 residual.

## KOREAN TEST

The resolver is structural — it reads the engine's own per-tenant convergence binding (learned at import,
not authored per tenant) and the regime classifier's structurally-extracted field names. Zero domain/
component/field literals in the resolution path.

## REJECTED

- Name-matching at the surface (the violation) · per-component hardcoded field pairs (N hardcodes) ·
  inventing a new field registry (the binding already is one).

---

*OB-208 D-1 · Field-Identity Canonicalization · 2026-06-14 · vialuce.ai*
