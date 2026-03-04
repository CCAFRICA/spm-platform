# HF-087: FIX CLIENT-SIDE FETCH TIMEOUT ON SCI EXECUTE
## Browser Shows "Failed" Even When Server Succeeds

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute all phases. Commit after each. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. `web/src/app/(authenticated)/operate/import/page.tsx` — the import page (or wherever the SCI execute fetch is called from)
3. `web/src/app/api/import/sci/execute/route.ts` — the server route (already fixed: 300s maxDuration, resolveProfileId)

---

## CONTEXT

The SCI execute route now works on production. Vercel logs confirm:
```
[SCI Execute] Plan saved: Optometrist Incentive Plan (03cab415-...), 7 components
```

BUT the **user sees failure**:
- "Import partially complete — 0 of 1 succeeded"
- "Failed to fetch"
- Status shows 0 Records imported, no active plan

The server took ~60 seconds to complete the AI plan interpretation. The **browser's fetch dropped the connection before the response came back.** The server succeeded silently while the client reported failure. This caused the user to retry, creating duplicate rule_sets.

**Vercel Function Max Duration is 300 seconds** (confirmed in Vercel dashboard). The server is NOT timing out. The client-side fetch is the problem.

**This is a P0 UX blocker.** A user who sees "Failed" will not trust the platform, even if the data is correct underneath. This directly contradicts the platform's transparency and trust value proposition.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. **Commit this prompt to git as first action.**
4. **Git from repo root (spm-platform), NOT web/.**
5. **Do NOT modify the SCI execute server route logic.** This HF fixes the CLIENT side only.
6. **Do NOT modify calculation engine, derivation, or component resolution.**

---

# PHASE 0: FIND THE CLIENT-SIDE FETCH

### 0A: Locate the fetch call

```bash
echo "=== WHERE IS THE SCI EXECUTE FETCH CALLED? ==="
grep -rn "sci/execute\|sci.*execute\|import.*execute" \
  web/src/app/ web/src/components/ web/src/lib/ \
  --include="*.tsx" --include="*.ts" | grep -v "route.ts" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== THE FETCH CALL ITSELF ==="
grep -B 5 -A 15 "sci/execute\|sci.*execute" \
  web/src/app/ web/src/components/ web/src/lib/ \
  --include="*.tsx" --include="*.ts" -r | grep -v "route.ts" | grep -v node_modules | grep -v ".next" | head -40

echo ""
echo "=== ANY TIMEOUT/SIGNAL/ABORT CONFIGURATION ==="
grep -rn "AbortController\|signal\|timeout\|setTimeout.*fetch\|fetchTimeout" \
  web/src/app/ web/src/components/ web/src/lib/ \
  --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "=== ANY GENERIC FETCH WRAPPER ==="
grep -rn "async.*fetch\|fetchApi\|apiCall\|supabaseFetch" \
  web/src/lib/ --include="*.ts" --include="*.tsx" | head -10
```

### 0B: Understand the current fetch pattern

```bash
echo "=== IMPORT PAGE — FULL EXECUTE HANDLER ==="
# Find the import page
find web/src -name "*.tsx" -path "*import*" | head -5

echo ""
echo "=== HOW DOES THE IMPORT PAGE CALL EXECUTE? ==="
# Check for the execute trigger (button click handler, form submit, etc.)
grep -B 10 -A 30 "execute\|handleImport\|handleExecute\|confirmImport\|startImport" \
  web/src/app/\(authenticated\)/operate/import/page.tsx 2>/dev/null | head -60
```

### Phase 0 Output — MANDATORY FORMAT

```
// PHASE 0 FINDINGS — HF-087
//
// FETCH LOCATION:
// File: [path]
// Line: [N]
// Pattern: fetch('/api/import/sci/execute', { ... })
//
// TIMEOUT CONFIG:
// AbortController used: YES/NO
// Timeout duration: [X ms or NONE]
// Signal passed to fetch: YES/NO
//
// RESPONSE HANDLING:
// Checks response.ok: YES/NO
// Handles network errors: YES/NO
// Shows error to user: [how]
//
// ROOT CAUSE:
// [Browser default fetch has no timeout / AbortController set too short / etc.]
```

**Commit:** `HF-087 Phase 0: Client-side fetch diagnostic`

---

# PHASE 1: FIX THE FETCH TIMEOUT

The fix depends on what Phase 0 reveals. There are two approaches — implement BOTH:

### 1A: Extend the client-side fetch timeout

If there's an AbortController with a short timeout, extend it to match the server's 300 seconds:

```typescript
// BEFORE (example — actual code may differ):
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds

// AFTER:
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 300000); // 300 seconds — match server
```

If there's NO AbortController and the browser's default fetch is timing out, add one explicitly with a 5-minute timeout:

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes

try {
  const response = await fetch('/api/import/sci/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);
  // ... handle response
} catch (error) {
  clearTimeout(timeoutId);
  if (error.name === 'AbortError') {
    // Timeout — but server may still be processing
    // Check plan-readiness endpoint to see if it actually succeeded
  }
  // ... handle error
}
```

### 1B: Add a post-failure recovery check

Even with an extended timeout, network issues can still cause the fetch to fail while the server succeeds. Add a recovery check that polls for the result:

```typescript
// After fetch fails (catch block), check if the server actually succeeded:
async function checkImportResult(tenantId: string, batchId: string): Promise<boolean> {
  try {
    // Check if a rule_set was created in the last 5 minutes
    const response = await fetch(`/api/plan-readiness?tenant_id=${tenantId}`);
    const data = await response.json();
    return data.hasActivePlan === true;
  } catch {
    return false;
  }
}

// In the catch block:
const serverActuallySucceeded = await checkImportResult(tenantId, batchId);
if (serverActuallySucceeded) {
  // Show success state — "Plan imported successfully"
  // Don't show error — the server completed even though the fetch failed
} else {
  // Show actual error — the server really did fail
}
```

### 1C: Show meaningful progress during the wait

The import page currently shows "Processing 1 content unit... 0 of 1" with a progress bar that doesn't move. For a 60+ second operation, the user needs feedback:

```typescript
// Add a timer display showing elapsed time
// "Plan interpretation in progress... (45 seconds)"
// This tells the user the operation is still running, not hung
```

At minimum, show a message like:
> "Plan interpretation is in progress. This may take up to 2 minutes for complex plans. Please do not close this page."

### 1D: Prevent duplicate submissions

The current behavior allows the user to retry while the server is still processing the first request, creating duplicate rule_sets. Add a guard:

```typescript
const [isExecuting, setIsExecuting] = useState(false);

// In the execute handler:
if (isExecuting) return; // Prevent duplicate submission
setIsExecuting(true);
try {
  // ... fetch
} finally {
  setIsExecuting(false);
}
```

Disable the "Confirm All" / "Import Data" button while executing.

**Proof gate PG-01:** Fetch timeout extended to 300s. Recovery check added. Duplicate prevention added. Progress feedback added.

**Commit:** `HF-087 Phase 1: Client-side fetch timeout fix + recovery + progress`

---

# PHASE 2: BUILD + DEPLOY TO PRODUCTION

### 2A: Build

```bash
cd web && rm -rf .next && npm run build
```

### 2B: Push + merge

```bash
cd /Users/AndrewAfrica/spm-platform
git add -A
git commit -m "HF-087: Fix client-side fetch timeout — 300s timeout, recovery check, duplicate prevention, progress feedback"
git push origin dev
gh pr create --base main --head dev \
  --title "HF-087: Fix import UX — client fetch timeout + recovery + progress" \
  --body "## Problem
SCI execute takes 60+ seconds for plan interpretation. Browser fetch drops connection.
Server succeeds but user sees 'Failed to fetch'. User retries, creating duplicates.

## Fix
1. Extended client-side fetch timeout to 300s (matches server maxDuration)
2. Post-failure recovery check — polls plan-readiness to detect silent server success
3. Duplicate submission prevention — disable button during execution
4. Progress feedback — elapsed timer + 'do not close' message

## Evidence
Vercel logs show plan saved successfully while browser showed failure:
\`\`\`
[SCI Execute] Plan saved: Optometrist Incentive Plan, 7 components
\`\`\`

**Must deploy to production — user currently sees failure on every plan import.**"

gh pr merge --squash
```

**Proof gate PG-02:** Build clean. PR merged to main. Vercel deploying.

**Commit:** `HF-087 Phase 2: Deployed to production`

---

# PHASE 3: COMPLETION REPORT

```markdown
# HF-087 COMPLETION REPORT
## Client-Side Fetch Timeout Fix

### Problem
SCI execute takes ~60 seconds for AI plan interpretation. Browser fetch times out.
Server succeeds, user sees "Failed to fetch". Retries create duplicate rule_sets.

### Root Cause
File: [path:line]
[Describe: no timeout / short timeout / no AbortController / etc.]

### Fix
1. **Fetch timeout:** [X]ms → 300,000ms (5 minutes, matches server maxDuration)
2. **Recovery check:** After fetch failure, poll plan-readiness to detect silent success
3. **Duplicate prevention:** Button disabled during execution, guard against re-submission
4. **Progress feedback:** Elapsed timer, "do not close" message for long operations

### Files Changed
- [list]

### Deployed
PR #[X] merged to main.
```

**Commit:** `HF-087 Phase 3: Completion report`

---

## ANTI-PATTERNS

| Don't | Do |
|-------|-----|
| Only extend the timeout | Also add recovery check — network can still fail |
| Show a generic error on timeout | Check if server succeeded before showing error |
| Allow retry while still processing | Disable button, prevent duplicate rule_sets |
| Show a frozen progress bar for 60+ seconds | Show elapsed time + reassurance message |
| Modify the server-side execute route | This HF is CLIENT-SIDE ONLY — server already works |
| Set timeout to infinity | 300s matches server limit — if server times out, client should too |
