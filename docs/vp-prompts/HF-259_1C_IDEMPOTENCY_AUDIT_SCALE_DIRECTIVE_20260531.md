# HF-259 — 1C Idempotency + Audited Supersession + Bounded-Concurrency Scale (Q3 + Q6 + Q4)
# Completing slice of the locked 1C path design (IRA Path_Comprehensive 2026-05-31); pairs with merged HF-258 (Q2+Q5)
# Repo: CCAFRICA/spm-platform (VP)
# Date: 2026-05-31
# Sequence: HF-259 (of-record; HF-258 merged PR #446)
# File path (this directive): docs/vp-prompts/HF-259_1C_IDEMPOTENCY_AUDIT_SCALE_DIRECTIVE_20260531.md
# SSOT reference: docs/code-references/SCI_INGESTION_PLAN_EXECUTION_TRACE_LIVE_dede922b.md (AUD-0015)

---

## §0 — CC Standing Rules
Read CC_STANDING_ARCHITECTURE_RULES.md and COMPLETION_REPORT_ENFORCEMENT.md before starting.
In force: ADR before code; commit+push per phase; final-build sequence (kill dev → rm -rf .next →
npm run build → npm run dev → confirm localhost:3000) before the completion report; git from repo
root; `gh pr create --base main --head dev` final. Evidence means PASTE, not describe. zsh:
single-quote every grep pattern.

**SQL discipline (this HF produces schema changes):**
- **FP-49 SQL Verification Gate (mandatory):** before authoring ANY SQL, query the LIVE schema and
  paste the result. No SQL ships without schema-verified proof in the report.
- **VP migration locus:** CC authors and commits the migration file and verifies post-application via
  a tsx script using the service-role client (`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`).
  **The architect applies the SQL via the Supabase Dashboard SQL Editor** — CC does NOT run psql/CLI/
  exec_sql in VP. CC's migration file is authored; the architect's Dashboard application is the apply
  step; CC's tsx-script verification confirms it landed.

This file IS the prompt (DD-11): no execution block, no paste block, no tail. It ends at §6A.

---

## §1 — Problem & Scope

### 1.1 — The design this HF completes (locked)
The path design is locked as 1C (hybrid). HF-258 shipped the foundation slice (content-channel
unification Q2 + dead-transport retirement Q5) — merged, PR #446. This HF implements the **remaining
known issues as one integrated slice**: idempotency (Q3), audited supersession (Q6), and
bounded-concurrency scale (Q4). These three are a single mutual-dependency cluster per the design's
interdependency map (Q3↔Q4 share the execution-lifecycle state machine; Q3↔Q6 are two faces of one
rule_set lifecycle), so they are designed and implemented together, not separately. With HF-258, this
HF realizes the complete 1C design — the product is whole at the path level only when this lands.

### 1.2 — What is broken today (the structural defects, confirmed)
From the AUD-0015 trace (the SSOT) and the live PPTX/PDF logs:
- **Duplicate execution (Q3).** A single logical import can run plan interpretation TWICE, producing
  two rule_sets (each a fresh UUID), the second silently superseding the first. Confirmed live on the
  Meridian PPTX (rule_sets `10aeb540` then `b983bc11`, one import). Root: **no server-side idempotency**
  — `proposalId` is received at `execute-bulk:120` and never used to dedupe; there is no single-flight
  guard preventing two concurrent executions, and no fingerprint check that returns an existing
  rule_set instead of re-deriving. The specific re-dispatch trigger was NOT determinable from source
  (AUD-0015 HALT-2: candidate edges = a retry that clears the dual guard, or a remount). **The fix does
  not require knowing the trigger** — idempotency makes a second execution a no-op regardless of cause.
  This is the same class as the BCL 2026-05-21 incident (`plan-interpretation.ts:208-210`); HF-244 made
  it single-*active* but did NOT prevent the duplicate run/save. Repeated-fix-failure pattern → demands
  a structural response, not another point fix.
- **Silent supersession (Q6).** "A later run supersedes all prior" at `plan-interpretation.ts:211-216`
  with no audit. The system cannot answer "what happened" to a rule_set's lifecycle. Under production
  use this is a trust/determinism failure: a calculation can bind to a rule_set that changed underneath
  it, with no record of the change, actor, or reason.
- **Scale bottleneck (Q4).** Interpretation is synchronous and makes 1+N sequential model calls per
  plan (the Meridian run: skeleton + 10 components, one after another, ~100s). At thousands of tenants
  re-importing, this is a cost and latency ceiling. AUD-0015/logs confirm Phase B components construct
  sequentially.

### 1.3 — The fix (the WHAT and the mechanism, per the locked design)

**Q3 — two-layer idempotency keyed on the content fingerprint.**
1. **Single-flight execution guard** — prevents two CONCURRENT executions for the same import identity
   (tenant + plan source + content fingerprint) from both running interpretation. The second concurrent
   request does not start a second execution; it waits for or returns the in-flight/just-completed
   result.
2. **Content-fingerprint idempotent reuse** — before executing interpretation, read the signal surface
   / fingerprint registry for a COMPLETED rule_set on the same fingerprint (the read-before-derive
   obligation: read for prior comprehension on the same fingerprint before re-deriving). If a completed
   rule_set exists for that fingerprint, **return it without re-execution** — the import rides the
   decreasing-cost (moat) curve at ~zero cost. The fingerprint is computed on HF-258's unified content
   representation, so it is now FORMAT-INVARIANT (this is the Q2→Q3 dependency: Q2 had to land first so
   the fingerprint is one representation). The PRESERVED fingerprint moat is READ, never modified.
3. Result: one logical import yields exactly one rule_set, deterministically, under retry, remount,
   double-submit, or timeout. Wire the received `proposalId` (and the fingerprint) as the dedup identity.

**Q6 — explicit, audited supersession.**
- Replace the silent supersede at `plan-interpretation.ts:211-216` with an explicit, recorded
  transition. Every rule_set lifecycle event — created, superseded, withdrawn — is persisted with
  timestamp, actor, reason, and predecessor reference. With Q3 in place, a duplicate import no longer
  creates a second rule_set at all (it's deduped), so supersession fires only on a GENUINE
  re-interpretation (an intentional plan change) — and that event is audited. The lifecycle becomes:
  create (idempotent) → active → superseded (audited, predecessor referenced) → archived.

**Q4 — bounded-concurrency parallel component phases inside a thin async envelope.**
- The skeleton phase runs first (it produces the component list). The N component phases — independent —
  then run with BOUNDED CONCURRENCY (a concurrency limit, not unbounded fan-out) instead of sequentially.
  This collapses ~(skeleton + sum of components) into ~(skeleton + max-of-components-within-the-limit).
- A THIN async envelope wraps dispatch for timeout resilience and progress signaling. This is the
  bounded re-architecture the design authorized — within the orchestrator's existing phase-dispatch
  structure, NOT a rewrite. The single-flight guard (Q3) and the concurrency limiter (Q4) operate on the
  SAME execution-lifecycle state machine — design them as one coordination surface.

### 1.4 — Why one HF, not three
Q3, Q4, Q6 co-determine: the single-flight guard and the concurrency limiter share one execution
state machine; idempotency and supersession are one rule_set lifecycle; the fingerprint that drives
dedup is the same surface the audit and the reuse curve read. Splitting them would sever Complement
edges and force the same piecemeal synthesis the 1C design exists to avoid. They land together.

---

## §2 — Substrate-Bound Discipline
- **Read-before-derive / Closed-Loop Intelligence:** any service that would derive a rule_set must
  first read the signal surface for prior comprehension on the same fingerprint and consume it rather
  than re-deriving. Q3's fingerprint-reuse IS this obligation made structural. The duplicate-run is its
  violation.
- **The fingerprint moat is PRESERVED — read-only.** Q3 reads the fingerprint as the dedup/reuse key;
  it does NOT compute, modify, or re-shape the fingerprint. The decreasing-cost curve must remain the
  live behavior (verify a re-import is ~zero cost).
- **Repeated-fix-failure → structural response:** the idempotency class was half-closed once (HF-244)
  and recurred. The fix must be a structural guard (single-flight + fingerprint dedup), not another
  point fix at the supersede site.
- **Scale by design:** the 1+N sequential pattern fails the 10x test; bounded-concurrency + async
  envelope is the in-scope structural fix.
- **Explicit supersession with audit (immutability principle, generalized to rule_set lifecycle):**
  silent supersession is a violation; lifecycle transitions are explicit and recorded. **Thermostat:**
  the system must answer "what happened" for a rule_set's lifecycle.
- **DD-7 / preserve:** the single plan code path (HF-257), HF-258's unified content channel, the
  fingerprint moat, and the calc handoff are PRESERVED. Parallelization changes call *scheduling*, not
  per-component construction logic — component outputs must be byte-identical to sequential.
- **Vertical Slice:** this touches the pipeline AND what the user sees. The rule_set lifecycle state
  (active/superseded + predecessor) must be surfaced WHERE rule_sets are already displayed — the
  experience half ships with the engine half in this one PR. (A dedicated audit-event viewer page is a
  separate UI concern, out of scope — see §6.)
- **SR-34:** fix the classes structurally (idempotency, lifecycle, concurrency), not the instances.
- **AP-1 / AP-17:** preserved from HF-258 — no body bytes; single plan path. Any locked-rule conflict →
  SR-42 (surface verbatim, name the action, HALT).

---

## §3 — Phases

### §3.1 — Phase 1: ADR (Architecture Decision Gate — BEFORE any edit or SQL)
Using AUD-0015 as the map and confirming against live HEAD, CC produces an ADR
(docs/completion-reports/) that instantiates §1.3 against ACTUAL code:
- **Single-flight mechanism** — the concrete guard (e.g. a unique-constraint in-flight execution
  record with insert-on-start; an atomic status compare-and-swap; or advisory lock) chosen against the
  live execution path, with the dedup identity = (tenant_id, plan source identity, content fingerprint).
- **Fingerprint reuse** — WHERE the fingerprint is computed at HEAD (the moat/structural_fingerprints
  surface), confirmation it is available PRE-execution on the unified representation, and the
  read-before-derive check that returns an existing completed rule_set.
- **Audit schema** — the rule_set lifecycle-event record shape (event_type, rule_set_id, predecessor_id,
  actor, reason, timestamp, tenant_id) — proposed against the live schema (Phase 3 verifies/authors).
- **Parallelization** — how Phase B component dispatch becomes bounded-concurrent within the existing
  orchestrator structure, the concurrency limit, the thin async envelope, and how the single-flight
  guard wraps it (shared state machine).
- **Lifecycle visibility** — where rule_sets are already displayed and how active/superseded state +
  predecessor surfaces there (the Vertical-Slice experience half).
- **DD-7 proof plan** — component outputs byte-identical under parallel vs sequential; the moat reuse
  curve intact.
**If the live structure cannot host this design without a change outside Q3/Q4/Q6 scope → HALT (§4),
report the ADR, do not implement.**

### §3.2 — Phase 2: Enumeration (DD-1/DD-2 — every site, before editing)
Enumerate and paste (live HEAD; cite AUD-0015 where mapped):
- The duplicate-run edges: `execute-bulk:120` (`proposalId` received, unused); the re-dispatch edges
  AUD-0015 named (`reimport-resume.ts:194`; the retry/remount paths); whether a single import can
  enqueue and also run inline.
- The supersede site: `plan-interpretation.ts:211-216` (the silent "supersede all prior").
- The fingerprint computation site(s) and the structural_fingerprints surface (read path).
- The orchestrator Phase B component dispatch loop (the sequential construction).
- Every rule_set display surface (for lifecycle-state visibility).
No edits. Output: complete edit-site + schema-touchpoint inventory.

### §3.3 — Phase 3: SQL Verification Gate + migration authoring (FP-49)
- Query and PASTE the live schema for `rule_sets`, `structural_fingerprints`, `import_batches`, and any
  existing lifecycle/execution-state tables (confirm what exists before authoring).
- Author the migration file for: the rule_set lifecycle-event audit record; and any in-flight
  execution-state structure the single-flight guard requires (table or column + unique constraint).
- CC commits the migration file. **Architect applies via Supabase Dashboard SQL Editor.** CC verifies
  post-application via a tsx script (service-role client) and pastes the verification output.
- No SQL is authored without the paste-verified live schema preceding it.

### §3.4 — Phase 4: Implement idempotency (Q3)
Single-flight guard (concurrent dedup) + content-fingerprint reuse (sequential dedup + moat reuse), per
the ADR. Wire `proposalId` + fingerprint as the dedup identity. Read-before-derive: an existing
completed rule_set on the fingerprint is returned without re-execution. Commit + push.

### §3.5 — Phase 5: Implement audited supersession (Q6)
Replace the silent supersede with explicit, recorded transitions (event_type, predecessor, actor,
reason, timestamp). Surface active/superseded + predecessor state where rule_sets are displayed.
Commit + push.

### §3.6 — Phase 6: Implement bounded-concurrency parallel phases + async envelope (Q4)
Skeleton first; N component phases bounded-concurrent (with limit); thin async envelope for timeout
resilience + progress. Single-flight guard wraps the execution (shared state machine). Component
construction logic unchanged (DD-7). Commit + push.

### §3.7 — Phase 7: Verification (the integrity + scale gates)
Paste evidence (logs + browser) on the proof tenants:
- **Idempotency (the headline):** a single import that double-dispatches (simulate the retry/remount
  re-dispatch, or rapid double-submit) produces EXACTLY ONE rule_set — no second `b983bc11`-style
  rule_set, no silent supersede. This is the direct close of the duplicate-run class.
- **Fingerprint reuse / moat:** re-import an identical plan → returns the existing rule_set, ~zero cost,
  no re-derivation (the decreasing-cost curve intact).
- **Audited supersession:** a GENUINE plan change → new rule_set, predecessor superseded WITH an audit
  record (timestamp/actor/reason/predecessor pasted); lifecycle state visible in the rule_set display.
- **Parallel scale + DD-7:** Phase B components construct CONCURRENTLY (bounded), wall-time materially
  below the sequential ~100s, and component outputs byte-identical to sequential (paste a before/after).
- **Regression:** PDF/PPTX/XLSX still interpret (HF-258 channel intact).

### §3.8 — Phase 8: Final build + PR
Final-build sequence (§0), confirm localhost:3000, `gh pr create --base main --head dev`. Completion
report FIRST (Rule 25), evidence pasted, before the final build is appended.

---

## §4 — HALT Conditions
- **HALT-1 (ADR misfit):** the live structure cannot host idempotency/audit/parallelization without a
  change outside Q3/Q4/Q6 scope → report the ADR, HALT.
- **HALT-2 (schema):** the FP-49 live-schema query reveals the proposed audit/execution-state schema
  conflicts with existing structure → report, HALT for architect schema disposition before authoring.
- **HALT-3 (DD-7 / moat):** parallelization cannot preserve byte-identical component outputs, OR the
  fingerprint cannot be read without modifying the moat → HALT and report; the proven mechanisms must
  not regress.
- **HALT-4 (SR-42):** any locked rule appears to dictate an out-of-scope change → surface verbatim,
  name the action, HALT.

---

## §5 — Reporting Discipline
Completion report (docs/completion-reports/), report-first, evidence pasted:
HEAD SHA → ADR (instantiated design) → enumeration inventory → FP-49 live-schema paste + migration
file + tsx verification → idempotency diff → audited-supersession diff + lifecycle-visibility diff →
parallelization diff → Phase-7 verification (single-import-one-rule_set; fingerprint reuse ~zero cost;
audited supersession record; parallel wall-time + byte-identical components; format regression check)
→ final build → PR link. CC reports observed values verbatim; no reconciliation interpretation.

---

## §6 — Out of Scope
- **HF-258 (Q2+Q5)** — already merged; not re-touched. (The fingerprint is computed on its unified
  representation; that is consumed, not re-implemented.)
- **A dedicated audit-event viewer page** — this HF surfaces lifecycle state where rule_sets already
  display; a standalone audit-log UI is a separate feature.
- **Calc-execution internals** — owned by AUD-005; untouched.
- **The VG substrate extensions and gap-captures** the IRA response flagged (the content-hash
  supersession primitive mandating pre-execution dedup; SCI ingestion-to-interpretation contract;
  AP-17 transport-channel sub-class; the new-entry gap candidates for idempotency-keying / supersession-
  audit / transport-retirement governance) — VG/ICA governance work, separate channel. The VP fix here
  is what unbreaks the product; the VG records are the governance counterpart.

## §6A — Residuals
- **AUD-0015 refresh:** after this merges, regenerate the ingestion-interpretation trace to a new SHA
  version (the execution-lifecycle, supersede, and orchestrator-dispatch surfaces change here).
- **AUD-005 boundary refresh:** AUD-005's SHAs predate the per-variant shape (HF-251/252/253); if its
  calc-side contract assumed the older flat-component shape it should be refreshed — separate from this.
- **JSON-parse-on-prose robustness:** unchanged from HF-258 §6A; a clean "plan content could not be
  read" failure remains a separate small HF.
