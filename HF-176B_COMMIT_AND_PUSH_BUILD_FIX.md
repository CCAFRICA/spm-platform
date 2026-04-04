# HF-176B: Commit and Push the Build Fix (Already on Your Machine)

## CC STANDING ARCHITECTURE RULES
Reference: `CC_STANDING_ARCHITECTURE_RULES.md` v3.0 — all rules apply.

---

## CONTEXT — READ THIS CAREFULLY

HF-176 asked you to fix the TypeScript cast error at lines 1245 and 1481 of `web/src/app/api/import/sci/execute/route.ts`. Your completion report showed the fix was applied and `npx tsc --noEmit` passed.

**However, the fix was never committed.** The change exists in your working directory but not in any commit. Proof:

```bash
# This is what we ran AFTER your HF-176 push:
$ git show HEAD:web/src/app/api/import/sci/execute/route.ts | grep -n "response as Record"
1245:      cadence_config: { period_type: (response as Record<string, unknown>).cadence || 'monthly' } as unknown as Json,
1481:      cadence_config: { period_type: (response as Record<string, unknown>).cadence || 'monthly' } as unknown as Json,
```

The committed code at HEAD still has the SINGLE cast `(response as Record<string, unknown>)` — not the double cast. Your grep during HF-176 showed the double cast because `grep` reads the working directory (including uncommitted changes). Your `npx tsc --noEmit` also passed because the TypeScript compiler reads the working directory. Everything you verified was correct — but it was never committed.

**The Vercel build failed on the same line 1245 error because Vercel builds from the committed code, not your working directory.**

---

## WHAT YOU NEED TO DO

### Step 1: Confirm the uncommitted change exists

```bash
cd /path/to/spm-platform
git diff web/src/app/api/import/sci/execute/route.ts | head -40
```

This should show the cast change as an unstaged modification. **Paste this output.**

If `git diff` shows nothing (empty output), run `git diff --staged` instead — the change may be staged but not committed.

If BOTH are empty, the change was lost. In that case, manually edit lines 1245 and 1481:

```
# Change FROM:
(response as Record<string, unknown>)

# Change TO:
(response as unknown as Record<string, unknown>)
```

### Step 2: Stage and commit

```bash
git add web/src/app/api/import/sci/execute/route.ts
git commit -m "HF-176B: Commit build fix — TypeScript double-cast at lines 1245 and 1481"
```

### Step 3: Verify the COMMITTED code (NOT the working directory)

**THIS IS THE CRITICAL STEP.** Do NOT use regular `grep` on the file path. Use `git show HEAD:` to read from the commit:

```bash
git show HEAD:web/src/app/api/import/sci/execute/route.ts | grep -n "response as Record"
```

**Expected output: EMPTY (zero matches).**

If this still shows matches, your commit did not include the change. Do NOT proceed — diagnose why.

Also verify the fix IS in the committed code:

```bash
git show HEAD:web/src/app/api/import/sci/execute/route.ts | grep -n "response as unknown as Record"
```

**Expected output: lines 1245 and 1481 showing the double cast.**

**Paste BOTH grep outputs.**

### Step 4: Build verification (against committed code)

```bash
cd web
rm -rf .next
git stash  # Temporarily remove any other uncommitted changes
npx tsc --noEmit
echo "tsc exit code: $?"
git stash pop  # Restore uncommitted changes
```

The `git stash` before `npx tsc --noEmit` ensures the type checker runs against ONLY committed code plus the build fix — nothing else from your working directory can mask or cause errors.

**Paste the complete terminal output.**

### Step 5: Push

```bash
cd /path/to/spm-platform
git push origin main
```

**Paste the push output including the commit hash.**

### Step 6: Verify the push reached GitHub

```bash
git log --oneline -3
```

**Paste the output.** The top commit should be the HF-176B commit.

---

## COMPLETION REPORT

Create file: `HF-176B_COMPLETION_REPORT.md` in project root.

```markdown
# HF-176B COMPLETION REPORT
## Date: [DATE]

## ROOT CAUSE
The HF-176 fix was applied to the working directory but never committed.
Verification (grep, npx tsc --noEmit) ran against the working directory and passed,
but the commit and push contained the old code.

## STEP 1 — GIT DIFF (proof the fix was uncommitted)
```
[PASTE git diff output]
```

## STEP 2 — COMMIT
```
[PASTE git commit output with hash]
```

## STEP 3 — COMMITTED CODE VERIFICATION
### Broken pattern (should be EMPTY):
```
$ git show HEAD:web/src/app/api/import/sci/execute/route.ts | grep -n "response as Record"
[PASTE — expected: no output]
```

### Fixed pattern (should show lines 1245 and 1481):
```
$ git show HEAD:web/src/app/api/import/sci/execute/route.ts | grep -n "response as unknown as Record"
[PASTE]
```

## STEP 4 — BUILD VERIFICATION (against committed code)
```
[PASTE complete terminal session: git stash, rm -rf .next, npx tsc --noEmit, exit code, git stash pop]
```

## STEP 5 — PUSH
```
[PASTE git push output]
```

## STEP 6 — GIT LOG
```
[PASTE git log --oneline -3]
```

## PROOF GATES
| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| 1 | git diff confirms uncommitted fix existed | | Step 1 output |
| 2 | git show HEAD: shows ZERO `response as Record` matches | | Step 3 output |
| 3 | git show HEAD: shows BOTH lines with double cast | | Step 3 output |
| 4 | npx tsc --noEmit passes on committed code (after git stash) | | Step 4 output |
| 5 | git push succeeded | | Step 5 output |
| 6 | git log confirms HF-176B is HEAD on main | | Step 6 output |

## NEW STANDING RULE COMPLIANCE
- Rule 51 (npx tsc --noEmit, not npm run build): PASS/FAIL
- **Rule 51 AMENDMENT: All verification grep/build runs against COMMITTED code (git show HEAD: or git stash before build), NOT working directory**: PASS/FAIL
```

---

## NEW STANDING RULE — EFFECTIVE IMMEDIATELY

**All file-level verification in completion reports must target COMMITTED code, not the working directory.**

| ❌ WRONG (reads working directory) | ✅ CORRECT (reads committed code) |
|---|---|
| `grep -n "pattern" path/to/file.ts` | `git show HEAD:path/to/file.ts \| grep -n "pattern"` |
| `npx tsc --noEmit` (with uncommitted changes) | `git stash && npx tsc --noEmit && git stash pop` |
| `cat path/to/file.ts` | `git show HEAD:path/to/file.ts` |

If your verification shows the fix but the committed code doesn't have it, the fix was never committed. This is what happened in HF-176. It must not happen again.
