# OB-203 Phase 6 — PR Creation and SR-43 Closure

**Date:** 2026-06-13
**Type:** SR-43 closure (merge + verification + documentation)
**Branch:** `OB-203-phase-6` → `main`
**Witness sign-off:** Architect-signed, warm witness #8, 16/16 committed, zero LLM, 162,956 rows

---

## §0 — CC Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. SR-43 governs: ship completes the work item — merge + production verification + completion report with SHA.

---

## §1 — Task

Create the PR from `OB-203-phase-6` → `main`. This is the closure step for OB-203 Phase 6 and HF-285. No code changes — the branch is witness-attested at `8f04b7e7`.

---

## §2 — PR Creation

```
gh pr create --base main --head OB-203-phase-6 \
  --title "OB-203 Phase 6 + HF-285: SCI Pipeline Binding Unification and Efficiency" \
  --body "$(cat <<'BODY'
## What ships

### OB-203 Phase 6 — SCI Multi-Sheet Bulk Ingest
162,956-row / 16-sheet MX Restaurant workbook import, cold and warm lifecycle proven.
Phases E/D/C/B built and closed across this arc. Clean-slate wipe, contamination repair,
DIAG-062/063/064 cascade resolved.

### HF-285 — SCI Pipeline Binding Unification and Efficiency (DIAG-066)

**Component A — Gate Unification (1047d979)**
processEntityUnit now falls back to the canonical HC surface (findHcRole) when the
semantic binding is absent. Fixes 5 entity sheets that failed on every warm import.

**Component B — Classification-Aware Identifier Role (fdf751e9)**
New structural predicate isEntityIdentifierAgent. Fixed both copies of the cardinality
fallback (agents.ts + negotiation.ts). Prevents flywheel from storing divergent
semanticRole on future cold writes.

**Component C — Concurrent LLM Comprehension (9688cdbb)**
p-limit, SCI_LLM_CONCURRENCY=4, Promise.allSettled barrier. Cold analyze: 229s → 111s
(51.8% improvement). Classifications concurrency-invariant (proven).

**Component D — Parse-Once Companion Artifact (be0bdc49)**
Gzipped companion (6.5MB), content-hash keyed. Execute/resume reads companion instead
of re-parsing xlsx. Read 4s replaces parse 34s.

**Component E** — Closed, no code. Profiling already samples to 50 rows.

### Diagnostics
- DIAG-066: Warm-Path Entity Binding Gap (a14265f8) — dual-surface defect proven,
  fix target delivered, Components A+B implemented.

### Witness evidence
- Warm witness #8: 16/16 committed, zero LLM, 184 bindings injected, $0 cost
- Five previously-failing entity sheets committed via HC fallback:
  Sucursales (location_id), Menus (menu_id), Resumen_Sucursal (location_id),
  Resumen_Menu (item_id), Resumen_Empleado (empleado_id)
- Component D companion HIT on resume: 162,956 rows in 8842ms (xlsx parse skipped)
- Ventas skip_in_flight on resume (lease held this run)
- HF-213 supersede on every unit
- Settle audit: DIVERGENCE on rows/pulses(formula) — caused by resume double-committing
  reference units; data integrity intact. Resolves with single-flight HF.

## Follow-on items (not in this PR)

See "Identified items" section below.

BODY
)"
```

---

## §3 — Post-PR Housekeeping

After the PR is created:

### 3.1 — Worktree removal
```
git worktree remove /Users/AndrewAfrica/spm-platform-ob203-witness
```
Only after the PR merges (Andrew will merge via GitHub). Do NOT remove before merge.

### 3.2 — PR 486 (DIAG-063, HELD)
Check status of PR #486. If it was held pending OB-203 Phase 6 sign-off, it can now be unholded. Report its current state.

### 3.3 — Scratch tenant cleanup
The HF-285 measurement scratch tenants (cold-measure concurrent + serial runs) are analyze-only (no committed_data/entities). List which scratch tenants exist (`1f4f0511`, `336af2a7`, `098f4915`, or any created during C/D proof gates). Report — do NOT delete without architect confirmation.

---

## §4 — Identified Follow-On Items

These items were surfaced during OB-203 Phase 6 witness sessions. Each is a distinct work item, sequenced post-arc. Include this list in the PR body AND record it in a file at `docs/OB-203_PHASE_6_FOLLOWON_ITEMS.md` committed on the PR branch before the PR is created.

### Correctness items

**1. Single-flight resume lease (DIAG-066 Q2)**
The liveness lease (360s) is shorter than legitimate large-unit commit time (~371s for 160k rows). No mutual exclusion across concurrent invocations. HF-213 supersession preserves correctness but not efficiency. Evidence: warm witness #7 Ventas double-processed; warm witness #8 Ventas held (narrower but not eliminated). Distinct HF.

**2. Flywheel correction from execution failure evidence**
The flywheel increments matchCount on every encounter regardless of whether execution succeeded or failed. Portada classified plan@80% on cold; plan-skeleton produced zero components and was correctly refused (HF-264); but the flywheel still stores plan@80% and matchCount grows, making the wrong classification harder to override. The graph prior flipped it on warm run #7 but couldn't on warm run #8 (matchCount=3). The missing piece: when a classification produces a terminal execution failure, that failure evidence should demote the stored confidence. Distinct HF.

**3. Entity resolution false-positive index detection**
Entity resolution skipped Sucursales and Resumen_Sucursal batches: `identifier column location_id looks like row indices`. Location IDs are 1–6 for 6 locations — a false positive in the index-detection heuristic. Not blocking (entities existed from prior runs), but entity enrichment skipped for these sheets on re-import. The heuristic needs a minimum-cardinality threshold or a classification-aware override.

### Efficiency items

**4. Poll discipline / adaptive backoff / SSE**
The client polls session-state every ~2s indefinitely, including after analyze returns and the proposal is on screen, and continues after the completion screen renders. Multiple evidence instances across all 8 witness runs. Needs: stop polling at terminal state, or switch to SSE/long-poll for progress.

**5. Post-commit UI stall indicator**
The completion state reaches the client before settle audit and entity enrichment finish server-side. User sees "Import Complete" then waits 15–30s with no feedback while entity resolution (774 rows linked), rule_set assignment (356 entities), and three settle audits run. Needs: visible processing indicator between data commitment and the final completion screen.

**6. Companion cleanup TTL**
Component D's companion artifacts accumulate under `{tenant}/parsed/`. No cleanup mechanism exists. Needs: hook session cleanup or 24h TTL. Named in HF-285 §6A.

### Observation items (no fix needed, tracking only)

**7. Settle audit divergence (resume-caused)**
DIVERGENCE on rows/pulses(formula) is caused by the resume double-committing reference units (both invocations count pulses; DB has only the latest generation). Resolves structurally when the single-flight HF (#1 above) eliminates the double-commit. No independent fix needed.

**8. Portada classification variance**
Portada oscillates between plan@80% and reference@58% depending on CRR posterior strength vs graph-prior override. Self-corrects via graph prior on some runs, requires manual assign on others. Resolves structurally when flywheel correction (#2 above) demotes the plan classification after zero-component execution failure. No independent fix needed.

**9. Clean-slate scope note**
The clean-slate wipe did not include `rule_sets` or `rule_set_assignments`. The tenant's plan learning survived (rule_set `001fe318`). If a future clean slate intends to zero plan learning too, the scope must be extended.

---

## §5 — Completion

Report:
- PR number and URL
- SHA at head of OB-203-phase-6 at PR creation
- Worktree status (still present until merge)
- PR 486 status
- Scratch tenant inventory
- Confirmation that `docs/OB-203_PHASE_6_FOLLOWON_ITEMS.md` is committed and included in the PR
