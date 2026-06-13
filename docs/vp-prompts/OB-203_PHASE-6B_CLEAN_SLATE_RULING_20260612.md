# OB-203 Phase 6B — Clean-Slate Ruling: MX Witness Scope (Architect)

**Date:** 2026-06-12
**Supersedes:** the DIAG-064 surgical-repair approach for any further memory repair; **withdraws DIAG-065** as a blocking step (the number stays consumed; if forensic value is wanted later it may be executed post-arc as read-only).
**Root cause on record:** witness attempt 5's all-reference outcome was caused by the architect's binding-reset ruling — correct code, self-inflicted state. It additionally exposed two pre-existing platform defects (§3), neither introduced by old code nor by the repair.
**File location:** `docs/vp-prompts/OB-203_PHASE-6B_CLEAN_SLATE_RULING_20260612.md` (CC commits via the witness worktree)

## §1 — Ruling: full scoped wipe, then cold rebuild, then warm witness

Surgical repair of the flywheel is abandoned. Hand-editing a destructively-overwritten memory store has produced a new partial state on each attempt; partial states are the recurring failure. The repair is **deletion to zero within scope, then organic rebuild by correct code**.

**Wipe scope (tenant `3d354bfa-b298-48dd-88a0-9f8c5a00be4e` + file `datos-cadena-restaurantes-mx.xlsx` learning state) — ALL of:**
1. The 16 sheet fingerprints for the file (every hash in the known set)
2. All atom-store rows learned from this file (incl. the 56 morning atoms — no partial memory survives)
3. All classification_signals / session state for this tenant's import sessions
4. All `import_batches` + `committed_data` for the tenant
5. All entities for the tenant
6. All `import_session_telemetry` rows for the tenant
7. Any remaining proposal/session records for sessions `d8085364…`, `e0f86141…`, `fc2318fe…`

Execution: tsx script (service-role) from the witness worktree, scope-guarded to the tenant ID and the file's fingerprint hash set — **abort with zero writes on any row outside scope**. Other tenants' learning state (BCL, Meridian, CRP) is untouchable; the script proves its scope in output. Post-wipe verification read pasted: zero rows in every category above. Script + output committed to `docs/diagnostics/` as `DIAG-064_CLEAN_SLATE_OUTPUT.md` (closing the DIAG-064 incident chain).

## §2 — Then: cold run (rebuild) → warm run (witness)

1. **COLD RUN (architect, not a witness):** same worktree/server, import the file. Expect full comprehension — LLM calls on all sheets, atoms learned, fingerprints created, bindings written, classifications from fresh inference. All 16 units committed. This run also exercises the Phase 6B machinery cold (batch entities, durable telemetry, resumable loop) — record its evidence; it is the cold-start baseline the arc never had.
2. **Architect checkpoint:** classifications on the cold proposal reviewed against ground truth (the proposal's assign action is the designed remedy for any miss — use it; that is product behavior, not failure). Import completes; completion screen + settle audit witnessed.
3. **WARM RUN = THE WITNESS:** re-import, same file, same tenant. Criteria as in force, restored to full strength — **including binding injection** (bindings exist again, written by correct code): 16/16 Tier-1, zero LLM, bindings injected, classifications inherited correct, all 16 units committed, pulse truth through the entity phase, designed completion, settle audit EQUAL, engine-visible Ventas exact, DB responsive throughout.

## §3 — Defects named (fix in sequence, NOT blocking the witness — the clean path does not traverse them)

- **HF (next number from repo): warm-path roles fallback** — a Tier-1 unit whose stored bindings are absent/empty re-derives roles through the cold inference path for that unit; the warm path never proceeds roles-less. One invariant, no shapes.
- **HF (next number): graph-prior information gate** — a workbook graph with zero edges / all-default roles does not arbitrate; defaults never penalize evidence-bearing posteriors. One invariant.
- **Standing (already named under SR-34, now twice-evidenced):** learning writes are destructive and unversioned — fingerprint updates overwrite classification/bindings in place with no history. Structural successor: versioned/append-with-supersede memory writes (the HF-213 pattern applied to memory). Sequenced post-arc with B3.
- **Observation to carry into the cold run (replaces DIAG-065 Q4):** architect saw no atom/telemetry counters during attempt 5's analyze. Watch the cold run's in-progress surface; if counters are absent there too, it is a Phase D display defect and gets its own HF; if present, attempt 5's blanks were truthful zeros.

## §4 — Sequence

Wipe + verification → cold run → architect checkpoint → warm witness → sign-off → ARTIFACT SYNC (covering this incident chain: vintage contamination, repair attempt, roles-less failure, clean slate, both named HFs) → PR per SR-43. PR 486 stays held until after sign-off.
