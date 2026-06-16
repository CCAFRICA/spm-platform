# DIAG-070 — Import Write Path: Trace Instrumentation + Change Forensics

**Date:** 2026-06-16 · **Mode:** READ-AND-INSTRUMENT ONLY (no fix) · **Branch:** `diag-070-import-trace-forensics`
**Predecessor:** DIAG-069 (settle-scope, H5). **Instrumentation commit:** `8336abef`.

---

## Section A — Change Forensics

### A.1 — Last-known-good point
**`3aa5c886` (2026-06-11, "OB-203 Phase 3 (engine): durable comprehension-state service + read contract")** — the commit immediately **before** OB-203 wired the settle/poll machinery into the execute path. At this SHA `settleFromSurface` does not exist. The unified heavy write path (HF-196, HF-239 — below) was already present and was importing cleanly. The clean-import window is therefore **HF-239 (2026-05-19) → OB-203 Phase 3 (2026-06-11)**: a ~3-week period where execute-bulk did all its per-file server work but had **no client settle/poll/resume stall**.

### A.2 — What introduced "pulses"
**`8d972753` (2026-06-12, "OB-203 §2: import telemetry … VERBOSE + PULSE naming + lineage records").** "Pulse" is the **user-facing display name for a write** (telemetry vocabulary), introduced by the OB-203 §2 telemetry layer. It did **not** restructure the commit loop. (The older chunked-commit idea — "nanobatch" — is `e1de91b1` OB-174 Phase 5, and is not what runs in the current per-file path.) **Verdict: pulses are display-only; not a write-path slowdown.**

### A.3 — Polling timeline (execute phase)
| Commit | Date | What it did to polling |
|---|---|---|
| `3aa5c886` | 6-11 | durable state spine (read contract) — no execute-phase poll yet (BASELINE) |
| `1fc8afb0` | 6-11 | Phase 3 wiring — emit unit states across analyze + execute-bulk |
| `f617264e` | 6-11 | Phase 3 retry+UI — **live-progress session-state poll enters SCIExecution** |
| `566b2905` | 6-11 | D13 — stream unit states + poll-based recovery |
| **`1c65baba`** | **6-12** | **D18 — `settleFromSurface` INTRODUCED: poll/resume loop, 90s stall × 3 re-POSTs (NET-NEW, +60/−31)** ← the stall mechanism |
| `3f5c9815` | 6-12 | 6B-D — telemetry=1 added to the settle poll |
| `103759e0` | 6-1x | HF-286 — terminal-stop both pollers on `allUnitsSettled` |
| (HF-290) | 6-14 | no code — "all pollers already terminal-aware" |
| `0567eef0` | 6-16 | HF-295 P2 — file-scoped settle |
| `04cf7ac1` | 6-16 | HF-296 — response-based settle (recovery-only) + poller terminal stops |

### A.4 — Commits that added synchronous work to the per-file SERVER write path (HEADLINE)
Both **predate** the last-known-good baseline (so they were present during clean imports — they set the ~25 s/file *baseline*, they are not the *regression*):

- **`6276a79a` HF-196 (2026-05-02)** — added the synchronous entity-resolution pass to execute-bulk:
  ```
  + import { executePostCommitConstruction } from '@/lib/sci/post-commit-construction';
  + // Run entity resolution + entity_id back-link via shared module after all units
  + await executePostCommitConstruction({ supabase, tenantId, source: 'sci-bulk' });
  ```
  (commit net −222/+101 lines: it removed 222 lines of dead `_postCommitConstruction_REMOVED` and routed through the shared module — but it RE-ADDED the awaited entity-resolution call "missing post-OB-182".)
- **`9484e3b5` HF-239 (2026-05-19)** — unified route added three more awaited/per-file operations:
  ```
  + await createMissingAssignments(supabase, tenantId);
  + emitFlywheelSignals({ … });                 // fire-and-forget
  + await populateStoreMetadata(supabase, tenantId, rows, commitResult.entityIdField);
  ```
- **Counter-evidence (OB-203 made the server FASTER):** `6ca60d9f` OB-203 6B-C (6-12) "batch entity I/O live — per-entity round-trips extinct" *reduced* entity-write cost. So OB-203's net effect on the server was an optimization; its regression was the **client** settle/poll (A.3).

### A.5 — `git diff 3aa5c886..1aba5a20 -- execute-bulk/route.ts`
Diffstat: **+385 / −86**. Dominated by OB-203 additions (idempotent resume classification `classifyUnitForResume`, batch entity I/O, write-time telemetry accumulation, D16.1 reconcile) — NOT new commit work (the commit work predates the baseline, A.4). Full diff reproducible via the command above; the per-file synchronous calls it carries are exactly the phases now bracketed by `[TRACE-SERVER]`.

### A.6 — `git diff 3aa5c886..1aba5a20 -- SCIExecution.tsx`
Diffstat: **+218 / −42**. The substance is the settle/poll/resume mechanism: `settleFromSurface` (`1c65baba`), the per-file dispatch loop (HF-295), and the response-based settle (HF-296). This is the client-side change from "POST → read response → advance" to "POST → poll session-state until terminal → advance," and back again (HF-296, not yet observed live).

---

## Section B — One-sentence hypothesis (evidence-backed)
The import went from ~25 s/file (tolerable) to ~5 min/file when **OB-203 D18 (`1c65baba`, 2026-06-12) added the client `settleFromSurface` poll/resume loop** (90 s stall × 3 re-POSTs) that made per-file advance **poll-driven instead of response-driven** — the added operation is a redundant session-state confirmation poll, **not** new server work (the per-file server cost — entity resolution `executePostCommitConstruction` HF-196 5-02, assignments/flywheel/store-metadata HF-239 5-19 — predates the clean window, and OB-203 6B-C even optimized it); HF-296 (`04cf7ac1`) neutralizes that poll on a live 200 but the production logs (34-row file committing 5 min from the 521-row file) indicate the deployed build predates HF-296, which Part-2's trace will confirm on a deployment-verified run: `[TRACE-CLIENT] PATH=immediate-return` + small `[TRACE-SERVER] … response` deltas = HF-296 live (fast); `PATH=settle-recovery` + `[TRACE-POLL] settleFromSurface TICK` storms = stale build; and the `[TRACE-SERVER]` per-phase deltas will quantify the residual ~25 s and whether `post-commit-construction` dominates it.

---

## Section C — Deployment confirmation record
- **Branch:** `diag-070-import-trace-forensics`
- **Instrumentation commit:** `8336abef` (the trace logs; behavior-neutral)
- **PR #:** _recorded in the PR description and CC handoff on creation_
- **HEAD SHA:** _the report commit on top of `8336abef`_
- **MANDATORY before re-running:** the architect verifies the **production deployment SHA** (Vercel → vialuce-prod → Deployments → Production → Source) contains HEAD. We have already been burned once by a stale deployment (three merged PRs with no behavior change); we will **not** interpret a trace run against an unconfirmed deployment. Only once prod = HEAD does the `[TRACE-*]` evidence mean anything.

**No fix written.** The instrumented, deployment-confirmed run produces the per-phase evidence; the forensics above produce the change history. The fix follows both.

---

*DIAG-070 · Import Write Path Trace + Change Forensics · 2026-06-16 · vialuce.ai*
