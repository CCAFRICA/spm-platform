# HF-128: Complete Tenant Admin Access — Every Route Patricia Needs
## No more whack-a-mole. Fix ALL access blocks in one PR. Then prove the vertical slice.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. `SCHEMA_REFERENCE_LIVE.md`
3. This prompt in its entirety

---

## CLT REGISTRY CROSS-REFERENCE

### The Pattern: `/admin/launch/*` Middleware Blocks Tenant Admin

This is the single most repeated access failure in the platform. Four CLT sessions, same root cause:

| Finding | Session | Route | Status |
|---------|---------|-------|--------|
| CLT118-F1 | CLT-118, Mar 1 | `/admin/launch/calculate` | ✅ FIXED by HF-125 (moved to /operate/calculate) |
| CLT122-F1 | CLT-122, Feb 28 | General admin access | ❌ OPEN |
| CLT167-F01 | CLT-167, Mar 12 | `/admin/launch/plan-import` | ❌ OPEN |
| CLT167-F02 (NEW) | CLT-167, Mar 12 | `/admin/launch/reconciliation` | ❌ PRESUMED BLOCKED |

### Root Cause
OB-67 created RESTRICTED_WORKSPACES in middleware.ts:
```
'/admin': ['platform']  ← ONLY platform role allowed
```
All routes under `/admin/*` are blocked for tenant admin (role='admin'). OB-67 then added RequireRole wrappers on individual pages allowing `(vl_admin, admin)` — but the middleware blocks BEFORE RequireRole runs.

HF-125 fixed Calculate by moving the sidebar link to `/operate/calculate` (which already existed). Plan import and reconciliation have NO `/operate/*` equivalents.

### Design Reference: OB-97 4-Workspace Model
OB-97 defined the navigation architecture. All tenant admin operations belong under OPERATE:
```
OPERATE (do things)
  ├── Operations Center (lifecycle subway)
  ├── Import Data
  ├── Calculate
  ├── Reconciliation
  └── Plan Import (or via Import Data unified surface)
```
Plan import under `/admin/launch` contradicts this model. It should be accessible through Operate.

### OB-94 Persona Visibility Matrix
| Item | Admin | Manager | Rep |
|------|:-----:|:-------:|:---:|
| Import (data + plan) | ✅ | ❌ | ❌ |
| Calculate | ✅ | ❌ | ❌ |
| Reconcile | ✅ | ❌ | ❌ |

All three are admin-only operations that must be accessible to tenant admin role.

---

## THE PROBLEM

Patricia Zambrano (BCL tenant admin) must complete this journey:

1. Import plan → AI interprets → rule_set created
2. Import roster → entities enriched
3. Import transaction data → committed_data
4. Calculate → results match GT ($44,590 for October)
5. View results

Steps 2-3 work (proven in this session). Step 4 works after HF-125/126/127.
**Step 1 is BLOCKED** — plan import at `/admin/launch/plan-import` returns "Access Restricted."
Step 5 is UNTESTED.

---

## CC EVASION WARNINGS

1. **CC will fix plan-import access but leave reconciliation blocked.** This HF fixes ALL `/admin/launch/*` routes that tenant admin needs. Not just the one Andrew hit today. CC must enumerate every route under `/admin/launch/` and verify each one.

2. **CC will add `admin` to the `/admin` middleware allowlist.** This is the WRONG fix — it opens ALL admin routes to tenant admin, including VL-only routes like tenant management. The correct fix is to move tenant-admin operations to `/operate/*` or create explicit route-level overrides. The middleware restriction on `/admin` exists for a reason.

3. **CC will create a new plan-import page under `/operate/` but not wire the sidebar or import flow to it.** The sidebar must link to the new route. Any "Import Plan" buttons elsewhere must point to the new route. The old route should redirect.

4. **CC will report PASS without verifying Patricia can actually upload a plan file.** The proof gate is: Patricia navigates to plan import, uploads BCL_Plan_Comisiones_2025.xlsx, the AI interprets it, a rule_set is created. Page access alone is not PASS.

5. **CC will skip the calculation verification.** After plan import, CC must verify that Calculate still works (HF-125/126/127 fixes preserved) and that the new plan produces correct results.

---

## PHASE 0: MAP ALL ROUTES PATRICIA NEEDS

```bash
echo "============================================"
echo "HF-128 PHASE 0: COMPLETE ROUTE MAP"
echo "============================================"

echo ""
echo "=== 0A: ALL ROUTES UNDER /admin/launch ==="
find web/src/app/admin/launch -name "page.tsx" | sort

echo ""
echo "=== 0B: MIDDLEWARE RESTRICTED_WORKSPACES ==="
grep -B 2 -A 10 "RESTRICTED\|restricted" web/src/middleware.ts

echo ""
echo "=== 0C: REQUIREROLE ON EACH /admin/launch ROUTE ==="
for f in $(find web/src/app/admin/launch -name "page.tsx"); do
  echo "--- $f ---"
  grep "RequireRole\|allowedRoles\|roles=" "$f" | head -3
done

echo ""
echo "=== 0D: ALL ROUTES UNDER /operate ==="
find web/src/app/operate -name "page.tsx" | sort

echo ""
echo "=== 0E: SIDEBAR CONFIG — ALL LINKS ==="
cat web/src/lib/navigation/workspace-config.ts

echo ""
echo "=== 0F: DOES /operate/plan-import EXIST? ==="
ls -la web/src/app/operate/plan-import/ 2>/dev/null || echo "DOES NOT EXIST"

echo ""
echo "=== 0G: DOES /operate/reconciliation EXIST? ==="
ls -la web/src/app/operate/reconciliation/ 2>/dev/null || echo "DOES NOT EXIST"
ls -la web/src/app/operate/reconcile/ 2>/dev/null || echo "DOES NOT EXIST"

echo ""
echo "=== 0H: CONFIGURE ROUTES — PEOPLE, PLANS, USERS ==="
for f in web/src/app/configure/people/page.tsx web/src/app/configure/plans/page.tsx web/src/app/configure/users/page.tsx; do
  echo "--- $f ---"
  grep "RequireRole\|allowedRoles" "$f" 2>/dev/null | head -3
  echo ""
done

echo ""
echo "=== 0I: RESULTS ROUTE ==="
ls -la web/src/app/operate/results/ 2>/dev/null || echo "DOES NOT EXIST"
grep "RequireRole" web/src/app/operate/results/page.tsx 2>/dev/null
```

**Document ALL findings. Build the complete route map showing which routes Patricia can and cannot access.**

**Commit:** `HF-128 Phase 0: Complete tenant admin route map`

---

## PHASE 1: MAKE ALL TENANT ADMIN ROUTES ACCESSIBLE

**The fix:** For every route Patricia needs that lives under `/admin/launch/*`, either:

**(A) PREFERRED:** Create an equivalent route under `/operate/*` that reuses the same page component, and update sidebar links. Add a redirect from the old `/admin/launch/*` path to the new `/operate/*` path. This follows the OB-97 4-workspace model.

**(B) FALLBACK:** If creating a new route is too complex (the page component depends on `/admin/launch` layout providers), add `'admin'` to the RequireRole list AND create a middleware exception for that specific path. NOT a blanket `admin` addition to `/admin` workspace.

### Routes to fix:

| Current Route | Required Action | New Route |
|---------------|----------------|-----------|
| `/admin/launch/plan-import` | Move to Operate | `/operate/plan-import` |
| `/admin/launch/reconciliation` | Move to Operate | `/operate/reconciliation` (if not already exists as `/operate/reconcile`) |
| `/admin/launch` (landing) | Low priority — redirect to `/operate` | N/A |

### For each route moved:
1. Create the new route page (can re-export the existing component)
2. Update sidebar config to point to new route
3. Add redirect from old route to new route
4. Verify RequireRole allows `['platform', 'admin']`
5. Verify middleware allows the `/operate/*` path for admin role

### Also verify these existing routes work for Patricia:
- `/operate/results` — can she see calculation results?
- `/configure/plans` — can she see/manage plans?
- `/configure/people` — CLT166-F08 shows 0 entities. Is this a route issue or query issue?

**LOCALHOST VERIFICATION (MANDATORY):**

Navigate to EACH of the following as a tenant admin (or verify via code + middleware analysis):

| Route | Expected | Must NOT show |
|-------|----------|---------------|
| `/operate/plan-import` (new) | Plan import page renders | "Access Restricted" |
| `/operate/reconciliation` (new or existing) | Reconciliation page renders | "Access Restricted" |
| `/operate/calculate` | Calculate page renders | "Access Restricted" |
| `/operate/import` | Data import page renders | "Access Restricted" |
| `/operate/results` | Results page renders | "Access Restricted" |
| `/operate` | Operations Overview renders | Redirect to /stream |

**Commit:** `HF-128 Phase 1: All tenant admin routes accessible under /operate`

---

## PHASE 2: VERIFY PLAN IMPORT WORKS

**This is NOT just an access check.** The plan import must actually function.

On localhost (or document what must be tested in production):

1. Navigate to the plan import route (new `/operate/plan-import`)
2. Upload a test plan file (any XLSX or PPTX)
3. Verify the AI interpretation fires
4. Verify a rule_set is created in the database

**If plan import cannot be tested on localhost** (requires AI API key, specific file, etc.):
1. Verify the route renders the plan import UI (not blank, not error)
2. Verify the file picker accepts files
3. State: "Full plan import verification requires production test by Andrew"

**Commit:** `HF-128 Phase 2: Plan import route accessible and functional`

---

## PHASE 3: COMPLETION REPORT

```markdown
# HF-128 Completion Report — Complete Tenant Admin Access

## Phase 0: Route Map
[Complete table of ALL routes, their middleware status, RequireRole, and accessibility for admin role]

## Phase 1: Routes Fixed
| Route | Previous | New Location | Access |
|-------|----------|-------------|--------|
| Plan import | /admin/launch/plan-import (BLOCKED) | /operate/plan-import | ✅ |
| Reconciliation | /admin/launch/reconciliation (BLOCKED) | /operate/reconciliation | ✅ |
| [any others discovered in Phase 0] | | | |

## Phase 2: Plan Import Verification
- Route renders: [YES/NO]
- File picker works: [YES/NO]
- AI interpretation: [TESTED/DEFERRED to production]

## Sidebar Updates
- [List every sidebar link that was changed]

## CLT Registry Updates
| Finding | Previous | New | Evidence |
|---------|----------|-----|----------|
| CLT118-F1 | FIXED (HF-125) | FIXED | Confirmed |
| CLT122-F1 | OPEN | [status] | [evidence] |
| CLT167-F01 | OPEN | FIXED | Plan import at /operate/plan-import |
| CLT167-F02 | PRESUMED BLOCKED | FIXED | Reconciliation at /operate/reconciliation |

## Regression
- /operate landing: still renders Pipeline Readiness Cockpit (HF-125)
- /operate/calculate: still accessible (HF-125)
- /operate/import: still works
- Meridian: unaffected
- VL Admin: retains full access to /admin/* routes

## Build
[Paste last 10 lines of npm run build]
```

**Commit:** `HF-128 Phase 3: Completion report`

---

## PHASE 4: PR

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-128: Complete Tenant Admin Access — All /admin/launch Routes Moved to /operate" \
  --body "## The Pattern (4 CLT sessions, same root cause)
/admin/* middleware restricts to platform role only. Tenant admin (role=admin) blocked from plan import, reconciliation, and any route under /admin/launch.

## The Fix
Moved all tenant admin operations to /operate/* (follows OB-97 4-workspace model). Sidebar updated. Old routes redirect.

## Routes Fixed
- Plan import: /admin/launch/plan-import → /operate/plan-import
- Reconciliation: /admin/launch/reconciliation → /operate/reconciliation
- [any others]

## Patricia's Complete Journey Now Works
Login → /operate → Import Plan → Import Data → Calculate → View Results
Every step accessible to tenant admin role.

## Evidence
See HF-128_COMPLETION_REPORT.md"
```

---

## REGRESSION — DO NOT BREAK

- VL Admin (`platform@vialuce.com`) MUST retain access to ALL routes including `/admin/*`
- `/operate/calculate` — HF-125 fix must persist
- `/operate/import` — must continue working
- HF-126 self-healing — must persist
- HF-127 button fix — must persist
- OB-167 normalization — must persist
- Meridian MX$185,063 — must persist

---

## WHAT HAPPENS AFTER THIS HF

After HF-128 merges and deploys, Andrew will:
1. Login as Patricia (admin@bancocumbre.ec)
2. Navigate to plan import → upload BCL_Plan_Comisiones_2025.xlsx
3. AI interprets the plan → rule_set created with correct rates ($25/$18 for C3, $150/$100 for C4)
4. Navigate to calculate → run October 2025
5. Compare result against GT $44,590
6. If correct: BCL vertical slice PROVEN — plan + roster + data + calculate, all through browser, all by tenant admin

This is the completion of the vertical slice that started at the beginning of this session.

---

*"Four CLT sessions. Same middleware. Same block. Fix them all at once. Then prove the vertical slice."*
