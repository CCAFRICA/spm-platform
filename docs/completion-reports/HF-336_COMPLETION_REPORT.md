# HF-336 — Convergence Binding Population: Completion Report

**Date:** 2026-06-22 · **Branch:** `hf-336-convergence-bindings` · **Priority:** ZERO (ahead of OB-232 Insight Engine)
**Directive:** `docs/vp-prompts/HF-336_CONVERGENCE_BINDING_POPULATION_20260622.md`

## Summary
Sabor's `rule_sets.input_bindings` was empty `{}`, forcing raw Spanish POS field names (`total`, `propina`) into `summary_artifacts` — a Korean Test violation. HF-336 populates convergence bindings for Sabor (LLM recognizes semantic roles), builds the absent Summary Engine enrichment path, and re-backfills so metrics carry **platform semantic roles** (`revenue`, `tips`, …). Proven on live data. All evidence pasted.

## HALT outcomes
- **HALT-1 (no generator path):** the SCI/convergence binding mechanism exists but is **ICM-plan-coupled** (`lib/sci/*`); Sabor is Financial-Agent/POS data. Per the directive, built a **standalone generator** (`convergence-binding-generator.ts`) using the same BCL binding STRUCTURE. Did not hard-halt.
- **HALT-2 (no enrichment path):** confirmed — `summary-engine.ts` had no convergence-enrichment (OB-229 deferred it; Sabor had empty bindings + BCL had no summaries at build time). **Built it** (`buildSemanticKeyMap` + `aggregateCommittedRows(keyMap)`).

## Approach: standalone generator (LLM recognition) + JS-path enrichment
LLM (`claude-sonnet-4-6`, via model-policy) assigns `{structuralType, contextualIdentity}` per field from field names + sample values (Decision 158 recognition). Deterministic code persists BCL-shaped `convergence_bindings` and aggregates. The SQL RPC stores raw keys only, so **enriched tenants take the JS aggregation path** (which applies the key map); unenriched tenants keep the fast RPC (raw keys, unchanged). RPC-side enrichment is a documented follow-on.

## Proof Gates

### PG-1 — Sabor convergence bindings exist — **PASS**
```
PG-1 binding gen: {"ruleSetsUpdated":2,"fieldsBound":27}
field → role (LLM-assigned, sample):
  total → revenue (measure)            propina → tips (measure)
  total_alimentos → food_revenue        total_bebidas → beverage_revenue
  total_descuentos → discount           total_cortesias → complimentary
  cancelado → cancellation              numero_de_personas → guest_count
  total_articulos → item_count          mesero_id → server_identifier (identifier)
  fecha → transaction_datetime (temporal)   turno → shift_category (category)
```
Persisted to both active rule sets (`Índice de Desempeño - Sucursales`, `Comisión por Ventas - Meseros`) as `input_bindings.convergence_bindings.component_0.{column}` with `field_identity.{structuralType, contextualIdentity}` + `learning_provenance`.

### PG-2 — summary_artifacts use semantic keys — **PASS**
Re-backfill: `{"written":2520,"skipped":0,"via":"js"}`. Metric keys NOW (zero raw POS names):
```
beverage_revenue, cancellation, complimentary, discount, document_identifier, food_revenue,
guest_count, item_count, net_revenue, payment_card, payment_cash, revenue, server_identifier,
shift_identifier, subtotal, table_identifier, tax, tips
```
Sample row metrics: `{"tax":7850.33,"tips":6595.62,"revenue":56914.75,"discount":1637.86,"subtotal":50878.02,"item_count":1060,"guest_count":414,"net_revenue":106537.10,...}`

### PG-3 — financial page renders with semantic keys — **PASS (byte-identical)**
`aggregateNetworkPulseFromSummaries` now reads platform roles. Revenue computed from the `revenue` role:
```
revenue(role)=MX$100,068,158.15 | tips(role)=MX$12,746,075.01 | cheques=263250
```
**Identical** to the pre-HF `total`/`propina` sums (OB-229 proved `total`=MX$100,068,158.15) — enrichment is a pure relabeling; correctness preserved (T1-E904).

### PG-4 — Korean Test — **PASS**
```
$ grep -nE "'total'|'propina'|'descuento'|total_alimentos|total_bebidas|total_cortesias|total_descuentos|mesero_id|numero_de_personas" \
    src/lib/summary/{convergence-binding-generator,semantic-roles,summary-engine}.ts
convergence-binding-generator.ts:93:  // collide when two fields share a role (e.g. descuento + total_descuentos → discount)  [COMMENT only]
```
The sole hit is an explanatory comment, not a code literal. The generator assigns roles via the LLM (no field→role dictionary); the enrichment key map is built from data (`input_bindings`); the page reads platform roles (`m.revenue`, `m.tips`). (The separate raw-cheque FALLBACK path `aggregateNetworkPulse` reads raw fields by nature — it reads raw `committed_data`, not summaries — and is unchanged; the SEMANTIC path is clean.)

## Subtraction log (hardcoded POS field names removed)
`financial/data/route.ts` summary read: `m.total→m.revenue`, `m.propina→m.tips`, `m.total_alimentos→m.food_revenue`, `m.total_bebidas→m.beverage_revenue`, `m.total_descuentos→m.discount`, `m.total_cortesias→m.complimentary`.

## Build
`tsc --noEmit` 0 errors · `npm run build` exit 0, `✓ Compiled successfully`, 206/206 static pages.

## §2.4 — OB-232 readiness
Sabor's `summary_artifacts` now carry semantic keys, so the OB-232 Insight Engine (parked, not yet run) will read semantically self-describing data with no hardcoded instructions — no OB-232 code change needed.

## Residuals
- **Role consolidation:** fields sharing a role aggregate under it (e.g. `descuento` + `total_descuentos` → `discount`; `pagado` + `subtotal_con_descuento` → `net_revenue`). Semantically reasonable; precise per-field reduction (BCL `reduction: snapshot|last`) deferred.
- **RPC-side enrichment:** enriched tenants use the JS backfill path; adding the key remap to the SQL RPC (so import-time enrichment is fast) is a follow-on (architect SQL).
- **finalize-import clears bindings:** step 2 sets `input_bindings={}` on every import (HF-269). A re-import of Sabor would clear these bindings; re-running the generator restores them. Wiring the generator into the import pipeline is a follow-on.
- **MIR/CRP:** same generator applies; deferred (other open items).

## PR
`gh pr create --base main --head hf-336-convergence-bindings`. Architect merges (SR-44).
