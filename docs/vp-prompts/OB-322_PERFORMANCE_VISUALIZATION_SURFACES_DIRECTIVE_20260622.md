# OB-322: PERFORMANCE AGENT VISUALIZATION SURFACES
**Date:** 2026-06-22
**Category:** OB (Objective Build)
**Sequence number:** OB-322 — architect-assigned. Phase 0 performs live collision check against `docs/vp-prompts/` directory.
**Repo:** VP `CCAFRICA/spm-platform`
**Branch:** `ob-322-performance-visualization`
**Mode:** ULTRACODE — objectives + constraints + proof gates. CC determines execution strategy autonomously. Fan-out where beneficial.
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md` — the file IS the prompt (DD-11); no tail summary; no internal CC Execution Block. Phase prose is the executable.
**Provenance:** CLTOB230 eight-surface architect walk (2026-06-22, architect channel); End-State A agent model (locked, separate architect session); DS-013 Platform Experience Architecture; DS-015 Intelligence Stream Evolution; DS-008 series.

---

## §0 — CC STANDING RULES HEADER

`CC_STANDING_ARCHITECTURE_RULES.md` binds throughout. Architecture Decision Gate (Section B) required before implementation. Anti-Pattern Registry (Section C) checked — AP-11 (shell/empty pages), AP-13 (assumed schema), AP-17 (duplicate code paths), AP-21 (summary/detail divergence) are the high-risk patterns for this work. AP-25 (Korean Test) binds on dimension discovery — zero hardcoded dimension names.

Standing rules: SR-34 (no bypass — fix structurally), SR-38 (math review gate where aggregation logic changes), SR-41 (revert discipline), Rules 25–28 (completion report structure). Drafting source: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

**First action:** write this directive verbatim to `docs/vp-prompts/OB-322_PERFORMANCE_VISUALIZATION_SURFACES_DIRECTIVE_20260622.md` and commit (`"OB-322: directive committed"`). Verify no sequence collision: `ls docs/vp-prompts/OB-322*` must return only this file.

**Reconciliation-channel separation:** no ground-truth payout values appear in this directive. BCL verification targets are architect-channel only. CC renders what the engine produces; architect reconciles.

---

## §1 — PROBLEM STATEMENT

The Performance agent's Insights sub-pages were built as independent surfaces, each re-deriving aggregates and hardcoding dimension vocabularies. An architect-channel walk of all eight surfaces against BCL March-2026 ground truth found:

**Data-binding failures (engine produces correct values; surfaces fail to render them):**
- Overview: "Earnings by Component" chart shows correct component labels but zero amounts. "Total Period Outcome" blank.
- Analytics: "Dimension Breakdown" shows "No Segment Dimension" empty state. BCL carries two real dimensions (component: 4 values; Nivel/variant: 2 values). The page hardcodes `{region, team, product}` and discards the tenant's actual dimensions — AUD-009 / Korean Test violation.
- Performance Overview: "Regional Performance" shows "No regional data configured" — correct for BCL (no region dimension), but the widget is hardcoded to region instead of discovering available dimensions.

**Fabricated content (surface asserts facts contradicted by tenant data):**
- Acceleration & Alerts: "Holiday Push SPIF," "New Product Launch," budget alerts referencing "West Region," achievement badges — none of which exist in BCL. Page reads zero tenant data and renders hardcoded seed content. AP-11 violation (shell page passing existence checks).

**Structural redundancy (surfaces duplicate each other's content):**
- Overview, Analytics, Performance Overview, and Compensation all render variants of the same hero cards (total payout, entity count, average) with no shared component and inconsistent period selection (Overview defaults to Nov; Analytics/Performance/Compensation default to March; Trends spans all).
- My Team renders a flat entity-payout table duplicating Performance Overview's and Compensation's entity lists, with no manager-scoped intelligence. Fails EECI on all four axes.
- Sales & Finance link routes back to Insights — broken nav entry.

**Boundary violations (End-State A, locked):**
- Multiple surfaces re-derive period totals (Decision 158: construction layer re-deriving what convergence already produced).
- Performance agent surfaces assert standalone totals and verdicts that belong to Calculation (End-State A: Performance consumes, never re-derives).

**Information architecture failures:**
- "Performance" is simultaneously the agent name, a Dashboard name, an Insights sub-page name, and a breadcrumb label — four identities on one word.
- No shared period selector; each surface independently decides its period.
- No drill path from aggregate → dimension → entity.

---

## §2 — SUBSTRATE-BOUND DISCIPLINE APPLICATIONS

| Substrate entry | Application in this OB |
|---|---|
| **Decision 158** (LLM recognizes; code constructs) | Applied at agent seam: Performance surfaces read `calculation_results.total_payout` and `calculation_results.components` directly. No re-aggregation from raw data. No re-derivation of component totals. |
| **End-State A** (agent model, locked) | Performance = analytics tier consuming Calculation's result-of-record. Every total, component amount, and entity payout displayed on a Performance surface reads from `calculation_results` / `entity_period_outcomes`. Performance never computes its own. |
| **Korean Test (T1-E910 v2)** | Dimension discovery: zero hardcoded dimension names. The system reads what the tenant's data carries (component names from `rule_sets.components` / `calculation_results.components`; variant values from `entities` metadata; any other classification from `committed_data` column diversity). If a dimension has <2 distinct values, it is not surfaced. |
| **Decision 111** | Performance = rate + trajectory + reference frame + components. The "Performance" Insights sub-page must show vs-target content (attainment, pacing), not another copy of State. |
| **DS-013 §5** | Persona as Intelligence Filter, not Page Template. Admin/Manager/Rep toggle filters density and emphasis within the same surface — it does not fork into separate pages. My Team's function collapses into persona-scoped views of the four canonical surfaces. |
| **AP-11** | Page renders with real data, not empty container or hardcoded seed. Acceleration page must read real `calculation_results` or show honest empty state — never fabricated SPIFs, badges, or region-based alerts. |
| **AP-21** | Single data source for summary and detail. Hero cards and entity tables on the same surface read from the same query result. |
| **AP-25** | Korean Test on every surface. No field-name pattern matching, no language-specific strings, no hardcoded column names. |

---

## §3 — OBJECTIVES (ULTRACODE)

CC determines execution strategy, file structure, component architecture, and phase ordering autonomously. The following objectives define DONE. All must be true on `localhost:3000` against BCL tenant data before the completion report.

### O-1: SURFACE INVENTORY

The Performance agent's Insights navigation contains exactly five entries after this OB:

| Nav label | URL path | Unique job |
|---|---|---|
| Overview | `/insights` | Glanceable state: hero cards, top performers, component/dimension composition |
| Analytics | `/insights/analytics` | Explore: user-controlled lens — period range, dimension pivot, drill, export |
| Performance | `/insights/performance` | Vs reference: attainment, pacing, hot/cold |
| Compensation | `/insights/compensation` | The money lens: payout composition, cost metrics, plan health |
| Trends | `/insights/trends` | Temporal: trajectory, velocity, direction, period-over-period |

**Removed entries:** My Team, Sales & Finance. Their nav items no longer render. Their routes redirect to `/insights` (not 404). Accelerator Participants moves to its own top-level Acceleration section in the sidebar (outside Insights) — if it currently lives under Insights, remove the nav entry from Insights. The Acceleration page itself is addressed in O-7.

### O-2: SHARED PERIOD SELECTOR

A single `PeriodSelector` component renders on every Insights surface (O-1 surfaces). Implementation:

- Renders as horizontal period cards (one card per calculated period), not a dropdown.
- Selected period is visually distinguished. All periods are tappable.
- Period state is shared across surfaces (navigating Overview → Analytics preserves period selection). Use URL query parameter, shared context, or equivalent — CC determines mechanism.
- Hero cards on every surface reflect the selected period's data.
- Data source: `calculation_batches` joined to `periods` for the active tenant. Only periods with completed calculation batches appear.

### O-3: DIMENSION DISCOVERY

A dimension-discovery service replaces all hardcoded dimension vocabularies (`region`, `team`, `product`, `plan`). Implementation:

- Reads the tenant's actual dimensions from live data. Two dimension sources are always available from the existing schema:
  - **Component** — keys from `calculation_results.components` JSONB array (each element has a name/label). BCL has 4: Colocación de Crédito, Captación de Depósitos, Productos Cruzados, Cumplimiento Regulatorio.
  - **Variant** — distinct values from `entities` metadata or `rule_set_assignments` metadata (the variant/level/role classification). BCL has 2: Ejecutivo, Ejecutivo Senior.
- Additional dimensions may exist in `committed_data.row_data` columns or `entities.metadata` — the service discovers them by inspecting distinct value counts. A column with 2–20 distinct values across the entity population is a candidate dimension. A column with 1 value or >50% unique values is not.
- No hardcoded list of dimension names. The service returns `Array<{ key: string, label: string, values: string[] }>`. Surfaces consume this array.
- Korean Test: if a tenant uploaded data in Hangul with different column names, the discovery still works because it reads values, not names.

### O-4: OVERVIEW FIXES

The Overview page (`/insights`) renders correctly for the selected period:

- **"Total Period Outcome"** (or equivalent hero card) shows `SUM(calculation_results.total_payout)` for the selected period's batch.
- **"Earnings by Component"** chart shows per-component totals extracted from `calculation_results.components` JSONB, aggregated across all entities for the selected period. The chart type (bar, horizontal bar, or stacked) is CC's choice — but it must show non-zero values when the data is non-zero.
- **"Top Performers"** list continues to work (already correct).
- **Hero cards** (Entities Paid, Average Earnings) continue to work (already correct), now reading from the selected period via O-2.

### O-5: ANALYTICS DIMENSION PIVOT

The Analytics page (`/insights/analytics`) uses the dimension-discovery service (O-3):

- **"Dimension Breakdown"** replaces the "No Segment Dimension" empty state. It renders the first discovered dimension (default: component) as a chart (bar or pie — CC determines; the chart-type toggle should work if present).
- A dimension switcher (tabs, dropdown, or toggle — CC determines) lets the user pivot between discovered dimensions.
- The "Total Payout by Period" chart continues to work (already correct).
- Period selection via O-2.
- Export button exports the currently visible data slice as CSV.

### O-6: COMPENSATION ENRICHMENT

The Compensation page (`/insights/compensation`) gains:

- **Period cards** (O-2) replacing the dropdown.
- **"Where the money goes"** — component composition from `calculation_results.components` aggregated for the selected period, rendered as horizontal bars or proportional visualization (not a 100% donut for single-plan tenants). Uses dimension discovery (O-3) so it pivots on whatever dimensions have variance, not hardcoded "by plan."
- **Payments by Entity table** continues to work (already correct), now scoped to selected period.
- The existing entity table columns (Entity, Variant, Top Component, Δ Prior, Total) are retained.

### O-7: ACCELERATION HONEST STATE

The Acceleration page (wherever it currently lives in nav):

- **Removes all hardcoded/fabricated content.** No fake SPIFs, no fake badges, no fake alerts, no fake coaching. Every element on this page either reads real tenant data or shows an empty state that says "not configured" / "no data available."
- **Reads real data where available.** For BCL: top performers from `calculation_results`, period-over-period changes, entity trajectory (from Trends data). For SPIFs: if no SPIF configuration exists in the tenant's data, show empty state — never fabricated programs.
- **Alerts section:** if no real alert-generating logic exists, show empty state: "No alerts. Alerts will appear here when threshold-based monitoring is configured."
- **Coaching/Goals/Insights tabs:** if no real data backs them, show empty state per tab — never fabricated content.

### O-8: NAMING AND IA CLEANUP

- Page titles, breadcrumbs, and URL paths agree on every surface. No surface has a title that contradicts its breadcrumb or its nav label.
- The word "Performance" as a page title is disambiguated from "Performance" as the agent name. The Insights sub-page titled "Performance" should be titled distinctly (e.g., "Attainment" or "Performance vs Target" — CC determines the label that best fits O-1's "vs reference" job).
- Breadcrumb path on every Insights sub-page: `[Tenant] > Insights > [Page Name]` — consistent.

---

## §4 — HALT CONDITIONS

| ID | Condition | Action |
|---|---|---|
| HALT-1 | `calculation_results.components` JSONB structure for BCL is not an array of objects with extractable component names and amounts — i.e., the schema assumption in O-3/O-4 is wrong. | Stop. Paste the actual JSONB structure from a live query. Architect dispositions the extraction path. |
| HALT-2 | The Acceleration page's SPIF/badge/alert content is generated by a backend service (not frontend hardcoded) — removal requires API route changes that affect other tenants. | Stop. Enumerate the backend routes involved. Architect dispositions scope. |
| HALT-3 | Entity variant/level classification is not present in `entities` metadata or `rule_set_assignments` — the Variant dimension in O-3 has no data source. | Stop. Paste the actual `entities` row for one BCL entity. Architect dispositions dimension source. |
| HALT-4 | More than 15 files need modification to implement O-1 surface cuts (My Team, Sales & Finance). | Stop. List the files. Architect confirms scope or narrows. |

---

## §5 — REPORTING DISCIPLINE

Completion report: `docs/completion-reports/OB-322_COMPLETION_REPORT.md` (NOT project root, NOT `docs/diagnostics/`).

Per Rules 25–28, the completion report includes:

- Per-objective (O-1 through O-8) PASS/FAIL with **pasted evidence**: screenshot URLs, terminal output, or code snippets proving the gate. Self-attestation not accepted (AP-9, AP-10).
- For O-2: paste the rendered period cards showing multiple periods with one selected.
- For O-3: paste the dimension-discovery service output for BCL showing component + variant dimensions discovered (not hardcoded).
- For O-4: paste the Overview page showing non-zero component chart values.
- For O-5: paste the Analytics page showing dimension breakdown with real data (not "No Segment Dimension").
- For O-7: paste the Acceleration page showing either real data or honest empty states — no fabricated content.
- For O-8: paste breadcrumb evidence for at least 3 Insights sub-pages showing consistent naming.
- Build verification: `kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000` output pasted.
- Git: all commits pushed. Final step: `gh pr create --base main --head ob-322-performance-visualization` with descriptive title and body.

---

## §6 — OUT OF SCOPE

- **Thermostat / AI intelligence binding** (forecast, anomaly detection, coaching recommendations, Insight Agent / AIService wiring). This is a P1 follow-on — not this OB. Surfaces should be structurally ready to receive intelligence elements but this OB does not wire them.
- **Transaction-level drill-down.** Per-transaction engine is not built (ICM readiness audit). Drill stops at entity level.
- **Cost-as-%-of-outcome metric.** Requires revenue binding from `committed_data` — a separate data contract. Compensation surface should have a placeholder card position but not fabricate a value.
- **Persona-adaptive density.** DS-013 §5 persona refraction (Admin sees highest density, Rep sees lowest). This OB ensures the Admin/Manager/Rep toggle continues to function but does not implement differentiated content per persona. Follow-on OB per OB-229+ scope.
- **Dashboard surfaces** (Intelligence, Performance Overview dashboards under "Dashboards" in nav). This OB scopes to the seven Insights sub-pages + Acceleration. Dashboard surfaces are a separate review.
- **End-State A relocation** of comp-reporting from Performance → Calculation agent. This OB fixes what's broken in Performance's current surfaces. The structural relocation (moving result-of-record content to Calculation) is a separate OB gated on End-State A's DS.
- **Budget vs actual.** No budget data exists in BCL; do not fabricate. If budget fields exist in schema, they can be rendered; if not, omit.

---

## §6A — RESIDUALS

- **Trends page enrichment.** Trends currently works as a thermometer (trajectory, velocity, direction). Promoting it to thermostat (forecast, anomaly, recommendation) is the P1 follow-on scoped under the Insight Agent / AIService binding.
- **Compensation plan-health diagnostics.** The AI Plan Intelligence diagnostics (threshold clustering, component irrelevance, cap saturation, floor waste) are designed (DS-008-A1, project knowledge) but not rendered. Compensation surface should structurally accommodate a "Plan Health" section but this OB does not wire the AI diagnostic generation. Honest empty state or omission — never fabricated diagnostics.
- **"Accelerator Participants" as a concept.** If the tenant has configured accelerator programs, this surface should show real participant data. If no accelerator configuration exists, empty state. The concept is retained; the fabricated seed content is removed.
- **Cross-domain synthesis.** Performance consuming Finance domain data (comp × revenue) requires the Finance agent to be active. BCL is ICM-only. This capability is structurally possible under End-State A but not exercised in this OB.

---

*OB-322: Performance Agent Visualization Surfaces*
*2026-06-22 · vialuce.ai · Intelligence. Acceleration. Performance.*
*ULTRACODE — CC determines execution strategy autonomously.*
*The file IS the prompt. No tail summary. Ends at §6A.*
