# OB-203 Phase 6 — Follow-On Items

**Date:** 2026-06-13 · **Source:** OB-203 Phase 6 witness sessions (#1–#8) + HF-285 · **Status:** sequenced post-arc
Each is a distinct work item. Witness #8 signed off (16/16 committed, zero LLM, 162,956 rows) with these open.

---

## Correctness items

### 1. Single-flight resume lease (DIAG-066 Q2)
The liveness lease (360s) is shorter than legitimate large-unit commit time (~371s for 160k rows), and there is no mutual exclusion across concurrent invocations. HF-213 supersession preserves data correctness but not work-efficiency. Evidence: warm witness #7 Ventas double-processed (gen2 created 371s after gen1, past the 360s lease, on a still-alive owner); witness #8 Ventas held `skip_in_flight` (narrower window this run, but not structurally eliminated). **Distinct HF.** Fix family: a held claim/lock keyed by content unit + session, OR a lease longer than the worst-case large-unit commit, OR both.

### 2. Flywheel correction from execution-failure evidence
The flywheel increments `match_count` and reinforces `confidence` on every encounter, regardless of whether the downstream EXECUTION succeeded. Portada classified `plan@80%` on cold; the plan-skeleton produced zero components and was correctly refused (HF-264); yet the flywheel still stores `plan@80%` and `match_count` grows, making the wrong classification progressively harder to override. The graph prior flipped Portada on warm #7 but could NOT on warm #8 (`match_count=3` — the reinforced prior won). **Missing piece:** a terminal execution failure for a classification should DEMOTE that stored fingerprint's confidence (the HF-213/DI-7 "failed runs must not seed memory" principle, extended from atoms to fingerprint classification). **Distinct HF.**

### 3. Entity-resolution false-positive index detection
Entity resolution skipped Sucursales and Resumen_Sucursal with `identifier column location_id looks like row indices`. `location_id` is 1–6 for 6 locations — a false positive in the index-detection heuristic (small sequential integers read as row indices). Not blocking (entities existed from prior runs) but entity ENRICHMENT was skipped for these sheets on re-import. Fix: a minimum-cardinality threshold, or a classification-aware override (an entity sheet's identifier is an entity id, not a row index — consistent with HF-285-B's classification-aware posture).

---

## Efficiency items

### 4. Poll discipline / adaptive backoff / SSE
The client polls `session-state` every ~2s indefinitely — including AFTER analyze returns with the proposal on screen, and AFTER the completion screen renders. Evidence across all 8 witness runs. Needs: stop polling at terminal state, or switch to SSE/long-poll for progress (Phase D demoted the heavy derive but the cheap poll cadence is still unbounded).

### 5. Post-commit UI stall indicator
The completion state reaches the client BEFORE the settle audit and entity enrichment finish server-side. The user sees "Import Complete" then waits 15–30s with no feedback while entity resolution (774 rows linked), rule-set assignment (356 entities), and three settle audits run. Needs: a visible processing indicator between data commitment and the final completion screen.

### 6. Companion cleanup TTL (HF-285-D §6A)
Component D's parse-once companion artifacts accumulate under `{tenant}/parsed/{fileHash}.json.gz` with no cleanup. Needs: hook the session-cleanup mechanism, or a 24h TTL.

---

## Observation items (no independent fix — resolve structurally via the above)

### 7. Settle-audit divergence (resume-caused)
Witness #8 settle audit reported DIVERGENCE on `rows` / `pulses(formula)`, caused by the resume double-committing reference units (both invocations count pulses; the DB holds only the latest generation via HF-213). Data integrity intact. Resolves structurally when item #1 (single-flight) eliminates the double-commit. No independent fix.

### 8. Portada classification variance
Portada oscillates between `plan@80%` and `reference@58%` depending on CRR posterior strength vs graph-prior override. Self-corrects via the graph prior on some runs, requires manual assign on others. Resolves structurally when item #2 (flywheel correction) demotes the `plan` classification after the zero-component execution failure. No independent fix.

### 9. Clean-slate scope note
The clean-slate wipe (DIAG-064) did not include `rule_sets` or `rule_set_assignments`; the tenant's plan learning survived (rule_set `001fe318`, created 2026-06-11, 1 component). If a future clean slate intends to zero plan learning too, the scope must be extended to those two tables.
