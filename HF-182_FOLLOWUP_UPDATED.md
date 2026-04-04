# HF-182 INCOMPLETE — Fix 9 + Fix 11 Verification Required
## DO NOT MERGE PR #328 until this is complete

---

## INCLUDE AT TOP OF PROMPT
- CC_STANDING_ARCHITECTURE_RULES.md v2.0

---

## WHAT IS MISSING

PR #328 delivered 8 of 12 fixes. Two items need correction before merge:

---

### Fix 9: Import History — NOT "N/A"

CC claimed "No history page exists (feature gap, not bug)" and skipped Fix 9. **This is incorrect.** The import history page EXISTS. The user navigated to it and saw "no import events found" despite multiple successful imports. The page renders, it just doesn't display data.

**Required action:**

1. Find the import page or import history component. Check these locations:
   ```bash
   find web/src -name "*.tsx" -path "*import*" | head -20
   grep -rn "import.*history\|import.*event\|no import" web/src/app/operate/import/ web/src/components/ --include="*.tsx" | head -20
   ```

2. Find the section that displays import history / import events

3. Trace what API it calls or what query it runs to fetch import events

4. Identify why it returns empty. Possible causes:
   - Querying the wrong table (should be `import_batches`)
   - Tenant filter not matching
   - Status filter excluding completed imports
   - Component exists but conditional rendering hides it
   - Data fetched but rendering logic has a bug

5. Fix the query or rendering so import events display correctly

**What to show per import event:**
- File name
- Timestamp
- Row count
- Classification (transaction, entity, reference, plan)
- Status (completed, failed, processing)

**Verification:**
```bash
# Find the import history query/component
grep -rn "import_batches\|ingestion_events\|import.*history\|ImportHistory\|no import" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -20
```

Paste the grep results AND the fix code.

**Commit:** `HF-182 Fix 9: Import history displays import events`

---

### Fix 11: Auth Cookie maxAge — VERIFY, DO NOT RE-FIX

CC removed `max-age=86400` from `tenant-context.tsx` in the current PR #328. That change is CORRECT — the tenant selection cookie should not have a maxAge.

**However**, the original CLT finding (CLT-181 F12) was about the AUTH SESSION cookie persisting through browser close. This was comprehensively fixed in **HF-167 (PR #304)** and **HF-168 (PR #305)** on March 23, 2026, across three files:

1. `web/src/lib/supabase/cookie-config.ts` — `maxAge` removed from `SESSION_COOKIE_OPTIONS`
2. `web/src/middleware.ts` — `setAll` callback overrides Supabase SSR's 400-day default with explicit `delete sessionOptions.maxAge`
3. `web/src/lib/supabase/server.ts` — Same `setAll` override with `delete sessionOptions.maxAge`

**There have been 20+ PRs since PR #304. The fix may have regressed.**

**Required action — VERIFICATION ONLY:**

1. Run these greps to verify HF-167's fixes are still intact:
   ```bash
   # 1. cookie-config.ts should NOT have maxAge in SESSION_COOKIE_OPTIONS
   echo "=== cookie-config.ts ==="
   grep -n "maxAge\|max_age" web/src/lib/supabase/cookie-config.ts

   # 2. middleware.ts should have delete sessionOptions.maxAge in setAll
   echo "=== middleware.ts setAll ==="
   grep -n "delete.*maxAge\|sessionOptions" web/src/middleware.ts

   # 3. server.ts should have delete sessionOptions.maxAge in setAll
   echo "=== server.ts setAll ==="
   grep -n "delete.*maxAge\|sessionOptions" web/src/lib/supabase/server.ts

   # 4. No maxAge being SET on auth cookies (only maxAge: 0 for deletion is OK)
   echo "=== All maxAge references ==="
   grep -rn "maxAge" web/src/lib/supabase/ web/src/middleware.ts --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next"
   ```

2. Paste ALL grep results in the completion report.

3. Based on the grep results, one of two outcomes:

   **If HF-167 is intact** (delete maxAge present in both middleware.ts and server.ts, no maxAge in SESSION_COOKIE_OPTIONS):
   - Report: "HF-167 auth session maxAge fix VERIFIED INTACT — no regression"
   - No code changes needed for Fix 11
   - The tenant-context.tsx fix already in PR #328 is a separate, valid fix for the tenant cookie

   **If HF-167 has REGRESSED** (delete maxAge missing, or maxAge re-introduced):
   - Report exactly what regressed (which file, which line, what it shows now)
   - Restore the HF-167 pattern:
     ```typescript
     // In setAll callback:
     const sessionOptions = { ...options, ...SESSION_COOKIE_OPTIONS };
     delete sessionOptions.maxAge;
     ```
   - Apply to BOTH middleware.ts and server.ts
   - Verify cookie-config.ts has no maxAge in SESSION_COOKIE_OPTIONS

**DO NOT re-implement HF-167 from scratch. Verify and restore if needed.**

**Commit (only if regression found):** `HF-182 Fix 11: Restore HF-167 auth maxAge override (regression fix)`

---

## BUILD VERIFICATION

After Fix 9 (and Fix 11 if regression found):

```bash
cd ~/spm-platform/web
rm -rf .next
npm run build

cd ~/spm-platform
git stash
npx tsc --noEmit 2>&1 | head -20
npm run lint 2>&1 | head -20
git stash pop
```

---

## COMPLETION REPORT UPDATE

Update the existing `HF-182_COMPLETION_REPORT.md` to include:

1. Fix 9: PASS/FAIL with pasted evidence (query code + grep results)
2. Fix 11: VERIFICATION results — paste ALL grep output showing HF-167 status
3. Updated commit list

**Commit:** `HF-182 Updated completion report`

---

## PUSH TO EXISTING PR

```bash
cd ~/spm-platform
git push origin dev
```

Push to the existing PR #328 branch. Do NOT create a new PR.

---

*"The auth maxAge was fixed in HF-167 across three files. Verify it's intact — don't re-fix what was already fixed."*
