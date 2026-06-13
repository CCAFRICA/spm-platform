# OB-203 Phase 6B — HALT-1 Disposition (Architect)

**Date:** 2026-06-12
**Disposes:** `docs/diagnostics/DIAG-062_WARM_WITNESS_POSTMORTEM_OUTPUT.md`
**Amends:** `docs/vp-prompts/OB-203_WARM_WITNESS_REMEDIATION_DIRECTIVE_20260612.md`
**File location (commit before dispatch):** `docs/vp-prompts/OB-203_PHASE-6B_HALT1_DISPOSITION_20260612.md`
**Status:** HALT-1 released. HALT-2 honored — Phase E executes FIRST. This file plus the directive are jointly the prompt for Phases E, B, C, D.

---

## §1 — Findings accepted

A1–A5 accepted as evidenced. The cascade reading (A5 saturation → A2 per-entity writes stretched to 9–23s → 300s response death → 5 roster units never reach commit → A3 blind to batch-less units → A1 panel split across cheap/heavy surfaces) is ratified as the causal account of record for the warm-witness tail failure. The session spine being durable (`classification_signals` as the one canonical surface) is confirmed satisfaction of Decision 64 v3 — Phase B therefore targets the **execution loop**, not the state surface.

---

## §2 — Phase E (F4) — released FIRST per HALT-2, with the following rulings

### 2.1 Structural diagnosis ratified at the class layer

The defect is **predicate multiplicity**, not status vocabulary. Two visibility predicates exist: the D16.1 gate (`committed-data-visibility.ts`, hides non-completed batches) and the legacy HF-196 filter (`fetchSupersededBatchIds` + per-callsite `.not('import_batch_id','in',…)`) that only the calculation engine composes in. Any consumer that applies one without the other reads a different universe. That is the invariant violation; supersession recording is downstream of it.

### 2.2 Fix invariant (one predicate, all consumers)

**Exactly one canonical visibility gate exists for `committed_data` reads, and it subsumes supersession.** `applyCommittedDataVisibility` (or its successor) excludes batches that are non-completed **or** superseded (`superseded_by IS NOT NULL`). The standalone HF-196 `fetchSupersededBatchIds` filter is **retired into the gate** — every callsite that composed it separately (run-calculation.ts and any sibling) drops the separate filter and relies on the gate alone. Per DD-1/DD-2: pre-edit grep enumerating **every** `committed_data` read path and every `fetchSupersededBatchIds` / `applyCommittedDataVisibility` consumer, pasted and classified in the completion report, before the edit.

**No migration required** — `superseded_by` and `status` both exist on `import_batches` (SCHEMA_REFERENCE_LIVE verified). **HALT-4 not triggered.** Batch `status` vocabulary remains untouched (DD-7: no behavior expansion; a `superseded` status value is NOT introduced under this fix).

### 2.3 D16.1 ratified phrasing amended

From "reads count only `import_batches.status='completed'` rows" to: **"reads see exactly the batches admitted by the single canonical visibility gate: `status='completed' AND superseded_by IS NULL`."** The NULL-tolerant legacy posture (rows with NULL `import_batch_id` remain visible) is preserved exactly as ratified — restate it in the gate's code comment.

### 2.4 The 128-row anomaly — resolve FIRST, inside Phase E

Decision 95: 160,315 ≠ 160,443 is a FAIL until explained with evidence; no proximity acceptance. Step E.0, before any predicate edit:
1. Re-run the engine-view count with a verified exact-count method (`count: 'exact', head: true`; no row-fetch pagination in the path) — paste the query and output.
2. Per-batch reconciliation: for each of the two Ventas batches (warm + superseded run-5), paste `committed_data` exact count grouped by `import_batch_id` against each batch's `import_batches.row_count`. This pins the deficit to (a) evidence-script artifact, (b) short-committed warm batch, or (c) filter leakage.
3. If (b) — the warm batch physically holds < 160,443 — HALT immediately for architect disposition; that is a write-path integrity question senior to the predicate fix.

### 2.5 Phase E EPG (amended)

After the gate change: paste (1) engine-visible Ventas count = the E.0-established true single-generation count, exactly; (2) the same count from one **adjacent consumer** (census/telemetry derive) through the same gate — E952 class-layer proof that no consumer reads a private universe; (3) DD-6 pre-SHA + git diff of the retired HF-196 callsites.

---

## §3 — Phases B, C, D — released, sequenced after E

Order after E: **C → D → B.** Rationale (dependency-driven, DD-prose): C removes the per-entity write pattern that consumed the 300s window; D removes the saturation source that stretched every round-trip; B then makes response death survivable as the structural guarantee rather than the daily crutch. All three invariants stand exactly as specified in the directive §5; amendments below only.

- **Phase C amendment:** the enrich loop's batch rewrite must also emit entity-phase pulses through the same VERBOSE/streamed surface as commit pulses (one observability spine — no entity-specific event vocabulary). The A2 timing EPG compares the same roster unit before/after on the same tier.
- **Phase D amendment:** the telemetry derive's `committed_data` count by `metadata->>proposalId` over 325k rows is the named contention source (A5). The in-progress panels stop reading the heavy derive entirely (cheap streamed spine only); the heavy derive runs once at settle/conclusion, not on poll. If a polling cadence remains for any surface, it is capped and evidenced.
- **Phase B amendment:** scope confirmed as the execution loop (A1 finding). The queue must be resumable from the durable spine such that a unit with **no batch row** is detected as unprocessed and processed on resume — this also closes the A3 gap operationally (a never-started unit cannot hide from a resume that walks the proposal's unit list rather than scanning batches). A3 remains named in §6A as a reconciliation-invariant gap, but Phase B's resume-from-proposal-list is the structural cover.

---

## §4 — Witness re-run criteria (amended per E.0)

As in the directive §5, with one amendment: "engine-visible Ventas = 160,443" becomes "engine-visible Ventas = the E.0-established single-generation true count, exact, with the E.0 evidence explaining any delta from 160,443 committed." All other criteria unchanged: 16/16 Tier-1, all 16 units committed (the 5 rosters via the repaired path), pulse panel truthful through the entity phase, designed completion, header/panel agreement.

---

## §5 — Reporting

Completion report per directive §6, plus: the E.0 anomaly resolution gets its own evidence subsection; the per-phase EPGs paste in phase-execution order (E, C, D, B). SR-43 governs closure. PR follows architect witness sign-off only.
