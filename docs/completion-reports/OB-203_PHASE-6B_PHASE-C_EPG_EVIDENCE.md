# OB-203 Phase 6B — Phase C EPG Evidence (directive §5 C, Amendment 2 §3)

**Date:** 2026-06-12 · **Branch:** `OB-203-phase-6` · **DD-6 pre-SHA:** 34c2554c (ADR commit; implementation diff in the commit carrying this file)
**Invariant:** entity resolution passes the DS-020 litmus — batch I/O, no per-entity synchronous writes — and emits the same observability as every other phase (pulses, VERBOSE at decision time, telemetry movement) through the ONE spine (no entity-specific vocabulary).

All runs: same scratch tenant `1f4f0511-6371-4458-9013-125ebdf5f735`, same 3-sheet workbook
(40-row roster / 4-row lookup / 3,200-row fact), same tier (Tier-1 warm re-import,
`bypassedByMemory=3`, bindings fixture-confirmed) — the directive's "same roster unit
before/after on the same tier".

---

## EPG-1 — Before/after timing, same roster unit, same tier

**BEFORE** (per-entity loop; session `1674b037`, pre-implementation):
```
[SCI Bulk] Entity: 0 new, 40 existing, 0 enriched      ← ZERO value changes
[POLL t=  7s] units=0/3 pulses=0/0   ← execute started ~t=5
[POLL t= 11s] units=0/3 pulses=0/0       structural SILENCE while the roster
[POLL t= 14s] units=0/3 pulses=0/0       grinds 88 per-entity SELECT round-trips
[POLL t= 17s] units=1/3 pulses=1/1 rows=40/40   ← roster finally bound
execute-bulk: wall=60.3s
```
~11–12s of invisible entity phase for 44 entities that wrote NOTHING — the N+1 READ is
the cost even when idempotent. (Warm-witness extrapolation: 50 entities × 9–23s saturated
round-trips ≫ 300s — the A2 cascade.)

**AFTER, identical data** (batch path; session `57356020`):
```
[SCI Bulk] Entity: 0 new, 40 existing, 0 enriched      ← same idempotent outcome
[POLL t=  7s] units=0/3 pulses=1/1 rows=40/40   ← roster commit pulse already visible
[POLL t= 10s] units=2/3 pulses=3/9 rows=544/3244 ← BOTH entity units done
execute-bulk: wall=54.9s
```
Entity phase ≈ 2–4s (was ~12s): the two per-entity SELECTs are extinct — the merge inputs
rode the ALREADY-EXISTING 200-batch entity fetch (select widened to carry
temporal_attributes/metadata; zero added round-trips).

**AFTER, mutated values** (the enrich-WRITE path live; session `c71022c4`, every rep's
region rotated → 40 changed entities):
```
[SCI Bulk] Entity: 0 new, 40 existing, 40 enriched     ← ONE 200-chunk upsert
[POLL t=  7s] pulses=1/2 rows=0/40    ← the ENRICH pulse landed (1 of composed total 2:
                                         1 enrich chunk + 1 commit chunk, one number line)
[POLL t= 16s] units=3/3 pulses=10/10 rows=3244/3244
```
40 enrichments = 1 round-trip (retired loop: 80 SELECTs + 40 UPDATEs = 120). Round-trip
arithmetic for the witness-scale roster: old = 2–3 × N; new = ceil(N/200) writes + reads
already amortized into the existing fetch. 1M-entity roster = ~5,000 fetch batches +
≤5,200 write chunks, bounded, visible throughout (Amendment 2 §3 Scale Contract).

---

## EPG-2 — Pulse/VERBOSE trace from the live import (OB203_VERBOSE=1)

```
21:34:30.885Z binding {"sheet":"Team_Roster","injected":3,"source":"flywheel-tier1"}
21:34:30.886Z llm     {"sheet":"Team_Roster","tier":1,"decision":"bypassed-by-memory"}
21:34:35.811Z pulse   {"unit":"...::Team_Roster::0","sheet":"Team_Roster","pulse":1,"ofTotal":1,"rows":40}   ← ENTITY-PHASE pulse (40-entity enrich upsert)
21:34:36.564Z pulse   {"unit":"...::Team_Roster::0","sheet":"Team_Roster","pulse":1,"ofTotal":1,"rows":40}   ← commit pulse (trace prints commit-local numbers; the RECORD composes: panel read pulses=1/2 → 2/2)
21:34:37.910Z pulse   {"unit":"...::Region_Lookup::1",...,"rows":4}
21:34:39.936Z pulse   {"unit":"...::Sales_Events::2","pulse":1,"ofTotal":7,"rows":500}
  ... pulses 2..7 at ~1s cadence ...
21:34:45.070Z pulse   {"unit":"...::Sales_Events::2","pulse":7,"ofTotal":7,"rows":3200}
```
The entity phase emits through the IDENTICAL vocabulary ('pulse', same fields) and the
identical session-record increment as commit pulses — one observability spine, no
entity-specific event type (HALT-1 disposition §3). The composed pulse line is what the
panels render (record), the trace is the server-side witness.

---

## EPG-3 — Settle audit (Decision 95)

`divergent=false, fields=[]` on ALL THREE runs above (4th–6th consecutive EQUAL audits),
including the mutated enrich-write run — accumulated record == scanned truth with the
batch entity path live. Composed actual pulse counts (10 = 2 roster + 1 lookup + 7 fact)
vs formula (7) compared at formula level per the Phase D design; rows exact 3244 = 3244.

---

## EPG-4 — DD-6: the retired loop

Pre-SHA 34c2554c. The implementation commit removes execute-bulk's per-entity enrich loop
(was route.ts:788-839: per entity — SELECT temporal_attributes :797, SELECT metadata :820,
conditional UPDATE :829) and replaces it with: widened batched fetch (one select, 200/batch,
zero added round-trips) → pure in-memory merge (`entity-enrichment.ts`,
`computeEnrichmentMerge` — the loop's semantics byte-for-byte, 6 unit tests) → 200-row
upsert chunks, each chunk a pulse. `grep -n "\.single()" processEntityUnit` post-change: zero
hits; zero per-entity round-trips remain on the path.

## Combined arms (named in ADR): failure lands on the spine

Failed data units now emit terminal `failed_interpretation` (failureClass = the unit's
error) at the same per-unit site that emits `bound` — both the returned-failure and
thrown-failure paths. Demonstrated need: the binding-failure run (session `d64111c5`)
left units pinned at 1/3 forever with no terminal state; that display class is closed.

## Residual (for architect disposition, out of scope)

Warm-path flywheel binding injection scrambles roles across sheets sharing column names
(evidence: session `d64111c5` proposal — roster `rep_id` → `transaction_identifier`; fact
sheet got two `entity_identifier`s). Entity units then fail the entity_identifier guard.
Cold HC classifies the same sheets correctly; the witness workbook did not trip this.
Candidate lineage: atom-flywheel role storage keyed by column atom across sheet contexts.

Tests: 182/182 (6 new merge tests); tsc clean; production build green.
