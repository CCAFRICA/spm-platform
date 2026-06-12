# OB-203 Phase 6B — Flywheel Contamination Repair Ruling (Architect)

**Date:** 2026-06-12
**Disposes:** `docs/diagnostics/DIAG-064_S4_CONTAMINATION_EVIDENCE.md` (65608b31)
**File location:** `docs/vp-prompts/OB-203_PHASE-6B_CONTAMINATION_REPAIR_RULING_20260612.md` (CC commits via the witness worktree)

**Micro-EECI:** Efficiency — one repair invariant (restore only what has provenance; re-learn the rest), no per-row patching. Efficacy — post-repair §4 re-read matches the morning truth map exactly, pasted. Comprehensive — DIAG-064 §4 evidence, session d8085364 durable signals, DS-020, 1a precedent consulted. Innovate — exercises the flywheel's re-learning path as the recovery mechanism, proving memory is reconstructible from atoms.

## §1 — Ruling

1. **Classifications (10 contaminated rows): RESTORE** to the morning truth map. Provenance is real — the targets derive from session `d8085364`'s durable signals, cited per row in the evidence file. 1a precedent, applied at scale.
2. **Bindings (all 16 rows): RESET; re-learn via the normal flywheel write on the next clean run.** Restore-from-inference is REJECTED as fabricated provenance — the platform never writes memory it cannot cite. The intact atom store (all 56 rows, morning timestamps) is the durable memory; sheet-level bindings are a derived acceleration layer and re-deriving it is the design, not a concession.
3. **Statistics (all 16 rows): DEMOTE** to pre-contamination truth — match_count 4→3, confidence 0.8000→0.75. The voided run was not a match and may not be counted as one.
4. **Atom store: UNTOUCHED** — verified clean; no write of any kind.

## §2 — Execution discipline

- Repair runs as a tsx script (service-role) from the witness worktree; the script and its full output are committed beside the evidence file as `DIAG-064_S4_REPAIR_OUTPUT.md` in `docs/diagnostics/`.
- **Verification gate:** immediately after repair, re-run the §4 contamination read verbatim and paste all 16 rows — classifications must equal the truth map, bindings empty/reset state, statistics at 3 / 0.75. Any row off: HALT, no manual nudging.
- No other fingerprint, atom, signal, or committed_data row is touched. Tenant data is not the repair surface.

## §3 — Witness criterion amendment (consequence of §1.2)

The binding-injection criterion for the re-armed witness becomes: **bindings re-learned and written through the normal flywheel path during the run, visible in telemetry** (injection counts may be partial/zero by design of this repair; any gap must be attributable to the documented reset and nothing else). All other criteria stand unchanged (HALT-1 §4 + Amendment 2 + DIAG-064 disposition §5.3): 16/16 Tier-1, zero LLM, correct classifications inherited from the restored fingerprints, all 16 units committed, pulse truth through the entity phase, designed completion, engine-visible Ventas exact, settle audit EQUAL, database responsive throughout.

## §4 — Sequence after verification passes

Proceed directly to the §5 re-arm steps (worktree exists at `/Users/AndrewAfrica/spm-platform-ob203-witness`, pinned to OB-203-phase-6): npm install + `.env.local`, clean build, vintage attestation pasted (branch + SHA), single start command handed to the architect. The §7 ARTIFACT SYNC block remains owed with this next report — fold the repair into it (MC: contamination incident + repair as a recorded item; SUBSTRATE: re-learning-as-recovery as an ICA capture candidate).
