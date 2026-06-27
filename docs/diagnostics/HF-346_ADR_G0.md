# HF-346 — ADR + G0 Diagnostic (BEFORE code)

*Rep Surface Experience: Thermostat, Drill-Through, and Intelligence Consolidation*
*Branch: `hf-346-rep-surface-experience` (from `main @ e0ab691f` — OB-246 + HF-345 merge)*
*Date: 2026-06-26 · Substrate: DS-013 · DS-015 · Performance Intelligence Research · OB-237 MSP · CLT-246*
*Standing rules: CC_STANDING_ARCHITECTURE_RULES.md v3.0 Section B (this gate)*

---

## §0 — Phase 0 root cause (the P0 data-accuracy gate) — HALT-A & HALT-B CLEAR

Live probe of BCL (`b1c2d3e4…`), Rep sample entity `e939a648…` (**BCL-5003 Gabriela Vascones Delgado**):

**`entity_period_outcomes` (MSP) — component dollars EXIST and reconcile:**
```
total_payout: 1775   lowest_lifecycle_state: PREVIEW   attainment_summary: {"overall":0}
component_breakdown = [
  {"payout":700,"componentName":"Colocación de Crédito"},
  {"payout":550,"componentName":"Captación de Depósitos"},
  {"payout":375,"componentName":"Productos Cruzados"},
  {"payout":150,"componentName":"Cumplimiento Regulatorio"}]   // 700+550+375+150 = 1775 = total ✓
```

**THE BUG (CLT-246 F12 — component $0):** `getRepDashboardData` (persona-queries.ts:359-396) reads component
breakdown from the **raw** `calculation_results.components` (period-mismatched: `myOutcome` = highest-payout
period, `myResults[0]` = latest-created), and `parseComponents` (persona-queries.ts:484-490) reads
`comp.value ?? comp.outputValue ?? 0` — but the data field is **`comp.payout`** → every component = **$0**. The
page StackedBar shows correct % because it reads `getComponentTotals` → `entity_period_outcomes.component_breakdown`
(the MSP path). **Code bug, not a data-state gap → HALT-A does NOT fire.**

**Attainment 0% (F13):** `attainment_summary = {"overall":0}` — the materializer carries no per-component targets
(the entity IS rule-set-assigned `7f5370df…`, but per-component target/attainment is absent from the MSP). So 0% is
a **data-state** limitation → Phase 1a: show payout + a "target not assigned" note, NOT "0%".

**Transaction drill-through (Phase 2) — HALT-B CLEAR:** BCL `committed_data` has `data_type='transaction'` = **510
rows, ALL entity-stamped** (6 for this entity), indexed by `entity_id`. The OB-224 source-transaction layer
(`getSourceTransactions(tenantId, entityId, periodId)`) reads exactly this. Drill-through is feasible; the only open
question is per-component *attribution* of transactions (addressed in §1 Option for Phase 2).

---

## §1 — ARCHITECTURE DECISION RECORD

```
Problem: The Rep /perform surface is an admin dashboard with persona-switched scope. It shows admin panels
(Entities Paid, Average Payout, Top Result, Period Finding, Data Quality, Period Lifecycle) that fail the DS-013
test battery for an individual contributor; the component breakdown shows $0 (F12); intelligence is split across
two contradictory sections; locale is mixed; no summary→transaction drill-through exists.
```

### Phase 0 fix (data) — Option A: read components from MSP + parse `payout` (CHOSEN)
- `getRepDashboardData`: components ← `myOutcome.component_breakdown` (MSP `entity_period_outcomes`, same period as
  the total), not `calculation_results.components`. `history` ← `entity_period_outcomes` across periods (MSP).
  `parseComponents`: read `comp.payout` (keep `value`/`outputValue` fallbacks for other tenants — open-vocab).
  - Scale ✅ (1 indexed MSP read, no raw aggregate). AI-first ✅ (no hardcoded field — adds `payout` to the
    tolerated key set). Transport ✅. Atomicity ✅. **Also closes Phase 5 (MSP) for the Rep path.**
- REJECTED Option B (just patch `parseComponents` to read `payout` off `calculation_results`): leaves the raw-path
  read (violates OB-237 MSP) and the period mismatch. Inferior.

### Surface redesign (DS-015 §5.3 Earnings Hero) — restructure the member branch of `/perform`
- The admin panels (Entities Paid / Average Payout / Top Result / Period Finding) live in `app/perform/page.tsx`
  (rendered for all personas) — they are **gated off for member** (`viewRole === 'member'` / not `canViewAll`).
  Admin + manager branches **byte-identical** (DD-7). Data Quality / Period Lifecycle pipeline likewise gated;
  lifecycle → a one-word payout-status badge on the hero (from `lowest_lifecycle_state`).
- **RepDashboard becomes the Earnings Hero surface**: Value (total) + Context (period, component count) +
  Comparison (vs prior, from trajectory) + Reference frame (attainment tier, or "target not assigned") + Action
  (View Components / Simulate) + Impact (focus component). ≤6 elements. Component breakdown rows ($ + % + bar) with
  **inline accordion** drill-through. ONE consolidated Intelligence section (Focus / Trend / Action). What-if inline.
- **Calculate button** in the persistent header: gate by `hasCapability('data.calculate')` (member lacks it; HF-345
  `hasCapability` already returns the preview persona's caps, so a VL-admin Rep preview correctly hides it).

### Phase 2 drill-through — reuse OB-224 source layer; per-component attribution best-effort
- Component row click → inline expansion via the OB-224 `getSourceTransactions(entityId, periodId)` (committed_data
  `data_type='transaction'`). Per-component attribution: filter the entity's transactions by the component when the
  transaction row carries a resolvable component/metric key (e.g. `row_data._sheetName` / a product field); else
  show the entity's period transactions with a note. Reconciliation shown where attributable.
- HALT-B: query is `entity_id + period` (indexed). No new index needed; if attribution requires a scan, fall back
  to the unfiltered entity-period list (documented). No engine change.

### GOVERNING PRINCIPLES (G1–G6)
- **G1/G2 (DS-013/DS-015 + OB-237):** the Rep surface embodies the Thermostat principle structurally — every metric
  carries a reference frame + action path; all reads from MSP (`entity_period_outcomes`), proven by grep (PG-12).
- **G3:** Standard (DS-015 §5.3 five-element hero) → Architecture (RepDashboard hero) → Implementation (PG-1/14).
- **G4:** Performance Intelligence Research §4.1 (Rep ≤5–6 elements, hero dominant, Type-2 on demand) — cited.
- **G5:** domain-agnostic (earnings/components/trajectory generalize beyond banking). **G6:** grounded (DS specs).

---

## §2 — HALT dispositions

| HALT | Disposition |
|---|---|
| **A** (no per-component MSP data) | **Not triggered** — `component_breakdown` carries per-component `payout` summing to the total. The $0 is a parse/source bug. |
| **B** (drill-through unscalable) | **Not triggered** — `committed_data data_type='transaction'` is entity-stamped + indexed; query is `entity_id+period`. |
| **C** (intelligence requires AI-pipeline change) | RENDER consolidation only (merge two sections, correctly render pre-generated/derived intelligence). AI generation content = out of scope (Residual 3). |
| **D** (no i18n mechanism) | Use the existing `isSpanish = isSpanishLocale(locale)` conditional-label mechanism already pervasive in `/perform`. Rep-surface labels only. Platform-wide i18n = Residual 4. |
| **E** (engine / SCI touched) | Guarded — read-path + rendering only. PG-15 git-diff proves `run-calculation.ts`/`convergence-service.ts`/SCI untouched. |

**DD-7:** admin + manager `/perform` byte-identical; only the member branch changes. `/stream` untouched (§6).

---

## §3 — Phase plan
P0 data fix (getRepDashboardData → MSP + parseComponents payout) · P1 Earnings Hero + remove admin panels + hide
Calculate · P2 component→transaction inline drill-through · P3 intelligence consolidation (one section) · P4
trajectory/what-if/links/locale · P5 MSP grep verification · P6 build/verify/PR/report (PG-0..17).

*HF-346 ADR · committed before implementation per Section B.*
