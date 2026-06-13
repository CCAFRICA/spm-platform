# OB-203 Phase 6B — Completion Report (Phases A, E, D, C, B)

**Date:** 2026-06-12 · **Branch:** `OB-203-phase-6` · **Status:** all phases closed with live EPG evidence; **awaiting architect witness re-run** (directive §5) — PR follows witness sign-off only (§6, SR-43).

Governing artifacts: `OB-203_WARM_WITNESS_REMEDIATION_DIRECTIVE_20260612.md` ·
HALT-1 disposition · Amendment 2 (TMB Phase D) · HALT-4 disposition. Execution order per
Amendment 2 §5: **E (live EPG) → D → C → B**. Per-phase EPGs below in that order; full
evidence in the per-phase EPG documents.

## Commit ledger

| Phase | Artifact | SHA |
|---|---|---|
| A | DIAG-062 post-mortem (read-only) | 1deb1c0e |
| E | Gate subsumes supersession + E.0 resolution | 2da1acc2 |
| E | Live EPG + legacy filter retired (4 callsites) | 1f1d7d59 |
| D | ADR (D.1 gate entry) | 63c79c91 |
| D | HALT-4 packet: migration + verifier | 867d15c3 |
| — | HALT-4 disposition (architect) committed | c7f2b629 |
| D | Implementation (record, hooks, route, audit) | 3f5c9815 |
| D | D.5 EPG passed live (+ comparator fix) | 91647c81 |
| C | ADR + BEFORE evidence | 34c2554c |
| C | Implementation + EPG (batch entity I/O) | 6ca60d9f |
| B | ADR (idempotent resume; lease) | 7ce1f1cf |
| B | Implementation (+ auditor predicate alignment) | 6a0c1d81 |
| B | Kill-test EPG passed | 33ddba27 |

## Phase E — F4 supersede visibility (CLOSED)

**E.0 anomaly (disposition §2.4) resolved first:** exact per-batch counts (by import_batch_id,
no pagination) — warm Ventas batch `11665e5a` = 160,443 (row_count == actual); superseded run-5
batch `e95be66e` = 160,443. The 128-row deficit was a paginated `_sheetName`/jsonb artifact in the
DIAG evidence script, NOT a short-committed batch (Decision 95 satisfied; no write-path question).
**Fix:** ONE canonical visibility gate (`committed-data-visibility.ts`) hides non-completed OR
superseded batches; NULL-tolerant posture restated in code. Legacy HF-196 `fetchSupersededBatchIds`
retired from all 4 callsites (run-calculation, calculation/run/route, state-reader,
convergence-service); zero consumers remain. **Live EPG:** engine-view Ventas THROUGH THE GATE =
**160,443 exact**; adjacent consumer (tenant-wide committed_data) ungated 325,757 → gated 162,956 —
one coherent generation for every consumer. No migration (HALT-4 not triggered); no `superseded`
status value (DD-7).

## Phase D — write-time telemetry record (CLOSED)

**D.1 gate (ratified at HALT-4):** dedicated `import_session_telemetry` (one row per tenant +
session) + `increment_import_session_telemetry` atomic upsert (the codebase's first app-runtime
RPC — exception class per disposition §1.4). Migration `20260612200000_…` architect-applied;
post-apply verifier: 9/9 PASS including a 25-way concurrent burst landing as exactly 25 (D.2
atomicity). **D.2 hybrid (ratified):** additive columns only for append-only quantities;
unit-scoped truth as per-unit latest-state snapshots, flattened per-field keys — idempotent under
double-bound emission, retry, rollback (exactness by construction; 11 unit tests).
**Hooks:** canonical-signal-writer (every signal insert) + commit path (batch create / 500-row
pulse / rollback / finalize) — one increment per pulse, never per row. **Read side:** every poll
is ONE PK-row read; view + telemetry project from the same row (D19 closed by construction;
the pre-fix `?telemetry=1` poll ran FIVE table reads per 2s tick — A5 understated). **Audit:**
`deriveImportTelemetry` demoted to the once-per-session settle audit (sole caller), write-once
verdict, divergence → `data.import_telemetry_audit_divergence` + completion-screen flag.
**D.5 EPG live:** continuous panel movement through analyze AND execute; audit EQUAL; zero
display queries >2s (pre-fix: 9–23s under saturation). Scale contract: no per-row ×
unbounded-frequency cell (HALT-3 clean).

## Phase C — entity-phase scale + visibility (CLOSED)

Per-entity enrich loop (2 SELECTs + UPDATE × N, sequential) retired: merge inputs ride the
ALREADY-EXISTING 200-batch entity fetch (select widened — zero added round-trips); pure in-memory
merge (`computeEnrichmentMerge`, retired loop's semantics byte-for-byte, 6 tests); changed-set
flushed in 200-row upserts; **every entity write chunk is a pulse on the one spine** (same
vocabulary + same record increment as commit pulses; `pulseBase` composes entity+commit pulses on
one number line). **EPG:** same roster, same Tier-1 warm tier — BEFORE ~12s structural silence on
88 per-entity SELECTs that wrote NOTHING; AFTER 2–4s with pulses visible; mutated run: 40
enrichments = ONE round-trip (was 120), enrich pulse on the record, VERBOSE trace pasted; audit
EQUAL on all runs. **Combined arms (named in ADR):** failed data units now emit terminal
`failed_interpretation` with failureClass — no unit can sit mid-flight forever.

## Phase B — response death cannot orphan units (CLOSED)

Execute-bulk is **resumable by construction**: every invocation classifies each requested unit
against the durable spine (terminal → skip; completed batch → skip + re-emit bound; young
'processing' batch → in-flight LEASE, never double-process; else process). The walk is the
REQUEST's unit list — a never-created-a-batch unit cannot hide (**A3 closed operationally**).
Client re-POSTs on settle stall (bounded, 3 attempts). D16.1 sweep zeroes swept units' record
fields (truthful regress). Auditor aligned to the canonical Phase E predicate (completed AND not
superseded — a swept batch is not expected work). **Kill-test EPG:** server killed mid-fact-commit;
first post-restart poll **byte-identical** to last pre-kill poll (truth survived process death);
sweep reclaimed the 1,500-row dead partial; resume skipped the 2 terminal units, reprocessed
exactly the orphan; all units bound; physical rows **3,244 exact** (one generation); audit EQUAL.

## Build-restart evidence (directive §0)

Kill dev → `rm -rf web/.next` → `npm run build` → green (183/183 pages) → `npm run dev` →
`curl localhost:3000` → HTTP 307 (auth redirect, serving). Tests: **190/190** (`node --test`,
includes 11 accumulator + 6 merge + 8 resume tests added this arc); `tsc --noEmit` clean.

## Residuals (named for architect disposition)

1. **Warm-path flywheel binding role-scramble** (Phase C evidence): injected bindings carry roles
   cross-contaminated between sheets sharing column names (roster `rep_id` →
   `transaction_identifier`; fact sheet got two `entity_identifier`s) → entity units fail the
   entity_identifier guard. Candidate lineage: atom-flywheel role keying. NEW finding, not in §6A.
2. **Failed-swept batches don't zero record commit fields** (Phase B ADR riding decision 2) —
   transient stale window until reprocess re-patches.
3. §6A standing items unchanged: entity-phase-silence class sweep elsewhere (plan interpretation,
   signal capture), `import_batches` supersede vocabulary, auth middleware timeouts under
   saturation (largely defused by D removing the saturation source), INF-001 arc.
4. Accumulated-vs-derive divergence classes documented (retry re-comprehension; terminally-failed
   units in perUnit) — the audit names them; none occur in clean runs (7 consecutive EQUAL audits).

## Witness re-run criteria (per HALT-1 disposition §4 + Amendment 2 §5)

Same file, same tenant, no reset. 16/16 Tier-1; all 16 units committed (5 rosters via the repaired
batch path); pulse panel truthful throughout INCLUDING the entity phase; designed completion with
Saved/Learned/Cost (+ audit reconciliation flag absent); engine-visible Ventas = 160,443 exact
(E.0-established); **database responsive throughout** (no middleware auth timeouts, no display
query >2s). The architect runs the witness; `gh pr create --base main --head OB-203-phase-6`
follows sign-off (SR-43 closure: merge + production verification).

## Harness inventory (committed, re-runnable)

`web/scripts/verify-ob203-phase-d-telemetry.ts` (RPC semantics, live) ·
`web/scripts/ob203-phase-d-epg-run.ts` (live import EPG; env: OB203_EPG_TENANT reuse,
OB203_EPG_FIX_BINDINGS, OB203_EPG_MUTATE) · `web/scripts/ob203-phase-b-epg-run.ts` (kill test;
manages its own dev server). Scratch tenants retained for inspection: `1f4f0511…` (D/C runs),
`336af2a7…` (B kill test), `098f4915…` (superseded first run).
