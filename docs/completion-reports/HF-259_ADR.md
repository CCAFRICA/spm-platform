# ARCHITECTURE DECISION RECORD — HF-259

*1C Idempotency (Q3) + Audited Supersession (Q6) + Bounded-Concurrency Scale (Q4)*
*Completing slice of the locked 1C path design; pairs with merged HF-258 (Q2+Q5).*
*Map: AUD-0015 trace. Committed BEFORE any code or SQL (Architecture Decision Gate).*

## Problem (confirmed at HEAD `18e055c7`)
- **Q3 duplicate execution:** `execute-bulk:120` receives `proposalId`, never dedupes; no single-flight
  guard; no fingerprint-reuse check. One import can run interpretation twice → two rule_sets (Meridian
  `10aeb540`→`b983bc11`). Same class as BCL 2026-05-21 (`plan-interpretation.ts:208-210`); HF-244 made it
  single-active, not single-run. AUD-0015 HALT-2: trigger not source-determinable — idempotency makes the
  fix trigger-independent.
- **Q6 silent supersession:** `plan-interpretation.ts:201-216` archives ALL prior rule_sets with no audit
  record (actor/reason/predecessor). `rule_sets` has no lineage columns (FP-49 confirmed).
- **Q4 sequential scale:** orchestrator Phase B is a sequential `for` loop (`plan-orchestration.ts:191-283`),
  1+N model calls (~100s for Meridian's 10 components).

## FP-49 live schema (verbatim, queried HEAD)
- `rule_sets`: id, tenant_id, name, ..., status, version, ..., metadata(jsonb), created_by, ..., created_at, updated_at — **no predecessor/lifecycle columns**; `metadata` JSONB can carry `content_hash` (no DDL).
- `import_batches`: has `file_hash_sha256`, `content_unit_hash_sha256`, and batch-level `superseded_by/supersedes/superseded_at/supersession_reason` (batch lineage exists; rule_set lineage does not).
- `structural_fingerprints`: the tabular moat — PRESERVE read-only.
- Proposed tables `rule_set_lifecycle_events`, `plan_interpretation_runs`: **absent** → safe to create (no HALT-2).

## Decision (instantiated against the live code)

### Q3 — two-layer idempotency, keyed on the plan content fingerprint
Dedup identity = **(tenant_id, content_hash)** where `content_hash = computeFileHashSha256(planFileBytes)`
— format-invariant, already computed pre-execution (`execute-bulk:180`; `executeBatchedPlanInterpretation`
downloads the file and can compute it). NOTE: plan documents do NOT carry a tabular `structural_fingerprint`
(AUD-0014 F-AUD-06), so the plan reuse key is the content hash, NOT the tabular moat — the moat is read-only
and untouched. New table `plan_interpretation_runs(tenant_id, content_hash UNIQUE-with-tenant, status, rule_set_id)`
serves BOTH layers:
1. **Fingerprint reuse (read-before-derive):** at the top of `executeBatchedPlanInterpretation`, look up a
   `completed` run for (tenant_id, content_hash). If found AND its `rule_set_id` is still a live rule_set →
   return it without re-executing (~zero cost; moat curve). This is the Closed-Loop read-before-derive made structural.
2. **Single-flight:** else attempt `INSERT` a run row `status='in_progress'`. The `UNIQUE(tenant_id, content_hash)`
   constraint means a concurrent second request's insert CONFLICTS → it does NOT execute; it re-reads for the
   completed run (returns it) or reports deduped-in-progress. First insert wins → executes → on save sets
   `status='completed', rule_set_id`.
Result: one import → exactly one rule_set, under retry/remount/double-submit/timeout, regardless of trigger.
The guard lives at the TOP of the sole plan path (HF-257), covering all callers; best-effort/degrade-safe so a
pre-application (table-missing) state falls back to current behavior without crashing.

### Q6 — explicit audited supersession
New table `rule_set_lifecycle_events(tenant_id, rule_set_id, event_type['created'|'superseded'|'withdrawn'],
predecessor_id, actor, reason, created_at)`. Replace the silent supersede (`:201-216`) with: archive prior +
**write a `superseded` event per archived rule_set** (predecessor_id = archived id; actor = userId; reason =
'reinterpretation: <new ruleSetId>') and a `created` event for the new one. With Q3, a duplicate import is
deduped BEFORE this fires, so supersession now only records GENUINE re-interpretations. Lifecycle: created
(idempotent) → active → superseded (audited) → archived.

### Q4 — bounded-concurrency parallel Phase B + thin async envelope
Skeleton first (unchanged). The N component phases (independent — each gets full manifest + its componentSpec)
run with **bounded concurrency** (limit, default e.g. 4) instead of the sequential loop, via a small
order-preserving promise-pool. Per-component retry (`callPlanComponentWithRetry`) and construction logic are
UNCHANGED (DD-7: same inputs → byte-identical outputs; only scheduling changes). Results assembled in
componentIndex order. The single-flight guard (Q3) wraps the whole execution — one coordination surface.
"Thin async envelope": the execution remains within the existing request lifecycle; the run-row status
('in_progress'→'completed'/'failed') IS the progress/timeout-resilience state (a crashed/timed-out run leaves
a stale 'in_progress' row that a TTL/age check treats as reclaimable — documented; full async queue is Q4's
larger form, out of scope per §1.3 "thin").

### Lifecycle visibility (Vertical Slice experience half)
Surface active/superseded + predecessor where rule_sets already display (the plan-approval / plans list,
`performance/approvals/plans` or `PlanCard`) — read the lifecycle events / rule_set status. Minimal: show the
status badge + "supersedes <predecessor>" where a plan card renders. A dedicated audit viewer is out of scope (§6).

## DD-7 proof plan
- Parallel Phase B: component construction unchanged; outputs byte-identical to sequential (same per-component
  inputs); verified by before/after component diff (architect-run EPG).
- Moat untouched: Q3 reads its own `plan_interpretation_runs` content-hash key; `structural_fingerprints` is
  not read/written by this HF.
- Single plan path (HF-257), HF-258 content channel, calc handoff: untouched.

## Scope / HALT
In scope: Q3+Q6+Q4 + lifecycle visibility. No HALT fires (design fits the live structure; schema is additive;
parallelization preserves per-component logic). OUT: HF-258 (merged), calc internals (AUD-005), dedicated audit
UI, VG substrate work. SQL: CC authors `web/supabase/migrations/20260531000000_hf259_idempotency_lifecycle.sql` (relocated from a mis-placed repo-root `017_*` per the of-record dir + timestamp scheme); architect applies via Dashboard; CC verifies via tsx.

## Anti-pattern check
SR-34: structural guards (single-flight + fingerprint dedup + lifecycle table), not another supersede-site point
fix. AP-1/AP-17: preserved from HF-258. AP-13: schema verified (FP-49) before SQL. Read-before-derive: Q3 layer 1.
