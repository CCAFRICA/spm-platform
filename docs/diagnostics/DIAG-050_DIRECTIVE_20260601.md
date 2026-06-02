# DIAG-050 — Aggregate-Scope Capability State (Post-HF-238 Prime-DAG Engine)

**Repo path on commit:** `docs/diagnostics/DIAG-050_DIRECTIVE_20260601.md` (VP, `CCAFRICA/spm-platform`)
**Date:** 2026-06-01
**[DIAG number provisional — confirm next-unused against `docs/diagnostics/` + open DIAG PRs before branch creation; project sequence tops at DIAG-047, PR-tracked to DIAG-049. If 050 is taken, use next and note in completion.]**

**Classification:** READ-ONLY diagnostic. No code edited, no SQL written, no calc run that mutates state (a read-only calc trace is permitted; see §3.3). Output is a current-SHA code reference + a capability determination.

---

## §0 — CC Standing Rules

This directive binds `CC_STANDING_ARCHITECTURE_RULES.md`. Drafting per `INF_Structured_Compliant_Drafting_Reference_20260513.md`. Operative for this DIAG:

- **READ-ONLY.** No edits, no migrations, no schema writes. Temp tsx read-scripts are removed after use. The deliverable is a reference document, not a code change.
- **AP-9 / AP-10 — Evidentiary Gates.** Every finding is established from pasted live code or pasted DB read. Never from memory, never from a prior audit. **This DIAG exists because the prior audit (AUD-005, SHA `5314c365`) is stale** — see §1.
- **AP-17 — Single pipeline.** The diagnostic confirms whether ONE scope mechanism exists post-HF-238; it does not propose adding a parallel one.
- **AP-25 / Korean Test (IGF-T1-E910).** Capability is assessed structurally. The determination must not depend on any tenant/language literal.
- **SR-34.** Findings are framed at the structural-class layer (the aggregate-scope capability), not the Meridian instance.
- **Schema access (VP):** reads via service-role client `npx tsx scripts/...`; no `psql` / CLI / `exec_sql` RPC. No SQL is written in this DIAG.

**Section D ops:** commit + push the reference document and completion report; no build/dev cycle required for a read-only DIAG (no source changed); final step `gh pr create --base main --head dev` is **NOT** required — per the standing-rule amendment that diagnostics produce read-only findings committed to the branch, not mergeable PRs. Commit the artifacts to `dev`; do not open a code PR.

---

## §1 — Problem Statement

The calc-execution reasoning for the Meridian fleet defect (HF-261 ADR) was conducted against **AUD-005 `AUD-005_CALC_EXECUTION_LIVE_REFERENCE_5314c365.md`**, generated at SHA `5314c365` (2026-05-06, post-HF-205). **That audit predates HF-238 (PR #420, merged ~2026-05-20), which rebuilt the calc engine to the prime-DAG architecture.** HF-238 R2 Closure C2 (completion report, commit `bafdc887`) states verbatim: *"`scopeAggregates` deleted from interface, buildEvalContext, and prompt — sole scope source is `allEntityRows`."* The HF-261 ADR confirmed this against live code: `intent-executor.ts:40,344` show `scopeAggregates` deleted; `scope_aggregate` now translates (`legacy-intent-to-dag.ts:130`) to a `scope` prime that aggregates over **peer entities** sharing a boundary, self-excluded.

**Consequence:** the only calc-execution audit in project knowledge describes a **deleted engine**. No correct fix can be drafted from it. Two structurally different conditions are possible and must be distinguished by reading live code, not inferred:

- **Condition A (additive gap):** the post-HF-238 single scope mechanism (scope prime over `allEntityRows`) correctly implements **peer-entity aggregation** (the CRP Plan 4 district-override shape: sum reps' revenue for a manager), and **never implemented reference-row→member projection** (the Meridian fleet shape: one hub reference row carrying hub totals, projected onto members at that hub). The fleet shape is an additive capability the one mechanism must be extended to cover.
- **Condition B (regression):** HF-238 deleted a reference-row-projection capability that previously worked, such that an aggregate shape that once reconciled now returns zero. If so, CRP Plan 4 (which the April history shows used the prior `scope_aggregate`/`scopeAggregates` path) may also be broken.

### Why this is a DIAG, not an HF

The cause-establishment requires reading the current engine end-to-end and determining a capability boundary; no code is changed. Per SOP this is a comprehensive read-only diagnostic pinned to a SHA, producing a single source of truth that the subsequent fix HF cites. It also discharges AUD-005's own refresh discipline (*"regenerate when any HF/OB/DIAG modifies surfaces in this reference"*) — HF-238 modified every surface.

### History establishing the framing (per search-before-unknown)

Conversation history read to derive this framing: HF-238 R2 closures chat (`79ad0ee7`, 2026-05-20, Closures C1–C6 incl. C2 `scopeAggregates` deletion); CRP Plan 4 scope_aggregate population (`b6658ff1` 2026-04-05 — managers paid $0 until `scopeAggregates` populated; `c0c174b0`/HF-155 2026-03-22 — `scopeAggregates` population spec, peer-entity scope by district/region); Meridian fleet (`8d3e5bda` 2026-03-10 — "ratio+aggregate… hub level," $185,063 anchor). Project files read: AUD-005 (full), `ViaLuce_Calculation_Flow_Architecture.md`, `HF-196_ARTIFACT_A`; grep across all project `.md` for the post-HF-238 surface (`allEntityRows`, `legacy-intent-to-dag`, `VALID_PRIMES`, `buildEvalContext`) returned **no project file** — confirming no current-SHA audit exists here. This DIAG produces it.

---

## §2 — Substrate-Bound Discipline Applications

- **Korean Test (IGF-T1-E910 / AP-25).** The capability determination is structural: does the scope prime resolve a boundary-keyed aggregate from data that is keyed at the boundary level (a reference row per hub) and project it onto members, or does it only sum a field across peer entities? No tenant/hub/column literal enters the assessment.
- **Reconciliation-channel separation (operative).** This DIAG reports **observed code behavior and calculated trace values only**. It does **not** state whether any Meridian or CRP value is "correct," "expected," or "matches." Verification target values stay architect-channel. The architect reconciles.
- **AP-17 single pipeline.** The determination explicitly answers whether the post-HF-238 architecture is one path (the prime-DAG `evaluate()` over `allEntityRows`) and whether extending it for reference-row projection keeps it one path.

---

## §3 — Phases

Dependency order: refresh the reference first (so all subsequent findings cite current code), then trace the two aggregate shapes through it, then a read-only live trace to confirm the runtime behavior matches the static reading.

### §3.1 — Phase 1: Refresh the calc-execution reference to current SHA

Regenerate the AUD-005 reference at current `dev` HEAD, producing `docs/code-references/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_<new_short_SHA>.md`. Extract, verbatim, the post-HF-238 calc-execution surfaces:

- `web/src/lib/calculation/intent-executor.ts` (current full inventory — the ADR notes it is 431 lines): the `PrimeNode` union / `VALID_PRIMES`, `evaluate()`, `buildEvalContext`, and specifically the **`scope` prime** body (the ADR cites `:223-238`) and the **`prior_period` prime** (HF-238 C5).
- `web/src/lib/calculation/legacy-intent-to-dag.ts`: the `scope_aggregate` → `scope(boundary) → aggregate(op, field)` translation (ADR cites `:130`).
- `web/src/app/api/calculation/run/route.ts`: where `allEntityRows` is built and wired into the eval context (ADR cites `:1708-1720`, `:2445`).

Record the refresh in the new reference's refresh log (trigger: DIAG-050 / HF-238 engine rebuild). Retain AUD-005 `5314c365` for historical citation.

**Classification table (DD-3):** every extracted surface classified — prime-definition / context-population / translation / read-only-context.

### §3.2 — Phase 2: Trace both aggregate shapes through the current engine

Using the refreshed reference, establish, with pasted code:

**(a) Peer-entity aggregation (CRP Plan 4 / district-override shape).** Trace how the `scope` prime resolves a manager's district aggregate: how `allEntityRows` is filtered to peers sharing the boundary, the self-exclusion, and the `aggregate` over `row[field]`. Determine whether this shape is **complete** at current HEAD (i.e., a manager bound to a district-scoped aggregate resolves a nonzero value when reps have data).

**(b) Reference-row→member projection (Meridian fleet shape).** Determine whether the current engine has **any** mechanism to take a single boundary-keyed reference row (one hub row carrying `Cargas_Totales`/`Capacidad_Total`, `data_type='reference'`) and resolve it as the fleet input for each member sharing that boundary. The ADR establishes the scope prime aggregates over **entities** (peers), self-excluded — which does not fit a single reference row that is not a peer entity. Confirm or refute: is there a code path that admits reference-provenance rows into the scoped set keyed by the boundary, or is there none?

**(c) Condition determination.** From (a) and (b), state which condition holds:
- **Condition A (additive):** (a) complete, (b) absent → reference-row projection is an additive capability; CRP Plan 4 is not regressed by the missing fleet shape.
- **Condition B (regression):** (a) incomplete or (b) once-present-now-absent → a working shape regressed; CRP Plan 4 shares the gap.

The determination is established by code, not asserted. If the evidence is ambiguous between A and B, report the ambiguity with the specific code that is ambiguous — do not pick.

### §3.3 — Phase 3: Read-only runtime confirmation (CRP Plan 4 + Meridian fleet)

Confirm the static reading against runtime, **without mutating state** (read existing persisted results; if a calc run is needed, run against a throwaway period/run id or in a dry-read that does not overwrite operative results — CC chooses the non-mutating path and states which):

- **CRP Plan 4 (district override):** report the current calculated manager payouts and whether the district `scope`/`aggregate` resolves nonzero. (Memory: CRP Plan 4 is OPEN; this establishes its current engine behavior. Calculated values only — no reconciliation verdict.)
- **Meridian fleet (C5):** confirm the fleet component resolves to zero at runtime and that the `scope`/reference path produces no value for an employee (corroborating the ADR's static finding). Paste the resolution trace for one employee's fleet component.

This phase distinguishes "broken in code" from "broken only in the Meridian binding" — if CRP Plan 4's peer-entity aggregate resolves nonzero while Meridian fleet resolves zero, that is direct runtime evidence for **Condition A**.

---

## §4 — HALT Conditions

- **HALT-1 (scope creep).** This is read-only. If any step would require editing source or writing SQL to proceed, HALT — that belongs in the subsequent fix HF, not this DIAG.
- **HALT-2 (state mutation).** If the Phase 3 runtime confirmation cannot be performed without overwriting operative calculation results, HALT and report rather than mutate; the static reading (Phase 2) stands as the determination.
- **HALT-3 (ambiguous condition).** If Phase 2 cannot distinguish Condition A from Condition B from code, HALT with the specific ambiguous code pasted — do not select a condition.

---

## §5 — Reporting Discipline

- **Deliverable 1:** the refreshed reference `docs/code-references/AUD-005_CALC_EXECUTION_LIVE_REFERENCE_<new_short_SHA>.md`.
- **Deliverable 2:** completion report `docs/completion-reports/DIAG-050_COMPLETION_REPORT_<YYYYMMDD>.md` (Rules 25–28). Structure: the stale-audit problem (AUD-005 SHA vs HF-238 merge); Phase-1 surface inventory + classification table; Phase-2 trace of both aggregate shapes with pasted code; **the Condition A vs B determination, code-justified**; Phase-3 runtime confirmation (calculated/observed values, **no reconciliation verdict**); current HEAD SHA. Evidentiary gates throughout — pasted code and pasted reads, never self-attestation.
- No mergeable PR (read-only diagnostic). Commit artifacts to `dev`.

---

## §6 — Out of Scope

- **The fix itself.** This DIAG determines the capability state; it implements nothing. The fix HF (extend the one scope mechanism for reference-row projection if Condition A; restore if Condition B) is drafted after this DIAG lands, citing the refreshed reference.
- **The HF-261 binding question.** Whether the fleet binding should be re-targeted vs aggregate-projected is downstream of the Condition determination; not resolved here.
- **Hub-as-payee exclusion (HF-261 Defect 2).** Separate concern; the ADR already localized it (provenance-based). Not part of this capability DIAG.
- **BCL.** Verified PASS; untouched.
- **Idempotency / HF-258 / HF-259.** Unrelated.
- **Variant explainability** (`materializedState`/role label): separate follow-on.

---

## §6A — Residuals

- **AUD-005 supersession.** After Phase 1, the `5314c365` reference is historical; all calc-execution citations move to the new SHA. Any other open work citing AUD-005 `5314c365` (e.g. pending HF-261 redraft) must re-cite the refreshed reference.
- **AUD-0015 ingestion-interpretation trace** is separately pinned to `dede922b` and is **not** refreshed by this DIAG (different surface — ingestion/interpretation, not calc-execution). Refresh it separately after any ingestion-path change.
- **CRP Plan 4 family.** If Phase 3 shows the district aggregate is itself incomplete, CRP Plan 4's OPEN status gains a code-level cause here; the fix HF then covers both Meridian fleet and CRP Plan 4 as one aggregate-scope-capability closure (SR-34 class-level).
- **Convergence Pass 5 (HF-238 Closure C6, open).** The ADR notes convergence emission was scoped for a later HF; if the fleet binding's shape (column-ratio vs scope-aggregate) is decided by convergence production, C6 is adjacent. Flag, do not absorb.
