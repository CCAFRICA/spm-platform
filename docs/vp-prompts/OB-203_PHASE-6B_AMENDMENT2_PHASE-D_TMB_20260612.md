# OB-203 Phase 6B — Amendment 2: Phase D Redesign (TMB-Scale Telemetry) + Scale Contract

**Date:** 2026-06-12
**Amends:** `docs/vp-prompts/OB-203_WARM_WITNESS_REMEDIATION_DIRECTIVE_20260612.md` and `docs/vp-prompts/OB-203_PHASE-6B_HALT1_DISPOSITION_20260612.md`
**File location (commit before dispatch):** `docs/vp-prompts/OB-203_PHASE-6B_AMENDMENT2_PHASE-D_TMB_20260612.md`
**Architect rulings encoded:** (1) the live import experience is a product requirement and is NOT reduced, throttled, or removed — it is delivered at TMB scale (thousands / millions / billions); (2) fix order is E-proof → **D** → C → B; (3) every phase in this directive carries a Scale Contract.

---

## §0 — Dispatch model and FIRST ACTION

**Two-channel correction (operative for this arc):** the architect places governance artifacts into the repo working tree by file download only and performs no git operations (SR-44). CC commits them. Accordingly:

**FIRST ACTION, before any phase work:** commit and push every uncommitted governance artifact in `docs/vp-prompts/` and `docs/diagnostics/`, including:
- `docs/vp-prompts/OB-203_WARM_WITNESS_REMEDIATION_DIRECTIVE_20260612.md`
- `docs/vp-prompts/OB-203_PHASE-6B_HALT1_DISPOSITION_20260612.md`
- `docs/vp-prompts/OB-203_PHASE-6B_AMENDMENT2_PHASE-D_TMB_20260612.md` (this file)
- `docs/diagnostics/DIAG-062_WARM_WITNESS_POSTMORTEM_OUTPUT.md` (if not already committed)

One commit, from repo root, message: `OB-203 Phase 6B: governance artifacts — directive, HALT-1 disposition, Amendment 2 (TMB Phase D)`. Verify with `git log --oneline -1` and `git status` clean; paste both in the next report.

**Standing context (this file is self-contained; do not rely on chat history):** Phase A (DIAG-062) is complete and dispositioned. Phase E's gate fix is committed; its live EPG (engine-view Ventas = 160,443 exact + one adjacent consumer at the same count) and the legacy `fetchSupersededBatchIds` retirement (4 callsites: run-calculation, calculation/run/route, state-reader, convergence; DD-6 pre-SHA + git diff + before/after count-equality at one heavy callsite) are PENDING on database availability — they complete first when the host is healthy. The Supabase instance was saturated by this platform's own display polling (the Phase D subject); the architect restarts it via Dashboard (architect channel). Execution order after E closes: **D → C → B**, per §5.

---

## §1 — Design principle (binding on Phases D and C)

**Truth is accumulated at write time, not derived at read time.** The importing process already possesses every number the experience displays, at the instant it becomes true. It records that truth incrementally as part of writes it is already making. Readers consume the recorded truth at O(1) cost. No display path may recompute session truth by scanning data tables. The full-scan derive is demoted to **auditor**: it runs once, at conclusion, to verify the accumulated counters against scanned truth (Decision 95 posture — the fast surface is self-auditing, never the display feed).

This extends the DS-020 litmus to reads, per architect ruling: *a read whose cost grows with stored data volume, triggered at unbounded frequency, fails the litmus exactly as a per-entity synchronous write does.*

---

## §2 — Phase D (redesigned): write-time telemetry accumulation

**Invariant:** every number on the import in-progress and completion surfaces derives from a durable per-session telemetry record that is incrementally updated by the work itself; display read cost is O(1) in stored data volume and independent of tenant size; no polling path executes a data-table scan; the heavy derive executes exactly once per session, at settle, as the audit.

### D.1 — The session telemetry record
One durable row (or equivalent single-fetch record) per import session, on an existing surface per A1's evidence (`classification_signals` carries session truth; CC selects the surface with a one-paragraph Architecture Decision Gate entry — a dedicated `import_session_telemetry` table is acceptable if signals are structurally per-unit; HALT-4 if a migration is required). Fields: the exact counter vocabulary the panels already render — units by state, fingerprints recognized/new, atoms from-memory/novel, LLM made/bypassed, signals captured, bindings injected, pulses landed/total, rows committed/expected, per-unit terminal dispositions, conclusion summary. Aligned with SynapticSurface.stats vocabulary (DS-020 lineage).

### D.2 — Write-time accumulation
- Analyze phase: each unit's Tier-1/Tier-2 decision, binding injection, and signal capture increments the record at decision time (these events already execute writes; the increment piggybacks — no new round-trips per unit beyond one counter update batched with existing work).
- Execute phase: each **pulse** carries one counter update (rows committed, pulses landed) batched with the pulse's own write — one increment per 500-row pulse, never per row. Entity-phase events (Phase C) emit through the identical mechanism.
- Increments are atomic (single-row update with additive expressions), so concurrent unit processing cannot lose counts.

### D.3 — Read side
- In-progress and completion panels fetch the session record (single-row read) and/or subscribe to its changes (Supabase Realtime/SSE acceptable; if polling is retained as fallback, it polls the single row — pasted evidence of the query shape required).
- Both panels and the header read the SAME record — the D19 two-surfaces-disagree class is closed by construction, not by synchronization.
- `deriveImportTelemetry` (the full-scan) is removed from every polling path. It runs once in settle/conclusion as the **audit**: its output is compared to the accumulated record; divergence is logged as a named platform_event and surfaces on the completion screen as a reconciliation flag (truth-telling, not silent self-correction).

### D.4 — Scale Contract (this phase)
| Path | Cost class | Trigger frequency | At 10⁹ rows / 10³ tenants / 10⁶ users |
|---|---|---|---|
| Counter increment | O(1)/event, piggybacked | per pulse / per unit decision | 2B-row import ≈ 4M pulses → 4M single-row increments amortized into writes already occurring |
| Panel read | O(1) single row | per render or pushed | independent of data volume; N watchers = N single-row reads or 1 stream fanout |
| Audit derive | O(session data) scan | ONCE per session, at settle | bounded, scheduled, never concurrent with display |
**No per-row × unbounded-frequency cell exists.** Any implementation choice that introduces one is HALT-3.

### D.5 — EPG
1. Paste the accumulation write shape (the additive single-row update) and the panel read query.
2. Live import: paste evidence the panels move continuously through analyze AND execute (including the entity phase once C lands), with `session-state?telemetry=1` full-scan absent from logs during the run.
3. Paste the settle-time audit output: accumulated counters vs scanned truth, equal.
4. DB health evidence during the run: no query >2s attributable to display paths (run log excerpt).

---

## §3 — Phase C amendment (same principle)

Phase C's batch entity I/O emits its progress through the D.2 mechanism — entity-phase pulses increment the same session record. The entity phase becomes as visible as the transaction phase through the identical spine. No entity-specific event vocabulary (one observability spine, per the HALT-1 disposition).

**Scale Contract (Phase C):** entity resolve = batched reads (`.in()` at the standing 200) + batched upserts in pulses; cost O(roster/batch-size) round-trips; a 1M-entity roster = ~2,000 batched round-trips + 2,000 counter increments — minutes, bounded, visible throughout. Per-entity round-trips are extinct on this path; EPG includes the DD-6 diff of the retired loop.

---

## §4 — Phase B note (unchanged invariant, contract added)

**Scale Contract (Phase B):** the detached/resumable execution walks the proposal's unit list (bounded by sheet count, not row count) against the durable spine; resume cost O(units), not O(rows). The 300s boundary ceases to bound work because no work lives inside a response.

---

## §5 — Order and closure

Execution order: **Phase E live EPG + legacy-filter retirement (already pending host recovery) → Phase D → Phase C → Phase B → witness re-run.** Witness criteria as amended in the HALT-1 disposition §4, plus one addition from this amendment: **database remains responsive throughout the run** (no middleware auth timeouts, no display query >2s) — pasted from the run log as part of sign-off evidence.

Pending architect ratification (separate artifact, not blocking this amendment): the Scale Contract as a numbered standing rule in `CC_STANDING_ARCHITECTURE_RULES.md`, required §-section in every future directive touching data surfaces.
