# HF-177: Build Fix — Orphaned Code Cleanup + Lint Gate

## CC STANDING ARCHITECTURE RULES
Reference: `CC_STANDING_ARCHITECTURE_RULES.md` v3.0 — all rules apply. Rules 1-39 active.

---

## CONTEXT

The Vercel build for OB-187 (commit 51f5002) fails with:

```
./src/app/operate/calculate/page.tsx
395:9  Error: 'handleCreatePeriods' is assigned a value but never used.  @typescript-eslint/no-unused-vars
```

This is the SECOND time an orphaned function has broken the Vercel build. The pattern: CC refactors a page, introduces new code to replace old logic, but leaves the old function definition in place. `npx tsc --noEmit` catches type errors but NOT ESLint errors. Vercel runs ESLint during `npm run build` (the "Linting and checking validity of types" phase), catches the unused variable, and the build fails.

**This HF has THREE parts:**
1. Fix the immediate lint error (remove `handleCreatePeriods`)
2. Scan for ALL orphaned/unused code in files modified by OB-187
3. Add `npx next lint` to the mandatory build verification sequence

---

## PHASE 1: FIX THE IMMEDIATE LINT ERROR

The function `handleCreatePeriods` at line 395 of `web/src/app/operate/calculate/page.tsx` is defined but never called. OB-187 replaced this with the new detection panel flow but left the old function behind.

**Step 1a:** Find and examine the orphaned code:

```bash
grep -n "handleCreatePeriods" web/src/app/operate/calculate/page.tsx
```

**Step 1b:** Remove the entire `handleCreatePeriods` function definition. Do NOT just add an underscore prefix — remove it entirely. Dead code has no place in the codebase.

**Step 1c:** After removal, check for any other references to the function that might also need cleanup:

```bash
grep -rn "handleCreatePeriods" web/src/
```

Expected: zero matches after removal.

**Paste all grep outputs.**

---

## PHASE 2: COMPREHENSIVE ORPHAN SCAN

This is the critical phase. The pattern of leaving orphaned code behind has caused build failures twice. Scan EVERY file modified by OB-187 for unused variables, functions, and imports.

**Step 2a:** Run ESLint specifically on the modified files:

```bash
cd web
npx next lint --file src/app/operate/calculate/page.tsx
npx next lint --file src/app/api/periods/detect/route.ts
```

**Step 2b:** Also scan for common orphan patterns in calculate/page.tsx:

```bash
# Unused imports
grep -n "^import" web/src/app/operate/calculate/page.tsx | head -30

# Unused state variables (defined but never read)
grep -n "const \[.*set" web/src/app/operate/calculate/page.tsx

# Unused function definitions
grep -n "const handle\|function handle\|async function\|const fetch" web/src/app/operate/calculate/page.tsx
```

**Step 2c:** For every unused item found — remove it entirely. Not comment it out. Not prefix with underscore. Remove.

**Step 2d:** After all removals, verify nothing is broken:

```bash
cd web
npx next lint --file src/app/operate/calculate/page.tsx
npx next lint --file src/app/api/periods/detect/route.ts
```

Expected: zero errors.

**Paste all outputs.**

---

## PHASE 3: FULL LINT CHECK

After all orphan removal, run the full lint check across the entire codebase:

```bash
cd web
npx next lint 2>&1 | grep -i "error" | head -20
```

If ANY errors appear (not warnings — errors), fix them before proceeding. Only warnings are acceptable in the Vercel build.

**Paste the output.**

---

## ⚠️ BUILD VERIFICATION GATE — UPDATED ⚠️

**Rule 51 is now AMENDED. The build verification sequence adds `npx next lint`.**

The FULL mandatory verification sequence is now:

```bash
cd web
rm -rf .next
git stash
npx tsc --noEmit
echo "tsc exit code: $?"
npx next lint 2>&1 | grep -c "Error:"
echo "lint error count: (should be 0)"
git stash pop
```

**Both** `npx tsc --noEmit` AND `npx next lint` must pass with zero errors.

**Why both are needed:**
- `npx tsc --noEmit` catches TYPE errors (wrong types, missing properties, invalid casts)
- `npx next lint` catches LINT errors (unused variables, missing dependencies, orphaned code)
- Vercel runs BOTH during its build. If either fails, the build fails.
- CC's previous verification only ran `npx tsc --noEmit`, which is why unused variable errors reached Vercel undetected.

After the build gate passes, verify committed code:

```bash
git show HEAD:web/src/app/operate/calculate/page.tsx | grep -n "handleCreatePeriods"
```

Expected: zero matches.

**Paste the COMPLETE terminal session.**

---

## PHASE 4: PUSH

```bash
cd /path/to/spm-platform
git add -A
git commit -m "HF-177: Remove orphaned handleCreatePeriods, add lint gate to build verification"
git push origin dev
```

Verify committed code after push:

```bash
git show HEAD:web/src/app/operate/calculate/page.tsx | grep -c "handleCreatePeriods"
```

Expected: 0.

---

## NEW STANDING RULE

**Rule 51 AMENDMENT (v2): Build verification requires BOTH type check AND lint check.**

| Step | Command | What It Catches |
|------|---------|----------------|
| 1 | `rm -rf .next` | Clear cached results |
| 2 | `git stash` | Isolate committed code |
| 3 | `npx tsc --noEmit` | Type errors |
| 4 | `npx next lint` | Unused variables, missing deps, orphaned code |
| 5 | `git stash pop` | Restore working directory |

Both must show zero errors. If either fails, the build will fail on Vercel.

**Additionally — ORPHAN PREVENTION RULE:**

When refactoring a function (replacing old logic with new logic):
1. REMOVE the old function definition entirely
2. REMOVE any imports that were only used by the old function
3. REMOVE any state variables that were only used by the old function
4. Run `npx next lint --file <modified-file>` to verify zero unused items remain

Leaving old code behind "in case we need it" is not acceptable. Git history preserves everything. The working codebase must be clean.

---

## COMPLETION REPORT

```markdown
# HF-177 COMPLETION REPORT
## Date: [DATE]

## PHASE 1 — ORPHANED FUNCTION REMOVAL
### Before:
```
$ grep -n "handleCreatePeriods" web/src/app/operate/calculate/page.tsx
[PASTE]
```
### After:
```
$ grep -rn "handleCreatePeriods" web/src/
[PASTE — expected: no matches]
```

## PHASE 2 — COMPREHENSIVE ORPHAN SCAN
### ESLint on modified files:
```
$ npx next lint --file src/app/operate/calculate/page.tsx
[PASTE]
$ npx next lint --file src/app/api/periods/detect/route.ts
[PASTE]
```
### Additional orphans found and removed:
[LIST each item removed with line number and reason]

## PHASE 3 — FULL LINT CHECK
```
$ npx next lint 2>&1 | grep -i "error" | head -20
[PASTE — expected: no errors, only warnings]
```

## BUILD VERIFICATION EVIDENCE
```
$ cd web
$ rm -rf .next
$ git stash
$ npx tsc --noEmit
[PASTE]
$ echo $?
0
$ npx next lint 2>&1 | grep -c "Error:"
0
$ git stash pop
```

## COMMITTED CODE VERIFICATION
```
$ git show HEAD:web/src/app/operate/calculate/page.tsx | grep -c "handleCreatePeriods"
0
```

## PROOF GATES
| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| 1 | handleCreatePeriods removed entirely | | grep shows 0 matches |
| 2 | No other orphaned functions in calculate/page.tsx | | npx next lint shows 0 errors |
| 3 | No orphaned code in detect/route.ts | | npx next lint shows 0 errors |
| 4 | Full codebase lint has 0 errors | | grep -c "Error:" returns 0 |
| 5 | npx tsc --noEmit passes | | exit code 0 |
| 6 | All verification against committed code (git stash) | | terminal session shows git stash before checks |
| 7 | Committed code confirmed (git show HEAD:) | | grep returns 0 |

## STANDING RULE COMPLIANCE
- Rule 51 v2 (tsc --noEmit + next lint + git stash): PASS/FAIL
- Rule 51 Amendment (committed code only): PASS/FAIL
- Orphan Prevention Rule: PASS/FAIL
```

---

## WHAT THIS HF DOES NOT DO

This HF fixes the build and establishes the lint gate. It does NOT implement OB-187 Phases 3-5 (period creation API fix, cadence-aware filtering, navigate-away removal). Those remain open items for verification after the build is green.
