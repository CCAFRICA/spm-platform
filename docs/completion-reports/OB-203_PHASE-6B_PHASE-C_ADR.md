ARCHITECTURE DECISION RECORD — OB-203 Phase 6B, Phase C (D21: entity-phase scale + visibility)
===============================================================================================
Section B gate; committed BEFORE implementation. Governing: directive §5 Phase C,
HALT-1 disposition §3 (one observability spine, no entity-specific vocabulary),
Amendment 2 §3 (Scale Contract: batched reads at the standing 200, batched
upserts in pulses; per-entity round-trips extinct; progress through the D.2
mechanism).

PROBLEM
-------
processEntityUnit's enrich path (execute-bulk/route.ts:788-839) is per-entity
synchronous: for EVERY existing entity with enrichment fields it runs SELECT
temporal_attributes by id, SELECT metadata by id, and a conditional UPDATE —
2-3 round-trips × N entities, sequential (DIAG-062 A2: DS-020 litmus FAIL).
Its whole duration is invisible: the unit sits with no state change between
'classified' and 'bound', emitting zero pulses/VERBOSE/telemetry (A2(d)).
Live BEFORE evidence (2026-06-12 harness, scratch tenant 1f4f0511, re-import):
44 existing entities, ZERO value changes — "Entity: 0 new, 40 existing,
0 enriched" — yet the phase consumed ~11-12s of structural silence (polls
t=5s..t=17s: units 0/3, pulses 0/0) on 88 per-entity SELECT round-trips that
wrote NOTHING. The N+1 READ is the cost even when idempotent. At warm-witness
scale under A5 saturation (9-23s/round-trip), this is what consumed the 300s
window and orphaned 5 roster units.

OPTIONS
-------
Option A — widen the existing batched fetch; merge in memory; flush changed
  entities in 200-row upsert chunks; every WRITE chunk is a pulse.   [CHOSEN]
  The existing-entity lookup ALREADY batches at 200 (route.ts:727-739,
  Section G standing rule); widening its select to carry temporal_attributes,
  metadata, display_name, entity_type, status ELIMINATES both per-entity
  SELECTs at zero additional round-trips. The merge (same semantics, moved to
  a pure function) computes the changed-set in memory; changed entities flush
  via upsert ON CONFLICT (id) in 200-row chunks (Amendment 2 §3's standing
  200). Entity creation keeps its 5000-row bulk inserts. Every write chunk —
  creation AND enrichment — emits the SAME pulse vocabulary as commit pulses:
  ob203Trace('pulse', ...) + one session-record increment (D.2 mechanism).
  commitContentUnit gains an optional pulseBase offset so an entity unit's
  pulse counters compose entity-phase + commit-phase pulses on the ONE spine
  (no entity-specific fields; "pulse X of Y" stays one number line).
  - Scale 10x: O(roster/batch) round-trips — 1M-entity roster = 5,000 reads +
    ≤5,200 writes + as many increments, bounded, visible throughout. No
    per-row × unbounded cell (HALT-3 clean).
  - AI-first: no hardcoding; merge keys stay open (enrichment fields are
    whatever bindings carry). Korean Test holds.
  - Transport: no row data through HTTP; same surfaces as today.
  - Atomicity: creation keeps D16 rollbackNewEntities; an enrich-chunk failure
    fails the unit (enrichment is an idempotent merge — re-runnable; same
    posture as today's loop, which also had no enrich rollback).
Option B — server-side merge RPC (one call, jsonb merge in SQL).
  - REJECTED: moves merge LOGIC into DDL (a second implementation of the
    temporal-attribute close/append semantics to keep in sync — AP-17 shape),
    requires a migration (HALT-4) for what batched upserts already achieve
    within contract.
Option C — keep per-entity loop, parallelize with Promise.all batches.
  - REJECTED: still N per-entity round-trips — the litmus names the pattern,
    not its concurrency ("no per-entity synchronous writes"); concurrency
    also multiplies instantaneous load on the Small tier (the D16 lesson).

COMBINED ARMS (named per DD-7 — explicit scope, not creep)
----------------------------------------------------------
Failed data units currently get NO durable terminal state — the per-unit loop
emits 'bound' on success only (route.ts:424-440); failures land in results[]
and vanish from the spine (DIAG-062 writepath gap (b); demonstrated live: the
binding-failure run left units pinned at 1/3 forever with no failed state).
Phase C's invariant is "the same observability as every other phase" — the fix
emits 'failed_interpretation' (failureClass from the unit's error) at the same
one site for EVERY failed unit, all classifications. One spine, success and
failure alike.

RESIDUAL (named, OUT of scope — for architect disposition)
----------------------------------------------------------
Warm-path flywheel binding injection scrambles semantic roles across sheets
sharing column names: live evidence (scratch tenant 1f4f0511, session
d64111c5) — Team_Roster's rep_id injected as 'transaction_identifier' (cold
HC: 'entity_identifier') while Sales_Events got TWO 'entity_identifier's
(event_id AND rep_id). Entity units then fail 'No entity_identifier binding
found'. The witness workbook did not trip this (its rosters entered enrich),
but any workbook whose sheets share column names under conflicting roles can.
Candidate lineage: atom-flywheel role storage keyed by column atom across
sheet contexts. NOT fixed here (Phase C is the write pattern, not binding
correctness); recorded for the completion report.

GOVERNING PRINCIPLES (G1-G6, brief)
-----------------------------------
G1/G2: DS-020 scale litmus (LOCKED) embodied structurally — batch I/O is the
architecture, not a tuning; observability spine is the same record Phase D
ratified (one surface, D19 stays closed by construction). G3: directive §5 →
HALT-1 §3 → Amendment 2 §3 → this ADR → diff. G4: database systems — set-based
operations over row-at-a-time (the N+1 anti-pattern is the canonical case);
AP-4 names it in the registry. G5: structural counters and merges, domain-
and language-agnostic. G6: nothing novel — upsert + chunking are the
codebase's existing patterns (AP-2/AP-4 correct patterns).

EPG (per directive §5 C + Amendment 2 §3)
-----------------------------------------
1. Before/after timing, same roster unit, same tier (the 44-entity re-import
   above is BEFORE; AFTER on the same tenant/workbook).
2. Pulse/VERBOSE trace from a live import (OB203_VERBOSE=1) showing the
   entity phase emitting through the one spine.
3. DD-6 diff of the retired per-entity loop.
4. Settle audit remains EQUAL (Decision 95).
