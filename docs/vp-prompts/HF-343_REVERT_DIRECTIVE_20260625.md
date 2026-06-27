# HF-343 REVERT — Close PR #600 and Delete Branch

> Embed `CC_STANDING_ARCHITECTURE_RULES.md` at top of execution.
> This file IS the prompt. Read fully before acting.
> **ULTRACODE MODE** — CC determines execution strategy autonomously.

---

## §0 — CC Standing Rules Header

**Standing rules binding:** SR-41 (contamination protocol), SR-43, SR-44.
**Substrate:** PR #600 was NEVER merged to main. Main is clean. This is branch cleanup, not a git revert.

---

## §1 — Problem Statement

PR #600 (HF-343: Persona Scope Enforcement) introduced regressions and was architecturally incomplete. The scope was silently narrowed to a single page (`/perform`) when the requirement was platform-wide data visibility enforcement. The PR also introduced a parallel auth path (`useAuthScope`) which was subsequently eradicated but left residual issues (non-functional persona switcher, unscoped `/stream` and `/insights/*` surfaces, slow login).

**Architect disposition: abandon PR #600 and start fresh.**

---

## §2 — Objectives

1. Close PR #600 without merging.
2. Delete the HF-343 branch (local and remote).
3. Confirm main is at the correct pre-HF-343 state.
4. Clean build on main passes.
5. Dev server on main confirms localhost:3000 responds normally.

---

## §3 — Constraints

- **SR-41:** Never force-push. The branch is deleted, not rewritten.
- **SR-44:** PR close is an architect action. CC closes via `gh pr close 600`. Architect confirms.
- **Do NOT cherry-pick, partially revert, or salvage any commits from the branch.** The entire branch is abandoned. The underlying concepts (scope resolver, data threading, capability-derived menu) will be rebuilt in a properly-scoped OB against a fresh branch.
- **Do NOT modify any files on main.** Main should already be clean. If it is not (i.e., if the PR was somehow merged), HALT and report immediately — that requires a `git revert <merge-SHA>` per SR-41.

---

## §4 — HALT Conditions

| ID | Condition | Action |
|---|---|---|
| HALT-A | `git log main --oneline -5` shows any HF-343 commit on main | STOP. PR was merged. Report the merge SHA. Architect will `git revert`. Do NOT revert autonomously — merges are architect-only (SR-44). |
| HALT-B | Branch cannot be deleted because other open PRs depend on it | STOP. Report the dependent PRs. |

---

## §5 — Execution Sequence

```bash
# 1. Confirm main has no HF-343 commits
git checkout main
git pull origin main
git log --oneline -10
# Verify: no commits from HF-343 (50c2e20b, 58317967, 59054360, b4c53a09, 59e58449, or any regression fix commits)
# If any appear → HALT-A

# 2. Close PR #600
gh pr close 600 --comment "Architect disposition: PR abandoned. Scope was silently narrowed to /perform; platform-wide enforcement will be rebuilt as a properly-scoped OB on a fresh branch."

# 3. Delete remote branch
git push origin --delete <branch-name>
# Get branch name from: gh pr view 600 --json headRefName

# 4. Delete local branch
git branch -D <branch-name>

# 5. Clean build on main
rm -rf .next
npm run build
# Must exit 0

# 6. Dev server
npm run dev
# Confirm localhost:3000 responds
```

---

## §6 — Proof Gates

| # | Gate | Evidence required |
|---|---|---|
| PG-1 | `git log main --oneline -10` shows no HF-343 commits | Pasted output |
| PG-2 | PR #600 closed | `gh pr view 600 --json state` → CLOSED (not MERGED) |
| PG-3 | Remote branch deleted | `git push origin --delete` output |
| PG-4 | Local branch deleted | `git branch -D` output |
| PG-5 | `npm run build` exits 0 on main | Pasted terminal output |
| PG-6 | `localhost:3000` responds | Dev server output |

---

## §6A — Residuals

1. **HF-343 scope will be rebuilt.** The data visibility + menu function enforcement will be re-scoped as a platform-wide OB covering every data-consuming surface (`/stream`, `/perform`, `/insights/*`, dashboards, Financial surfaces). Fresh branch, fresh directive, correct scope.
2. **The Phase 0 ADR findings are valid.** Diagnosis (C), operative cause (B) — the absence of scope narrowing in the read path — is architecturally correct. The resolver design concepts are sound. What failed was the scope of application (one page instead of every surface) and the introduction of a parallel auth path.
3. **PDR-05 remains OPEN.** The revert restores the pre-HF-343 state including the persona-switcher anti-pattern.

---

*HF-343 Revert · 2026-06-25 · vialuce.ai*
*Drafting discipline: INF_Structured_Compliant_Drafting_Reference_20260513.md*
