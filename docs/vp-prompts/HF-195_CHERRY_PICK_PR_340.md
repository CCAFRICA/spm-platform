# HF-195 — Cherry-Pick PR #340 (HF-194 field_identities restore) onto Rebuilt Substrate

**Classification:** HF (Hotfix; surgical structural-symmetry fix)
**Sequence:** HF-195 (HF-194 was the PR #340 originally merged to main; HF-195 reapplies that fix to the rebuilt substrate)
**Authored:** 2026-04-26
**Predecessor:** AUD-003 Phase 0 evidence + inline audit verdicts (DROP / DROP / REINSTATE for PRs #338, #339, #340)
**Successor work:** Phase 1 verification — execute calculation against HF-195'd substrate, prove BCL $312,033 and Meridian MX$185,063 reproduce, gate the cutover-to-main decision

---

## ARCHITECT-CHANNEL META-CONTENT

### Why this hotfix exists

The AUD-003 inline audit (architect-channel, against AUD-003 Phase 0 verified diff evidence) returned three verdicts:

| PR | Title | Verdict | Rationale |
|---|---|---|---|
| #338 | HF-191 Plan Intelligence Forward (seeds) | **DROP** | Architectural violation; intelligence in private JSONB instead of signal surface; intent valid, mechanism non-compliant |
| #339 | HF-193 plan_agent_seeds eradicated; signals via persistSignal | **DROP** | In a pre-seeds substrate, this PR has no problem to solve; storage half is correct, operative-path half preserved seeds shape |
| #340 | HF-194 Restore field_identities in execute-bulk | **REINSTATE** | Pure structural-symmetry fix; orthogonal to seeds; addresses pre-existing pipeline asymmetry that exists at the anchor |

PR #340's fix is being reapplied to the rebuilt substrate (`origin/revert-pre-seeds-anchor`) via cherry-pick. The fix introduces one pure-function helper file (`web/src/lib/sci/field-identities.ts`), one import line in `execute-bulk/route.ts`, and three call sites in `processEntityUnit`/`processDataUnit`/`processReferenceUnit` that write `field_identities` into `committed_data.metadata`.

### Why this is HF, not OB or BUILD or REVERT

- Not OB — not a feature build; no new product capability; no design-side change
- Not REVERT — nothing is being undone; the anchor branch never contained #338/#339/#340; #340 is being *added*, not removed
- HF — surgical fix to close a structural defect (execute-bulk metadata asymmetry) identified through the diagnostic chain (DIAG-020 / 020-A / 021 R1 / 022). Narrow scope, clear gate, structural correctness only

### Scope boundary (Rule 36)

**IN SCOPE:**
- Cherry-pick PR #340's three production-source changes onto `origin/revert-pre-seeds-anchor`
- Preserve commit authorship/date metadata where possible (or re-author with explicit reference to PR #340)
- Verify the cherry-pick's working tree compiles (`npm run build` from `web/`)
- Document the operation in HF-195 FINDINGS

**OUT OF SCOPE:**
- Merging to `main` (deferred to cutover-to-main decision after Phase 1 verification)
- Reapplying any of PR #338 or PR #339 (DROP per audit)
- Modifying the `field-identities.ts` helper or `buildFieldIdentitiesFromBindings` logic — cherry-pick as-is
- Running calculations (Phase 1 verification work)
- Database queries
- Any signal-surface, plan-comprehension, or convergence redesign work

### What CC does and does not produce

CC produces:
- Three production-source changes from PR #340 applied to `revert-pre-seeds-anchor`:
  - `web/src/lib/sci/field-identities.ts` (new file, 58 lines, pure helper)
  - `web/src/app/api/import/sci/execute-bulk/route.ts` (import line + 3 call site additions)
  - `web/src/app/api/import/sci/execute/route.ts` (refactor to use shared helper instead of private function)
- `npm run build` PASS verification
- `docs/vp-prompts/HF-195_CHERRY_PICK_PR_340.md` — the directive itself, preserved per SOP (vp-prompts directory)
- `docs/hotfixes/HF-195_FINDINGS.md` documenting the cherry-pick operation, the SemanticBinding type compatibility check, and any conflicts encountered
- `docs/completion-reports/HF-195_COMPLETION_REPORT.md` per Rule 26

CC does not produce:
- Any merge to main
- Any modification to PR #340's helper logic
- Any execution of calculations
- Any HF or fix beyond this cherry-pick
- Any disposition of #338/#339 (those are DROP per audit; CC does not re-evaluate)

### Architect disposition (after HF-195 completes)

After CC reports, architect:
1. Reviews HF-195 FINDINGS — confirm cherry-pick clean, build PASS, no scope expansion
2. Authorizes Phase 1 verification (separate directive) — execute calculation against `revert-pre-seeds-anchor + HF-195`, prove BCL $312,033 and Meridian MX$185,063
3. After Phase 1 PASS, drafts cutover-to-main decision artifact

`origin/revert-pre-seeds-anchor` advances to include HF-195 commit. Main remains untouched at `a2921fbb` until cutover-to-main decision.

---

## CC PASTE BLOCK BELOW THIS LINE

---

# CC DIRECTIVE — HF-195

## CC Standing Architecture Rules

- **Rule 25:** Completion report authored before final commit/push.
- **Rule 26:** Completion report follows mandatory structure.
- **Rule 27:** Every proof gate has pasted evidence — no self-attestation.
- **Rule 29:** This paste block is the final block of the architect's message.
- **Rule 34:** No bypass recommendations. No fix attempts beyond cherry-pick scope.
- **Rule 36:** Scope held strictly to PR #340 cherry-pick onto `revert-pre-seeds-anchor`. Do NOT modify the helper logic. Do NOT touch other production source. Do NOT reapply #338 or #339.
- **Rule 51v2:** Build verification required (`npm run build` from `web/`); calculations not run (Phase 1 verification scope).
- **Korean Test:** Structural identifiers only.
- **SR-39:** Compliance verification N/A (no auth/session/access/storage/encryption changes).

## Architecture Decision Gate

```bash
# ADG-1: Repo identity
cd ~/spm-platform || cd /Users/AndrewAfrica/spm-platform
git rev-parse --show-toplevel

# ADG-2: Fetch latest
git fetch origin --prune --tags

# ADG-3: Confirm anchor branch is current per AUD-003 close
git rev-parse origin/revert-pre-seeds-anchor
echo "Expected: 1c79671d498e9effe4d1345333827752b42c1742 (AUD-003 Phase 0 commit on top of substrate anchor 283d4c24)"

# ADG-4: Confirm PR #340 merge SHA from AUD-003 evidence
echo "PR_340_MERGE_SHA expected: a2921fbb9bdc95fd6e4093368c27fd98bbd364c8"
git log -1 a2921fbb9bdc95fd6e4093368c27fd98bbd364c8 --format='HASH=%H%nDATE=%ci%nSUBJECT=%s%nPARENTS=%P' 2>&1

# ADG-5: Checkout revert branch
git checkout revert-pre-seeds-anchor
git rev-parse HEAD

# ADG-6: Working tree clean
git status --short
echo "Working tree must be clean."

# ADG-7: Verify SemanticBinding type contract on substrate
echo "--- SemanticBinding definition at substrate ---"
grep -nE 'export\s+(interface|type)\s+SemanticBinding\b' web/src/lib/sci/sci-types.ts 2>&1 | head -5
grep -nE 'export\s+(interface|type)\s+ColumnRole\b' web/src/lib/sci/sci-types.ts 2>&1 | head -5
grep -nE 'export\s+(interface|type)\s+FieldIdentity\b' web/src/lib/sci/sci-types.ts 2>&1 | head -5
echo "--- Verify shape (sourceField, semanticRole, confidence) ---"
sed -n '/^export\s\+\(interface\|type\)\s\+SemanticBinding\b/,/^}/p' web/src/lib/sci/sci-types.ts 2>&1

# ADG-8: Read-only intent declared until cherry-pick
echo "HF-195 cherry-picks PR #340's three production-source changes onto revert-pre-seeds-anchor. No #338 or #339 reapplied. No helper logic modified."
```

**HALT conditions:**
- ADG-3 returns SHA other than `1c79671d` (anchor branch advanced unexpectedly)
- ADG-7 returns no `SemanticBinding` / `ColumnRole` / `FieldIdentity` definitions, OR returns a `SemanticBinding` shape lacking `sourceField` / `semanticRole` / `confidence` fields (cherry-pick will fail to compile)
- ADG-6 returns dirty working tree

---

## PHASE 1 — Cherry-pick PR #340 commits

**Purpose:** Apply PR #340's production-source changes to `revert-pre-seeds-anchor`.

### Phase 1.1 — Identify the commits to cherry-pick

PR #340 was a merge commit (`a2921fbb`) with two parents (`3a3351eb` = main pre-340; `c9f2015a` = HF-194 branch tip). The actual change content is in the second-parent ancestry. We need the production-source commits, not the docs commits.

```bash
echo "=== Phase 1.1: identify PR #340 production-source commits ==="

# 1.1.1: List commits introduced by PR #340 (between first-parent main and second-parent branch tip)
git log a2921fbb^1..a2921fbb^2 --oneline

# 1.1.2: Identify which of those commits touch production source under web/src/
echo "--- Commits touching web/src/ production source ---"
for sha in $(git log a2921fbb^1..a2921fbb^2 --format=%H); do
  if git diff-tree --no-commit-id --name-only -r $sha | grep -qE '^web/src/'; then
    echo "$sha:"
    git log -1 $sha --format='  SUBJECT=%s'
    echo "  Files touched under web/src/:"
    git diff-tree --no-commit-id --name-only -r $sha | grep -E '^web/src/' | sed 's/^/    /'
    echo "---"
  fi
done

# 1.1.3: Capture the SHA list of cherry-pick targets
echo "=== Cherry-pick target SHAs ==="
git log a2921fbb^1..a2921fbb^2 --reverse --format=%H -- 'web/src/**' | tee /tmp/hf-195-cherry-targets.txt
```

Paste output verbatim. The cherry-pick target list should be small (the production-source commits only, excluding docs-only commits).

### Phase 1.2 — Pre-cherry-pick state snapshot

```bash
echo "=== Phase 1.2: pre-cherry-pick state ==="

# Files HF-195 will modify or create
echo "--- field-identities.ts existence on revert branch ---"
ls -la web/src/lib/sci/field-identities.ts 2>&1 || echo "NOT_PRESENT (expected — new file)"

echo "--- execute-bulk/route.ts existing field_identities references ---"
grep -nE 'field_identities|fieldIdentities|buildFieldIdentitiesFromBindings' web/src/app/api/import/sci/execute-bulk/route.ts 2>&1 || echo "NO_MATCHES (expected on pre-seeds substrate)"

echo "--- execute/route.ts existing buildFieldIdentitiesFromBindings ---"
grep -nE 'buildFieldIdentitiesFromBindings' web/src/app/api/import/sci/execute/route.ts 2>&1
echo "(Expected: helper exists as private function in execute/route.ts at substrate; PR #340 extracts it)"
```

Paste output verbatim.

### Phase 1.3 — Cherry-pick execution

```bash
echo "=== Phase 1.3: cherry-pick PR #340 production commits ==="

# Cherry-pick each target SHA in order
while IFS= read -r sha; do
  echo "--- Cherry-picking $sha ---"
  git log -1 $sha --format='SUBJECT=%s'
  git cherry-pick $sha 2>&1
  if [ $? -ne 0 ]; then
    echo "CHERRY_PICK_CONFLICT — HALTING"
    git status --short
    break
  fi
  echo "  Result: $(git rev-parse HEAD)"
done < /tmp/hf-195-cherry-targets.txt

# Verify final state
echo "--- Post-cherry-pick HEAD ---"
git rev-parse HEAD
git log --oneline -10
```

If conflict occurs: HALT, paste conflict details, do NOT resolve without architect direction.

Paste output verbatim.

### Phase 1.4 — Post-cherry-pick verification

```bash
echo "=== Phase 1.4: verify cherry-pick produced expected files ==="

echo "--- field-identities.ts now exists ---"
ls -la web/src/lib/sci/field-identities.ts 2>&1
wc -l web/src/lib/sci/field-identities.ts

echo "--- buildFieldIdentitiesFromBindings is exported from helper ---"
grep -nE 'export\s+function\s+buildFieldIdentitiesFromBindings' web/src/lib/sci/field-identities.ts

echo "--- execute-bulk/route.ts imports the helper ---"
grep -nE "buildFieldIdentitiesFromBindings.*from.*field-identities" web/src/app/api/import/sci/execute-bulk/route.ts

echo "--- execute-bulk/route.ts has 3 call sites writing field_identities ---"
grep -cE 'field_identities:\s*buildFieldIdentitiesFromBindings' web/src/app/api/import/sci/execute-bulk/route.ts
echo "(Expected: 3)"

echo "--- execute/route.ts no longer has private helper definition ---"
grep -nE 'function\s+buildFieldIdentitiesFromBindings' web/src/app/api/import/sci/execute/route.ts 2>&1 | head -5
echo "(Expected: 0 results in execute/route.ts because PR #340 extracted it; if results appear, the cherry-pick may have left a stale private definition that must be flagged)"
```

Paste output verbatim.

### Phase 1 Hard Gate

| # | Criterion | Pass condition |
|---|---|---|
| H1.1 | Cherry-pick targets identified | One or more commits in /tmp/hf-195-cherry-targets.txt; each touches `web/src/` |
| H1.2 | Pre-state snapshot | field-identities.ts NOT_PRESENT; execute-bulk has no field_identities; execute has private helper |
| H1.3 | Cherry-pick executed without conflict | Each cherry-pick reports success; final HEAD advances |
| H1.4 | Post-state verifies expected file shape | field-identities.ts exists with `buildFieldIdentitiesFromBindings` exported; execute-bulk imports it; 3 call sites present; execute has no private helper definition |

---

## PHASE 2 — Build verification (Rule 51v2)

**Purpose:** Confirm the cherry-picked code compiles cleanly. The helper is a pure function with explicit type imports from `@/lib/sci/sci-types`; if those types are stable on the substrate (verified in ADG-7), the build should succeed.

```bash
echo "=== Phase 2: build verification ==="
cd web
npm run build 2>&1 | tee /tmp/hf-195-build.log
BUILD_EXIT=$?
cd ..
echo "Build exit code: $BUILD_EXIT"
echo "--- Build log tail ---"
tail -50 /tmp/hf-195-build.log
echo "---"
echo "--- TypeScript errors specific to HF-195 files (if any) ---"
grep -E "field-identities\.ts|sci/field-identities|execute-bulk/route\.ts.*error" /tmp/hf-195-build.log | head -20 || echo "NONE"
```

If `BUILD_EXIT != 0`: HALT, paste error context, do NOT attempt fixes.

Paste output verbatim.

### Phase 2 Hard Gate

| # | Criterion | Pass condition |
|---|---|---|
| H2.1 | Build succeeds | `npm run build` exits 0 |
| H2.2 | No errors in HF-195-touched files | grep for `field-identities.ts` / `execute-bulk/route.ts` in build errors returns empty |

---

## PHASE 3 — FINDINGS.md and completion report

### Phase 3.1 — Author FINDINGS.md

Create `docs/hotfixes/HF-195_FINDINGS.md` with these required sections:

1. **HOTFIX SCOPE** — predecessor (AUD-003 audit verdict REINSTATE on PR #340), substrate anchor SHA, current branch HEAD pre-cherry-pick.
2. **CHERRY-PICK TARGETS** — table of cherry-picked SHAs with subjects.
3. **PRE-CHERRY-PICK STATE** — file inventory snapshot from Phase 1.2.
4. **CHERRY-PICK RESULT** — final HEAD SHA on `revert-pre-seeds-anchor`; commit log showing HF-195 commits on top of AUD-003 commit on top of REVERT-001 commit on top of substrate anchor.
5. **POST-STATE FILE INVENTORY** — verification from Phase 1.4 (field-identities.ts exists, 3 call sites present, etc.).
6. **BUILD VERIFICATION** — `npm run build` exit code, error count, HF-195-file error count.
7. **TYPE COMPATIBILITY NOTE** — confirmation from ADG-7 that SemanticBinding/ColumnRole/FieldIdentity contract on substrate matches what HF-195's helper imports.
8. **ARCHITECT NEXT STEPS** — Phase 1 verification (calculation execution against rebuilt substrate) is the next gate before cutover-to-main.

### Phase 3.2 — Commit and push

The directive prompt itself (this file) must be preserved under the project's standard prompt directory `docs/vp-prompts/` per SOP. Architect provides the prompt content; CC writes it to that path before committing.

```bash
# 3.2.1: Place the directive prompt under docs/vp-prompts/
# Architect-provided content is HF-195_CHERRY_PICK_PR_340.md (this file).
# Architect or CC copies the source content to docs/vp-prompts/HF-195_CHERRY_PICK_PR_340.md
# before the commit.
ls -la docs/vp-prompts/HF-195_CHERRY_PICK_PR_340.md 2>&1 || echo "PROMPT_FILE_NOT_PRESENT — architect must provide content before commit step"

# 3.2.2: Commit FINDINGS, completion report, and prompt
git add docs/vp-prompts/HF-195_CHERRY_PICK_PR_340.md \
        docs/hotfixes/HF-195_FINDINGS.md \
        docs/completion-reports/HF-195_COMPLETION_REPORT.md
git commit -m "HF-195: cherry-pick PR #340 (HF-194 field_identities restore) onto rebuilt substrate; build PASS"
git push origin revert-pre-seeds-anchor
git log -1 --format='COMMIT_SHA=%H'
```

Paste commit SHA in architect-channel reply.

### Phase 3 Hard Gate

| # | Criterion | Pass condition |
|---|---|---|
| H3.1 | FINDINGS.md exists with all 8 sections | `grep -cE "^## [A-Z]"` returns ≥ 8 |
| H3.2 | Prompt preserved under docs/vp-prompts/ | `ls -la docs/vp-prompts/HF-195_CHERRY_PICK_PR_340.md` returns file |
| H3.3 | Final commit pushed | Commit SHA pasted; `origin/revert-pre-seeds-anchor` advances; commit includes vp-prompts/, hotfixes/, completion-reports/ files |

---

## COMPLETION REPORT REQUIREMENTS

Author `docs/completion-reports/HF-195_COMPLETION_REPORT.md` per Rule 26 mandatory structure (COMMITS / FILES CREATED / FILES MODIFIED / BRANCHES MODIFIED / PROOF GATES HARD/SOFT / STANDING RULE COMPLIANCE / KNOWN ISSUES / VERIFICATION SCRIPT OUTPUT).

Verification script output should include the build log tail.

---

## ANTI-PATTERN CHECKS (CC self-attests)

- [ ] No merge to main attempted
- [ ] No PR #338 or #339 code reapplied
- [ ] No modification to PR #340's helper logic — cherry-pick as-is
- [ ] Build verification performed; PASS
- [ ] No execution of calculations (Phase 1 verification scope)
- [ ] No database queries
- [ ] No domain vocabulary introduced (Korean Test)
- [ ] All evidence pasted (Rule 27)

---

## CC AUTONOMY

Report at:
- (a) Any HALT condition during ADG or any phase
- (b) Phase 3.2 close with final commit SHA on `revert-pre-seeds-anchor`
- (c) Cherry-pick conflict (HALT, do not resolve without direction)
- (d) Build failure (HALT, do not attempt fixes)

CC executes Phases 1 → 2 → 3 sequentially.

---

*HF-195 · Cherry-pick PR #340 (HF-194 field_identities restore) onto rebuilt substrate · Predecessor: AUD-003 inline audit (DROP/DROP/REINSTATE on PRs #338/#339/#340) · Successor: Phase 1 verification (execute against rebuilt substrate, prove BCL $312,033 + Meridian MX$185,063) · 2026-04-26 · Standing Rules 25, 26, 27, 34, 36, 51v2 + Korean Test enforced*
