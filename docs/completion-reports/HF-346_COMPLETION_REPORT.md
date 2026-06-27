# HF-346 — Rep Surface Experience: Thermostat, Drill-Through, and Intelligence Consolidation — Completion Report

*Branch: `hf-346-rep-surface-experience` (from `main @ e0ab691f` — OB-246 + HF-345 merge)*
*Date: 2026-06-26 · Substrate: DS-013 · DS-015 · Performance Intelligence Research · OB-237 MSP · CLT-246*
*Standing rules: CC_STANDING_ARCHITECTURE_RULES.md v3.0 (Section B ADR `docs/diagnostics/HF-346_ADR_G0.md`, committed before code). Evidentiary discipline: pasted evidence per gate, not self-attestation.*

---

## 1. Summary

The Rep `/perform` surface was an admin dashboard with persona-switched scope; it showed admin panels that fail the
DS-013 test battery for an individual contributor, the component breakdown read `$0` (F12), intelligence was split
across contradictory sections, and there was no summary→transaction drill-through. HF-346 fixes the data root cause
and rebuilds the member surface around the **DS-015 §5.3 Earnings Hero** (5 elements, hero dominant, Thermostat not
thermometer). **Admin + manager `/perform` are byte-identical (DD-7); only the member branch changes.**

**Gates:** `tsc --noEmit` 0 · `npm run build` 0 (Korean Test gate PASS) · dev `:3008/login` 200 · engine/SCI untouched (HALT-E).

---

## 2. Proof gates (PG-0 … PG-17) — pasted evidence

### PG-0 — Phase 0 root cause (data-state vs code bug)
Live probe, BCL entity `e939a648…` (BCL-5003). **`entity_period_outcomes.component_breakdown` (MSP) carries per-component dollars that reconcile to the total — HALT-A does NOT fire:**
```
total_payout: 1775   attainment_summary: {"overall":0}   lowest_lifecycle_state: PREVIEW
component_breakdown = [{"payout":700,"componentName":"Colocación de Crédito"},
                       {"payout":550,"componentName":"Captación de Depósitos"},
                       {"payout":375,"componentName":"Productos Cruzados"},
                       {"payout":150,"componentName":"Cumplimiento Regulatorio"}]   // 700+550+375+150 = 1775 ✓
```
**Bug = code:** `getRepDashboardData` read `calculation_results.components` (period-mismatched), and `parseComponents`
read `comp.value ?? comp.outputValue ?? 0` — but the dollar field is **`comp.payout`** → every component `$0`. Fix:
```ts
// parseComponents (persona-queries.ts)
value: typeof comp.payout === 'number' ? comp.payout
  : typeof comp.value === 'number' ? comp.value
  : typeof comp.outputValue === 'number' ? comp.outputValue : 0,
// getRepDashboardData: components from the MSP breakdown (same period as the total)
components: parseComponents(myOutcome?.component_breakdown ?? null),
```
Attainment `{"overall":0}` = data-state (no per-component targets) → handled as "target not assigned", never "0%".

### PG-1 — Earnings Hero (Value + Context + Comparison + Reference frame + Action + Impact)
`RepDashboard.tsx` hero: Value = `{format(data.totalPayout)}` (5xl dominant); Context = `periodLabel` + component
count; Comparison = `<Delta pct={derived.deltaPct} />` (vs prior, from MSP history); Reference frame = attainment
tier bar OR "target not assigned"; Status badge = `payoutStatus(data.lifecycleState)` → In Review / Approved / Paid;
Impact = focus component (`derived.focus`); Action = `View Components ↓` (scrolls) + `Simulate What-If →`. Data source:
`getRepDashboardData` (MSP `entity_period_outcomes`).

### PG-2 — Admin-metric panels removed for member
`app/perform/page.tsx`:
```tsx
const isRep = persona === 'rep';
// …
{!isRep && (<>
  {/* Period Total tile, Entities Paid, Average Payout, Top Result, Period Finding, Data Quality,
      Compensation-by-Component, Payout Distribution, Period Lifecycle, AI Findings */}
  …
</>)}
```
For `persona !== 'rep'` (admin/manager) the gate is a no-op → unchanged (DD-7).

### PG-3 — Calculate button hidden for member
`VialuceTopbar.tsx`:
```ts
if (!hasCapability('data.calculate')) return false;   // calcAccessible gate
```
A rep lacks `data.calculate` (reaches the calculate workspace only via `/perform/statements`) → CTA hidden. HF-345
`hasCapability` honors the preview persona, so a VL-admin Rep preview also hides it. Admin/platform hold the cap → shown.

### PG-4 — Component breakdown dollars SUM to total
`getRepDashboardData.components` = `[{Colocación,700},{Captación,550},{Productos Cruzados,375},{Cumplimiento,150}]`
→ **700+550+375+150 = 1,775 = `total_payout`** (PG-0 probe). The breakdown renders via OB-224 `ComponentCards`
(`getEntityStatement`), whose `StatementComponent.payout` equals these MSP values.

### PG-5 — Component row click → transactions inline (Action Proximity)
`RepDashboard.tsx` renders `<ComponentCards tenantId entityId={data.entityId} periodId={data.periodId} … />` (OB-224).
A row with per-transaction traces expands inline ("N transactions · traced $X" → date/contribution table);
entity-level components (BCL Pattern C) expand inline source rows via `handleSource` (self-managed `openSource`, no
`onTransactionDrill` prop → inline, never a dead button). **No navigation away** (DS-013 §4.3).

### PG-6 — Transaction amounts reconcile to component amount
`getEntityStatement` probe (BCL): `Productos Cruzados payout=375 attributable=true txns=1 tracedSubtotal=375` →
**traced subtotal = component payout = $375** ✓. Entity-level components (Colocación/Captación/Cumplimiento) carry the
authoritative MSP payout (700/550/150) shown on the card; their inputs are aggregate metrics (no discrete transactions
— Pattern C), surfaced via the inline "Source data" expander.

### PG-7 — ONE intelligence section
`RepDashboard.tsx` renders a single Intelligence card (Focus / Trend / Action). The prior four intelligence
presences (`AgentInbox`, `InsightPanel`, `NextAction`, `AssessmentPanel`) are removed from the rep surface.

### PG-8 — No contradictory metrics
Intelligence derives from the SAME `data` as the hero (no second source). Relative position is anonymized
**percentile** (`derived.pct = round((totalEntities - rank + 1)/totalEntities * 100)`), never "#1 of 85" (OB-246).
Trend = `derived.deltaPct` (the hero's comparison). No "Ranked #1 + 0% attainment" contradiction.

### PG-9 — All links functional (no dead ends)
Every clickable in `RepDashboard.tsx` is an **inline `scrollIntoView` / state toggle** — `View Components ↓`
(scroll), `Simulate What-If →` (toggle + scroll), the intelligence Action (scroll to Component Breakdown). The prior
`/data/transactions` link (OB-246 `view.team_results`-gated, unreachable by a member) was **removed**. `ComponentCards`
trace/source expanders are inline.

### PG-10 — "View Trajectory" works or is removed
Trajectory is an **inline** element (Sparkline + projection); there is no "View Trajectory →" navigation to a member-
inaccessible page → no dead link (removed-by-design).

### PG-11 — Locale consistent
Every chrome label in `RepDashboard.tsx` is gated on `isEs = isSpanishLocale(locale)` (e.g. `Mi Compensación`/`My
Earnings`, `En Revisión`/`In Review`, `Desglose por Componente`/`Component Breakdown`). No mixed EN/ES (grep clean).
Tier labels (Base/Standard/Premium) are role-neutral chrome. Tenant data (component names) display as-is.

### PG-12 — Every visualization object reads MSP
`getRepDashboardData` grep — sources: `entity_period_outcomes` (×4: outcome, history, ranking, top-fallback) +
`periods` (labels). **No `calculation_results`.** The hero / trajectory / component-breakdown dollars are MSP. The
component **drill-down** reuses OB-224 `ComponentCards → getEntityStatement` which reads `calculation_results` +
`calculation_traces` — the documented MSP exemption (transaction/trace detail, not an aggregate render; its component
payouts equal the MSP `component_breakdown` values).

### PG-13 — Admin `/perform` unchanged (DD-7)
The `{!isRep && …}` gate renders the full admin panel set for `persona !== 'rep'`; `RepDashboard` renders only for
`persona === 'rep'`. No admin/manager code path changed. (Adversarial-review R1 dimension below.)

### PG-14 — DS-013 test battery (element-by-element)
| Element | IAP | Five Elements | Thermostat (frame + action) | Verdict |
|---|---|---|---|---|
| Earnings Hero | P (own earnings) | Value+Context+Comparison+Frame+Action+Impact | attainment/tier frame + View Components/Simulate | **PASS** |
| Component Breakdown | I+P | $ + % + drill | click → transactions inline | **PASS** |
| Trajectory | A+P | value+context+comparison(step/proj) | "↗ +$X/period · proj $Y" | **PASS** |
| Intelligence (Focus/Trend/Action) | I+A | focus + trend + action | each carries a concrete next step | **PASS** |
| What-If | A | inline projection | drag → projected payout/tier (or "requires target") | **PASS** |
*Removed (failed all-three IAP for a rep): Entities Paid, Average Payout, Top Result, Period Finding, Data Quality, Period Lifecycle, duplicate intelligence.*

### PG-15 — Zero engine/SCI changes
`git diff --name-only main…HEAD` → 6 files (2 docs + `app/perform/page.tsx`, `RepDashboard.tsx`, `VialuceTopbar.tsx`,
`persona-queries.ts`). `run-calculation.ts` / `convergence-service.ts` / SCI **absent** (HALT-E).

### PG-16 — `npm run build` exits 0
`Compiled successfully` · `[korean-test-gate] PASS` · `BUILD_EXIT=0` · `tsc --noEmit` 0 · dev `:3008/login` 200.

### PG-17 — PR
(URL recorded on creation below.)

---

## 3. CLT-246 dispositions (F06–F24)

| Finding | Disposition |
|---|---|
| **F12** component $0 | **FIXED** (Phase 0 — parseComponents reads `payout` + MSP `component_breakdown`) |
| **F13** 0% attainment | **FIXED display** — data-state (`attainment_summary={overall:0}`, no targets) → "target not assigned", never 0% |
| **F14** RepDashboard $0 | **FIXED** (cascade of F12) |
| **F16** contradictory intelligence | **FIXED** — ONE section, percentile not "#1 of 85", same data as hero |
| **F17** inaccurate coaching | **FIXED display** — Focus/Trend/Action derive deterministically from the corrected data (AI-generation quality = Residual 3, HALT-C) |
| **F18** wrong focus | **FIXED** — focus = the corrected component data (smallest-headroom growth opportunity) |
| **F21** broken trajectory link | **FIXED** — trajectory is inline (no dead navigation) |
| **F22** broken what-if ($0) | **FIXED** — downstream of F12; what-if renders, and shows "requires target assignment" where attainment is unassigned (not $0) |
| **F06–F11, F15, F19–F20, F23–F24** (admin-panel relevance, locale mixing, link dead-ends, intelligence duplication, lifecycle pipeline for rep) | **ADDRESSED by the redesign** — admin panels gated off for rep (PG-2), locale consistent (PG-11), links functional (PG-9), one intelligence section (PG-7), lifecycle → status badge (PG-1) |

No silent omissions: where a finding is data-blocked (per-component targets / per-transaction attribution for BCL
entity-level components), it is disposed as data-state with the honest display, not faked.

---

## 4. HALT dispositions
- **A** (no per-component MSP data) — not triggered (component_breakdown reconciles to total).
- **B** (drill-through unscalable) — not triggered (`committed_data data_type='transaction'` entity-stamped + indexed; OB-224 trace path).
- **C** (intelligence requires AI-pipeline change) — RENDER consolidation only; AI-generation quality = Residual 3.
- **D** (no i18n mechanism) — used the existing `isSpanish`/`isEs` conditional-label mechanism (Rep surface only).
- **E** (engine/SCI) — not triggered (PG-15).

---

## 5. Browser verification (architect, SR-43)
- VL admin → BCL → **Admin** persona → `/perform`: full admin panels + Calculate CTA (unchanged, DD-7).
- VL admin → BCL → **Rep** persona → `/perform`: Earnings Hero ($1,775 · period · vs prior · status badge),
  Component Breakdown (Colocación $700 / Captación $550 / Productos Cruzados $375 / Cumplimiento $150 — click → inline
  transactions/source), Trajectory sparkline, ONE Intelligence section, What-If on demand; **no** Entities Paid /
  Average / Top Result / Data Quality / Lifecycle panels; **no** Calculate CTA.
- Real member login → own-entity scope (blocked on OB-246 Residual 2 entity-linkage; the surface is correct, the data is data-blocked).

---

## 6. ARTIFACT SYNC
```
ARTIFACT SYNC
MC: HF-346 → COMPLETE (Rep /perform redesign). CLT-246 F12/F13/F14/F16/F17/F18/F21/F22 → FIXED;
    F06-F11/F15/F19-F24 → ADDRESSED by redesign (admin-panel removal, locale, links, one intelligence, status badge).
REGISTRY: Rep Surface / Perform → DS-013 §7 test battery compliant (element-by-element table, PG-14); DS-015 §5.3
    Earnings Hero implemented; component→transaction drill-through (Action Proximity) via OB-224 reuse.
R1: admin + manager /perform byte-identical (DD-7, PG-13); rep surface redesigned (DS-015 §5.3).
BOARD: CAPS delta — Rep Experience moves from "admin dashboard with switched scope" to "DS-015 Earnings Hero,
    Thermostat, inline drill-through, single intelligence". Data accuracy (component $) restored from the MSP.
SUBSTRATE: DS-013 §7 test battery, DS-015 §5.3, Performance Intelligence Research §4.1, OB-237 MSP exercised.
    Captured: "component $ from MSP component_breakdown.payout, not calculation_results.value" (F12 root);
    "reuse OB-224 ComponentCards/getEntityStatement for the component→transaction drill-through (EECI)";
    "member action links must target inline/member-accessible surfaces, never /data/transactions (view.team_results)".
```

---

## 7. Residuals
1. Manager surface redesign (DS-015 §5.2 — team coaching). 2. `/stream` ICM panels persona-relevance.
3. Intelligence Agent generation quality (HALT-C — render consolidation done; AI content is separate).
4. Platform-wide i18n framework (HALT-D — Rep surface done via existing mechanism). 5. Per-component targets +
per-transaction attribution for entity-level (Pattern C) tenants like BCL (data/materialization, not surface).
6. OB-246 Residual 2 (`entities.profile_id` linkage) for real-member data verification.

*HF-346 — Rep Surface Experience · 2026-06-26 · vialuce.ai · Intelligence. Acceleration. Performance.*
