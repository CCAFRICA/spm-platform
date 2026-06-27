# HF-346 — Rep Surface Experience: Thermostat, Drill-Through, and Intelligence Consolidation — Completion Report

*Branch: `hf-346-rep-surface-experience` (from `main @ e0ab691f` — OB-246 + HF-345 merge)*
*Date: 2026-06-26 · Substrate: DS-013 · DS-015 · Performance Intelligence Research · OB-237 MSP · CLT-246*
*Standing rules: CC_STANDING_ARCHITECTURE_RULES.md v3.0 (Section B ADR `docs/diagnostics/HF-346_ADR_G0.md`, committed before code). Evidentiary discipline: pasted evidence per gate, not self-attestation. An adversarial find→refute review ran BEFORE this report; its confirmed defects were fixed and are documented in §3.*

---

## 1. Summary

The Rep `/perform` surface was an admin dashboard with persona-switched scope; it showed admin panels that fail the
DS-013 test battery for an individual contributor, the component breakdown read `$0` (F12), intelligence was split
across contradictory sections, and there was no summary→transaction drill-through. HF-346 fixes the data root cause
and rebuilds the member surface around the **DS-015 §5.3 Earnings Hero** as **four real elements** (Hero · Component
Breakdown w/ inline drill-through · Trajectory · one Intelligence section). **Admin + manager `/perform` are
byte-identical (DD-7); only the member branch changes.**

A what-if simulator was prototyped but **removed before merge**: an honest simulation needs the rep's real plan tier
structure, which is not on the MSP serving path — the prototype used a fabricated tier ladder and a hardcoded-Spanish /
dark-only slider (invisible on the Bliss white card). Per EECI ("every element passes DS-013 on real data or is
removed") it was cut and recorded as a Residual rather than shipped as a fabrication. The adversarial review caught
this; see §3.

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
read `comp.value ?? comp.outputValue ?? 0` — but the dollar field is **`comp.payout`** → every component `$0`. Fix
(payout-first, both array AND object branch — the object branch had the same latent bug; plus aggregate duplicate
names for multi-rule-set entities):
```ts
value: typeof comp.payout === 'number' ? comp.payout
  : typeof comp.value === 'number' ? comp.value
  : typeof comp.outputValue === 'number' ? comp.outputValue : 0,
// getRepDashboardData: components from the MSP breakdown (same period as the total)
components: parseComponents(myOutcome?.component_breakdown ?? null),
```
Attainment `{"overall":0}` = data-state (no per-component targets) → handled as "target not assigned", never "0%".

### PG-1 — Earnings Hero (Value + Context + Comparison + Reference frame + Action + Impact)
`RepDashboard.tsx` hero: Value = `{format(data.totalPayout)}` (5xl dominant); Context = `periodLabel` + component
count; Comparison = `<Delta pct={derived.deltaPct} />` (vs prior, from MSP history); Reference frame = **real**
attainment toward 100% (`Math.min(100, data.attainment)`) OR "target not assigned"; Status badge =
`payoutStatus(data.lifecycleState)` → In Review / Approved / Paid; Impact = largest component + its share
(`derived.top` / `derived.topShare`); Action = `View Components ↓` (scrolls to inline breakdown). Data source:
`getRepDashboardData` (MSP `entity_period_outcomes`).

### PG-2 — Admin-metric panels removed for member
`app/perform/page.tsx`:
```tsx
const isRep = persona === 'rep';
{!isRep && (<>
  {/* Period Total tile, Entities Paid, Average Payout, Top Result, Period Finding, Data Quality,
      Compensation-by-Component, Payout Distribution, Period Lifecycle, AI Findings */}
</>)}
```
For `persona !== 'rep'` (admin/manager) the gate is a no-op → unchanged (DD-7).

### PG-3 — Calculate button hidden for member (and NOT for managers — DD-7)
`VialuceTopbar.tsx` `calcAccessible` gates the gold Calculate CTA on the **stewardship capability set**, not on
`data.calculate` alone (the alone-gate wrongly stripped the manager CTA — see §3 R1):
```ts
const canStewardCalc =
  hasCapability('data.calculate') ||       // platform/admin run calculations
  hasCapability('data.approve_results') || // manager approves
  hasCapability('dispute.resolve');        // manager adjusts
if (!canStewardCalc) return false;
```
Rep/viewer hold only `statement.view` → none of the three → CTA hidden. Managers hold `data.approve_results` +
`dispute.resolve`; admin/platform hold `data.calculate` → CTA shown (byte-identical to main). `hasCapability` honors
the HF-345 preview persona → a VL-admin Rep preview also hides it.

### PG-4 — Component breakdown dollars SUM to total
`getRepDashboardData.components` = `[{Colocación,700},{Captación,550},{Productos Cruzados,375},{Cumplimiento,150}]`
→ **700+550+375+150 = 1,775 = `total_payout`** (PG-0 probe). BCL has 4 distinct components in array format, so the
new dedup/object-branch logic is a no-op for it (verified: still 1,775).

### PG-5 — Component row click → transactions inline (Action Proximity)
`RepDashboard.tsx` renders `<ComponentCards tenantId entityId={data.entityId} periodId={data.periodId} … />` (OB-224).
A row with per-transaction traces expands inline ("N transactions · traced $X"); entity-level components (BCL Pattern C)
expand inline source rows via `handleSource` (self-managed `openSource`, no `onTransactionDrill` prop → inline, never a
dead button). **No navigation away** (DS-013 §4.3).

### PG-6 — Transaction amounts reconcile to component amount
`getEntityStatement` probe (BCL): `Productos Cruzados payout=375 attributable=true txns=1 tracedSubtotal=375` →
**traced subtotal = component payout = $375** ✓. Entity-level components (Colocación/Captación/Cumplimiento) carry the
authoritative MSP payout (700/550/150) shown on the card; their inputs are aggregate metrics (no discrete transactions
— Pattern C), surfaced via the inline "Source data" / "Datos fuente" expander.

### PG-7 — ONE intelligence section
`RepDashboard.tsx` renders a single Intelligence card (Focus / Trend / Action). The prior four intelligence
presences (`AgentInbox`, `InsightPanel`, `NextAction`, `AssessmentPanel`) are removed from the rep surface.

### PG-8 — No contradictory metrics
Intelligence derives from the SAME `data` as the hero (no second source). Relative position is anonymized
**percentile** (`derived.pct`), never "#1 of 85" (OB-246). Trend = `derived.deltaPct` (the hero's comparison). Focus is
a **factual** statement — the largest component and its share of payout — not the prior speculative "smallest = growth
headroom" heuristic (removed in §3). `prior` is matched to the period immediately before the current one (by label),
so the hero delta and the trajectory cannot disagree.

### PG-9 — All links functional (no dead ends)
Every clickable in `RepDashboard.tsx` is an **inline `scrollIntoView`** — `View Components ↓` (hero + intelligence
Action). No navigation to a member-blocked page; the prior `/data/transactions` link (OB-246 `view.team_results`-gated)
was removed in the rebuild. `ComponentCards` trace/source/dispute expanders are inline.

### PG-10 — "View Trajectory" works or is removed
Trajectory is an **inline** element (Sparkline + projection); there is no "View Trajectory →" navigation → no dead link.

### PG-11 — Locale consistent
Every chrome label in `RepDashboard.tsx` is gated on `isEs`. **The rep's primary breakdown surface — OB-224
`ComponentCards` — was English-only; HF-346 localized its chrome** (Loading / no-breakdown / "N transactions · traced" /
entity-level note / "Source data" / "Dispute" / table headers Ref·Date·Detail·Contribution) via an `isEs`-gated `L`
helper applied to BOTH the Vialuce and dark render branches. Spanish tenants (BCL es-MX / MIR / Sabor) now render
Spanish chrome here. No mixed EN/ES on the surface.

### PG-12 — Every visualization object reads MSP
`getRepDashboardData` sources (grep): `entity_period_outcomes` (×4: outcome, ranking, history, top-fallback) +
`periods` (labels). **No `calculation_results`.** The hero / trajectory / component-breakdown dollars are MSP. The
component **drill-down** reuses OB-224 `ComponentCards → getEntityStatement` (reads `calculation_results` +
`calculation_traces`) — the documented MSP exemption for transaction/trace detail (not an aggregate render; its
component payouts equal the MSP `component_breakdown` values, PG-4/6).

### PG-13 — Admin `/perform` unchanged (DD-7)
The `{!isRep && …}` gate renders the full admin panel set for `persona !== 'rep'`; `RepDashboard` renders only for
`persona === 'rep'`. No admin/manager code path changed. The Calculate-CTA fix (PG-3) keeps admin AND manager
byte-identical. (Adversarial-review R1 confirmed the original `data.calculate`-only gate broke this for managers; fixed.)

### PG-14 — DS-013 test battery (element-by-element)
| Element | IAP | Five Elements | Thermostat (frame + action) | Verdict |
|---|---|---|---|---|
| Earnings Hero | P | Value+Context+Comparison+Frame+Action+Impact | real attainment→100% + View Components | **PASS** |
| Component Breakdown | I+P | $ + % + drill | click → transactions inline | **PASS** |
| Trajectory | A+P | value+context+comparison(step/proj) | "↗ +$X/period · proj $Y" — context element (action via the surface's shared View Components) | **PASS (frame-dominant)** |
| Intelligence (Focus/Trend/Action) | I+A | factual focus + trend + action | each carries a concrete next step | **PASS** |
*Removed: Entities Paid, Average Payout, Top Result, Period Finding, Data Quality, Period Lifecycle, duplicate intelligence (failed IAP for a rep); What-If (fabricated reference frame — §3 R2, Residual).*

### PG-15 — Zero engine/SCI changes
`git diff --name-only main…HEAD` → 8 files (3 docs + `app/perform/page.tsx`, `RepDashboard.tsx`, `ComponentCards.tsx`,
`VialuceTopbar.tsx`, `persona-queries.ts`). `run-calculation.ts` / `convergence-service.ts` / `intent-executor.ts` /
`calculation-service.ts` / SCI **absent** (HALT-E).

### PG-16 — `npm run build` exits 0
`Compiled successfully` · `[korean-test-gate] PASS` · `BUILD_EXIT=0` · `tsc --noEmit` 0 · dev `:3008/login` 200.
(The "Dynamic server usage" lines are the pre-existing expected logs for cookie-using API routes; build exit is 0.)

### PG-17 — PR
(URL recorded on creation below.)

---

## 3. Adversarial review (find → refute) — BEFORE this report

A 3-dimension adversarial review (DD-7 admin-unchanged · DS-013 battery + data accuracy · MSP + dead-links +
drill-through + engine) with a default-refuted verify pass ran on the committed branch. Verdict: **2 confirmed defects,
both fixed**; the rest refuted or dispositioned.

**R1 (DD-7) — CONFIRMED → FIXED.** The committed `if (!hasCapability('data.calculate')) return false;` stripped the
Calculate CTA from **managers** (managers lack `data.calculate` but reached the calculate workspace via
approvals/adjustments/statements → saw the CTA on main). Independently verified: manager caps (permissions.ts:175-192)
hold `data.approve_results`+`dispute.resolve` not `data.calculate`; the calculate workspace has no featureFlag → CTA
showed on main. **Fix:** gate on the stewardship set (PG-3) → admin+manager byte-identical, rep hidden.

**R2 (DS-013 / data accuracy) — CONFIRMED → FIXED by removal.** The What-If element wired the OB-211 `WhatIfSlider`,
which is hardcoded-Spanish + dark-theme-only (text-zinc-100 on the Bliss white card ≈ 1.04:1 contrast → the projected
payout is invisible), and projected off a fabricated `TIER_LADDER` (invented rates / cap-120%, not the rep's real plan).
**Fix:** removed the What-If element + the fabricated ladder; the hero reference frame now uses only real attainment
toward 100%. An honest what-if requires exposing the real plan-tier structure to the serving layer (Residual 1).

**Refuted / dispositioned (not blocking):**
- *Two component sources (hero count/focus from MSP vs visible $ from getEntityStatement)* — they reconcile (PG-4/6,
  both trace to the same calc); accepted, single-source refactor noted as Residual 8.
- *"Smallest = growth headroom" is speculative* — **fixed**: Focus reframed to factual largest-component + share
  (also consumes `derived.top`, eliminating the dead-code finding).
- *`derived.top` dead code* — **fixed** (now rendered as the factual Focus/Impact).
- *parseComponents object-branch / no-dedup* — **fixed** (payout-first object branch + aggregate-by-name).
- *`totalPayout===0` hides a real clawback* — **fixed**: empty state now gates on no-outcome (`periodId == null`).
- *Trajectory frame-only* — accepted as a context element (PG-14 marks it frame-dominant; the surface's action path
  is concentrated in the hero + Intelligence).
- *ComponentCards dark classes on the Bliss white theme* — pre-existing OB-224 condition (not HF-346-introduced; the
  rep surface runs Vialuce/Dark); chrome localized here, Bliss theme-hardening noted as Residual 7.

---

## 4. CLT-246 dispositions (F06–F24)

| Finding | Disposition |
|---|---|
| **F12** component $0 | **FIXED** (Phase 0 — parseComponents reads `payout`, both branches + MSP `component_breakdown`) |
| **F13** 0% attainment | **FIXED display** — data-state (`attainment_summary={overall:0}`) → "target not assigned", never 0% |
| **F14** RepDashboard $0 | **FIXED** (cascade of F12) |
| **F16** contradictory intelligence | **FIXED** — ONE section, percentile not "#1 of 85", same data as hero |
| **F17** inaccurate coaching | **FIXED display** — Focus/Trend/Action derive deterministically from corrected data (AI-generation quality = Residual; HALT-C) |
| **F18** wrong focus | **FIXED** — Focus reframed to a factual largest-component + share (removed the speculative "smallest = opportunity" heuristic) |
| **F21** broken trajectory link | **FIXED** — trajectory is inline (no dead navigation) |
| **F22** broken what-if ($0) | **REMOVED** — the What-If was a fabricated reference frame (§3 R2); an honest one needs real plan tiers off the MSP path (Residual 1). Not shipped as a fabrication. |
| **F06–F11, F15, F19–F20, F23–F24** | **ADDRESSED by the redesign** — admin panels gated off for rep (PG-2), locale consistent incl. ComponentCards (PG-11), links functional (PG-9), one intelligence section (PG-7), lifecycle → status badge (PG-1) |

No silent omissions: where a finding is data-blocked (per-component targets / per-transaction attribution for BCL
entity-level components, real plan tiers for what-if), it is disposed honestly as a Residual, not faked.

---

## 5. HALT dispositions
- **A** (no per-component MSP data) — not triggered (component_breakdown reconciles to total).
- **B** (drill-through unscalable) — not triggered (`committed_data data_type='transaction'` entity-stamped + indexed; OB-224 trace path).
- **C** (intelligence requires AI-pipeline change) — RENDER consolidation only; AI-generation quality = Residual.
- **D** (no i18n mechanism) — used the existing `isSpanish`/`isEs` conditional-label mechanism (Rep surface + ComponentCards).
- **E** (engine/SCI) — not triggered (PG-15).

---

## 6. Browser verification (architect, SR-43)
- VL admin → BCL → **Admin** persona → `/perform`: full admin panels + Calculate CTA (unchanged, DD-7).
- VL admin → BCL → **Manager** persona → `/perform`: admin panels + Calculate CTA still present (DD-7 — the §3 R1 fix).
- VL admin → BCL → **Rep** persona → `/perform`: Earnings Hero ($1,775 · period · vs prior · status badge · largest
  component), Component Breakdown (Colocación $700 / Captación $550 / Productos Cruzados $375 / Cumplimiento $150 —
  click → inline transactions/source, Spanish chrome), Trajectory sparkline, ONE Intelligence section; **no** Entities
  Paid / Average / Top Result / Data Quality / Lifecycle panels; **no** Calculate CTA; **no** What-If.
- Real member login → own-entity scope (blocked on OB-246 Residual 2 entity-linkage; the surface is correct, the data is data-blocked).

---

## 7. ARTIFACT SYNC
```
ARTIFACT SYNC
MC: HF-346 → COMPLETE (Rep /perform redesign, 4 real elements). CLT-246 F12/F13/F14/F16/F17/F18/F21 → FIXED;
    F22 (what-if) → REMOVED (fabrication; Residual); F06-F11/F15/F19-F24 → ADDRESSED by redesign.
REGISTRY: Rep Surface / Perform → DS-013 §7 test battery compliant (element-by-element, PG-14); DS-015 §5.3
    Earnings Hero; component→transaction drill-through (Action Proximity) via OB-224 reuse.
R1: admin + manager /perform byte-identical (DD-7, PG-13 + §3 R1 manager-CTA fix); rep surface redesigned.
BOARD: CAPS delta — Rep Experience moves from "admin dashboard with switched scope" to "DS-015 Earnings Hero,
    Thermostat on REAL data, inline drill-through, single intelligence". Data accuracy (component $) restored from MSP.
SUBSTRATE: DS-013 §7, DS-015 §5.3, Performance Intelligence Research §4.1, OB-237 MSP exercised. Captured:
    "component $ from MSP component_breakdown.payout, not calculation_results.value" (F12 root);
    "reuse OB-224 ComponentCards/getEntityStatement for component→transaction drill-through (EECI)";
    "member action links must target inline/member-accessible surfaces, never /data/transactions";
    "a reference frame / what-if must be built on REAL plan data or removed — a fabricated tier ladder fails
     DS-013 Reference-Frame (EECI Effective)";
    "the Calculate-CTA gate is the STEWARDSHIP set (run||approve||adjust), not data.calculate alone — else the
     manager CTA regresses (DD-7)".
```

---

## 8. Residuals
1. **What-If** requires exposing the rep's real plan-tier structure to the serving layer (data/materialization, not a
   render task) — removed rather than shipped on a fabricated ladder.
2. Manager surface redesign (DS-015 §5.2 — team coaching).
3. `/stream` ICM panels persona-relevance.
4. Intelligence Agent generation quality (HALT-C — render consolidation done; AI content is separate).
5. Platform-wide i18n framework (HALT-D — Rep surface + ComponentCards done via existing mechanism).
6. OB-246 Residual 2 (`entities.profile_id` linkage) for real-member data verification.
7. OB-224 `ComponentCards` Bliss-theme hardening (dark zinc classes on the white Bliss card — pre-existing).
8. Single-source the hero component count/focus and the visible breakdown $ (currently MSP + getEntityStatement, which
   reconcile).

*HF-346 — Rep Surface Experience · 2026-06-26 · vialuce.ai · Intelligence. Acceleration. Performance.*
