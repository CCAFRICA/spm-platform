# OB-224 Completion Report — Transactional Detail / Five-Layer Drill-Through

**Date:** 2026-06-20
**Branch:** `ob-224-drill-through`
**Implementation SHA (build-verified):** `90e2c91d` (final push SHA recorded on PR)
**Status:** Built, tsc clean, `next build` GREEN (198/198 pages). **NOT merged** — per the SR-44 split-proof model the architect merges + performs browser-visual verification.

---

## Headline

The calculation substrate was rich but **no user could reach any of it**. OB-224 ships one reusable drill-through library (data layer + components) and wires it into **8 surfaces**, turning every rendered number into a path: **entity → result → component → per-transaction trace → source transaction**, with inline dispute filing and CSV export.

Built as ONE component set consumed by all surfaces (AP-17), reusing the OB-219 `getCommissionStatement` assembler rather than duplicating trace logic. Data layer proven **13/13 against real BCL data** + the Sabor no-outcomes fallback + a self-cleaning dispute round-trip.

---

## Files changed (25 files, +2877 / −316)

**Data layer (new) — `web/src/lib/drill-through/`**
- `types.ts` (69), `entity-scope.ts` (47), `entity-results.ts` (169), `component-traces.ts` (73), `source-transactions.ts` (85), `dispute-submit.ts` (42), `index.ts` (13)

**Component library (new) — `web/src/components/drill-through/`**
- `EntityResultsList.tsx` (203), `ComponentCards.tsx` (209), `TransactionRows.tsx` (131), `DisputeInline.tsx` (147), `DrillThroughPanel.tsx` (66), `index.ts` (11)

**Surface integrations**
- `stream/page.tsx` (+68), `operate/calculate/page.tsx` (+15), `operate/reconciliation/page.tsx` (+47), `data/transactions/page.tsx` (rebuild), `perform/statements/page.tsx` (replace), `insights/my-team/page.tsx` (+95), `approvals/page.tsx` (+184), `configure/people/page.tsx` (+83)

**Docs / scripts**
- `docs/vp-prompts/OB-224_DIRECTIVE_20260620.md` (Rule 14), `docs/diagnostics/OB-224_SUBSTRATE_VERIFICATION.md`, `web/scripts/ob-224-substrate-check.ts`, `web/scripts/ob-224-data-layer-test.ts`

---

## Substrate verification findings (§3.1)

No HALT. `calculation_results.components` is an array-of-objects (HALT-2 cleared). All tables exist.

| Table | Rows | Populated |
|---|---|---|
| `calculation_traces` | 7,813 | BCL 510, MIR 7,303 (others 0) |
| `entity_period_outcomes` | 745 | Meridian 201, BCL 510, MIR 34 |
| `calculation_results` | 941 | BCL 510, Meridian 201, MIR 170, Sabor 60 |
| `committed_data` | 120,401 | MIR/Sabor/BCL/Meridian |
| `profile_scope` | **0 (empty)** | — → resolveEntityScope returns "all" |
| `entity_relationships` | 83 | Sabor only |
| `disputes` | **0 (empty)** | schema applied; submitDispute proven via round-trip |

**Structural finding:** BCL `committed_data` has `entity_id`/`period_id` NULL — entity↔row attribution lives only in `calculation_traces.committed_data_id`. `getSourceTransactions` honors BOTH models (direct columns + trace-derived).

---

## Component library

| Component | Props (key) | Behavior |
|---|---|---|
| `DrillThroughPanel` | tenantId, scope, periodId?, batchId?, initialEntityId?, comparisonData?, compact?, showExport? | Orchestrator — one entity open at a time (useDrillThrough), expands ComponentCards inline beneath the row |
| `EntityResultsList` | + onEntitySelect/renderExpanded | Sortable scoped grid, inline row expansion, CSV export |
| `ComponentCards` | tenantId, entityId, periodId, comparisonData?, onTransactionDrill?, onDispute? | Component breakdown + per-transaction trace table; graceful "entity-level" fallback when no traces; comparison overlay |
| `TransactionRows` | tenantId, entityId, periodId, dataType? | Raw committed_data, **dynamic columns from row_data keys** (Korean Test) |
| `DisputeInline` | tenantId, entityId, periodId, componentName, amount, … | Inline dispute filing via submitDispute |

---

## Surface integration verification (§3D.1)

Browser-visual = architect-channel (R2 split-proof). CC evidence per surface = integration + `next build` GREEN + data-layer proof.

| Route | Mode | What landed | Build |
|---|---|---|---|
| `/stream` | add | Distribution "view entities" → inline entity drill (admin); manager acceleration/heatmap click → drill scoped to the on-screen team set (no over-disclosure) | ✅ |
| `/operate/calculate` | add | DrillThroughPanel below grand total (Finding #8), gated on a run | ✅ |
| `/perform/statements` | **replace** | bespoke breakdown + source-tx drill → single ComponentCards (AP-17); +per-tx trace +dispute; pickers/trajectory kept | ✅ |
| `/data/transactions` | **rebuild** | MOCK array + toast stubs removed → real scoped DrillThroughPanel (AP-11) | ✅ |
| `/insights/my-team` | add | non-hospitality empty-state → manager-scoped results panel; hospitality untouched | ✅ |
| `/approvals` | extend | real "Pending Calculations" from calculation_batches + per-batch drill; legacy in-memory UI intact | ✅ |
| `/configure/people` | add | entity row → drill to its components/traces/source (live in-nav people surface; personnel is orphan/mock) | ✅ |
| `/operate/reconciliation` | extend | entity expansion gains ComponentCards with recon expected/delta overlaid per component; external_id→uuid resolved | ✅ |

**Data verification (UI→DB traced):** `getEntityStatement(BCL, 02048d13…, f170f48e…)` → entity "Verónica Sofía Zambrano Rojas", total $352, component "Productos Cruzados — Ejecutivo" formula `18 × Cantidad_Productos_Cruzados`, 1 traced txn (ref `BCL-5083`), source row keys `Periodo, Sucursal, ID_Empleado, Meta_Depositos`. All from live DB, zero hardcoding.

## Export verification (§3D.2 / MC#17)

`EntityResultsList` CSV export header: `External ID, Name, Period, Total Payout, <per-component columns…>, Lifecycle State` — covers the payroll-export shape. Pure transform over the verified `EntityResult[]`.

---

## MC items addressed

| MC | Item | Status |
|---|---|---|
| MC#1 (P0) | Individual Commission Statements | ✅ /perform/statements now has forensic ComponentCards + dispute (page was already partly built — premise stale) |
| MC#2 (P0) | Transaction-Level Detail | ✅ /data/transactions rebuilt on real data; TransactionRows component |
| MC#19 | Forensics drill-down | ✅ five-layer chain across all surfaces |
| MC#24 | Manager/company dashboards | ✅ /stream + /insights/my-team scoped drill |
| MC#39 | Dispute resolution | ✅ DisputeInline (minimal; structured funnel = R-4) |
| MC#43 | Approver visibility | ✅ /approvals per-batch drill (transitions deferred) |
| MC#17 | Payroll-ready export | ✅ CSV export (PDF = R-5) |

---

## HALT encounters

None. HALT-2 (components shape) checked and cleared in §3.1. Resolution rules covered empty `profile_scope`/`disputes`/`entity_relationships`, the NULL-attributed `committed_data`, and the personnel-not-in-nav divergence.

## Known limitations / residuals

- **R-1:** traces exist only for BCL/MIR → ComponentCards renders the entity-level fallback for other tenants (graceful).
- **R-3:** `entity_relationships` Sabor-only + `profile_scope` empty → manager scoping resolves to "all" until materialized; manager /stream drill is scoped to the on-screen team set as a safeguard.
- **R-4:** DisputeInline is a minimal free-text form; the OB-68 structured 7-category funnel is a follow-up.
- **R-5:** CSV export only (PDF deferred).
- **/approvals:** batch Approve/Reject buttons are present but **disabled** — lifecycle transitions deferred to a follow-up (review/reconcile first); the dead `approval-routing` UI was left intact (not deleted) to avoid breaking imports.
- **Premise corrections (faithful reporting):** `/perform/statements` and `/operate/calculate` were NOT empty as the directive stated — both already rendered data; treated as extend/add. `/data/transactions` WAS mock (rebuilt).
- **Browser-visual + the numeric correctness of rendered values** are architect-channel (this OB renders whatever the substrate contains; it sets no verification targets — §2 reconciliation-channel separation).

## PR

`gh pr create --base main --head ob-224-drill-through` — see PR for final push SHA.

---

*OB-224 · Five-Layer Drill-Through · CC build complete · awaiting SR-44 architect merge + browser-visual.*
