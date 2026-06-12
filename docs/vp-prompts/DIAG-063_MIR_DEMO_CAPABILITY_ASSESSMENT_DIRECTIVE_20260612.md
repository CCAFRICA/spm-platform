# DIAG-063 — MIR DEMO CAPABILITY ASSESSMENT
## Platform-Wide Read-Only Assessment Defining Development Effort for the MIR Demo Capabilities
**Date:** 2026-06-12 · **Class:** DIAG (read-only — this directive ships zero code changes) · **Repo:** spm-platform (repo root)
**Sequence:** Architect-assigned DIAG-063 from the authoritative `docs/diagnostics/` read of 2026-06-12 (highest existing: DIAG-062)
**Directive path:** `docs/vp-prompts/DIAG-063_MIR_DEMO_CAPABILITY_ASSESSMENT_DIRECTIVE_20260612.md`

---

## §0 — CC Standing Rules Header

Binding throughout: `CC_STANDING_ARCHITECTURE_RULES.md` (read in full before Phase 1), `CC_DIAGNOSTIC_PROTOCOL.md` Rules 19–24 (applied in read-only form: Rules 21/22 tracing and headless verification apply; the "fix" halves of Rules 19/24 do not, because this directive prohibits fixes), AP-25 / Korean Test (all probes are structural; zero domain vocabulary enters any committed artifact's code), SR-34 (no bypasses — and no fixes: a defect found here is recorded, never repaired), Rules 25–28 (completion-report discipline per `COMPLETION_REPORT_ENFORCEMENT.md`). Drafting-discipline source: `INF_Structured_Compliant_Drafting_Reference_20260513.md` (DD-1 through DD-12; this file is the prompt per DD-11 — read end-to-end, execute the phase prose, no summary exists elsewhere).

**Read before Phase 1:** `CC_STANDING_ARCHITECTURE_RULES.md`, `CC_DIAGNOSTIC_PROTOCOL.md`, `SCHEMA_REFERENCE_LIVE.md` (authoritative schema — every DB probe checks table/column names here first; no schema assumed from memory). Database access is read-only via the established service-role client pattern (`npx tsx scripts/...`). No psql. No exec_sql RPC. No migrations. No writes of any kind to any table.

**Mode declaration:** This is an assessment, not a hunt for blame and not a fix arc. Several capabilities are believed working by the architect channel; for those, the job is to locate and bank the evidence cheaply. For gaps, the job is to define the development effort in structural terms. Discovering that evidence contradicts a belief is a finding to record verbatim and continue — not a reason to halt, argue, or repair.

---

## §1 — Problem Statement

A prospect demo (codename **MIR**) is approximately 2.5 weeks out. A Capability Status Profile R0 exists in the architect channel with 32 capabilities tiered by evidence; 9 are UNKNOWN, several are EXISTS-UNVERIFIED, and the development schedule cannot be built on opinion. Recent architect-channel observations (a ~162,000-row import completed; duplicate-execution believed fixed; persona switching observed working; a disputes foundation believed present without UI) must be converted into located, pasted, repository-and-database evidence, and every gap must be converted into a defined development effort.

This DIAG produces the single output document from which the R1 profile revision and the demo development schedule derive. Its deliverable is **evidence plus effort definition**, per capability, in one file.

**Effort-class vocabulary (used throughout the output):**

- **E0 — NONE:** verified working; evidence banked; no development effort.
- **E1 — VERIFY-ONLY:** code/DB evidence is green; remaining proof is an architect browser action (listed for the architect checklist).
- **E2 — SURFACE:** backend/service/data exists; effort is a new or extended UI surface composing existing services.
- **E3 — COMPOSE:** effort assembles existing components/services with light service-layer work.
- **E4 — BUILD:** net-new schema and/or service and/or UI required.

Effort is expressed structurally (routes, components, services, named tables) — never in time units. The architect channel converts structure to schedule.

---

## §2 — Substrate-Bound Discipline Applications

- **E905 (Prove, Don't Describe):** every probe's result is pasted verbatim — command output, code excerpt with `file:line` header (≤40 lines per excerpt), or tsx read-script output. PASS/FAIL self-attestation without pasted evidence is a directive violation.
- **E952 (Adjacent-Arm Drift):** inventories sweep the class, not the instance. Where a probe asks "where does X happen," the answer enumerates every site found by the stated search, not the first site.
- **E910 / AP-25 (Korean Test):** any read script committed under `scripts/diag/` uses structural queries and registry-derived names only; no language-specific literals beyond what exists in inspected data.
- **D-158 / D-92 surfaces** are probed (intent constructor, source_date binding) and never modified.
- **Reconciliation-channel separation:** this directive contains zero expected values, zero ground-truth anchors, and zero tenant verification numbers. CC reports what the platform contains; the architect channel interprets.
- **Anonymization:** the prospect's name appears nowhere in this directive and must appear nowhere in any committed artifact, commit message, branch name, PR, script, or output. The engagement codename is MIR.

---

## §3 — Phase Prose (the executable)

Phase ordering is dependency-driven: anchoring first, evidence-banking second (cheapest, unblocks belief reconciliation), effort-definition modules after, assembly last.

### Phase 1 — Anchoring and Sequence Verification

1.1 From repo root: `git checkout main && git pull`. Paste `git rev-parse HEAD` and `git log -1 --format='%H %ad %s'`. Confirm clean tree with `git status --porcelain` (paste; must be empty). This SHA is the assessment anchor; the output document names it.

1.2 **Sequence verification (architect-assigned DIAG-063).** Run `ls -1 docs/diagnostics/ | sort -V` and paste the full listing. Confirm both: (a) the highest existing `DIAG-` number is DIAG-062, and (b) no file beginning `DIAG-063` exists. If either check fails, HALT-1 — the architect re-sequences; CC never self-assigns a number.

1.3 Create the working branch: `git checkout -b diag/063-mir-demo-capability-assessment`. Save this directive file verbatim at `docs/vp-prompts/DIAG-063_MIR_DEMO_CAPABILITY_ASSESSMENT_DIRECTIVE_20260612.md` and commit it as the first commit on the branch.

1.4 Read-proof of governing artifacts. Locate each (paste the command output):
`find . -name "CC_STANDING_ARCHITECTURE_RULES.md" -not -path "./node_modules/*"`
`find . -name "CC_DIAGNOSTIC_PROTOCOL.md" -not -path "./node_modules/*"`
`find . -name "SCHEMA_REFERENCE_LIVE.md" -not -path "./node_modules/*"`
Then paste `wc -l` for each found path. Read all three in full before any probe.

1.5 Create the output skeleton at `docs/diagnostics/DIAG-063_MIR_DEMO_CAPABILITY_ASSESSMENT_OUTPUT.md` with the structure defined in Phase 7.1. All subsequent probe results are written into this file as they are produced, not reconstructed at the end.

### Phase 2 — Module A: Believed-Working Evidence Banking

> Architect-channel belief register for this module: Section-1 ingest capabilities present and working; duplicate execution solved; scale proven by a ~162k-row import; persona switcher works. Bank the evidence. Where evidence diverges, record verbatim and continue.

**A1 — Scale anchor (the ~162k import).** Via a read-only tsx script against the live DB (schema names from `SCHEMA_REFERENCE_LIVE.md`): list the ten largest import batches platform-wide by committed row count — batch id, tenant id, file count, per-file row counts where recorded, status, created/completed timestamps (compute wall-clock duration). Identify the ~162k batch. Paste the script and its output. Then the second half: for that batch's tenant and period(s), query `calculation_results` for run count, result-row count, and run duration if recorded. If no calculation has executed against that volume, the output records: "Import proven at ~162k; calculation at volume: NOT YET EXECUTED" — that distinction feeds the architect's volume-spike decision. Effort-class this capability accordingly (import side and calc side separately).

**A2 — Multi-file single-batch.** From A1's batch data, paste evidence of at least one batch containing ≥3 files completing with per-file row accounting. Code side: enumerate write sites with `grep -rn "commitContentUnit" src/ --include="*.ts" --include="*.tsx"` — paste all hits; the expectation under AP-17 is one projection path; record every call site found.

**A3 — Cross-file entity resolution.** Locate the resolution mechanism: `grep -rni "dedup\|entity.*match\|resolveEntity\|entity_identifier" src/ --include="*.ts" -l`, paste the file list, then paste the core resolution function (≤40 lines, file:line). DB side: for the most recent tenant with a multi-file batch, query whether single entities carry multiple source identifiers (per the identifier model in `SCHEMA_REFERENCE_LIVE.md`); paste counts: total entities, entities with ≥2 distinct source keys. If the mechanism cannot be located in code, record NOT FOUND with the searches attempted — that is itself the finding.

**A4 — Multi-tab XLSX.** Locate sheet iteration in the ingestion path: `grep -rni "SheetNames\|worksheets\|sheet_to_json" src/ --include="*.ts" -l`, paste; then paste the handling excerpt. DB side if recordable: any batch whose source file yielded multiple content units/sheets.

**A5 — Mapping confirmation gate.** Locate the surface that blocks commit on unresolved mappings: `grep -rni "unmapped\|unresolved.*mapping\|mapping.*confirm" src/ --include="*.ts" --include="*.tsx" -l`, paste; paste the guard logic or record ABSENT with searches attempted.

**A6 — Duplicate-execution guard.** Locate the fix: `git log --oneline --all -i --grep="duplicat"` and `grep -rni "in.flight\|already.*running\|execution.*lock\|idempot" src/lib/ --include="*.ts" -l`. Paste both. Paste the guard code (≤40 lines, file:line) and identify the commit that introduced it. Confirm that commit is an ancestor of the Phase-1 anchor SHA using `git merge-base --is-ancestor` with the discovered commit hash and HEAD, pasting the exact command run and its exit code. If no guard is found, record NOT FOUND with searches attempted; do not fix.

**A7 — Persona switcher post-auth-rework trace (Rule 21).** Locate the switcher: `grep -rni "persona\|demo.*switch\|switch.*user" src/ --include="*.ts" --include="*.tsx" -l`, paste. Trace its identity path: entry component → handler → session/identity call chain, every hop with file:line. State explicitly whether the chain routes through `resolveIdentity()` (the HF-282 canonical reader) or reads identity/profile by any other shape. If any other shape: record the shape verbatim — that is a defect-class finding (divergent identity read), recorded, not fixed. Architect-browser item: live persona-switch on production.

### Phase 3 — Module B: Surfacing-Effort Definition

**B1 — Five layers of proof, user accessibility.** Inventory every existing drill-down surface: result-detail routes (`grep -rn "calculation" src/app --include="page.tsx" -l`, paste and classify), component-breakdown rendering, input/source-row trace surfaces (`grep -rni "trace\|drill\|breakdown" src/ --include="*.tsx" -l`). Paste the inventory with one line per surface: route, audience (admin/rep), what layer it exposes (total → components → inputs → source rows). Then define the gap: which layers are reachable by an authenticated rep from their own statement today, which are admin-only, which exist only as data in `calculation_results`. Effort shape: the route(s)/component(s) required to make all layers rep-reachable, and which existing services they compose. Expected class E2-SURFACE; report what the evidence supports.

**B2 — Individual commission statements.** Locate statement backend (`grep -rni "statement" src/ --include="*.ts" --include="*.tsx" -l`, paste; paste the core service excerpt). Define the rep-facing surface gap and effort shape.

**B3 — Payroll-ready export.** Locate export machinery (`grep -rni "export.*csv\|csv.*export\|payroll" src/ --include="*.ts" -l`, paste; paste route/service excerpt). State what the current output contains versus the demo bar (entity id, name, hierarchy, period, amount) field by field. Effort shape for the delta. If a headless invocation path exists (existing script or route callable via tsx with service role against an existing tenant, read-only), run it once and paste the first 5 output lines with numeric values redacted to `#` characters (channel separation: no tenant payout values cross this report).

**B4 — Trajectory surfacing.** Locate the DS-015-B engine (`grep -rni "trajector" src/ --include="*.ts" -l`, paste; paste core excerpt). State where its output lands (table/service) and what UI consumes it today, if any. Effort shape to surface one trend view.

**B5 — Results dashboard (admin).** Locate the current results table route/component; paste. Enumerate its present columns/controls versus: per-entity totals, per-component columns, period selection, entity count correctness. Effort shape for the gap.

### Phase 4 — Module C: Trust Loop (Disputes, Adjustments, Audit)

> Architect-channel belief: a disputes foundation exists; no UI to initiate, manage, or approve. The functional bar this module measures against: **vendedor opens own statement → flags a specific transaction with structured reason + data reference → dispute enters an admin queue → admin resolves via adjustment (approved + audited) → recalculation reflects the delta on the statement.**

**C1 — Disputes foundation inventory.** Three layers, each pasted: (1) schema — from `SCHEMA_REFERENCE_LIVE.md` plus a live read-only existence probe, list dispute-related tables and their columns; (2) API — `grep -rni "dispute" src/app/api -l` and route excerpts; (3) services/UI — `grep -rni "dispute" src/ --include="*.tsx" -l`. Then a six-row table, one row per functional-bar step, each row: EXISTS (evidence ref) / MISSING. Effort shape for every MISSING row in structural terms (new route, new component, which existing service it calls, which table it writes). Expected mix of E2/E4; report what the evidence supports.

**C2 — Adjustments / exception approval.** Same three-layer treatment with `grep -rni "adjust\|exception\|approv" src/ --include="*.ts" --include="*.tsx" -l` (classify hits; approval machinery for plans vs payouts vs adjustments distinguished). Map against: manual adjustment requires approval; every touch emits an audit event; adjustment triggers recalculation. Effort shape per missing element.

**C3 — Audit trail coverage.** DB: distinct `platform_events` event names with counts (read-only). Code: enumerate emit sites (`grep -rn "platform_events\|recordEvent\|logEvent" src/ --include="*.ts" -l`, paste). Coverage table: demo-path action classes (login, import, plan import, calculate, export, adjustment, dispute, persona switch) × instrumented? Gap list only; no new events added.

### Phase 5 — Module D: Net-New Definition and Demo-Surface Invariants

**D1 — Company-wide dashboard adjacents.** Inventory reusable composition material: existing chart components (`grep -rni "recharts\|Chart" src/ --include="*.tsx" -l`, paste and classify), existing aggregation services or queries that produce tenant-level rollups, existing dashboard routes. Output: a compose-from list and the effort shape of a company view (total payout, attainment by grouping, period view) as E3-COMPOSE or E4-BUILD per the evidence.

**D2 — Currency formatting (PDR-01) class analysis.** This item has survived three fix cycles; the assessment defines the class, read-only. (1) Enumerate every currency-formatting site: `grep -rni "toLocaleString\|Intl.NumberFormat\|formatCurrency\|formatMoney" src/ --include="*.ts" --include="*.tsx"` — paste all hits, classified by surface. (2) History: `git log --oneline -i --grep="currenc\|cents\|PDR"` — paste; for each prior fix commit, one line on what it changed (from `git show --stat` on each discovered commit, command and output pasted). (3) Structural statement: single formatting authority or N independent sites? If N sites, the prior fixes were instance closures (AUD-009 signature) and the eventual fix is one invariant at one authority — state where that authority would live. No fix here.

**D3 — Demo-path language inventory (neutral).** (1) Identify the i18n mechanism if any (`grep -rni "i18n\|locale\|dictionar\|translations" src/ --include="*.ts" -l`, paste). (2) List the demo-path routes (login, import, mapping, calculate, results, statement, dashboards). (3) For each, sample for hardcoded English UI strings (grep for common English UI words within those page/component files, e.g. `grep -rn "Submit\|Cancel\|Loading\|Search\|Settings"` scoped to the route component paths enumerated in step 2). Output: per-route count + up to 3 exemplars. Inventory only — no translation work, no judgment language.

**D4 — Post-calc display integrity (historical #69/#71/#72 family).** Three reads, each with pasted code: (1) results staleness — does the results view re-fetch after calculation completes (trace the post-calc data flow per Rule 21)? (2) entity-count source — does the displayed count derive from calculated entities or all entities (paste the count's data source)? (3) period-selector refresh — does a newly created period appear without page exit (paste the selector's data source/refresh path)? Per item: current-behavior statement from code + effort shape if defective.

### Phase 6 — Module E: Engine-Path Confirmations for the MIR Plan Portfolio

**E1 — temporal_adjustment execution.** Paste the engine handler (`grep -rn "temporal_adjustment" src/lib --include="*.ts"`, then the handler excerpt). DB: read-only count of calculation result components of this type across all tenants (no values — counts and tenant/period identifiers only). Record EXECUTED-IN-HISTORY or NEVER-EXECUTED.

**E2 — Period-scoped plan assignment.** From `SCHEMA_REFERENCE_LIVE.md` + code: does the assignment model support effective ranges / period scoping, and does the calculation path honor it? Paste the schema fields and the honoring code, or record ABSENT with effort shape (this gates the MIR seasonal-overlay plan).

**E3 — Plan variant mechanism.** Locate the variant mechanism (BCL-era); paste its core. Confirm operative on the anchor SHA.

**E4 — Filtered metric derivation.** Paste the derivation execution path for `sum` + filters and `count` + filters (the MIR category-commission dependency). Confirm operative.

**E5 — Condition-subject constructor surface map.** Locate the intent-constructor surface where condition-bearing compositions are built (the CRP Plan-3-arc surface): paste the constructor function(s) with file:line, and enumerate which component types route through it versus which bypass it. This is a boundary map for the architect's route-around authoring — explicitly NO change, NO fix, NO disposition.

**E6 — Multi-plan concurrency.** Schema + one read-only evidence row (identifiers only, no values) confirming an entity with ≥2 active rule-set assignments calculates under both.

### Phase 7 — Assembly, Commit, Report

7.1 The output document `docs/diagnostics/DIAG-063_MIR_DEMO_CAPABILITY_ASSESSMENT_OUTPUT.md` contains, in order: (1) header with anchor SHA, date, branch; (2) **Summary Matrix** — one row per capability probed: capability · evidence tier · effort class (E0–E4) · probe ref · architect-browser ref if any; (3) per-module probe results with all pasted evidence inline (A1…E6, each as: CURRENT STATE / EVIDENCE / GAP TO DEMO BAR / EFFORT SHAPE); (4) **Architect Browser Verification Checklist** — every item marked architect-browser across all modules, consolidated, one action + one observable each; (5) **Open Questions** — anything a probe could not resolve, each with the searches/queries attempted (a question without its attempted-search list is incomplete); (6) **Findings Register** — any evidence that contradicted the §0 belief register or surfaced a defect, recorded neutrally with evidence refs.

7.2 Commit discipline: commit after each module phase completes (Phases 2–6), message format `DIAG-063 Module <module letter>: <one-line summary>` (CC composes the summary; the prefix is fixed). Read scripts created for probes live under `scripts/diag/` and are committed (read-only scripts; useful for regression).

7.3 Completion report at `docs/completion-reports/DIAG-063_MIR_DEMO_CAPABILITY_ASSESSMENT_COMPLETION.md` per Rules 25–28: phases executed, evidence index (probe → output-doc section), HALTs encountered, zero-code-change attestation backed by `git diff main --stat` pasted (must show only `docs/` and `scripts/diag/` additions).

7.4 Push the branch and create the PR: `gh pr create --base main --head diag/063-mir-demo-capability-assessment --title "DIAG-063: MIR demo capability assessment (read-only)" --body "Read-only platform assessment defining development effort for MIR demo capabilities. Output: docs/diagnostics/DIAG-063_MIR_DEMO_CAPABILITY_ASSESSMENT_OUTPUT.md. Zero src/ changes."` Architect merges per SR-44.

---

## §4 — HALT Conditions

- **HALT-1 — Sequence mismatch.** The Phase 1.2 listing shows a higher DIAG number than 062 already present, or any existing `DIAG-063*` file. Stop; paste the listing; the architect re-sequences. CC never self-assigns.
- **HALT-2 — Write pressure.** Any probe appears to require a write, fix, migration, or schema change to proceed. Stop that probe, record the blocker in Open Questions, continue with remaining probes. (Findings that merely *contradict beliefs* are NOT halts — record in the Findings Register and continue.)
- **HALT-3 — Access failure.** Service-role read access or repository state prevents a module from executing. Stop; report the exact error verbatim.
- **HALT-4 — Secret exposure.** Any probe output contains credentials, keys, or tokens. Redact before pasting, note the redaction, continue.

---

## §5 — Reporting Discipline

Completion report file: `docs/completion-reports/DIAG-063_MIR_DEMO_CAPABILITY_ASSESSMENT_COMPLETION.md`, structure per Rules 25–28 in `COMPLETION_REPORT_ENFORCEMENT.md`. Every gate in this directive is satisfied only by pasted evidence (command output, code excerpt with file:line, script output). PASS/FAIL words without pasted evidence are non-responsive. The output document (Phase 7.1) is the deliverable of record; the completion report indexes it.

---

## §6 — Out of Scope

- Any code fix, refactor, behavior change, migration, schema change, RLS change, or event addition — including for defects this assessment discovers.
- B3 dev/prod substrate work; B4 RLS re-audit; DS-027 internals beyond what existing-evidence probes touch; CRP Plan 2/4 delta investigation; the condition-subject gap's disposition.
- Browser automation or any UI interaction (architect-channel per SR-44; the assessment produces the browser checklist instead).
- Ground-truth values, expected totals, or reconciliation content of any tenant.
- Any reference to the prospect's real name in any artifact.

## §6A — Residuals

- The effort definitions produced here become individual work items (HF/OB) seeded in the architect channel; their sequencing is the R1 development schedule — follow-on, not this DIAG.
- The PDR-01 class analysis (D2) feeds a single-invariant fix HF; the constructor-surface map (E5) feeds the gap's eventual disposition arc; the identity-read finding from A7, if divergent, feeds the HF-282 family.
- Calculation-at-volume, if A1 records it as not yet executed, feeds the Phase-0 volume-spike decision in the architect channel.

*— End of directive. (DD-11: no execution block follows; the phase prose above is the executable.)*
