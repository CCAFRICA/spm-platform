# DIAG-064 — Witness Analyze Regression Post-Mortem (OB-203 Phase 6B)

**Date:** 2026-06-12 · **Discipline:** read-only; zero fix code (one read-only timing script committed: `web/scripts/diag/diag064-witness-timing.ts`)
**Witness session:** `e0f86141-1729-4d9e-a53d-6ddf3ee46580`, tenant `3d354bfa…` · **Disposes:** `docs/vp-prompts/OB-203_PHASE-6B_ANALYZE_REGRESSION_DIAG_20260612.md`
**Verdict in one line:** **NO code regression exists — the witness analyze ran `main` (2026-06-11), not `OB-203-phase-6`.** A parallel session sharing this working directory checked the tree out from `OB-203-phase-6` to `main` at 15:00:36, six minutes and 52 seconds BEFORE the witness's first analyze signal landed (15:07:28, DB timestamp). Every §1 symptom is main's code, byte-for-byte. `origin/OB-203-phase-6` is intact at `f05a562e`.

---

## Timeline of record (reflog ISO + DB timestamps, all -0700)

```
14:53:01  f05a562e committed — OB-203-phase-6 tip, completion report, tree clean   (git reflog)
15:00:36  checkout: moving from OB-203-phase-6 to main                             (git reflog)
          → main = d38d6355, authored Thu Jun 11 19:23:11 2026 (the day BEFORE the fixes)
15:02:34  checkout: moving from main to diag/063-mir-demo-capability-assessment    (git reflog)
15:04:48  bbfa3cb8 "DIAG-063 Phase 1: directive committed" (+173 lines, additive)  (parallel session)
15:07:28  WITNESS analyze first signal lands (comprehension:session_lifecycle)     (DB, 99 signals)
15:07:42  WITNESS analyze last signal (interaction:import)                         (DB)
15:12:57  dc79a10a "DIAG-063 Phase 1: anchoring evidence…" (+189 lines, additive)  (parallel session)
```
Witness timing script output (`diag064-witness-timing.ts`, read-only):
```
witness session signals: 99
first: 2026-06-12T22:07:28.622444+00:00 (comprehension:session_lifecycle)
last:  2026-06-12T22:07:42.375224+00:00 (interaction:import)
```
The dev server on :3001 was started from THIS directory after the 15:00:36 checkout — it compiled
`main@d38d6355` / `diag/063` (same content for the SCI surface: the two DIAG-063 commits are purely
additive — +173/+189 lines, zero modifications to web/src). "Same tree" in §1.6 is literally true and
is the cause: **one working directory, two sessions — branch state is process-global.**

`git merge-base d38d6355 f05a562e` = `d38d6355` — main is a STRICT ANCESTOR of the phase branch.
The morning's fixes exist ONLY on `OB-203-phase-6` (unmerged BY DESIGN: SR-43/§6 — merge follows
witness sign-off). The witness therefore exercised the pre-fix world.

## Q1 — Where did the graph stage go? NOWHERE — it never existed on main.

```
git grep -c "workbookGraph|WORKBOOK-GRAPH|GRAPH-PRIOR" d38d6355 -- …/analyze/route.ts  → ZERO hits
git grep -c  …                                          f05a562e -- …/analyze/route.ts  → 11
git ls-tree d38d6355 -- web/src/lib/sci/workbook-graph.ts → (absent)
git ls-tree f05a562e -- web/src/lib/sci/workbook-graph.ts → (present)
git log --oneline d38d6355..f05a562e --diff-filter=A -- web/src/lib/sci/workbook-graph.ts
  7507ad8e OB-203 Phase 6 (1): workbook graph synthesis — derived, flag-only (DI-3/DI-4)
```
Not removed, not reordered, not behind a condition: the analyze that ran was a DIFFERENT FILE
VERSION (main's), which predates the stage's existence.

## Q2 — Where did the 1a ratio fix go? Same answer: main predates it.

main (`d38d6355`, content-profile.ts:641-643) — the population formula the architect saw:
```ts
const identifierRepeatRatio = idField && idField.distinctCount > 0
  ? rowCount / idField.distinctCount        // ← 160,443 ÷ 21 = 7640.14 exactly (§1.2)
  : 0;
```
branch (`f05a562e`, content-profile.ts:647-649) — the 1a fix:
```ts
const identifierRepeatRatio = idField && idField.distinctCount > 0
  ? idRatioBasis / idField.distinctCount    // sample-row basis (commit 97765bae)
  : 0;
```
`git log d38d6355..f05a562e -- content-profile.ts` → `97765bae OB-203 D15.2 rulings: Empleados
repeat-ratio fix (1a) + Portada zero-components ignore (1b)` — branch-only. Not reverted, not
recomputed elsewhere, not bypassed: the fixed function was never in the executed tree.

## Q3 — Why do HC patterns adjudicate again? Main has no D15 arbitration to stop them.

```
d38d6355 analyze/route.ts: 1 hit  — :473 [SCI-HC-PATTERN] … NO_MATCH (the log line only;
                                     pattern WINS whenever it matches — no prior arbitration)
f05a562e analyze/route.ts: 3 hits — :610 + :633 [SCI-GRAPH-PRIOR] symmetric non-veto arbitration
                                     (hc→graph and crr→graph), :637 NO_MATCH retained
git grep -c "SCI-GRAPH-PRIOR|applyGraphPrior|graph prior" d38d6355 → ZERO; f05a562e → 3
```
The morning's "16× NO_MATCH / Level-2 retained with graph-prior arbitration" is branch behavior.
On main, the 1a-less population ratios feed the HC pattern conditions (rosters look like
high-repeat fact tables), the patterns match, and nothing arbitrates them — §1.3 exactly.

## Q4 — Why doesn't Tier-1 carry the stored classification? It never did directly — alignment came from D15, which main lacks.

`fingerprint-flywheel.ts` is IDENTICAL in classification handling at both SHAs (27/27 references) —
Tier-1 carries bindings and tier, not a classification override, in BOTH worlds. The morning's
agreement between stored fingerprint classifications and final outcomes was produced by the D15
graph-prior arbitration steering Level-2 outcomes — absent on main (Q3). The Phase C warm-path
role-scramble residual is NOT implicated in §1.4: it scrambles semanticRoles WITHIN bindings and
cannot move a unit's classification; the contradiction is fully accounted for by main's missing
arbitration over 1a-less profiles. (The residual stands on its own evidence in the Phase C ADR.)

## §1.5 — SCI-DEDUP adjudicated: it does NOT prove current code.

```
d38d6355:…/analyze/route.ts:643: [SCI-DEDUP] Removed split duplicate …   ← present on MAIN too
f05a562e:…/analyze/route.ts:807: (same line)
```
The line exists at BOTH vintages; it was "previously unseen" because the branch's graph/1a-corrected
classifications never produced the duplicate state that triggers it. Reachability, not vintage —
the inference that the witness ran current code is refuted.

## Q5 — Single root or several? ONE root, and it is not code.

No commit in the entire phase sequence touched the analyze surface:
```
git log --oneline 1f1d7d59..f05a562e -- web/src/app/api/import/sci/analyze/   → EMPTY
git log --oneline 1f1d7d59..f05a562e -- content-profile.ts workbook-graph.ts hc-pattern-classifier.ts → EMPTY
```
All four symptoms are one event: **the working tree's checked-out branch changed under the witness.**
Class (E952, Adjacent-Arm): **a shared mutable execution environment across concurrent agents** —
the working directory is a singleton; `git checkout` by any session retargets every dev server and
every subsequent run in that directory, silently. The Phase 6B work itself is unharmed
(`origin/OB-203-phase-6` = `f05a562e`; the parallel DIAG-063 commits are additive-only on their own
branch). The witness re-run executed the one world that was guaranteed to fail.

## §1.6 environment adjudication — IMPLICATED, with evidence

Two servers shared the ONE directory. The :3001 server (witness) was started after the 15:00:36
checkout → compiled main-vintage code (reflog + DB timestamps above; symptom-to-source byte
matches in Q1–Q4). The :3000 server (CC's, started 14:5x from f05a562e) would also have
hot-recompiled main-vintage code on any later request — same directory. At DIAG time, zero
`next dev` processes are running.

## Disposition inputs (no fixes shipped; for architect ruling)

1. **Re-arm the witness:** check this directory out to `OB-203-phase-6` (or run the witness from a
   dedicated `git worktree` of that branch) and restart the witness dev server from it.
2. **Worktree-per-session discipline:** concurrent sessions in this repo should each own a
   `git worktree` — checkouts stop being process-global. Candidate standing-rule amendment.
3. **§4 endorsed with this DIAG as the existence proof:** a classification-equality check against
   the known proof file in the pre-witness gate would have caught the wrong-vintage tree in seconds
   (16 classifications vs the morning run's), before any witness time was spent — exactly the
   Phase-7 per-tenant anchor pattern.
4. Session `e0f86141…` left untouched as evidence (its 99 signals and any record row carry
   main-vintage truth; no proposal interaction performed).

**HALT** per directive §3.
