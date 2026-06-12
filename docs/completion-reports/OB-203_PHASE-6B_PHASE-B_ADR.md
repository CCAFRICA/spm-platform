ARCHITECTURE DECISION RECORD — OB-203 Phase 6B, Phase B (D20: response death cannot orphan units)
==================================================================================================
Section B gate; committed BEFORE implementation. Governing: directive §5 Phase B,
HALT-1 disposition §3 (scope = the EXECUTION LOOP; resume walks the proposal's
unit list, closing the A3 never-created-a-batch blindness operationally),
Amendment 2 §4 (Scale Contract: resume cost O(units), not O(rows); the 300s
boundary ceases to bound work because no work LIVES inside one response).

PROBLEM
-------
The execute loop runs inside the HTTP response (F2: no jobs spine). Response
death at the 300s boundary stops the loop; durable state is intact but
unprocessed units are orphaned (warm witness: 5 rosters, zero batch rows,
invisible to D16.1 reconciliation which scans batches). The client's
settleFromSurface gives up after a 90s stall with units non-terminal forever.

OPTIONS
-------
Option A — IDEMPOTENT RE-POST RESUME: execute-bulk becomes resumable by
  construction. Every invocation walks the REQUEST's unit list and classifies
  each unit against the durable spine before processing:
    terminal on the spine (bound/resolved/failed_interpretation) → skip;
    latest batch 'completed'                → skip + re-emit bound (the commit
                                              landed; only the emission died);
    latest batch 'processing' INSIDE the D16.1 liveness window → skip as
                                              IN-FLIGHT (a possibly-alive owner
                                              — the warm witness proved a dead
                                              response ≠ dead server);
    otherwise (no batch, or swept/stale)    → process.
  The client re-POSTs the same body when settle stalls with non-terminal units
  remaining (bounded attempts). D16.1 reconcile (already first in the route)
  sweeps dead partials before the loop; the liveness window is the ownership
  arbitration — no heartbeat infrastructure needed.                  [CHOSEN]
  - Scale 10x: classification inputs are ONE single-row record read (Phase D)
    + ONE session-batches query — O(units), never O(rows). Skipped units cost
    zero writes. No per-row × unbounded-frequency cell (HALT-3 clean).
  - AI-first: no enumeration; the classifier is structural (state + batch
    status + age).
  - Transport: same body re-sent (metadata-only; rows live in Storage).
  - Atomicity: per-unit D16 unit-atomicity unchanged; double-processing is
    excluded by the liveness arbitration + content-hash supersession as the
    safety net of record (HF-213).
Option B — detached execution (waitUntil / spawned worker).
  - REJECTED: platform-specific detachment IS the INF-001 Loading Dock arc
    (directive §6 out-of-scope); a detached worker that dies still needs
    resumability — resume is the structural primitive either way.
Option C — durable job rows (processing_jobs) + pull workers.
  - REJECTED: generalized queues/schedulers are INF-001 by name (§6).

DECISIONS RIDING THIS ADR
-------------------------
1. BATCH_LIVENESS_MS becomes configuration (env OB203_BATCH_LIVENESS_MS,
   default unchanged 6min) — Scale Reference: timeouts are configuration, not
   re-architecture. The controlled kill-test EPG uses a short window; the
   arbitration LOGIC is identical at any setting.
2. reconcileStaleBatches, when it sweeps a STALE-PROCESSING batch, also zeroes
   that unit's commit fields on the session telemetry record (metadata carries
   proposalId + contentUnitId) — the panel reflects the physical reclamation
   immediately (truthful regress ≠ the D19 lying regress; rows that were
   deleted are not displayed as committed). Failed-swept batches are NOT
   zeroed (a newer generation may own the record's numbers); residual noted.
3. settleFromSurface returns settled|stalled; the client resume loop re-POSTs
   on stall, capped (3 attempts), each with its own 90s progress-reset window.
   A unit owned by a live in-flight batch settles via polling as that owner
   completes; a dead owner's batch exits the liveness window and the next
   resume sweeps + reprocesses it.

GOVERNING PRINCIPLES (brief)
----------------------------
G1/G2: idempotent, resumable ingestion embodies the audit posture (SOC1: no
partial state survives; D16/D16.1 unchanged and composed, not bypassed).
G4: distributed systems — at-least-once delivery + idempotent receivers +
lease-based ownership (the liveness window IS a lease); retry-until-terminal
is the standard recovery primitive where exactly-once is unattainable.
G5: structural; any tenant, any workload. G6: no novelty — composes D16.1
(sweep), HF-213 (supersession), Phase D (O(1) spine reads).

EPG (directive §5 B)
--------------------
Controlled kill mid-execute: start a real import, kill the dev server mid-fact-
commit (process death, the strongest form of response death), restart, re-POST
(resume). Paste: (1) the post-restart panel read showing pre-kill truth
SURVIVED process death (the record, not memory); (2) reconcile sweeping the
dead partial; (3) resume skipping terminal units and reprocessing the orphan;
(4) all units terminal; committed_data exact per unit (one generation);
(5) settle audit EQUAL.
