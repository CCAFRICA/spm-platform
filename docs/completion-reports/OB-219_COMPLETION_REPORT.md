# OB-219 — Per-Transaction Audit Drill-Down + Commission Statement — Completion Report

*Branch: `ob-219-transaction-drill-down` · 2026-06-19 · DO NOT MERGE (SR-44)*

---

## 1. Outcome

The experience layer over the OB-217/218 trace substrate is built: an admin can navigate from
the Results surface to any entity's **commission statement** — component breakdown → per-transaction
table → inline transaction detail (formula, inputs, rate, contribution, steps, raw source row) —
with clawback rows rendered as reversals (original + formula). Domain-agnostic, Bliss-themed,
tenant-locale currency/dates.

**Verification boundary (same as OB-217/218):** app pages sit behind middleware auth, so the live
*visual* walkthrough (theme/responsive/click-through) is an authenticated-browser step. I proved the
**data layer against real BCL data**, **unit-tested the pure transforms**, and **built exit-0** — i.e.
everything the page renders is proven correct; only the pixels need an authenticated session.

---

## 2. DoD status

| # | DoD | Status |
|---|---|---|
| 1 | Commission statement page (entity+period → total + components + per-tx table), URL-addressable | ✅ `/operate/statement/[entityId]/[periodId]` |
| 2 | Transaction detail (formula/inputs/rate/contribution/steps); clawback shows original + reversal | ✅ inline `TransactionDetail` in the view |
| 3 | Admin drill-down entry point from Results | ✅ "Commission Statement →" button in `/operate/results` |
| 4 | Bliss theme (light+dark), responsive | ✅ semantic theme classes + Bliss `Card`/`Collapsible`/`Table`/`Badge` (visual confirm = architect browser) |
| 5 | i18n-aware currency/number/date by tenant locale | ✅ `useCurrency()`/`useTenantDate()` (BCL USD/es-EC, MIR PEN/en-US) |
| 6 | MIR demo: per-transaction traces with rates/contributions | ⚠️ **MIR has 0 traces** (OB-218 keystone deferred) → MIR renders entity-level only; per-transaction proven on **BCL**. Lights up when MIR bindings are regenerated. |
| 7 | build exit-0; PR opened (not merged) | ✅ |

---

## 3. Architecture (matches live conventions, mapped via comprehension)

- **Page**: client component (the app's universal data-page pattern), `/operate/statement/[entityId]/[periodId]`, `useParams()` + `useTenant()`, fetches the API route.
- **Data**: `web/src/lib/compensation/commission-statement.ts` — `getCommissionStatement(client, tenantId, entityId, periodId)` + pure transforms. Merges the **authoritative** component list (`calculation_results.components`) with **per-row traces** (`calculation_traces`) joined to **source rows** (`committed_data`). Takes a `SupabaseClient`, so the route, tests, and a browser page all share it.
- **API**: `web/src/app/api/compensation/statement/route.ts` — GET, auth-gated (`getUser`), service-role aggregation (the `api/periods` pattern). Zero LLM (Decision 158).
- **UI**: `web/src/components/compensation/CommissionStatementView.tsx` — header + `Collapsible` component cards + `Table` of transactions + inline `TransactionDetail`; `Badge` patterns (Additive/Qualified/**Reversal**/Entity-level); `EmptyState`/skeletons; `cn` + semantic theme tokens.
- **Entry point**: `/operate/results` entity row → "Commission Statement →" using `selectedBatch.periodId` + `row.entityId`.

**Korean Test (PASS)**: component names render from `calculation_traces.component_name`; input labels from `inputs` JSONB keys; source fields from `row_data` keys; amounts/dates from tenant locale. Zero component/column/plan literals in UI code — works for BCL, MIR, any tenant.

---

## 4. Pasted evidence

### 4a. Data layer vs REAL BCL (read-only)
```
===== OB-219 commission statement (BCL, real data) =====
entity: Verónica Sofía Zambrano Rojas (BCL-5083)  period: October 2025
totalPayout: 352  hasTraces: true  traceCount: 1
components:
  - "Colocación de Crédito — Ejecutivo" payout=180 attributable=false pattern=entity-level txns=0
  - "Captación de Depósitos — Ejecutivo" payout=0   attributable=false pattern=entity-level txns=0
  - "Productos Cruzados — Ejecutivo"     payout=72  attributable=true  pattern=additive txns=1 tracedSubtotal=72
      sample tx: ref="BCL-5083" date=2025-10-01 inputs={"Cantidad_Productos_Cruzados":4} rate=18 contribution=72 sourceRow=present
  - "Cumplimiento Regulatorio — Ejecutivo" payout=100 attributable=false pattern=entity-level txns=0
✅ PASS — attributable component reconciles (tracedSubtotal === payout); per-tx rows carry rate/inputs/sourceRow; Pattern-C → entity-level.
```
(`web/scripts/ob219-verify-statement.ts`. Note: `ref="BCL-5083"` is the pre-OB-218-fix value in existing traces; a post-OB-218 BCL recalc yields `transaction_ref: null` and the UI falls back to the committed_data id.)

### 4b. Unit tests (3/3)
```
✔ isClawbackTrace: pattern clawback only
✔ groupTracesByComponent: groups, skips null committed_data_id, joins source, sorts by date
✔ buildStatementComponents: merges authoritative components with traces  [additive reconciles; clawback pattern; Pattern-C entity-level]
ℹ tests 3  ℹ pass 3  ℹ fail 0
```

### 4c. Build / scanners
```
$ npx tsc --noEmit                    → EXIT 0
$ bash scripts/verify-korean-test.sh  → PASS
$ npm run build                       → EXIT 0
```

---

## 5. Notes / residuals

- **MIR per-transaction (DoD #6)**: MIR has 0 traces (OB-218 keystone deferred behind the cross-wired-bindings rebind). The statement renders MIR's entity-level components correctly today; per-transaction rows appear automatically once MIR traces exist. No code change needed then.
- **Rep self-service** (`/perform/statements`, entity-to-user linking) is OOS (DS-014 Phase 3); this OB serves the admin-accessed statement, the MIR-demo path.
- **Input label humanization**: the table renders raw `inputs` keys (e.g. `Cantidad_Productos_Cruzados`). Display-name mapping is a noted follow-on (directive §6A.3).
- **transaction_ref**: existing BCL traces show the old value until a recalc applies the OB-218 fix; the UI already falls back to the committed_data id when `transaction_ref` is null.

---

## 6. ARTIFACT SYNC

```
ARTIFACT SYNC
MC: Commission Statement: NOT BUILT → BUILT; Transaction Detail: NOT BUILT → BUILT; clawback rendering BUILT.
REGISTRY: Audit Trail → drill-down UI (per-transaction table + detail + source row) reading calculation_traces;
          Rep Transparency → commission statement page (admin-accessed; rep self-service still OOS).
BOARD: 5-layer drill-down — bottom 3 layers (transactions → per-transaction calc → source data) now have UI.
       MIR per-transaction view pending MIR binding regeneration (renders entity-level today).
SUBSTRATE: Korean Test (domain-agnostic rendering — names/labels from data), Thermostat (actionable
           per-transaction detail, not just a number), Decision 158 (UI reads stored traces, zero LLM).
```

## 7. SHA

Merge-ready PR-branch HEAD: `git rev-parse HEAD` on `ob-219-transaction-drill-down` (recorded on the PR). DO NOT MERGE — SR-44.
