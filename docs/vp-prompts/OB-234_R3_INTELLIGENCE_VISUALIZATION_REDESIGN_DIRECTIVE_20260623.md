# OB-234 R3: INTELLIGENCE AGENT VISUALIZATION REDESIGN
**Date:** 2026-06-23 (R3 — ULTRACODE-native restructure)
**Category:** OB · **Sequence:** OB-234 (architect-assigned; P0 collision check)
**Repo:** VP `CCAFRICA/spm-platform` · **Branch:** `ob-234-intelligence-viz-redesign`
**Mode:** ULTRACODE / effort-mode native. Tiered orchestration plan below. CC determines execution strategy within each tier. Fan-out on Tier-2.
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md` — the file IS the prompt (DD-11).
**Supersedes:** OB-234 R1/R2 in entirety. OB-322 (merged `a0865172`) is baseline.
**Provenance:** CLTOB230 architect walk; End-State A (locked); OB-235 Learning Loop (#594); DS-003, DS-013, DS-015, TMR Addendum 7, TMR Addendum 8.

---

## ORCHESTRATION PLAN

```
P0  ─────────────────────────────────────  RE-SYNC GATE (sequential, no code)
         │
Tier-1  ─┼── T1-A: Agent rename           ─┐
         ├── T1-B: End-State A data layer   ├─ shared primitives (sequential; each
         ├── T1-C: DS-003 component library ├─ builds modules Tier-2 consumes)
         ├── T1-D: Persona context provider ├─ File-disjoint. Commit per sub-tier.
         └── T1-E: Period selector          ─┘
                    │
Tier-2  ───────────┬┼─ T2-1: /stream          ─┐
                   ├┼─ T2-2: /perform          │
                   ├┼─ T2-3: /insights         │ 8 surfaces, PARALLEL fan-out.
                   ├┼─ T2-4: /insights/analytics│ Each owns one page file.
                   ├┼─ T2-5: /insights/performance│ Each consumes Tier-1 modules.
                   ├┼─ T2-6: /insights/compensation│ No cross-surface dependency.
                   ├┼─ T2-7: /insights/trends  │
                   └┼─ T2-8: /acceleration     ─┘
                    │
Tier-3  ─────────────────────────────────  INTEGRATION PROOF (sequential)
```

Tier-1 is sequential (each sub-tier may depend on prior). Tier-2 agents are mutually independent — run in parallel under effort-mode. Tier-3 runs after all Tier-2 agents complete.

---

## P0 — RE-SYNC GATE

Validates actual codebase state against #593+#594 before any implementation. Every check pastes evidence.

**P0-A: OB-235 artifacts on HEAD.** Confirm existence:
- `lib/learning/learner-core.ts`, `lib/learning/comprehension-recall.ts`, `lib/learning/density-recall.ts`
- `lib/learning/correction-consumer.ts`, `lib/learning/convergence-recall.ts`
- `lib/learning/expression/binding-inheritance.ts`
- `components/platform/RecognitionCurvePanel.tsx`, `app/api/observatory/recognition-curve/route.ts`

**P0-B: Collision files.** These were edited by #594. OB-234 edits to them MUST be additive, never rewrite. `git log --oneline -3` each:
- `lib/comprehension/surface-binding-recognition.ts` (P-EXP)
- `app/api/financial/data/route.ts` (P-EXP)
- `lib/calculation/synaptic-surface.ts` (P4)
- `lib/calculation/flywheel-pipeline.ts` (P5)
- `lib/summary/comprehension-generator.ts` (P3)
- `components/platform/PlatformObservatory.tsx` (P8)

**P0-C: Learning-loop API reachability.** Paste tsc-clean import for:
- `recallComprehension` from comprehension-store
- `recallDensity` / `modeDistribution` from density-recall
- `recognize` from surface-binding-recognition

**P0-D: End-State A baseline.** For EACH of the 8 surfaces: grep the current data-access path. Record: reads `calculation_results`/`entity_period_outcomes` (CLEAN) or raw `committed_data`/re-aggregation (DIRTY). Paste. This is the before-state that Tier-1B must fix.

---

## §0 — STANDING RULES + BINDING READS

`CC_STANDING_ARCHITECTURE_RULES.md` binds throughout. AP-11, AP-17, AP-21, AP-25 are high-risk.

### §0.1 — Design system (CC reads ALL before any implementation)

| Ref | File | Why |
|---|---|---|
| DS-003 | `DS-003_VISUALIZATION_VOCABULARY.md` | Component library, composition rules, color encoding. The WHAT. |
| TMR-7 | `ViaLuce_TMR_Addendum7_Feb2026.md` | Persona color psychology, density gradients, cognitive tasks per persona. |
| TMR-8 | `ViaLuce_TMR_Addendum8_Feb2026.md` | Cognitive Fit Framework, six decision tasks, the mandatory test. |
| DS-013 | `DS-013_Platform_Experience_Architecture_20260310.docx` | Test battery: IAP, Five Elements, Thermostat, Action Proximity, Cognitive Fit, Reference Frame, Korean Test, Confidence Disclosure, Scale. |
| DS-015 | `DS-015_Intelligence_Stream_Evolution_20260314.docx` | Intelligence Stream architecture, Five Elements model, State Reader, Intelligence Ranker. |

CC applies the **Cognitive Fit Test** (TMR-8) to every element before implementing: (1) decision task named, (2) visual form matches, (3) no duplicate form for different tasks on same page, (4) reference frame present, (5) processing mode correct. This test replaces prescriptive component-type assignments — CC selects from DS-003's library based on the test, not by matching a table cell.

### §0.2 — OB-235 Learning Loop

Four layers of non-amnesiac behavior. Surfaces CONSUME them:

| Layer | Store | Surface reads via | Provides |
|---|---|---|---|
| Comprehension | `comprehension_artifacts` | `recallComprehension` (comprehension-store) | Field characterizations: what each column means, aggregation behavior, structural role. Dimension labels. |
| Surface bindings | `surface_bindings` | `recognize` (surface-binding-recognition) | Pre-resolved data→element mappings with confidence. |
| Calculation density | `synaptic_density` | `recallDensity` → `modeDistribution` (density-recall) | Execution-mode distribution (cold/warming/learned), per-pattern confidence. |
| Cross-tenant flywheel | `foundational_patterns` / `domain_patterns` | `loadColdStartPriors` (flywheel-pipeline) | Structural priors for new-tenant cold-start. |

### §0.3 — End-State A (binding contract)

Intelligence Agent = analytics tier consuming Compensation Agent's result-of-record. Every total, component amount, and validity verdict reads from `calculation_results` / `entity_period_outcomes` / `calculation_batches`. Intelligence NEVER re-derives. One validity verdict, one source, all surfaces reflect it.

### §0.4 — Thermostat action classification

**REAL actions** (backends exist — wire fully): lifecycle advancement, navigation/drill, export, configure links.

**STUB actions** (backends NOT built — render disabled, label honestly): Simulate (plan-health, what-if), Coach/Schedule coaching, AI Plan Intelligence diagnostics (threshold clustering, component irrelevance, cap saturation, floor waste), correlation analysis.

Stub rule: structurally present in DOM (layout accommodates, component exists), NOT functionally wired (no click handler, no fake response), visually disabled with honest label ("Coming soon" or disabled state). Zero fabricated actions.

**Data-driven thermostat elements that ARE real post-OB-235:** reference frames (prior-period deltas, quartile markers, population averages), learned-confidence disclosure, trajectory with projection, entity direction arrows.

---

## TIER-1 — SHARED PRIMITIVES

Sequential. Each sub-tier builds modules that Tier-2 surfaces consume. Commit after each sub-tier.

### T1-A: Agent rename

| Old | New | Scope |
|---|---|---|
| Performance Agent | **Intelligence** | Nav labels, sidebar, breadcrumbs, page titles, `workspace-config.ts`, component names, CSS classes, comments |
| Calculation | **Compensation** | Nav labels, sidebar, breadcrumbs, page titles, `workspace-config.ts` |

Experiential rename only — `calculation_results`, `calculation_batches`, route paths `/api/calculation/*` stay. Schema unchanged.

### T1-B: End-State A data layer

The verified, clean read-path that every surface consumes. This is the VERTICAL SLICE data foundation.

**Build:** a shared data-access module (e.g. `lib/insights/intelligence-data.ts` or extend existing `lib/insights/index.ts`) exposing:

| Function | Returns | Source (End-State A clean path) |
|---|---|---|
| `getPeriodTotal(tenantId, periodId)` | number | `SUM(calculation_results.total_payout)` for batch |
| `getComponentTotals(tenantId, periodId)` | `{name, payout}[]` | `calculation_results.components` JSONB aggregated |
| `getEntityResults(tenantId, periodId)` | entity rows with totals | `entity_period_outcomes` or `calculation_results` per entity |
| `getCalculatedPeriods(tenantId)` | period metadata + lifecycle | `calculation_batches` joined `periods` |
| `getBatchValidity(tenantId, periodId)` | verdict: exception count, severity, recommendation | `calculation_batches.summary` — the ONE validity verdict |
| `getEntityTrajectory(tenantId, entityId)` | per-period totals across periods | `calculation_results` across batches |
| `getDimensions(tenantId)` | discovered dimensions + characterizations | OB-322 `dimension-discovery.ts` enriched with `comprehension_artifacts` characterizations |

**Contract:** ZERO functions in this module query `committed_data`. Every function terminates at `calculation_results` / `entity_period_outcomes` / `calculation_batches`. This is the End-State A guarantee — all 8 surfaces bind to this layer, and this layer binds to Compensation's output.

**P0-D dirty paths:** any surface currently accessing data outside this layer gets rewired in Tier-2 to use it.

### T1-C: DS-003 component library

Shared React components implementing DS-003's visualization vocabulary. CC determines which to build new, which exist, which to wrap existing recharts/lucide primitives. The minimum set that the 8 surfaces require:

| DS-003 component | Decision task | Key props (CC determines full interface) |
|---|---|---|
| **HeroMetric** | Identification | value, label, icon, context (trend arrow + delta), subtitle |
| **DistributionPosition** | Ranking | data (values array), markers (quartile/mean/median), onDrill |
| **HorizontalBar** | Comparison | items (label + value), referenceLine (average/target), onBarClick |
| **SparkTrend** | Monitoring | data (time series), velocity text, direction |
| **Sparkline** | Monitoring (embedded) | data, color, width/height |
| **PrioritySortedList** | Selection | items (severity + label + detail + action), splitView (green/red) |
| **StackedBar** | Comparison (part-of-whole) | segments (label + value + color), total, onSegmentClick |
| **GaugeMetric** | Monitoring (bounded) | value, min, max, thresholds (green/amber/red bands) |
| **ThresholdArea** | Monitoring (temporal) | data (time series), thresholdBand or referenceLine |
| **ConfigurablePipeline** | Planning | stages (label + status), currentStage, actionButton |
| **NeighborhoodLeaderboard** | Ranking (relative) | entities, selfId (highlighted), neighborhoodSize |
| **SteppedProgress** | Planning (goal-gradient) | tiers, currentValue, gapFraming |
| **StubAction** | — (disabled affordance) | label, description (e.g. "Simulation engine coming soon") |

Each component follows DS-003 specs: semantic colors for state, persona accent for environment, reference frame built in (not optional), lucide-react icons, recharts for chart internals.

### T1-D: Persona context provider

A React context providing persona-aware values to all surfaces:

| Value | Admin | Manager | Rep |
|---|---|---|---|
| ambient gradient | `from-slate-950 via-indigo-950/40 to-slate-950` | `from-slate-950 via-amber-950/25 to-slate-950` | `from-slate-950 via-emerald-950/25 to-slate-950` |
| accent color | `#6366F1` indigo-500 | `#F59E0B` amber-500 | `#10B981` emerald-500 |
| density | high (all elements, tables, dense grid) | medium (people-focused, 2-column) | low (5-6 elements max, single-column, personal focus) |
| action vocabulary | Publish, Approve, Resolve, Investigate, Simulate Impact | Coach, Develop, Recognize, Reassign, Schedule | Explore, Simulate, Dispute, View Plan, Track Progress |

Text hierarchy (DS-003 §3): slate-100 headline, slate-300 section label, slate-400 body, slate-500 muted, slate-600 disabled. Never pure `#FFFFFF` body text.

Semantic colors RESERVED for state: Green `#10B981`, Amber `#F59E0B`, Red `#EF4444`, Blue `#3B82F6`.

### T1-E: Period selector (PeriodCards)

OB-322 built `PeriodCards.tsx` — verify it exists and meets spec: horizontal selectable cards, one per `getCalculatedPeriods` result, lifecycle badge each, selected card distinguished, cross-surface state preservation (URL param or context). If it needs revision for the new data layer (T1-B), revise it. If it works, reuse it.

Present on EVERY surface — `/stream`, `/perform`, and all 6 Insights/Acceleration surfaces.

---

## TIER-2 — SURFACE FAN-OUT

**Parallel.** Each surface is one agent owning one page file. Each consumes Tier-1 modules: T1-B data layer for values, T1-C component library for visuals, T1-D persona context for density/color, T1-E period selector for period state.

**The design reference tables below are ARCHITECT INTENT, not implementation spec.** They define what the architect expects to see on each surface — the elements, their purpose, and the data they display. CC implements by selecting from the T1-C library, applying the Cognitive Fit Test (TMR-8) to every element, and binding to T1-B. Where CC's Cognitive Fit analysis suggests a different component type than the table implies, CC's analysis wins — the test is the authority, not the table.

**Rules applied by CC on every surface (from DS-003 §2):**
1. **Diversity Minimum:** 4+ data elements → 3+ distinct DS-003 component types.
2. **Visual Hierarchy:** 1 dominant element + supporting metrics above fold. Dominant = highest-priority decision task for persona.
3. **Reference Frame Mandate:** every quantitative visualization has a reference frame. "Is that good or bad?" answerable at a glance.
4. **Persona Density:** Admin dense, Manager medium, Rep minimal. Content filtered, not just resized.
5. **Interaction Reveals Depth:** primary surface glanceable (Type 1). Click/expand reveals detail (Type 2).
6. **Thermostat Classification:** real actions wired. Stub actions disabled. Zero fabricated.

### T2-1: Intelligence Stream (`/stream`)

The canonical landing (DS-015). Five Elements on every intelligence element: value + context + comparison + action + impact. State Reader + Intelligence Ranker.

**Single validity verdict:** if Compensation's batch has anomalies, this surface says so — not "within expected parameters." Same verdict as `/perform`. Source: `getBatchValidity` (T1-B).

**Learning-loop integration:** component names/labels sourced from comprehension artifact characterizations via `getDimensions` (T1-B). Confidence ambient for Admin persona: bind to `recallDensity` → `modeDistribution` for system confidence.

| Element | Purpose | Data source (T1-B) | Persona scope |
|---|---|---|---|
| Period selector | Navigate periods | `getCalculatedPeriods` | All |
| System Health hero | Authoritative total + delta + lifecycle action | `getPeriodTotal` + prior-period delta | All |
| Validity verdict | Honest data-quality state | `getBatchValidity` | All |
| Trajectory | Velocity + direction + projection | `getPeriodTotal` across periods | Admin, Manager |
| Component trajectories | Per-component velocity | `getComponentTotals` across periods | Admin |
| Accelerators / Attention Needed | Top gainers + decliners | `getEntityResults` current vs prior, sorted by delta | Admin, Manager |
| Optimization Opportunities | Zero-payout cohort per component | `getComponentTotals` + `getEntityResults` where component payout = 0 | Admin |
| Population Distribution | Payout shape | `getEntityResults` → values array | Admin |
| Lifecycle | Current state + next action | `getCalculatedPeriods` → lifecycle_state | All |
| Learning confidence | System's self-assessed competence | `recallDensity` → `modeDistribution` | Admin only |

### T2-2: Compensation Dashboard (`/perform`)

Result-of-record. Authoritative numbers + lifecycle + governance gate. The $46,291/$58,406 split dies: hero reads `getPeriodTotal` for the SELECTED period (PeriodCards).

| Element | Purpose | Data source (T1-B) | Persona scope |
|---|---|---|---|
| Period selector | Navigate | `getCalculatedPeriods` | All |
| Period total hero | The number | `getPeriodTotal` | All |
| Component breakdown | Where money goes | `getComponentTotals` | All |
| Distribution | Population shape | `getEntityResults` → values | Admin |
| Lifecycle | State + action | `getCalculatedPeriods` → lifecycle | All |
| Data quality | Validity verdict (SAME as `/stream`) | `getBatchValidity` | All |
| Intelligence findings | AI-generated observations | existing AI intelligence output | Admin |

### T2-3: Overview (`/insights`)

Glanceable state. Standings, composition, top/bottom.

| Element | Purpose | Data source (T1-B) |
|---|---|---|
| Period total | Current total | `getPeriodTotal` |
| Entities paid | Count | `getEntityResults` → count |
| Average payout | Mean | `getPeriodTotal` / count |
| Top performer | Highest earner | `getEntityResults` → max |
| Earnings by Component | Component composition | `getComponentTotals` |
| Top Performers | Ranking | `getEntityResults` sorted desc, limit 5 |
| Payout Distribution | Shape | `getEntityResults` → values |

### T2-4: Explore (`/insights/analytics`)

User-controlled lens. Period range + dimension pivot + drill + export.

| Element | Purpose | Data source (T1-B) |
|---|---|---|
| Dimension pivot controls | Switch lens | `getDimensions` (comprehension-enriched labels) |
| Dimension breakdown chart | Slice comparison | `getEntityResults` grouped by dimension |
| Payout by Period | Temporal overview | `getPeriodTotal` across periods |
| Entity drill table | Detail on demand | `getEntityResults` filtered by current slice |
| Export button | Current slice as CSV | Client-side serialization of current view data |

### T2-5: Attainment (`/insights/performance`)

Vs reference. Decision 111: rate + trajectory + reference frame + components. Palette per DS-003 §3.

| Element | Purpose | Data source (T1-B) | Note |
|---|---|---|---|
| Attainment summary | Overall attainment | `calculation_results.attainment` | If NOT bound (BCL PREVIEW): honest empty "Targets not configured." + "Configure" link |
| Entity attainment distribution | Who's on/off track | `getEntityResults` → attainment values | If attainment unbound: hide, don't fabricate |
| Component attainment | Per-component vs target | `getComponentTotals` + targets if available | |
| Hot / Cold entities | Sorted by delta from target | `getEntityResults` sorted by attainment delta | |
| Pacing sparklines | Trajectory per entity | `getEntityTrajectory` | |

### T2-6: Compensation Insights (`/insights/compensation`)

The money lens. Five executive question families:

| Question family | Element | Data source (T1-B) |
|---|---|---|
| **Cost efficiency** | Total comp (period + cumulative) | `getPeriodTotal` current + sum across periods |
| **Cost efficiency** | Cost % of outcome | HONEST EMPTY if no revenue data — "Revenue data not configured" |
| **Cost efficiency** | Avg cost per entity | `getPeriodTotal` / entity count |
| **Composition** | Component breakdown | `getComponentTotals` |
| **Composition** | Dimension pivot (variant/level) | `getEntityResults` grouped by `getDimensions` |
| **Pay for performance** | Payout distribution | `getEntityResults` → values |
| **Pay for performance** | Payout-vs-attainment | `getEntityResults` with attainment (if bound) |
| **Plan health** | AI diagnostics | STUB — disabled "Plan health diagnostics coming soon" |
| **Drill** | Entity detail (reached by drill, not primary) | `getEntityResults` filtered |

### T2-7: Trends (`/insights/trends`)

Temporal axis. Currently strongest surface — preserve and enhance.

| Element | Purpose | Data source (T1-B) |
|---|---|---|
| Population trend | Total over time | `getPeriodTotal` across all periods |
| Avg velocity | Period-over-period change rate | Derived from period totals |
| Fastest growing / declining | Extreme movers | `getEntityResults` current vs prior, sorted by delta |
| Entity trajectory table | Per-entity direction + velocity | `getEntityTrajectory` for top-N entities |
| Component trends | Per-component over time | `getComponentTotals` across periods |
| Projected next period | Trajectory extrapolation | Linear extrapolation from 3+ period totals |

### T2-8: Acceleration (`/acceleration`)

Coaching, recognition, actions. Real data or honest empty.

| Element | Purpose | Data source (T1-B) | Note |
|---|---|---|---|
| Top Performers | Recognition | `getEntityResults` sorted desc | |
| Top Movers | Gainers + decliners | `getEntityResults` current vs prior | |
| Near-tier entities | Gap framing | `getEntityResults` near tier boundaries | If no tier config: omit |
| Component coaching | Component focus | `getComponentTotals` per entity vs avg | STUB coaching action |
| SPIFs | Active programs | Real SPIF config or honest empty | |
| Alerts | Threshold alerts | Real alert logic or honest empty | |
| Rep: My Progress | Goal-gradient | Personal `getEntityResults` + tier config | |
| Rep: My Rank | Neighborhood | `getEntityResults` neighborhood around self | |

---

## TIER-3 — INTEGRATION PROOF

Sequential. After all Tier-2 agents complete.

### T3-A: Build verification
`kill dev → rm -rf .next → npm run build → npm run dev → localhost:3000`. tsc 0, build compiles, tests pass. Paste output.

### T3-B: Consolidated proof gates

Eight gates. Each proves a meaningful invariant. Self-attestation rejected — paste evidence.

| Gate | Invariant | Evidence required |
|---|---|---|
| **G1: Cognitive Fit** | Every surface passes DS-003 Diversity Minimum (3+ component types for 4+ elements). | Per surface: list elements + component types. 8 surfaces × 1 list. |
| **G2: Five Elements** | At least 2 elements across all surfaces contain all five (value + context + comparison + action + impact). | Paste 2 rendered elements showing all five. |
| **G3: End-State A** | Every surface's data access terminates at `calculation_results` / `entity_period_outcomes` / `calculation_batches`. Zero chains reach `committed_data`. | Per surface: paste the import/call chain from rendered value to T1-B function to SQL source. Compare to P0-D baseline (before/after). |
| **G4: Single validity verdict** | `/stream` and `/perform` show the SAME verdict for BCL's current batch. | Paste both surfaces' verdict rendering for the same period. |
| **G5: Persona** | Admin vs Rep density differs on 2+ surfaces AND ambient gradient shifts between personas on 1+ surface. | Paste Admin view and Rep view of same surface. Paste gradient CSS for both. |
| **G6: Thermostat honesty** | 2+ real actions wired (click → response). 2+ stub actions rendered disabled. Zero fabricated actions (enabled → no backend). | Paste evidence of each class. |
| **G7: Agent rename** | Sidebar shows "Intelligence" and "Compensation." Breadcrumbs reflect. | Paste workspace-config or nav output. |
| **G8: Learning-loop consumption** | At least 1 surface element's label/data sourced from a comprehension artifact or surface binding (not raw DB). | Paste code path: component → T1-B → comprehension-store/surface-binding read. |

### T3-C: Completion report
`docs/completion-reports/OB-234_COMPLETION_REPORT.md`. Per Rules 25–28: per-gate evidence, build output, git log. `gh pr create --base main --head ob-234-intelligence-viz-redesign`.

---

## HALT CONDITIONS

| ID | Condition | Action |
|---|---|---|
| HALT-1 | Agent rename blast radius exceeds 30 files. | Stop. List. Architect confirms. |
| HALT-2 | Persona ambient gradient requires changes to shared shell/layout affecting non-Intelligence surfaces. | Stop. List shared files. Architect dispositions. |
| HALT-3 | `/stream` components imported by other agents — redesign has cross-agent blast radius. | Stop. List imports. Architect dispositions. |
| HALT-4 | Budget/target/attainment data doesn't exist for BCL. | NOT a halt. Honest empty or omit. Never fabricate. |
| HALT-5 | T1-B data layer requires new API routes for comprehension artifact access. | Proceed — create the routes. This is the point. |
| HALT-6 | P0-D reveals ALL 8 surfaces are DIRTY (no clean read-path exists). | Proceed — T1-B builds the clean layer from scratch. Report the scope. |

---

*OB-234 R3: Intelligence Agent Visualization Redesign*
*2026-06-23 · vialuce.ai · Intelligence. Acceleration. Performance.*
*ULTRACODE / effort-mode native. Tiered: P0 → T1 → T2 (fan-out) → T3.*
*Design system: DS-003 · TMR 7 · TMR 8 · DS-013 · DS-015*
*Learning loop: OB-235 comprehension · density · bindings · flywheel*
*Agent rename: Performance → Intelligence · Calculation → Compensation*
*Data contract tight. Visual expression autonomous.*
*The file IS the prompt. Ends here.*
