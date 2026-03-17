# HF-125: Tenant Admin Journey — Zero Dead Ends, Zero Access Blocks
## Every step Patricia Zambrano needs to operate BCL must work. No workarounds.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE_LIVE.md` — actual database schema (generated March 7, 2026 from live Supabase)
3. This prompt in its entirety

---

## CLT REGISTRY CROSS-REFERENCE (R7 + R8)

**This HF addresses or relates to the following existing findings. CC must read these before writing any code.**

### Findings This HF Directly Fixes

| ID | Finding | Priority | Status Before | Session |
|----|---------|----------|---------------|---------|
| CLT118-F1 | Tenant admin gets "Access Restricted" on calculate | **P0** | ❌ OPEN 11 DAYS | CLT-118, March 1 |
| CLT166-F01 | /operate STILL redirects to /stream after OB-166 | **P0** | ❌ OPEN | CLT-166, March 12 |
| CLT166-F02 | Empty Intelligence Stream shows blank page — no guidance | **P0** | ❌ OPEN | CLT-166, March 12 |
| CLT166-F03 | Default landing is /stream even when no data exists | **P1** | ❌ OPEN | CLT-166, March 12 |
| CLT165-F02 | /operate redirects to /stream (OB-165 regression) | **P0** | ❌ PERSISTS | CLT-165, March 12 |

### Findings in the Same Pattern Family (CC Must Not Repeat)

| ID | Finding | Relevance |
|----|---------|-----------|
| CLT122-F72 | After last plan import, dropped to blank page | Same dead-end pattern as CLT166-F02. Every completed action must show next step. |
| CLT122-F8 | New tenant lands on Data Import, no onboarding guidance | Same missing-guidance pattern. |
| CLT122-F9 | No contextual guidance for new users | Same family. |
| CLT111-F41 | Calculate empty state suggests upload, not calc | Empty state must guide to the correct NEXT action, not a generic action. |
| CLT51A-F47 | Dead-end pages in navigation — 36 stubs | /stream blank is another dead end. |
| CLT51A-F30 | Rep shows "No Outcome" despite admin showing data | Same entity-resolution family as CLT165-F01. |

### Findings That May Block Calculation Even After Access Is Fixed

| ID | Finding | Risk | Mitigation |
|----|---------|------|------------|
| CLT111-F43 | Calc fails — no entity rule_set_assignments | **HIGH** | BCL convergence bindings survived the data wipe (Vercel logs show "4 component bindings"). Convergence may handle routing without explicit assignments. But CC must VERIFY: after fixing access, does calculation actually produce results? If it returns $0 or errors, this is the likely cause. |
| CLT122-F77 | No entities assigned to plans | **HIGH** | Same root cause as F43. The convergence architecture may bypass this for BCL because bindings were pre-established, but this is not guaranteed. |
| CLT122-F80 | Platform does not wire imports → calculable state | **MEDIUM** | This was the "core gap" in CLT-122. For BCL specifically, the pipeline import (OB-164) proved this works. But through browser import with clean-slate entities, the wiring must be verified. |

### Findings Superseded by This HF (Update Status After Merge)

| ID | Current Status | New Status After HF-125 |
|----|---------------|------------------------|
| CLT118-F1 | ❌ OPEN | Should become ✅ FIXED if calculate access resolved |
| CLT165-F02 | ❌ PERSISTS | Should become ✅ FIXED if /operate restored |
| CLT166-F01 | ❌ OPEN | Should become ✅ FIXED if /operate restored |
| CLT166-F02 | ❌ OPEN | Should become ✅ FIXED if empty state added |
| CLT166-F03 | ❌ OPEN | Should become ✅ FIXED if empty state routes to import |

---

## THE PROBLEM

Patricia Zambrano is the BCL tenant administrator (email: admin@bancocumbre.ec, profiles.role = 'admin', tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'). She must be able to complete this journey without hitting a dead end, a blank screen, or an access restriction:

1. Login → land somewhere useful (not blank)
2. Navigate to import → upload data
3. Navigate to calculate → run calculation
4. See results

Currently this journey fails at FOUR points:
- Login lands on blank `/stream` (no data, no guidance, dead end)
- Sidebar "Operate" link fails back to `/stream` (OB-166 Phase 1 fix did not work)
- Calculate page shows "Access Restricted" (RequireRole blocks tenant admin)
- `/operate/calculate` route — need to verify this exists and is accessible

## WHAT SUCCESS LOOKS LIKE

After this HF merges, Patricia logs into vialuce.ai and can:
1. See actionable guidance (not blank screen)
2. Click sidebar → reach Operate workspace → reach Import, Calculate, Reconciliation
3. Run a calculation without "Access Restricted"
4. See results

---

## CC EVASION WARNINGS

**CC will attempt to do the following. Do NOT allow it:**

1. **CC will mark a phase PASS based on code changes without testing the rendered output.** Every phase in this HF has a localhost verification step. If CC skips the verification step and reports PASS, the HF has failed.

2. **CC will fix one route and assume the other routes work.** Each route listed below must be individually verified by navigating to it on localhost and confirming it renders content (not blank, not redirect, not "Access Restricted").

3. **CC will change RequireRole to allow 'admin' but not verify the JWT user_metadata.role actually matches.** The three-layer auth system (OB-67) checks user_metadata.role FIRST (middleware, JWT), then falls back to profiles.role. If Patricia's JWT has a different role string than what RequireRole expects, the fix won't work. CC must verify the ACTUAL role string, not assume it.

4. **CC will create a new calculate route instead of fixing access to the existing one.** There are potentially two calculate paths: `/admin/launch/calculate` and `/operate/calculate`. CC must identify which one the sidebar links to, verify THAT route works, and ensure no duplicate routes exist.

5. **CC will "fix" the /operate redirect by adding conditional logic instead of simply removing the redirect.** The fix is to restore /operate to its pre-OB-165 state. Not conditional redirects. Not "if no data, redirect to stream." Restore the original page.

6. **CC will report "calculate page renders" and skip verifying that calculation actually works.** CLT111-F43 and CLT122-F77 document that page access ≠ calculation success. Entities may have no rule_set_assignments, causing $0 results. Phase 2B exists specifically for this. CC must verify the data path, not just the UI.

7. **CC will fix the empty state by showing a generic "loading" spinner instead of actionable guidance.** The empty state must contain a specific call to action ("Import Data →") that navigates to `/operate/import`. A spinner or "No data available" without an action button is a dead end — the same failure we're fixing.

---

## PHASE 0: DIAGNOSTIC — MAP THE ACTUAL STATE

**Do not write any fix code. Only observe and document.**

```bash
echo "============================================"
echo "HF-125 PHASE 0: DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: WHAT DOES /operate CURRENTLY RENDER? ==="
cat web/src/app/operate/page.tsx

echo ""
echo "=== 0B: WHAT DOES /perform CURRENTLY RENDER? ==="
cat web/src/app/perform/page.tsx

echo ""
echo "=== 0C: ALL CALCULATE ROUTES ==="
find web/src/app -path "*calculate*" -name "page.tsx" | sort
echo "--- /admin/launch/calculate ---"
cat web/src/app/admin/launch/calculate/page.tsx 2>/dev/null | head -40
echo "--- /operate/calculate ---"
cat web/src/app/operate/calculate/page.tsx 2>/dev/null | head -40

echo ""
echo "=== 0D: REQUIREROLE ON CALCULATE ==="
grep -rn "RequireRole\|allowedRoles\|vl_admin\|admin" \
  web/src/app/admin/launch/calculate/page.tsx \
  web/src/app/operate/calculate/page.tsx 2>/dev/null

echo ""
echo "=== 0E: MIDDLEWARE RESTRICTED_WORKSPACES ==="
grep -n "RESTRICTED\|restricted\|admin/launch\|workspace" \
  web/src/middleware.ts | head -20

echo ""
echo "=== 0F: SIDEBAR CALCULATE LINK ==="
grep -rn "calculate\|Calculate" \
  web/src/lib/navigation/workspace-config.ts \
  web/src/components/navigation/Sidebar.tsx 2>/dev/null | head -20

echo ""
echo "=== 0G: PATRICIA'S ACTUAL ROLE ==="
echo "RUN IN SUPABASE SQL EDITOR:"
echo "SELECT p.id, p.email, p.role, p.tenant_id,"
echo "  au.raw_user_meta_data->>'role' as jwt_role"
echo "FROM profiles p"
echo "JOIN auth.users au ON au.id = p.auth_user_id"
echo "WHERE p.email = 'admin@bancocumbre.ec';"

echo ""
echo "=== 0H: WHAT DOES /stream SHOW WHEN EMPTY? ==="
grep -n "empty\|no.*data\|no.*result\|loading\|error" \
  web/src/app/stream/page.tsx \
  web/src/lib/data/intelligence-stream-loader.ts | head -20

echo ""
echo "=== 0I: GIT DIFF — DID OB-166 PHASE 1 ACTUALLY CHANGE OPERATE? ==="
git log --oneline -5
git diff HEAD~4..HEAD -- web/src/app/operate/page.tsx
git diff HEAD~4..HEAD -- web/src/app/perform/page.tsx
```

**Document all findings. Include the Supabase query result for Patricia's role.**

**Commit:** `HF-125 Phase 0: Diagnostic — tenant admin journey blockers`

---

## PHASE 1: RESTORE /operate AS FUNCTIONAL ROUTE

**The problem:** `/operate/page.tsx` either still contains a redirect to `/stream`, or the redirect was replaced with something that doesn't render.

**The fix:**

1. Check the git history for the last working version of `/operate/page.tsx` BEFORE OB-165 (PR #230):
```bash
git log --oneline -- web/src/app/operate/page.tsx
git show <commit-before-OB-165>:web/src/app/operate/page.tsx > /tmp/operate-before.tsx
```

2. Restore that version. The Operate page should render the Pipeline Readiness Cockpit (OB-108) or whatever operational content existed before OB-165 replaced it with a redirect.

3. If the pre-OB-165 version cannot be recovered from git, create a minimal Operate landing page that shows the sidebar navigation to sub-routes (Import, Calculate, Reconciliation). NOT a redirect. NOT blank. A page with links to the operational functions.

4. Do the same for `/perform/page.tsx` if it was also replaced with a redirect.

**LOCALHOST VERIFICATION (MANDATORY — do not skip):**
```bash
# Start dev server
npm run dev

# In a separate terminal, verify the routes:
echo "Testing /operate..."
curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:3000/operate
# MUST return 200, NOT 307/302 to /stream

echo "Testing /operate/import..."
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/operate/import
# MUST return 200

echo "Testing /operate/calculate or /admin/launch/calculate..."
# Test whichever route the sidebar links to
```

**Commit:** `HF-125 Phase 1: Restore /operate as functional route — no redirect to /stream`

---

## PHASE 2: FIX CALCULATE ACCESS FOR TENANT ADMIN

**The problem:** The calculate page (at `/admin/launch/calculate` or `/operate/calculate`) wraps its content in `RequireRole` which checks the user's role. Patricia's role is 'admin' (profiles table), but:
- The middleware may check `user_metadata.role` from the JWT, which may have a DIFFERENT value
- The `/admin/launch` path may be in RESTRICTED_WORKSPACES which blocks at middleware level before RequireRole even runs
- The sidebar may link to a different calculate route than the one that's accessible

**The fix depends on what Phase 0 diagnostic reveals:**

### If the problem is RESTRICTED_WORKSPACES in middleware:
The `/admin/launch` workspace path is middleware-restricted. The middleware checks JWT `user_metadata.role`. If Patricia's JWT says 'admin' but middleware only allows 'vl_admin' for this workspace, she's blocked before the page loads.

**Fix option A (preferred):** Move the calculate functionality to `/operate/calculate` — a route that ISN'T in a restricted workspace. The Operate workspace is where Patricia works. Calculation belongs there, not under `/admin/launch`. Update the sidebar link to point to `/operate/calculate`.

**Fix option B:** Add 'admin' to RESTRICTED_WORKSPACES allowed roles for the `/admin/launch` path. This is less desirable because `/admin/launch` is architecturally a VL Admin workspace.

### If the problem is RequireRole on the page:
The OB-67 completion report shows `calculate/page.tsx` has `RequireRole wrapper (vl_admin, admin)` — so 'admin' SHOULD be allowed. If Patricia is still blocked, the issue is that her JWT `user_metadata.role` doesn't match 'admin'.

**Fix:** Verify Patricia's JWT role. Run the Phase 0G Supabase query. If `raw_user_meta_data->>'role'` is NULL or different from 'admin', update it:
```sql
-- Only run this if the JWT role is wrong/missing
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'),
  '{role}',
  '"admin"'
)
WHERE id = (
  SELECT auth_user_id FROM profiles
  WHERE email = 'admin@bancocumbre.ec'
);
```

### If the sidebar links to a route that doesn't exist:
Create the route, or redirect to the one that does exist.

**LOCALHOST VERIFICATION (MANDATORY):**

1. Log in as admin@bancocumbre.ec on localhost
2. Navigate to the calculate page via sidebar
3. The page MUST render calculation controls — NOT "Access Restricted"
4. Paste a screenshot or paste the terminal output showing the page loaded

**If you cannot log in as Patricia on localhost** (because demo auth users may not exist locally), then:
1. Verify the middleware and RequireRole code changes are correct by reading the code
2. Verify Patricia's JWT role via the Supabase query
3. Verify the route exists and has correct RequireRole allowlist
4. State explicitly: "Cannot verify as Patricia on localhost because [reason]. Production verification required by Andrew."

**Commit:** `HF-125 Phase 2: Fix calculate access for tenant admin role`

---

## PHASE 2B: VERIFY CALCULATION PRODUCES RESULTS (NOT JUST PAGE ACCESS)

**Why this phase exists:** CLT111-F43 and CLT122-F77 document that even when the calculate page is accessible, calculation can fail because entities have no rule_set_assignments. The BCL convergence bindings survived the data wipe (Vercel logs showed "4 component bindings, 0 derivations"), so convergence SHOULD handle entity-to-plan routing. But this must be verified, not assumed.

**After Phase 2 (calculate page accessible), trigger a calculation on localhost or verify the code path:**

1. Check whether `rule_set_assignments` exist for BCL entities:
```sql
SELECT COUNT(*) FROM rule_set_assignments
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

2. If COUNT = 0 (likely — we deleted them in the data wipe):
   - Check whether the calculation engine uses `rule_set_assignments` OR `convergence_bindings` to route entities to components
   - If the engine requires `rule_set_assignments`, the import pipeline must create them. Check whether entity resolution or convergence creates assignments:
   ```bash
   grep -rn "rule_set_assignments" web/src/lib/ web/src/app/api/ --include="*.ts" | grep -i "insert\|create\|upsert" | head -10
   ```
   - If nothing creates assignments during import, this is a blocker. Document it and add a step to create assignments from the existing convergence bindings.

3. If the engine uses convergence bindings directly (bypassing rule_set_assignments):
   - Verify convergence bindings exist:
   ```sql
   SELECT COUNT(*) FROM convergence_bindings
   WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
   -- OR check rule_sets.components JSONB for input_bindings
   SELECT id, name, components->0->'input_bindings' as bindings
   FROM rule_sets
   WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
   ```

4. **The test:** If you can trigger a calculation on localhost, do so. The result for BCL October must be non-zero. If it returns $0 for all entities, the assignment/binding gap is the cause — document the root cause and fix it.

**If calculation cannot be tested on localhost** (no demo auth users locally), document what you found in steps 1-3 and state: "Calculation result verification requires production test by Andrew."

**CC EVASION WARNING:** CC may skip this phase entirely and say "calculate page renders, PASS." Page rendering is NOT calculation succeeding. The page can render perfectly and still produce $0 because no entities are assigned. This phase verifies the DATA PATH, not the UI.

**Commit:** `HF-125 Phase 2B: Verify calculation data path — assignments or convergence bindings exist`

---

## PHASE 3: EMPTY STATE FOR INTELLIGENCE STREAM

**The problem:** When a tenant has zero calculation results, `/stream` renders a blank page. No guidance. No action. Dead end.

**The fix:** In the Intelligence Stream page (`web/src/app/stream/page.tsx` or the loader), detect the empty state and render a single actionable element:

```
No calculation data yet.

Import your data to get started.

[Import Data →]  (navigates to /operate/import)
```

This is NOT a new component. It is a conditional render in the existing stream page. When the data loader returns zero results, show this message with a navigation button instead of blank space.

**Requirements:**
- The message must NOT be hardcoded to BCL or any tenant
- The "Import Data →" button must navigate to `/operate/import`
- If calculation results exist but the intelligence cards fail to render for another reason, this empty state must NOT mask the error. Only show it when the query genuinely returns zero results.

**LOCALHOST VERIFICATION:**
Navigate to `/stream` for a tenant with zero calculation_results. The page must show the empty state message with the import button, NOT a blank page.

**Commit:** `HF-125 Phase 3: Empty state for Intelligence Stream — actionable guidance, not blank`

---

## PHASE 4: VERIFY FULL JOURNEY ON LOCALHOST

**This phase produces NO code changes.** It is a verification pass.

Log in as a tenant admin on localhost (if possible) and walk through:

1. `/stream` → shows empty state with "Import Data →" button (Phase 3)
2. Click "Import Data →" → arrives at `/operate/import` (not redirect, not blank)
3. Sidebar "Operate" → arrives at `/operate` (not redirect to /stream) (Phase 1)
4. Sidebar "Calculate" → arrives at calculate page (not "Access Restricted") (Phase 2)
5. If calculation can be triggered → produces non-zero results (Phase 2B)

**If any step fails, go back and fix it before proceeding.**

**Document the results in the completion report. For each step, state: route tested, what rendered, PASS or FAIL.**

**CLT Registry entries to update in completion report:**

| Finding | Expected New Status |
|---------|-------------------|
| CLT118-F1 | ✅ FIXED — if step 4 passes |
| CLT165-F02 / CLT166-F01 | ✅ FIXED — if step 3 passes |
| CLT166-F02 / CLT166-F03 | ✅ FIXED — if step 1 passes |
| CLT111-F43 / CLT122-F77 | ✅ FIXED or DOCUMENTED BLOCKER — if step 5 passes or fails |

---

## PHASE 5: BUILD + COMPLETION REPORT

```bash
# Kill dev server
# rm -rf .next
npm run build
```

**Build must exit 0.**

Create `HF-125_COMPLETION_REPORT.md`:

```markdown
# HF-125 Completion Report — Tenant Admin Journey

## Phase 0: Diagnostic
[Paste findings for each 0A-0I diagnostic]
[Paste Patricia's actual JWT role from Supabase query]

## Phase 1: /operate Restored
- What /operate/page.tsx contained before fix: [redirect to /stream / other]
- What it contains after fix: [restored page / new landing]
- Localhost test: curl output showing 200 (not 307)

## Phase 2: Calculate Access Fixed
- Root cause: [middleware block / RequireRole mismatch / JWT role missing]
- Fix applied: [route moved / middleware updated / JWT updated / RequireRole updated]
- Calculate route that sidebar links to: [exact path]
- Localhost test: [page renders / screenshot / terminal output]

## Phase 2B: Calculation Data Path
- rule_set_assignments count for BCL: [number]
- convergence_bindings or input_bindings status: [exist / missing]
- Calculation test result: [non-zero / $0 / not testable on localhost]
- If $0: root cause and fix applied: [description]

## Phase 3: Empty State
- /stream with zero results: [renders empty state message with import button]

## Phase 4: Journey Verification
- Step 1 (/stream empty state): PASS/FAIL — [what rendered]
- Step 2 (Import Data → button): PASS/FAIL — [what rendered]
- Step 3 (Sidebar Operate): PASS/FAIL — [what rendered]
- Step 4 (Sidebar Calculate): PASS/FAIL — [what rendered]
- Step 5 (Calculation produces results): PASS/FAIL/DEFERRED — [result or reason]

## CLT Registry Updates
| Finding | Previous Status | New Status | Evidence |
|---------|----------------|------------|----------|
| CLT118-F1 (Access Restricted) | ❌ OPEN | [status] | [evidence] |
| CLT165-F02 / CLT166-F01 (/operate redirect) | ❌ OPEN | [status] | [evidence] |
| CLT166-F02 (blank /stream) | ❌ OPEN | [status] | [evidence] |
| CLT111-F43 (no assignments) | ❌ OPEN | [status] | [evidence] |

## Build
[Paste last 10 lines of npm run build output]
```

**Commit:** `HF-125 Phase 5: Completion report + build verification`

---

## PHASE 6: PR

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-125: Tenant Admin Journey — Restore Operate, Fix Calculate Access, Empty State" \
  --body "## What This Fixes
- /operate redirected to /stream — restored as functional workspace
- Calculate page blocked tenant admin — access fixed
- Empty /stream showed blank page — now shows actionable guidance

## The Journey That Must Work
Patricia Zambrano (tenant admin, BCL) logs in → sees guidance → navigates to import → navigates to calculate → runs calculation → sees results.

## Root Causes
[From Phase 0 diagnostic — paste actual findings]

## Evidence
See HF-125_COMPLETION_REPORT.md"
```

---

## REGRESSION — DO NOT BREAK

- Meridian admin stream: MX$185,063 must still render
- BCL import pipeline: 85 entities created from transaction data must persist
- VL Admin access: must retain full access to all routes
- Intelligence Stream with data: must still render cards (BCL after data re-import, Meridian)

---

## FILES LIKELY TOUCHED

Based on Phase 0 diagnostic, these are the files CC will need to modify:

| File | Change | Risk |
|------|--------|------|
| `web/src/app/operate/page.tsx` | Remove redirect, restore content | CC may add conditional logic instead of clean restore |
| `web/src/app/stream/page.tsx` | Add empty state render | CC may mask errors with empty state |
| `web/src/middleware.ts` | Possibly add 'admin' to workspace access | CC may break VL Admin access |
| `web/src/app/admin/launch/calculate/page.tsx` OR `web/src/app/operate/calculate/page.tsx` | Fix RequireRole or move route | CC may create duplicate route |
| `web/src/lib/auth/role-permissions.ts` | Possibly update role allowlists | CC may over-broaden permissions |

---

*"A tenant administrator must be able to operate their own tenant. Every route the sidebar shows must be accessible. Every blank screen is a failure. No workarounds."*
