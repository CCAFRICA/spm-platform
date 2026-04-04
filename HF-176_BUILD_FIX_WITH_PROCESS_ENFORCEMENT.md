# HF-176: Build Fix — TypeScript Cast Error in SCI Execute Route

## CC STANDING ARCHITECTURE RULES
Reference: `CC_STANDING_ARCHITECTURE_RULES.md` v3.0 — all rules apply. Rules 1-39 active.

---

## CONTEXT

The Vercel production build has been failing since OB-186 (PR #310). The same TypeScript type error has persisted across THREE consecutive PRs (310, 311, 312), each of which self-attested "Build passes: PASS" in the completion report. The build has never passed on Vercel since PR #309.

**Root cause of false attestations:** The local `.next` directory caches previous successful type check results. When `npm run build` runs, it reuses cached type information and does not catch new type errors. Vercel builds clean (no `.next` cache), so it catches the error. CC's local build environment is unreliable.

**This HF introduces a new mandatory build verification process. Read the BUILD VERIFICATION GATE section carefully. Your completion report will be REJECTED if you do not follow it exactly.**

---

## THE ERROR

File: `web/src/app/api/import/sci/execute/route.ts`
Line: ~1245 (may have shifted due to PRs 311-312)

```
Type 'Record<string, unknown>' is not assignable to type 'string | number | boolean | ...'.
```

The pattern `(response as Record<string, unknown>)` fails because TypeScript cannot narrow directly from the response type to `Record<string, unknown>`. The fix is a two-step cast: `(response as unknown as Record<string, unknown>)`.

---

## PHASE 1: IDENTIFY ALL OCCURRENCES

Before changing anything, find every occurrence of this pattern in the file:

```bash
grep -n "response as Record" web/src/app/api/import/sci/execute/route.ts
```

**Paste the complete grep output in your completion report.** This tells us how many fixes are needed.

There may be more than one occurrence — OB-186 added plan save logic that could have a second path ~50 lines below the first.

---

## PHASE 2: FIX ALL OCCURRENCES

For every line found in Phase 1, change:

```typescript
// FROM:
(response as Record<string, unknown>)

// TO:
(response as unknown as Record<string, unknown>)
```

Also verify that any `.cadence` access on these casts is properly typed:

```typescript
// ENSURE the cadence extraction has a string cast:
((response as unknown as Record<string, unknown>).cadence as string) || 'monthly'
```

Commit after fixing all occurrences.

```bash
cd /path/to/spm-platform
git add -A
git commit -m "HF-176: Fix TypeScript cast error in SCI execute route — all occurrences"
```

---

## PHASE 3: POST-FIX GREP VERIFICATION

After fixing, run the same grep to confirm zero remaining occurrences:

```bash
grep -n "response as Record" web/src/app/api/import/sci/execute/route.ts
```

Expected output: empty (no matches).

If any matches remain, go back and fix them before proceeding.

**Paste the grep output (or confirmation of no matches) in your completion report.**

---

## ⚠️ BUILD VERIFICATION GATE — MANDATORY ⚠️

**THIS IS THE MOST IMPORTANT SECTION OF THIS PROMPT.**

Previous HFs (OB-186, HF-174, HF-175) all claimed "Build passes: PASS" while the Vercel build was failing. This happened because `npm run build` with a cached `.next` directory does not reliably catch type errors.

**From this point forward, the ONLY accepted build verification is `npx tsc --noEmit` run AFTER deleting the `.next` cache.**

Execute these commands exactly, in this order, from the `web/` directory:

```bash
cd web
rm -rf .next
npx tsc --noEmit
```

### What to look for:

- **If `npx tsc --noEmit` exits with NO output and exit code 0:** The build passes. Proceed.
- **If `npx tsc --noEmit` outputs ANY errors:** The build FAILS. Fix every error before proceeding. Do NOT continue to the completion report.

### What is NOT accepted as build evidence:

| ❌ NOT ACCEPTED | WHY |
|---|---|
| `npm run build` output alone | Cached `.next` masks type errors (FP-111) |
| "Build passes: PASS" without terminal output | Self-attestation is not evidence (FP-109) |
| "exit 0" text typed manually | Must be pasted from actual terminal |
| Build run WITHOUT `rm -rf .next` first | Cache invalidation is mandatory |
| Running from repo root instead of `web/` | TypeScript config is in `web/tsconfig.json` |

### What IS accepted:

The PASTED terminal output of ALL THREE commands:

```
$ cd web
$ rm -rf .next
$ npx tsc --noEmit
[paste whatever appears here — even if it's nothing]
$ echo $?
0
```

**Paste the COMPLETE terminal session showing these commands and their output in your completion report under "BUILD VERIFICATION EVIDENCE."**

If `npx tsc --noEmit` produces errors, DO NOT submit the completion report. Fix the errors first, then re-run the verification sequence and paste the clean output.

---

## PHASE 4: PUSH

Only after the build verification gate passes:

```bash
cd /path/to/spm-platform
git push origin main
```

---

## COMPLETION REPORT

Create file: `HF-176_COMPLETION_REPORT.md` in project root.

```markdown
# HF-176 COMPLETION REPORT
## Date: [DATE]
## Execution Time: [TIME]

## COMMITS
| Hash | Phase | Description |
|------|-------|-------------|
| [hash] | Phase 2 | Fix TypeScript cast error — all occurrences |

## FILES MODIFIED
| File | Change |
|------|--------|
| web/src/app/api/import/sci/execute/route.ts | [describe exact changes] |

## PHASE 1 — GREP RESULTS (BEFORE FIX)
```
[PASTE the complete output of: grep -n "response as Record" web/src/app/api/import/sci/execute/route.ts]
```

## PHASE 3 — GREP RESULTS (AFTER FIX)
```
[PASTE the complete output — should be empty]
```

## BUILD VERIFICATION EVIDENCE
```
[PASTE the COMPLETE terminal session showing:]
$ cd web
$ rm -rf .next
$ npx tsc --noEmit
[output here]
$ echo $?
[exit code here]
```

## PROOF GATES
| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| 1 | All `response as Record` patterns fixed | | Phase 3 grep output |
| 2 | `rm -rf .next` executed before type check | | Terminal session shows command |
| 3 | `npx tsc --noEmit` exits with 0 errors | | Terminal session shows clean output |
| 4 | Build evidence is PASTED terminal output, not self-attestation | | See BUILD VERIFICATION EVIDENCE |
| 5 | Pushed to main | | `git push` output |

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push): PASS/FAIL
- Rule 7 (git from repo root): PASS/FAIL
- **NEW — Rule 51 (build = npx tsc --noEmit, not npm run build): PASS/FAIL**
- **NEW — Rule 51 (.next deleted before type check): PASS/FAIL**

## KNOWN ISSUES
[list any issues found during the fix]
```

---

## WHAT THIS HF DOES NOT DO

This HF fixes ONLY the TypeScript cast error blocking the Vercel build. It does NOT:
- Modify any platform logic
- Change any UI components
- Add any features
- Touch any other files

The goal is ONE thing: get the Vercel build to pass so that OB-186, HF-174, and HF-175 code (already merged) can deploy to production.

---

## WHY THIS MATTERS

Three PRs are sitting in the repo but have never deployed:
- **OB-186** — Period management, cadence-aware calculate, quota/targetValue resolution, filtered scope aggregates
- **HF-174** — Period creation constraint fix (status 'draft'→'open')
- **HF-175** — Create Periods UX redesign

All of this work is blocked by a single TypeScript type error. Fix the type error → Vercel builds → all three PRs deploy → platform capabilities can be verified.
