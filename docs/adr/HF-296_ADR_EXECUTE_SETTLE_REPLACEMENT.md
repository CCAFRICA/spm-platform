# ADR — HF-296: Execute-Phase Settle Replacement + Poller Terminal Stops + Performance Benchmark

**Date:** 2026-06-16 · **Branch:** `hf-296-execute-settle-replacement` · **Mode:** ULTRACODE · effort MAX
**Predecessor:** DIAG-069 (settle-scope, H5) → HF-295 Part 2 (file-scoped settle, shipped). HF-295 fixed *which* units settle; HF-296 fixes *how* — the file-scoped settle still **polls** to re-derive what the HTTP 200 already returned, costing ~298s of stall per file and starving auth.

This ADR is the build's **first commit** (per §1A). It states the orchestration plan, the merged STATE MAP, the keystone, the parallel streams, the surfaced terminal-state contract, and the one-sweep lens set — then the build executes it.

---

## 1 — Orchestration plan

| Element | Decision |
|---|---|
| **Fan-out (paid once)** | 5 disjoint reads → one merged STATE MAP, executed in the main context (the build edits these files; subagent summaries would lose the exact lines). |
| **Keystone (sequential, first)** | §2 settle-mechanism replacement — `executeBulk` trusts a live HTTP 200 and returns immediately; `settleFromSurface` becomes recovery-only. Everything else renders into this control flow. |
| **Streams (after keystone)** | Stream A = `SCIExecution` live-progress session-state poller (the "[import] /" execute-phase noise) — single clean lifecycle, one terminal stop. Stream B = `ImportTelemetryPanel` telemetry=1 poller — stall-timeout hard stop. File-disjoint. |
| **Surfaced collision** | All three pollers key off the same notion of "terminal." The contract (below) makes it one definition so a poller never waits on a source the keystone no longer feeds. |
| **One batched sweep** | §4 proof gate once — analytical poll-count benchmark (computed here) + architect's browser run (real wall-clock). |

### Terminal-state contract (the surfaced collision, resolved)
A unit is **terminal** when its durable spine state ∈ `{bound, resolved, failed_interpretation}`. A **file** is terminal when its `executeBulk` has returned a `FileDispatchOutcome` (the HTTP 200 results are authoritative — route.ts:672 builds the response only after every per-unit + batch spine emission). The **execute phase** is terminal when the dispatch loop has processed every file (`executionDone`).
- Keystone: trusts the 200 (file terminal on response), polls only when the response is **lost**.
- Stream A (in-component): gates on `executionDone` — the single execute-phase terminal signal.
- Stream B (cross-component, in the page): gates on `allUnitsSettled` **OR** a stall-timeout (can never outlive progress) **OR** unmount at phase transition.

---

## 2 — Merged STATE MAP (5 fan-out targets)

- **T1 — settle (`SCIExecution.tsx`):** `executeBulk` (:265) runs a bounded resume loop that POSTs then **always** calls `settleFromSurface(groupUnitIds)` (:351) — even on a live 200. Settle (:163) polls `/session-state?telemetry=1` every 2s up to `STALL_MS=90s`, returns true at `settledCount >= trackedIds.length`. `MAX_EXECUTE_ATTEMPTS=3` re-POSTs on stall.
- **T2 — "[import] /" poller + HF-289 status:** HF-289 was **Peru locale** work (PEN/es-PE), not pollers. HF-286 (session-state) + HF-290 (import-list) shipped; HF-290 concluded "all pollers already terminal-aware." **There is no separate import-list route poller.** The execute-phase "[import] /" access-log noise is the `SCIExecution` live-progress effect (:243) polling `/session-state` every 2s, gated on the per-file-toggling `hasActiveUnits` (causes the HF-290 "double/triple hits").
- **T3 — telemetry poller (`ImportTelemetryPanel.tsx`):** polls `/session-state?telemetry=1` every 2s during `phase="executing"` (page:645). Has an `allUnitsSettled` stop (HF-286, :71) and unmount cleanup — but **no stall-timeout**: if any unit is never settled on the spine, it polls forever.
- **T4 — HTTP response contract (`execute-bulk/route.ts`):** returns `SCIExecutionResult { proposalId, results: ContentUnitResult[], overallSuccess }` (:672) **after** all per-unit `bound`/`failed_interpretation` emissions (:517/:539) and the final batch `bound` (:658). Each result carries success, rowsProcessed, error. **This is everything settle re-derives.**
- **T5 — baseline:** no logs are committed in-repo; I cannot access Vercel prod logs. Baseline = architect-observed (cited) + a poll-count derivation computed from the code (§4).

---

## 3 — The three pollers (architect label → actual code)

| Architect label | Actual code | Fix |
|---|---|---|
| The settle | `settleFromSurface` while-loop (telemetry=1) | **Keystone (§2):** recovery-only — zero polls on a live 200 |
| `[import] /` route poller | `SCIExecution` live-progress effect (session-state) | **Stream A:** stable execute-phase gate + single terminal stop at `executionDone` |
| Telemetry poller | `ImportTelemetryPanel` (telemetry=1) | **Stream B:** stall-timeout hard stop (+ existing settled-stop & unmount) |

No fourth/import-list poller exists (T2). Leaving any of these three running would be SR-34 adjacent-arm; all three are addressed. Analyze-phase pollers (HF-286: SCIProposal, the analyze poll, the telemetry panel in `phase="analyzing"`) and the processing-phase job poller (`ImportProgress`, already terminal) are **out of scope** (§0.4).

---

## 4 — Benchmark method (honest)

I cannot run the production browser import or read Vercel logs. The benchmark therefore has two halves:
1. **Architect-observed baseline (cited from the directive):** ~2s work/file, ~298s stall/file, 3/17 files before the 300s function cap, `getUser()` timeouts present.
2. **Poll-count derivation (computed from the code — the measurable evidence I produce):** per-file session-state hits before vs. after, for each of the three pollers. Real post-fix wall-clock is the architect's §4.2 browser proof gate.

---

## 5 — No over-correction (scope fence)
Settle **scope** (HF-295) stays — this fixes the **mechanism**. Single-file and all-success paths keep behavior (single-file = one group, trusts its 200). Analyze-phase pollers, the processing job poller, server routes, engine, schema, other tenants: untouched. D18 resilience is **preserved** — a lost response still falls to settle-recovery; only a *live* 200/4xx/5xx now short-circuits the poll.

---

*HF-296 · ADR · 2026-06-16 · vialuce.ai*
