# OB-203 Phase 6B — Phase B EPG Evidence (directive §5 B: controlled kill mid-execute)

**Date:** 2026-06-12 · **Branch:** `OB-203-phase-6` · **Implementation SHA:** 6a0c1d81 (ADR 7ce1f1cf)
**Invariant:** session unit-states, pulse progress, and the conclusion summary survive process and
response death; the queue is resumable from the durable spine such that response death at any point
cannot orphan unprocessed units; a unit with NO batch row is detected as unprocessed on resume
(A3 closed operationally — the walk is the proposal's unit list, never a batch scan).

Controlled test (`scripts/ob203-phase-b-epg-run.ts`): fresh scratch tenant
`336af2a7-e9b3-445e-abea-85792afa893d`, session `d79ed433`, real import via the HTTP routes,
**dev server KILLED mid-fact-commit** (process death — the strongest form of response death, the
warm-witness shape), restart, re-POST the same body. Lease shortened to 15s for the test
(env `OB203_BATCH_LIVENESS_MS`; arbitration logic identical at any setting).

---

## 1 — Truth survived process death (the D20 core)

```
[pre-kill t=5s] tick=26 units=2/3 pulses=7/11 rows=1544/3244 states=[Region_Lookup:bound, Sales_Events:classified, Team_Roster:bound]
>>> KILLING dev server mid-fact-commit (process death) <<<
exec1 fetch died as expected: fetch failed
--- RESTART ---
FIRST poll after restart (pre-resume): tick=26 units=2/3 pulses=7/11 rows=1544/3244 states=[Region_Lookup:bound, Sales_Events:classified, Team_Roster:bound]
```
The first poll after restart is **byte-identical** to the last pre-kill poll — every number
reconstructed from the durable record, zero process memory involved. No panel regress, no
1-of-326 lie: the D19 class stays closed through process death.

## 2 — Sweep + resume reprocesses exactly the orphan

Server log (post-restart re-POST):
```
[committed-data-visibility] reconcile tenant=336af2a7…: processing→failed=1 failedSwept=0 rowsReclaimed=1500
[SCI Bulk] Phase B resume: …::Team_Roster::0  → skip_terminal (state=bound)
[SCI Bulk] Phase B resume: …::Region_Lookup::1 → skip_terminal (state=bound)
[HF-213] Superseded prior batch 96d0f8b4… → new batch 26e4f11f… (content_unit_hash_match_reimport)
[SCI Bulk] Complete: 3200 rows in 50.5s
```
The dead partial (1,500 fact rows) was reclaimed by the D16.1 sweep once the lease expired; the
two terminal entity units were SKIPPED (no double-processing); only the orphaned fact unit was
reprocessed. HF-213 additionally superseded the swept batch on content match — the gate hides it
twice over.

```
resume execute-bulk: 200 overallSuccess=true
[post-resume t=0s] tick=28 units=3/3 pulses=11/11 rows=3244/3244 states=[…all bound…]
```

## 3 — Verdict (all PASS)

```
all 3 units bound:               PASS (Region_Lookup:bound, Sales_Events:bound, Team_Roster:bound)
physical rows exact (3244):      PASS (3244)        ← one generation, Decision 95 count equality
audit EQUAL:                     PASS (divergent=false fields=[])
session batches: Team_Roster:completed=40, Region_Lookup:completed=4,
                 Sales_Events:failed(superseded)=3200, Sales_Events:completed=3200
```
The settle audit (the demoted derive, reading batches through the canonical Phase E predicate —
completed AND not superseded) returns EQUAL against the accumulated record after a kill + resume:
the fast surface is self-auditing across process death (7th consecutive EQUAL audit in this arc).

## Scale Contract conformance (Amendment 2 §4)

Resume classification inputs: ONE single-row record read + ONE session-batches query — O(units),
never O(rows). Skipped units cost zero writes. The 300s boundary no longer bounds work: any number
of re-POSTs each do only the remaining work, and the client's bounded resume loop (3 attempts,
stall-gated) drives to terminal truth. The in-flight lease (liveness window) prevents
double-processing when a dead response hides a live server — the warm-witness case.

Residuals (named): failed-swept batches do not zero record commit fields (a newer generation may
own the numbers — transient stale window until reprocess re-patches; ADR riding decision 2).
Tests: 8 resume-classifier tests (incl. the A3 no-batch case); 190/190 suite; tsc clean; build green.
