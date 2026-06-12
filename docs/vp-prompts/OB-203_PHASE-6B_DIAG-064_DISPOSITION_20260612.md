# OB-203 Phase 6B — DIAG-064 Disposition: Witness Voided, Re-Arm Protocol (Architect)

**Date:** 2026-06-12
**Disposes:** `docs/diagnostics/DIAG-064_ANALYZE_REGRESSION_OUTPUT.md` (committed 7a10a147)
**File location:** `docs/vp-prompts/OB-203_PHASE-6B_DIAG-064_DISPOSITION_20260612.md` (CC commits via its worktree)

## §0 — Nomenclature correction (architect SOP violation, owned)

The regression DIAG's directive was mis-filed by the architect as `docs/vp-prompts/OB-203_PHASE-6B_ANALYZE_REGRESSION_DIAG_20260612.md` — DIAG artifacts carry the DIAG prefix and live in `docs/diagnostics/` as a directive/output pair. With your next commit: `git mv` that file to `docs/diagnostics/DIAG-064_ANALYZE_REGRESSION_DIRECTIVE.md` so it sits beside `DIAG-064_ANALYZE_REGRESSION_OUTPUT.md`. Standing for the remainder of the arc: every DIAG is named `DIAG-NNN_*_DIRECTIVE.md` / `DIAG-NNN_*_OUTPUT.md`, co-located in `docs/diagnostics/`; OB/HF naming never wraps a DIAG.

## §1 — Findings accepted; witness attempt VOIDED

DIAG-064 accepted in full. There is no code regression: the witness analyze executed `main` (2026-06-11 vintage) after a parallel session's checkout retargeted the shared working directory; `git merge-base` confirms main is a strict ancestor lacking the entire Phase 6 analyze surface (graph prior, 1a ratio, D15 arbitration). The witness attempt on session `e0f86141…` is **voided — wrong vintage — not failed on merits**. The morning warm run (`d8085364…`) remains the last valid behavioral evidence of `OB-203-phase-6`. The §1.5 SCI-DEDUP correction (reachability, both vintages) is accepted. The Q5 class finding is ratified as stated: **a shared mutable execution environment across concurrent agents** — the singleton working directory lets any session's checkout silently retarget every dev server in it.

## §2 — Worktree isolation: RULED for this arc, standing-rule candidate endorsed

Effective immediately for OB-203: every concurrent session and every witness run operates in its **own dedicated git worktree**; the primary checkout is never assumed stable across sessions. CC's worktree commit of DIAG-064 is ratified as the pattern. As a platform standing rule ("worktree-per-session; no agent operates in another session's checkout; witness runs execute only from a worktree pinned to the branch under test"), it is endorsed and queued for the architect's standing-rules ratification pass alongside the Scale Contract rule.

## §3 — Pre-witness vintage attestation: MANDATORY from now on

No witness run starts until the serving tree's vintage is attested and pasted: `git -C <worktree> rev-parse --abbrev-ref HEAD && git -C <worktree> rev-parse HEAD`, matching the branch and SHA under test. This gate is procedural and immediate. The fuller classification-equality pre-check against the proof file (§4 of the regression DIAG directive, endorsed by DIAG-064 as existence-proven) is folded into the Phase 7 regression plan's per-tenant checks rather than built ad hoc now.

## §4 — Flywheel contamination check: GATES the re-arm (read-only, evidence pasted)

The voided run was not read-only: main-vintage analyze **updated all 16 fingerprints** (matchCount 3→4, confidence 0.75→0.8000) while classifying Empleados=transaction and four rosters=target. Before any re-run, CC reads (tsx script, service-role) and pastes for each of the 16 fingerprints: hash, matchCount, confidence, stored classification, and binding claimedBy summary — compared against the corrected post-1a state (Empleados `7707e8553823` MUST be entity).
- If stored classifications/bindings are intact (the update touched only match statistics): state it with the pasted evidence and proceed to §5.
- If contaminated: HALT with the pasted delta; repair follows the existing 1a fingerprint-correction precedent under a fresh architect go — no silent repair.

## §5 — Re-arm protocol

1. CC creates a dedicated witness worktree pinned to `OB-203-phase-6` at `f05a562e` (or current branch head if this disposition's commit advances it), runs the §3 attestation, builds clean (`rm -rf .next && npm run build`), and hands the architect a single start command for that worktree with the attestation output pasted.
2. Architect confirms zero other dev servers (`lsof -i :3000 -i :3001` empty), starts the witness server (it will take port 3000), and runs the witness: same file, same tenant `3d354bfa…`, no reset.
3. Adjudication criteria unchanged: HALT-1 disposition §4 + Amendment 2 (16/16 Tier-1; all 16 units committed including the 5 rosters; pulse-panel truth through the entity phase; header/panel agreement; designed completion; engine-visible Ventas exact via the gate; settle audit EQUAL on screen; database responsive throughout — no auth timeouts, no display query >2s).
4. Session `e0f86141…` remains untouched as DIAG-064 evidence. The voided session's proposal is never interacted with.

## §6 — Residual recorded

Concurrent-agent execution isolation (worktrees, and eventually per-session ports/processes) joins the standing-rules ratification queue with the Scale Contract. DIAG-064 is the existence proof for both this and the classification-equality pre-check.
