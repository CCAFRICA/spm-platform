# OB-211 WS-2 INCREMENT-2: DISTRIBUTIONCHART EXTENSION + ACCESS-SCOPED POPULATION SIMULATE + B1 EXPAND + C3 DRILL

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-14 (architect channel)
**Type:** OB-211 WS-2 increment-2 — the architect-ruled resolutions for the WS-2 HALT items, plus the two scoped increments. Continues the campaign loop (test→verify→RCA→resolve→re-verify→SR-44).
**Gate:** Proceed only after architect SR-44 confirms PR #514 (WS-2 inc-1, B2 narrative) is merged. If not merged, HALT and report.
**Branch:** `ob-211-ws2-inc2` off main. PR architect-SR-44-gated. tsc --noEmit before push. Read-before-assume: read each surface + component + its Phase-0 finding before resolving.
**Architect rulings (this increment executes them):**
- **B3 ruling:** EXTEND `DistributionChart` (the primitive) backward-compatibly to serve the payout-currency case — do NOT keep `DistributionCard`'s inline recharts as a parallel.
- **Simulate ruling:** **Option B — population mode**, AND **entity-contextually-dynamic by access:** the simulation reflects ONLY the entities the user has access to. A manager simulates their team's near-boundary entities; a single rep simulates their own context.
**Governing specs:** the OB-207 Regime ADR, #509 field-identity, #510 signal, DS-003 (composition rules), DS-008-A3 (Simulate impact model), DS-014 (access scoping — the single PDP / persona scope), Korean Test, DS-023 §5.1 + HF-219, Bloodwork, SR-34.

---

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md`. Binding: AP-25 (Korean Test), SR-34 (extend the canonical primitive; no inline parallel; no third path), SR-38 (math review gate — every simulated payout traces to the tier computation), SR-39 (access scoping touches who-sees-what — verify isolation), SR-41, SR-42, SR-43, SR-44. Drafting source: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

**Leverage, do not create (HALT-GENERAL):** the scoping infrastructure EXISTS — `buildManagerData` operates on `teamResults` (the manager's scoped set), `buildRepData` on `myResult` (the rep's own). `WhatIfSlider` exists (single-entity). `computeOptimizationOpportunities` (loader:684) exists. The work is: SCOPE the opportunity computation to the user's accessible set (reuse the existing persona scope boundary), EXTEND WhatIfSlider to population mode, EXTEND DistributionChart's props. Create nothing new for access — the persona scope boundary (`teamResults`/`myResult`) IS the access control. **HALT-GENERAL** if about to build a new access mechanism, a new slider, or a parallel chart.

**FP-49:** no new writes here (Simulate is a client-side projection, no persistence); reads are already-loaded, already-scoped data. If any new read is needed, it goes through the existing tenant+persona-scoped path.

AUTONOMY: NEVER ask yes/no. Act. tsc --noEmit before push. Git from repo root.

**Reconciliation-channel separation:** No ground-truth values. Simulated projections are client-side what-ifs, not asserted payouts.

---

## §1 — ITEM B3: EXTEND DistributionChart (backward-compatible) + compose DistributionCard

### 1.1 RCA (confirmed, code-read)
`DistributionChart` (primitive) hardcodes attainment-% buckets (`<70%…120%+`), labels stats with literal `%`, takes `data: number[]`. `DistributionCard` (live) takes pre-computed payout-currency `buckets`, a `formatCurrency`, and draws mean/median **ReferenceLines** on the chart. A naive swap regresses payout→attainment, dynamic→fixed buckets, and drops the reference lines.

### 1.2 The extension (additive, optional — existing callers unaffected)
Extend `DistributionChartProps`:
```ts
interface DistributionChartProps {
  data: number[];
  benchmarkLine?: number;
  buckets?: Bucket[];                 // NEW optional: pre-computed buckets; else fall back to the fixed attainment buckets
  valueFormatter?: (n: number) => string;  // NEW optional: e.g. currency; else default "%"
  showReferenceLines?: boolean;       // NEW optional: draw mean/median on the chart; else current text-only stats
}
```
- When `buckets` is provided, render those (the card's payout ranges) instead of the fixed attainment bands.
- When `valueFormatter` is provided, format stats/labels with it (currency) instead of `%`.
- When `showReferenceLines`, draw mean/median markers on the bars (port the card's ReferenceLine behavior into the primitive).
- **Backward compatibility (MANDATORY):** existing callers passing only `data: number[]` (on /results, /lifecycle) render IDENTICALLY — the new props default to the current behavior. Verify the existing consumers unchanged (grep + render-trace).

### 1.3 Compose DistributionCard from the extended primitive
Replace `DistributionCard`'s inline recharts with the extended `DistributionChart` (passing the payout buckets + `formatCurrency` + `showReferenceLines`). Remove the inline recharts. **SR-34:** the primitive is now canonical for both cases; no inline parallel remains. **SR-38:** the rendered distribution + mean/median match pre-composition values.

### 1.4 This is the composition TEMPLATE
WS-3/4/5/6 inherit this pattern (a primitive narrower than the card it replaces → extend the primitive, never keep the inline). The extension shape here sets the precedent: additive optional props, backward-compatible, canonical primitive.

**HALT-B3:** extending DistributionChart to support reference-lines breaks an existing consumer's render. Report; make the new behavior strictly opt-in.

### 1.5 Commit
`feat(OB-211 WS-2): extend DistributionChart (optional buckets/formatter/reference-lines, backward-compatible) + compose DistributionCard from it — the composition template (B3)`

---

## §2 — ITEM Simulate: ACCESS-SCOPED POPULATION MODE (Option B, entity-contextually-dynamic)

### 2.1 RCA (confirmed, code-read)
`OptimizationCard.onSimulate` is dead (0 callers). `WhatIfSlider` is single-entity (`currentValue`/`currentPayout`/`tiers`). The opportunity (`computeOptimizationOpportunities`, loader:684) is population-level (`nearBoundaryCount`, scalar `costImpact`) and currently computed population-WIDE, not access-scoped.

### 2.2 The ruling: population mode, scoped to the user's accessible entities
Simulate, when opened, models the WHOLE near-boundary group the user can act on — and ONLY the entities the user has access to:
- **Manager:** the near-boundary entities within their TEAM (the existing `teamResults` scope — `buildManagerData` already has this set).
- **Single rep:** their OWN context only (the existing `myResult` — `buildRepData` already has this).
- **Admin:** the full population (admin scope is the tenant).
The accessible-entity set is the SAME boundary the persona builders already enforce — `teamResults` for manager, `myResult` for rep, full for admin. **Do NOT build a new access filter** — derive the simulation's entity set from the persona's already-scoped result set (HALT-GENERAL).

### 2.3 Scope the opportunity computation to the accessible set
`computeOptimizationOpportunities` is called per surface build. Ensure each persona's opportunities are computed over THEIR scoped result set:
- manager build → opportunities over `teamResults`
- rep build → opportunities over `[myResult]` (the rep's own near-boundary state, if any)
- admin build → opportunities over the full set
The opportunity must carry the contributing entities (not just the scalar `costImpact`) so population mode can model them — extend the opportunity shape to include the near-boundary entities' {value, currentPayout, tiers} (computable via the existing `parseTiers(compDef)` at loader:684). **SR-38:** the aggregate cost the opportunity reports = the sum of the per-entity deltas.

### 2.4 Extend WhatIfSlider to population mode
A population variant (extend WhatIfSlider or a sibling `PopulationWhatIf` composing the same tier math): a single lever (e.g., "move entities within X% over the boundary") that, applied to the SCOPED entity set, projects:
- the AGGREGATE payout change (sum over the scoped near-boundary entities), and
- the COUNT of entities affected.
Reuses the existing `calculatePayout(value, tiers)` per entity, summed. The single-entity WhatIfSlider remains for the rep-own-context case (a rep sliding their own value) — population mode is the manager/admin group case. **Korean Test:** the slider math is structural (tiers from the plan grammar), no domain literals.

### 2.5 Wire Simulate + the disposition
`OptimizationCard.onSimulate` → opens the access-scoped population model (or the single-entity model for a rep's own context). The dead button is now live AND scoped. **SR-39:** verify a manager's simulation includes ONLY their team's entities (not other teams), a rep's ONLY their own — paste the scope check. **SR-38:** the projected aggregate traces to the per-entity tier computation.

**HALT-SIM:** the per-opportunity entity {value, currentPayout, tiers} cannot be computed from what's loaded (the loader exposes only the scalar). Report; either extend the loader minimally to carry the entities, OR (if that's a larger change) disable+tooltip with the gap named — do NOT fabricate placeholder tiers.
**HALT-SCOPE:** the accessible-entity set for a persona can't be derived from the existing scoped result set (the scope boundary isn't where assumed). Report the actual scope mechanism; scope to it — do not build a new one or default to population-wide (that would leak other teams' entities into a manager's simulation — an access violation).

### 2.6 Commit
`feat(OB-211 WS-2): access-scoped population Simulate — manager simulates team / rep simulates self / admin full; WhatIfSlider population mode over the persona-scoped set; wired onSimulate (Option B, entity-contextually-dynamic)`

---

## §3 — ITEM B1: expand-default + #510 adaptive react (the scoped increment)

### 3.1 RCA (Phase-0 confirmed)
/stream has no expand/collapse UI concept (the only `expand` token is telemetry). The #510 read-back exists on /results (`operate/results/page.tsx:142-149`: read prior expand/collapse signals → flip the default).

### 3.2 Resolution
Add a collapsible wrapper around the stream's secondary cards (NOT the narrative or the hero — those always lead). Default state driven by the #510 read-back: read the user's OWN prior `expand`/`collapse` signals for the surface (same shape as /results, via the existing reader); if habitually collapsed, default collapsed; else default expanded (the architect-reported "should open expanded" baseline when no signal history exists). Capture continues via the EXISTING `captureStreamSignal`→`writeSignal` (no new path). **Observation-IS-Action:** the captured signal's presence flips the default.

**HALT-B1:** the #510 read-back on /results reads a signal shape /stream doesn't emit. Report; align the emit/read shape via the existing path (no new signal_type registry — HF-219).

### 3.3 Commit
`feat(OB-211 WS-2): /stream expand-default + #510 adaptive react — default expanded, user's own collapse history flips it (B1, existing signal path)`

---

## §4 — ITEM C3: generalize the inline drill (the WS-3 enabler)

### 4.1 RCA (Phase-0 confirmed)
The working anomaly drill is a one-off inline handler (`operate/results/page.tsx:662`, `setDrillAnomaly`→`AnomalyDrillThrough`); the reusable drill props (`onCellClick`/`onDrillDown`/`onEntityClick`/`onRowClick`) are dead.

### 4.2 Resolution
Extract the inline `setDrillAnomaly` flow into a shared drill hook/util (`useDrillThrough` or equivalent) that the reusable drill props invoke. Point /stream's `onEntityClick` (currently telemetry-only) and /results' drill props at it. Every claim/cell/segment/row that exposes a drill prop reaches the Five-Elements drill-through (DS-003 Rule 6, generalized). **This is the WS-3 enabler** — WS-3's dead-control dispositions consume this shared mechanism. **SR-38:** a drilled subset's aggregate reconciles with its claim.

**HALT-C3:** the inline drill flow has /results-specific state that can't be cleanly extracted. Report; extract what generalizes, note what stays surface-specific.

### 4.3 Commit
`feat(OB-211 WS-2): generalize the inline drill into a shared mechanism the reusable drill props invoke — DS-003 Rule 6 (C3, the WS-3 enabler)`

---

## §5 — GATES + ADVERSARIAL SWEEP

### 5.1 Per-item re-verify (Phase-0 check flips fail→pass)
- B3: grep DistributionCard imports the extended DistributionChart; no inline recharts; existing primitive consumers unchanged.
- Simulate: onSimulate has a caller; opens the scoped model; SR-39 scope check (manager=team only, rep=self only).
- B1: /stream has expand-state; default expanded (no history) / reacts to history.
- C3: reusable drill props invoke the shared mechanism; a band/cell/row drills.

### 5.2 Adversarial sweep (over the inc-2 diff)
The dimensions that bite this project: **wrong-rule-set** (Simulate reads the batch's tiers, not arbitrary), **cross-tenant/cross-team** (the SCOPE check — a manager's simulation MUST NOT include other teams' entities; this is the access-scoping correctness lens, elevated for Simulate), **right-by-luck** (the population projection correct on more than BCL's shape — scale_factor/filters in the tier math), **Korean Test** (no domain literals; slider math from grammar), **scale** (the scoped set isn't capped by an unbounded read). Every HIGH fixed + re-verified. The cross-team scope leak is the HIGH-risk dimension here — verify explicitly.

### 5.3 Build
tsc --noEmit → 0. `npm run build` exit 0. Kill dev, `rm -rf .next`, `npm run dev`, localhost:3000.

### 5.4 Proof gates (rendered + source, pasted)
| PG | PASS |
|---|---|
| B3-extend | DistributionChart extended (optional props); existing consumers render identically (paste). |
| B3-compose | DistributionCard composes the extended primitive; no inline recharts (diff). |
| SIM-scope | Manager Simulate includes ONLY team entities; rep ONLY self; admin full. Paste the scope derivation + a per-persona entity-set check. |
| SIM-model | population mode projects aggregate payout + affected count over the scoped set; traces to per-entity tiers (SR-38). |
| SIM-wired | onSimulate opens the model (not dead); rep-own-context uses single-entity, manager/admin use population. Screenshot. |
| B1-default | /stream defaults expanded (no history); collapse→reload→reacts. Signal via captureStreamSignal (paste). |
| C3-general | a distribution band / heatmap cell / row drills to the Five-Elements view via the shared mechanism. |
| KoreanTest | grep: no domain/field/component literals; slider+chart math structural; no registry. |
| Build | tsc 0 + build exit 0. |
| PER-ITEM SR-44 | each behavior RENDERS on the live tenant; architect confirms. |

### 5.5 PR
```bash
gh pr create --base main --head ob-211-ws2-inc2 \
  --title "OB-211 WS-2 inc-2: DistributionChart extension + access-scoped population Simulate + B1 expand + C3 drill" \
  --body "Executes the architect rulings. B3: extends DistributionChart backward-compatibly (optional buckets/formatter/reference-lines) and composes DistributionCard from it — the composition template (extend the canonical primitive, no inline parallel). Simulate (Option B, entity-contextually-dynamic): population mode scoped to the user's accessible entities — manager simulates team, rep simulates self, admin full; reuses the existing persona scope boundary (teamResults/myResult) as the access control, extends WhatIfSlider to project aggregate payout + affected count over the scoped set, wires the dead onSimulate. B1: /stream expand-default + #510 adaptive react (default expanded, user's own collapse history flips it, existing signal path). C3: generalizes the inline anomaly drill into a shared mechanism the reusable drill props invoke (DS-003 Rule 6, the WS-3 enabler). Adversarial sweep: the cross-team scope-leak lens elevated (a manager's simulation must not include other teams). SR-44: architect confirms each renders + the scope is correct."
```

---

## §6 — HALT CONDITIONS
- **HALT-GENERAL:** about to build a new access mechanism / new slider / parallel chart — STOP, report (extend existing).
- **HALT-B3:** reference-lines break an existing DistributionChart consumer. Make strictly opt-in.
- **HALT-SIM:** per-opportunity entity {value,payout,tiers} not computable from loaded data. Extend loader minimally OR disable+tooltip + name gap; no placeholder tiers.
- **HALT-SCOPE:** persona accessible-set not derivable from the existing scoped result set. Report the real mechanism; scope to it; NEVER default to population-wide (cross-team leak).
- **HALT-B1:** #510 read-back shape mismatch /stream. Align via existing path; no new registry.
- **HALT-C3:** inline drill has unextractable /results-specific state. Extract what generalizes; note the rest.
- **HALT-LOCKED:** any locked rule (Korean Test, DS-014 scope, DS-023 §5.1, HF-219, Bloodwork, regime ADR, SR-34) conflicts. Surface verbatim per SR-42.

---

## §7 — REPORTING
`docs/completion-reports/OB-211_WS2_INC2_COMPLETION_REPORT_20260614.md` — per-item RCA + re-verify, the SR-39 scope check (per-persona entity sets), the SR-38 simulation trace, adversarial sweep (esp. cross-team lens), SHA, build+tsc, PR URL. Confirm: nothing created but the population-mode extension + chart props + drill hook; access uses the existing persona scope; no new write path.

```
ARTIFACT SYNC (WS-2 inc-2)
MC: B3 (composition template) + Simulate (access-scoped population, entity-contextually-dynamic) + B1 (expand+react) + C3 (drill generalized) → RESOLVED (pending per-item SR-44). The composition template + the access-scoped simulation pattern established for WS-3..6.
REGISTRY: "DistributionChart extension" → canonical primitive serves payout+attainment; "Access-Scoped Simulate" → manager=team/rep=self/admin=full population mode; "Adaptive expand" → #510 react on /stream; "Generalized drill" → WS-3 enabler.
R1: Tier-C "Simulate is live and access-scoped; surfaces compose from canonical primitives; drill generalized" → pending SR-44.
BOARD: Decide (Simulate scoped + composition template + expand + drill).
SUBSTRATE: SR-34 extend-the-primitive (no inline parallel); DS-014 access scoping reused for Simulate (no new mechanism — persona scope IS the access control); WhatIfSlider population mode (tiers from grammar, Korean Test); #510 capture-and-react on /stream; drill generalized (DS-003 Rule 6); cross-team scope-leak verified absent.
```
