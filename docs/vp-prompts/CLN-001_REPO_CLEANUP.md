# CLN-001 — Repo Cleanup Before DIAG-024

**Classification:** Housekeeping (no new artifact category needed; this is operational hygiene)
**Authored:** 2026-04-27
**Why:** ADG-3 strict allow-list in DIAG-024 conflicted with carry-over untracked files. Cleanup eliminates the recurring stash trigger across sessions and commits the legitimate CLT-197 artifact that was orphaned when CLT-197 went straight from result to diagnosis without committing the prompt.
**Scope:** Three actions on `origin/main`. No code changes. No DIAG-024 work begins until CLN-001 closes.

---

## Items addressed

| # | Item | Status | Action |
|---|---|---|---|
| 1 | `.claude/settings.local.json` (tracked, modifies every session) | Recurring stash trigger | Untrack + gitignore |
| 2 | `.DS_Store` (recurring across `docs/`, etc.) | Recurring noise | Gitignore (untrack any tracked instances) |
| 3 | `docs/vp-prompts/CLT-197_BCL_BROWSER_VERIFICATION.md` (untracked, orphaned) | Legitimate artifact never committed | Commit to main (the branch CLT-197 actually executed against) |

After CLN-001 closes:
- `git status --short` returns clean (no `.DS_Store`, no `.claude/settings.local.json`, no orphaned vp-prompts)
- DIAG-024 ADG-3 passes without stashing
- Future CC sessions don't re-encounter the same noise

---

## CC PASTE BLOCK

---

# CC DIRECTIVE — CLN-001

## Standing Architecture Rules

- Rule 25/26/27 standard
- Rule 34: no bypass
- Rule 36: scope held to three actions; no code changes; no DIAG-024 work
- Korean Test: housekeeping; no domain vocabulary involved

## Architecture Decision Gate

```bash
cd ~/spm-platform || cd /Users/AndrewAfrica/spm-platform
git fetch origin --prune

# ADG-1: confirm on main, post-CLT-197 merge
git rev-parse origin/main
echo "Expected: be2e532146c9d5174627f7ae508d1399bc792adb"

# ADG-2: switch to main if not already
git checkout main
git pull origin main
git rev-parse HEAD

# ADG-3: snapshot starting state
git status --short
echo "Expected to see: .claude/settings.local.json modified; docs/vp-prompts/CLT-197_BCL_BROWSER_VERIFICATION.md untracked; docs/vp-prompts/DIAG-024_IMPORTER_ENGINE_ALIGNMENT.md untracked"
```

**HALT if:** ADG-1 SHA differs from `be2e5321` (substrate state diverged unexpectedly).

---

## PHASE 1 — Update .gitignore

### Phase 1.1 — Inspect current .gitignore

```bash
echo "=== Current .gitignore content ==="
cat .gitignore 2>&1 || echo "NO_GITIGNORE"
echo ""
echo "=== Existing entries for .DS_Store and .claude ==="
grep -nE "\.DS_Store|\.claude" .gitignore 2>&1 || echo "NO_MATCHES"
```

### Phase 1.2 — Add entries if missing

CC inspects the output and decides:
- If `.DS_Store` already present in .gitignore → skip that addition
- If `.claude/settings.local.json` (or `.claude/`) already present → skip that addition
- Otherwise append the missing entries

```bash
# Append only what's missing — CC composes based on Phase 1.1 output
# Suggested additions (CC reviews; only adds what isn't already present):
#
#   # OS noise
#   .DS_Store
#   **/.DS_Store
#
#   # Claude Code session-local state
#   .claude/settings.local.json

# Pseudocode CC adapts:
if ! grep -qE "^\.DS_Store$|^\*\*/\.DS_Store$" .gitignore 2>/dev/null; then
  echo "" >> .gitignore
  echo "# OS noise (CLN-001)" >> .gitignore
  echo ".DS_Store" >> .gitignore
  echo "**/.DS_Store" >> .gitignore
fi

if ! grep -qE "^\.claude/settings\.local\.json$|^\.claude/$" .gitignore 2>/dev/null; then
  echo "" >> .gitignore
  echo "# Claude Code session-local state (CLN-001)" >> .gitignore
  echo ".claude/settings.local.json" >> .gitignore
fi

echo "=== Updated .gitignore tail ==="
tail -20 .gitignore
```

### Phase 1.3 — Untrack files that are now ignored but still tracked

```bash
echo "=== Phase 1.3: untrack files newly covered by .gitignore ==="

# Untrack .claude/settings.local.json if it's tracked
if git ls-files --error-unmatch .claude/settings.local.json >/dev/null 2>&1; then
  git rm --cached .claude/settings.local.json
  echo "Untracked: .claude/settings.local.json"
fi

# Untrack any tracked .DS_Store files anywhere in the repo
TRACKED_DSSTORE=$(git ls-files | grep -E "\.DS_Store$" || true)
if [ -n "$TRACKED_DSSTORE" ]; then
  echo "$TRACKED_DSSTORE" | xargs git rm --cached
  echo "Untracked .DS_Store files:"
  echo "$TRACKED_DSSTORE"
else
  echo "No .DS_Store files tracked"
fi

git status --short
```

### Phase 1 Gate

| # | Criterion | Pass |
|---|---|---|
| G1.1 | `.gitignore` covers .DS_Store (recursive) and .claude/settings.local.json | grep returns matches |
| G1.2 | `.claude/settings.local.json` no longer tracked | `git ls-files .claude/settings.local.json` empty |
| G1.3 | No `.DS_Store` files tracked anywhere in repo | `git ls-files | grep .DS_Store` empty |

---

## PHASE 2 — Commit orphaned CLT-197 artifact

The CLT-197 BCL browser verification directive ran against `main` (PR #341 closed → PR #342 opened, merged → BCL re-imported on production substrate → October calc produced $19,280). The directive prompt itself was never committed because the session pivoted from result to diagnosis. The artifact is legitimate; it belongs on main alongside the work it directed.

```bash
echo "=== Phase 2: confirm CLT-197 artifact present ==="
ls -la docs/vp-prompts/CLT-197_BCL_BROWSER_VERIFICATION.md
wc -l docs/vp-prompts/CLT-197_BCL_BROWSER_VERIFICATION.md
echo ""
echo "First 30 lines (sanity check it's the right artifact):"
head -30 docs/vp-prompts/CLT-197_BCL_BROWSER_VERIFICATION.md
```

### Phase 2 Gate

| # | Criterion | Pass |
|---|---|---|
| G2.1 | File present at expected path | `ls` returns file |
| G2.2 | File header references CLT-197 | `head` shows CLT-197 title |

If artifact looks correct, proceed to Phase 3 commit. If not, HALT.

---

## PHASE 3 — Commit and push

```bash
echo "=== Phase 3: stage and commit ==="

git add .gitignore
git add docs/vp-prompts/CLT-197_BCL_BROWSER_VERIFICATION.md
# If the rm --cached operations from Phase 1.3 staged removals, those are also included
git status --short
echo "---"

git commit -m "CLN-001: gitignore .DS_Store and .claude/settings.local.json; commit orphaned CLT-197 vp-prompt"

git push origin main
git log -1 --format='COMMIT_SHA=%H'
```

### Phase 3 Gate

| # | Criterion | Pass |
|---|---|---|
| G3.1 | Commit pushed | SHA pasted |
| G3.2 | Working tree clean | `git status --short` returns only `?? docs/vp-prompts/DIAG-024_IMPORTER_ENGINE_ALIGNMENT.md` (the next directive's prompt, intentionally untracked until DIAG-024 commits) |

---

## PHASE 4 — Verify clean state for DIAG-024

```bash
echo "=== Phase 4: clean state verification ==="
git status --short
echo "---"
echo "Expected:"
echo "  ?? docs/vp-prompts/DIAG-024_IMPORTER_ENGINE_ALIGNMENT.md  (intentional, will be committed at DIAG-024 close)"
echo "  (no other entries)"
```

### Phase 4 Gate

| # | Criterion | Pass |
|---|---|---|
| G4.1 | Only DIAG-024 prompt remains untracked | `git status --short | grep -v 'DIAG-024_IMPORTER'` returns empty |

---

## ANTI-PATTERN CHECKS

- [ ] No code changes
- [ ] No new artifact categories invented
- [ ] No DIAG-024 work attempted
- [ ] All evidence pasted (Rule 27)
- [ ] Korean Test PASS

---

## CC AUTONOMY

Report at:
- (a) Any HALT condition during ADG or any phase
- (b) Phase 4 close with clean working tree confirmed and CLN-001 commit SHA

After CLN-001 closes, architect re-issues "PROCEED with DIAG-024" — DIAG-024 then runs against a clean tree without ADG-3 conflicts.

---

*CLN-001 · Repo cleanup before DIAG-024 · Predecessor: DIAG-024 ADG-3 HALT (working tree dirty beyond allow-list) · Successor: DIAG-024 re-issue against clean tree · 2026-04-27*
