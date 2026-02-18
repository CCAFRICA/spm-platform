# HF-040: PLAN IMPORT UUID + PERSONNEL PAGE CRASH

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every fix sequentially. Commit after each fix. Push after each commit.

---

## WHY THIS HOTFIX EXISTS

CLT-59 browser testing revealed two blocking issues:

**Bug 1: Plan Import 500 Error**
- URL: `vialuce.ai/admin/launch/plan-import`
- Console: `POST https://vialuce.ai/api/plan/import 500 (Internal Server Error)`
- Error: `invalid input syntax for type uuid: 'VL Platform Admin'`
- Impact: Cannot save any AI-interpreted plan. Blocks customer onboarding.

**Bug 2: Personnel Page Crash**
- URL: `vialuce.ai/configure/people`
- Console: `Error: Seems like you have not used custard provider as an ancestor`
- Impact: "Something went wrong" error page. Configure → People completely broken.

Both must be fixed before co-founder testing begins.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Inline styles for any visual fixes.
4. This is a hotfix — minimal changes, maximum precision. Do NOT refactor, reorganize, or "improve" adjacent code.

---

# ═══════════════════════════════════════════════════
# FIX 1: PLAN IMPORT UUID — "VL Platform Admin" sent as tenantId
# ═══════════════════════════════════════════════════

## Root Cause

The plan import handler sends a `tenantId` to `/api/plan/import`, but the value being sent is the user's display name or scope label (`'VL Platform Admin'`) instead of the actual tenant UUID (`'9b2b0a40-...'`).

The CLT-59 console shows both values — the correct tenant UUID IS available in context (`currentTenant: 9b2b0a40-6b02-4d13-b1fe-c83b5096849f`) but the wrong field is passed to the API.

## Diagnosis

```bash
echo "=== PLAN IMPORT PAGE — HOW tenantId IS SOURCED ==="
grep -rn "tenantId\|tenant_id\|tenant\.id\|currentTenant" web/src/app/*/launch/plan-import/ --include="*.tsx" --include="*.ts" | head -20

echo ""
echo "=== PLAN IMPORT HANDLER ==="
grep -rn "handleImport\|onImport\|savePlan\|confirmImport" web/src/app/*/launch/plan-import/ --include="*.tsx" --include="*.ts" | head -20

echo ""
echo "=== WHAT CONTEXT PROVIDES ==="
grep -rn "useTenant\|useTenantContext\|TenantContext\|tenant.*context" web/src/contexts/ --include="*.tsx" --include="*.ts" | head -10

echo ""
echo "=== API ROUTE — WHAT IT EXPECTS ==="
cat web/src/app/api/plan/import/route.ts 2>/dev/null | head -40
```

## Fix Pattern

Find where `tenantId` is assigned before the API call. It will look something like one of these:

```typescript
// WRONG patterns — any of these could be the bug:
const tenantId = user.display_name;        // "VL Platform Admin"
const tenantId = profile.scope_level;      // "VL Platform Admin"  
const tenantId = session.user.user_metadata.name; // "VL Platform Admin"
const tenantId = tenant?.name;             // "VL Platform Admin" (if tenant object has name not id)
```

Replace with:

```typescript
// CORRECT — use the tenant UUID from context
const tenantId = tenant?.id;               // "9b2b0a40-6b02-4d13-b1fe-c83b5096849f"
// OR from the tenant context hook:
const { tenant } = useTenant();
const tenantId = tenant?.id;
```

If the tenant context provides an object, ensure `.id` is used, not `.name` or `.slug`.

**Also check:** The API route itself. If the route extracts tenantId from the request body, ensure it validates UUID format before passing to Supabase:

```typescript
// Add validation at top of API route:
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!tenantId || !UUID_REGEX.test(tenantId)) {
  return NextResponse.json(
    { error: `Invalid tenantId: expected UUID, got "${tenantId}"` },
    { status: 400 }
  );
}
```

This prevents cryptic Postgres errors and gives a clear error message for debugging.

## Secondary Check — Other API routes with same pattern

The same bug might exist in other API routes that accept tenantId. Check:

```bash
echo "=== ALL API ROUTES THAT ACCEPT tenantId ==="
grep -rn "tenantId\|tenant_id" web/src/app/api/ --include="*.ts" | grep -v node_modules | head -20

echo ""
echo "=== ALL PLACES tenantId IS SENT TO AN API ==="
grep -rn "tenantId.*fetch\|body.*tenantId\|JSON.stringify.*tenantId" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | head -20
```

If any other API call sends a non-UUID value as tenantId, fix those too.

## Verification

```bash
echo "=== VERIFY FIX ==="
# 1. Check the plan import page now uses tenant.id (UUID)
grep -n "tenantId" web/src/app/*/launch/plan-import/page.tsx | head -10

# 2. Check API route has UUID validation
grep -c "UUID\|uuid\|regex\|test.*tenantId" web/src/app/api/plan/import/route.ts

# 3. Build clean
cd web && npm run build
```

## Proof Gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1 | Plan import sends UUID not name | `grep -n "tenantId" web/src/app/*/launch/plan-import/page.tsx` shows `.id` reference | UUID pattern visible |
| PG-2 | API route validates UUID | `grep -c "UUID\|uuid\|regex" web/src/app/api/plan/import/route.ts` | ≥1 |
| PG-3 | Build passes | `npm run build` exit code | 0 |

**Commit:** `HF-040 Fix 1: Plan import sends tenant UUID instead of display name`

---

# ═══════════════════════════════════════════════════
# FIX 2: PERSONNEL PAGE CRASH — Missing context provider
# ═══════════════════════════════════════════════════

## Root Cause

The Personnel page at `/configure/people` crashes with:
```
Error: Seems like you have not used custard provider as an ancestor
```

This is a custom error message (misspelling of "context") from a context hook that's being called outside its provider. The component tree for this page is missing a required context wrapper.

## Diagnosis

```bash
echo "=== FIND THE ERROR SOURCE ==="
grep -rn "custard\|custard provider\|not used.*provider.*ancestor" web/src/ --include="*.tsx" --include="*.ts" | head -10

echo ""
echo "=== PERSONNEL PAGE ==="
cat web/src/app/configure/people/page.tsx 2>/dev/null | head -40
# Also check alternate paths:
find web/src/app -path "*people*" -name "page.tsx" | head -5
find web/src/app -path "*personnel*" -name "page.tsx" | head -5

echo ""
echo "=== WHAT CONTEXT IS NEEDED ==="
grep -rn "useContext\|createContext\|Provider" web/src/app/configure/ --include="*.tsx" --include="*.ts" | head -20

echo ""
echo "=== LAYOUT FOR CONFIGURE ==="
find web/src/app/configure -name "layout.tsx" | head -5
cat web/src/app/configure/layout.tsx 2>/dev/null | head -30
```

## Fix Pattern

The fix depends on diagnosis. Common patterns:

**Pattern A: Missing provider in layout**
If the Personnel page uses a context that's not provided by the Configure layout:

```typescript
// In configure/layout.tsx or configure/people/layout.tsx:
import { SomeProvider } from '@/contexts/some-context';

export default function ConfigureLayout({ children }) {
  return <SomeProvider>{children}</SomeProvider>;
}
```

**Pattern B: Component assumes a provider that only exists in certain routes**
If the Personnel component uses a hook (e.g., `useEntityData` or `useCanvasData` or `useReactFlow`) that requires a provider only mounted in Design workspace:

```typescript
// Wrap the specific component call, not the whole page:
// Option 1: Add the provider
<EntityDataProvider>
  <PersonnelTable />
</EntityDataProvider>

// Option 2: Make the hook optional / provide fallback
const data = useOptionalContext(EntityContext) ?? { entities: [] };
```

**Pattern C: ReactFlow provider leaking**
If OB-59's Canvas work added a ReactFlow provider dependency that now bleeds into Configure:

```bash
grep -rn "ReactFlow\|ReactFlowProvider\|@xyflow" web/src/app/configure/ --include="*.tsx" | head -5
```

If found, remove the ReactFlow dependency from the Configure route. ReactFlow should only be in Design.

**Pattern D: The error message source is a third-party library**
```bash
# Find if "custard" is in node_modules
grep -rn "custard" web/node_modules/@xyflow/ 2>/dev/null | head -5
grep -rn "custard" web/node_modules/reactflow/ 2>/dev/null | head -5
```

If the "custard provider" message comes from @xyflow/react, it means a ReactFlow component is being rendered outside of `<ReactFlowProvider>`. The Personnel page is probably importing or rendering a component that transitively depends on ReactFlow.

Fix: either wrap in `<ReactFlowProvider>` (if Personnel legitimately needs it) or remove the ReactFlow-dependent import (more likely — Personnel should not need ReactFlow).

## Verification

```bash
echo "=== VERIFY FIX ==="
# 1. No more "custard" errors
cd web && npm run build

# 2. Personnel page renders
npm run dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}" localhost:3000/configure/people
# Should be 200 or 307 (auth redirect), NOT 500

# 3. Design page still works (canvas not broken by fix)
curl -s -o /dev/null -w "%{http_code}" localhost:3000/design
```

## Proof Gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-4 | No "custard" error in build | `npm run build` passes | Exit 0 |
| PG-5 | Personnel page doesn't crash | `curl -s localhost:3000/configure/people` | Not 500 |
| PG-6 | Design page still works | `curl -s localhost:3000/design` | Not 500 |

**Commit:** `HF-040 Fix 2: Personnel page crash — missing context provider`

---

# ═══════════════════════════════════════════════════
# FIX 3: VERIFY NO OTHER UUID/CONTEXT BUGS
# ═══════════════════════════════════════════════════

## Cross-cutting check

Since the UUID bug affected plan import, check ALL API calls for the same pattern:

```bash
echo "=== ALL fetch() CALLS WITH tenantId IN BODY ==="
grep -rn "tenantId" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".d.ts" | grep -v "route.ts" | head -30

echo ""
echo "=== VERIFY ALL API ROUTES HANDLE tenantId SAFELY ==="
for route in $(find web/src/app/api -name "route.ts"); do
  echo "--- $route ---"
  grep -c "tenantId" "$route"
done
```

For any API route that receives `tenantId`:
1. Verify it validates UUID format
2. Verify the calling component sends `tenant.id` (UUID), not `tenant.name` or user display name

## Check for other pages with missing providers

```bash
echo "=== ALL PAGES IN CONFIGURE WORKSPACE ==="
find web/src/app/configure -name "page.tsx" | sort

echo ""
echo "=== ALL useContext CALLS IN CONFIGURE ==="
grep -rn "use[A-Z].*Context\|use[A-Z].*Data\|use[A-Z].*Flow" web/src/app/configure/ --include="*.tsx" | head -20
```

If any other Configure pages use contexts that might not be provided, fix them with the same pattern used for Personnel.

## Proof Gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-7 | All API routes validate tenantId | Visual check of grep output | All routes handling tenantId have validation |
| PG-8 | Full build clean | `npm run build` | Exit 0 |

**Commit:** `HF-040 Fix 3: Cross-cutting UUID and context provider verification`

---

# ═══════════════════════════════════════════════════
# FINAL: BUILD + PR
# ═══════════════════════════════════════════════════

```bash
cd web
rm -rf .next
npm run build
npm run dev &
sleep 5

echo "=== HF-040 FINAL VERIFICATION ==="
echo "1. Build:"
echo $?

echo ""
echo "2. localhost responds:"
curl -s -o /dev/null -w "%{http_code}" localhost:3000

echo ""
echo "3. No 'custard' in codebase (except node_modules):"
grep -rn "custard" web/src/ --include="*.tsx" --include="*.ts" | wc -l

echo ""
echo "4. Plan import page references tenant.id:"
grep "tenantId\|tenant\.id\|tenant_id" web/src/app/*/launch/plan-import/page.tsx | head -5
```

## Create completion report

Create `HF-040_COMPLETION_REPORT.md` at project root:

```markdown
# HF-040: Plan Import UUID + Personnel Page Crash

## Fixes Applied
| Fix | Issue | Root Cause | Resolution |
|-----|-------|-----------|------------|
| 1 | Plan Import 500 | tenantId sent as display name, not UUID | Changed to tenant.id from context |
| 2 | Personnel crash | Context provider missing from Configure route | [Describe actual fix] |
| 3 | Cross-cutting | Verify no other UUID/context bugs | [Describe findings] |

## Proof Gates: 8
[Terminal evidence for each gate]
```

## Create PR

```bash
gh pr create --base main --head dev \
  --title "HF-040: Plan Import UUID + Personnel Page Crash" \
  --body "## CLT-59 Bug Fixes

### Fix 1: Plan Import 500 Error
- **Bug:** Plan import API received 'VL Platform Admin' as tenantId instead of UUID
- **Fix:** Changed tenantId source to tenant.id from context + added UUID validation in API route
- **Impact:** Plan import now saves successfully

### Fix 2: Personnel Page Crash  
- **Bug:** Configure → People → Personnel crashed with missing context provider error
- **Fix:** [Actual fix description]
- **Impact:** Personnel page renders correctly

### Fix 3: Cross-Cutting Verification
- Verified all API routes validate tenantId format
- Verified no other Configure pages have missing providers

## Proof Gates: 8 — see HF-040_COMPLETION_REPORT.md"
```

**Commit:** `HF-040: Completion report + PR`

---

## PROOF GATE SUMMARY (8 gates)

| # | Gate | Fix |
|---|------|-----|
| PG-1 | Plan import sends UUID | Fix 1 |
| PG-2 | API validates UUID format | Fix 1 |
| PG-3 | Build passes after Fix 1 | Fix 1 |
| PG-4 | No "custard" build error | Fix 2 |
| PG-5 | Personnel page doesn't crash | Fix 2 |
| PG-6 | Design page still works | Fix 2 |
| PG-7 | All API routes validate tenantId | Fix 3 |
| PG-8 | Full build clean | Final |

---

*HF-040 — February 18, 2026*
*"Two CLT-59 blockers fixed before co-founder testing begins."*
