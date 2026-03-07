# HF-093: SCI EXECUTE ROUTE 404
## Execute route not found by Vercel — blocks entire pipeline
## Type: Hotfix — P0 Production Blocker
## Root Cause: Route file path doesn't match client request URL
## Evidence: Vercel Runtime Log — POST /api/import/sci/execute → 404

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit after each phase. Push after each commit.

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`

---

## THE PROBLEM

CLT-160 browser test on vialuce.ai:
- `POST /api/import/sci/analyze-document` → **200** (classification works)
- `POST /api/import/sci/execute` → **404** (execute route not found)

The SCI pipeline classifies content correctly but cannot execute the confirmed proposal.

---

## PHASE 0: DIAGNOSTIC

Find the execute route and determine why Vercel returns 404.

```bash
# 1. What is the EXACT file path of the execute route?
find web/src/app/api/import/sci/ -name "route.ts" -o -name "route.js" | sort

# 2. What is the directory structure under /api/import/sci/?
ls -R web/src/app/api/import/sci/

# 3. What does the analyze route path look like? (it works — use as reference)
find web/src/app/api/import/sci/ -path "*analyze*" -name "route.ts"

# 4. What URL does the client POST to for execute?
grep -rn "api/import/sci/execute\|sci.*execute\|execute.*proposal" \
  web/src/app/ web/src/lib/ web/src/components/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -20

# 5. Is there a different execute endpoint name?
grep -rn "execute-proposal\|execute-import\|confirm-import\|commit-import" \
  web/src/app/ web/src/lib/ --include="*.ts" --include="*.tsx" | head -10

# 6. Does the execute route file compile?
cat web/src/app/api/import/sci/execute/route.ts 2>/dev/null | head -5
# If not found:
find web/src/app/api/ -path "*execute*" -name "route.ts"
```

Paste ALL output. The diagnostic will reveal one of:
- **Path mismatch:** File exists at different path than client expects
- **Missing file:** Execute route doesn't exist as a deployable Next.js route
- **Nested directory issue:** File exists but Next.js can't resolve it

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-093 Phase 0: Diagnostic — execute route 404 on production" && git push origin dev`

---

## PHASE 1: FIX

Based on Phase 0 findings, the fix will be one of:

### Fix A: Path Mismatch
If the file exists at a different path (e.g., `execute-proposal/route.ts`):
- Either rename the directory to match what the client calls (`execute/route.ts`)
- Or update the client to call the correct path
- Choose whichever requires fewer changes. Document which.

### Fix B: Missing Route File
If no execute route exists as a deployable Next.js route:
- The 1,391-line execute logic exists somewhere (Phase F confirmed it)
- It may be in a lib file but not exposed as an API route
- Create the route file that delegates to the existing logic

### Fix C: Route Exists But Not Deploying
If the file exists at the correct path but Vercel doesn't deploy it:
- Check for TypeScript errors that prevent serverless function creation
- Check for file size limits (1,391 lines is large — Vercel has 50MB limit per function)
- Check for import errors that only manifest in Vercel's bundler

### Also Fix: /api/periods Calls on Import Page
The Vercel log shows 3 calls to `/api/periods` on import page load. Decision 93 says zero period references in the import surface. Find and remove these calls.

```bash
# Find period API calls in import page
grep -rn "api/periods\|/periods\|fetchPeriods\|usePeriods" \
  web/src/app/operate/import/ --include="*.ts" --include="*.tsx" | head -10
```

### Proof Gates
- PG-01: `POST /api/import/sci/execute` responds (not 404) on localhost
- PG-02: Execute route accessible at the path the client calls
- PG-03: Zero `/api/periods` calls from import page (Decision 93)
- PG-04: `npm run build` exits 0
- PG-05: localhost:3000 responds

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-093 Phase 1: Fix execute route path — [describe fix]" && git push origin dev`

---

## PHASE 2: VERIFY + PR

```bash
kill dev server
rm -rf .next
npm run build
npm run dev

# Test execute route responds (should return 401 or 400, not 404)
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/import/sci/execute
# Expected: 401 (unauthorized) or 400 (bad request) — NOT 404

# Test analyze route still works
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/import/sci/analyze-document
# Expected: 401 or 400 — NOT 404

# Verify no period calls from import page
grep -rn "api/periods\|/periods" \
  web/src/app/operate/import/ --include="*.tsx" | grep -v "// "
```

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-093: Fix SCI execute route 404 — route path mismatch on production" \
  --body "## Problem
POST /api/import/sci/execute returns 404 on vialuce.ai.
Classification works (analyze-document returns 200) but execution fails.
Blocks entire SCI pipeline — no plan import, no data import, no calculation.

## Root Cause
[CC documents root cause from Phase 0]

## Fix
[CC documents fix from Phase 1]

## Also Fixed
Removed /api/periods calls from import page load (Decision 93 — 3 calls on every page load)."
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-093 Complete: Execute route 404 fix" && git push origin dev`

---

*HF-093: "Classification without execution is observation without action. The system understood the plan perfectly — 95% confidence, 5 components, 2 variants. Then it couldn't do anything with that understanding because the door was locked. Fix the door."*
