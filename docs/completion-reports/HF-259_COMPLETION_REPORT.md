# HF-259 COMPLETION REPORT

*1C Idempotency (Q3) + Audited Supersession (Q6) + Bounded-Concurrency Scale (Q4) — completing 1C slice*

## HEAD SHA
Start: `18e055c7` (dev reset to main). Final code commit: `d93e9d88`.

## COMMITS (in order)
| Hash | Phase | Description |
|---|---|---|
| `1bf13a84` | 1 | ADR + FP-49 schema gate (in ADR) |
| `d378df7c` | 3 | Migration 017 (idempotency + lifecycle tables) + verification script |
| `2c534214` | 4+5 | Idempotency (Q3) + audited supersession (Q6) + lifecycle UI |
| `d93e9d88` | 6 | Bounded-concurrency parallel Phase B (Q4) |
| (this commit) | 8 | Completion report + build |

## FILES MODIFIED / ADDED
| File | Change |
|---|---|
| `supabase/migrations/017_hf259_idempotency_lifecycle.sql` | NEW — `plan_interpretation_runs` (single-flight + reuse) + `rule_set_lifecycle_events` (audit). |
| `web/src/lib/sci/plan-idempotency.ts` | NEW — degrade-safe Q3/Q6 helpers. |
| `web/src/lib/sci/plan-interpretation.ts` | Q3 guard (reuse + single-flight) at the sole plan path; failRun/completeRun; Q6 audited supersede. |
| `web/src/lib/sci/plan-orchestration.ts` | Q4 — sequential Phase B loop → order-preserving bounded-concurrency pool. |
| `web/src/components/calculate/PlanCard.tsx` | Q6 Vertical-Slice — rule_set lifecycle status badge from the readiness API. |
| `web/scripts/_hf259-verify-migration.ts` | Post-apply migration verification (service-role). |

## ARCHITECTURE DECISION RECORD
See `docs/completion-reports/HF-259_ADR.md` (Phase 1, `1bf13a84`) — instantiated design + FP-49 live schema.

## PRE-EDIT ENUMERATION (Phase 2)
- Q3 duplicate edges: `execute-bulk:120` (proposalId received, unused); `reimport-resume.ts:194` (most-recent-batch attach); re-dispatch via `SCIExecution` retry/remount (AUD-0015 HALT-2).
- Q6 silent supersede: `plan-interpretation.ts:201-216`.
- Q4 sequential Phase B: `plan-orchestration.ts:191-264` (`for ... await callPlanComponentWithRetry`).
- Content fingerprint: `computeFileHashSha256` available per file (`execute-bulk:180`); `executeBatchedPlanInterpretation` downloads the file (`:53`) → can hash.
- UI: plan-readiness API returns `status` (`:107`); `PlanCard` displays plans.

## FP-49 SQL VERIFICATION GATE (live schema, queried at HEAD — verbatim)
```
rule_sets: id, tenant_id, name, description, status, version, effective_from, effective_to,
  population_config, input_bindings, components, cadence_config, outcome_config, metadata, created_by,
  approved_by, created_at, updated_at   [no lifecycle/predecessor columns; metadata is JSONB]
import_batches: ... file_hash_sha256, content_unit_hash_sha256, superseded_by, supersedes,
  superseded_at, supersession_reason ...   [batch-level lineage exists; rule_set lineage does not]
structural_fingerprints: ... [the tabular moat — PRESERVED read-only, untouched]
proposed tables rule_set_lifecycle_events / plan_interpretation_runs: ABSENT → safe to create (no HALT-2)
```
Migration `017` authored AFTER this paste. **Architect applies via Supabase Dashboard SQL Editor.**
Pre-apply verification baseline (`_hf259-verify-migration.ts`):
```
plan_interpretation_runs: MISSING — Could not find the table ... (expected pre-apply)
rule_set_lifecycle_events: MISSING — ...
RESULT: NOT fully applied — architect to apply 017 via Dashboard.
```

## PROOF GATES
| # | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| HARD-1 | Q3 idempotency guard at the sole plan path (reuse + single-flight), degrade-safe | **PASS (structural)** | plan-interpretation.ts:156-186; plan-idempotency.ts; claimRun distinguishes 23505 from table-missing |
| HARD-2 | Q6 audited supersession replaces silent supersede (created + superseded events) | **PASS (structural)** | plan-interpretation.ts:277/328 writeRuleSetLifecycleEvent |
| HARD-3 | Q4 Phase B bounded-concurrent, order-preserving; per-component logic unchanged (DD-7) | **PASS (structural)** | plan-orchestration.ts:194-273 pool; callPlanComponentWithRetry args unchanged |
| HARD-4 | UI lifecycle state surfaced where plans display | **PASS** | PlanCard lifecycle badge from `plan.status` |
| HARD-5 | `npm run build` exit 0 (korean-test gate) + localhost + tsc clean | **PASS** | BUILD_EXIT=0, gate PASS, 307, tsc 0 errors |
| EPG-IDEMPOTENCY | (live) double-dispatched single import → EXACTLY ONE rule_set, no silent supersede | **PENDING — architect-run (post-apply)** | requires migration applied + double-dispatch import |
| EPG-REUSE | (live) re-import identical plan → returns existing rule_set, ~zero cost | **PENDING — architect-run** | post-apply re-import |
| EPG-AUDIT | (live) genuine plan change → new rule_set + superseded audit record (actor/reason/predecessor) | **PENDING — architect-run** | post-apply, query rule_set_lifecycle_events |
| EPG-PARALLEL | (live) Phase B components concurrent, wall-time << ~100s, outputs byte-identical to sequential | **PENDING — architect-run** | live plan import, before/after component diff |
| EPG-REGRESSION | (live) PDF/PPTX/XLSX still interpret (HF-258 channel) | **PENDING — architect-run** | live imports |

## STANDING RULE COMPLIANCE
- **SR-34:** structural guards (single-flight + fingerprint reuse + lifecycle table), not another supersede-site point fix (the BCL/HF-244 recurrence class). **Read-before-derive:** Q3 layer 1.
- **DD-7 / moat:** Q4 changes scheduling only (per-component inputs/logic unchanged → byte-identical); the tabular `structural_fingerprints` moat is not read or written (Q3 uses its own content-hash key in `plan_interpretation_runs`). Single plan path (HF-257) + HF-258 channel + calc handoff untouched.
- **AP-1/AP-17:** preserved from HF-258. **AP-13/FP-49:** schema verified before SQL.
- **Degrade-safe:** all new-table access falls back to current behavior pre-apply (claimRun → execute on table-missing; reuse → null; audit → no-op) — build/path never crashes before the architect applies 017.
- **Vertical Slice:** engine half (Q3/Q6/Q4) + experience half (PlanCard lifecycle badge) in one PR.
- **D.1/D.2/D.3:** per-phase commit+push; build(0)→dev→307; PR below.

## KNOWN ISSUES
1. **Migration apply is architect-gated (Dashboard).** All behavioral EPGs (idempotency, reuse, audit, parallel) require `017` applied + live imports. Code is degrade-safe pre-apply (no idempotency/audit until applied, but no crash). `_hf259-verify-migration.ts` confirms post-apply.
2. **RLS subquery shape** on the two tables references `profiles(auth_user_id, tenant_id)` — confirm against the live profiles policy shape at apply (writes are service-role; SELECT is the only RLS-gated path).
3. **Stuck single-flight claim:** a process crash between claim and complete/fail leaves a stale `in_progress` row that would block re-import of that exact content. failRun covers all in-code failure returns; an out-of-band crash needs a TTL/age reclaim (documented as the "thin async envelope" follow-on; not the full async queue — Q4's larger form is out of scope).
4. **Default component name fallback** (Q4): missing-id/name entries now use `index` not `components.length` — deterministic; real plans carry skeleton ids/names (no effect). Documented for DD-7 completeness.
5. **UI scope:** PlanCard surfaces lifecycle *status*; the full audited history (predecessor/actor/reason) is recorded in `rule_set_lifecycle_events`; a dedicated audit viewer is out of scope (§6).

## VERIFICATION OUTPUT
- tsc: 0 errors (after each phase). Build: `BUILD_EXIT=0`, `[korean-test-gate] PASS`, `✓ Compiled successfully`. localhost: 307.
- Structural greps (Q3 guard / Q6 audit / Q4 pool): pasted in Phase 7 verification.
