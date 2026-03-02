# HF-080: Create New Tenant Button Regression — Not Responding

## READ FIRST
- `CC_STANDING_ARCHITECTURE_RULES.md` — ALL sections
- `SCHEMA_REFERENCE.md` — tenants, profiles tables

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Complete all phases, all proof gates, commit, push, PR.

---

## PROBLEM STATEMENT

**Regression.** The "Create New Tenant" button on the VL Admin Observatory (`/select-tenant`) previously worked — multiple tenants were successfully created through it, including Mexican Bank Co. Now clicking it fires but nothing happens. No modal, no navigation, no error, no network request.

**This is blocking creation of a new test tenant for the Caribe Financial demo walkthrough.**

---

## DIAGNOSTIC PHASE (MANDATORY — commit findings before fixing)

### Step 1: Find the Create New Tenant click handler

```bash
grep -rn "Create New Tenant\|createTenant\|new.*tenant\|handleCreate" src/ --include="*.tsx" --include="*.ts" | head -30
```

### Step 2: Trace the click path

Find the button component, its onClick handler, and what it's supposed to do (open modal? navigate? call API?). Check:
- Is the click handler wired?
- Does it open a modal that fails to render?
- Does it navigate to a route that no longer exists?
- Is there a conditional that prevents execution (e.g., a feature flag, a permission check)?

### Step 3: Check for recent changes that could cause the regression

The last 4 PRs merged were:
- PR #134 (OB-121 — calculation hygiene)
- PR #135 (HF-078 — error message fix)
- PR #136 (HF-079 — DELETE fix, eliminated dual code path in calculation)
- PR #137 (OB-122 — SHEET_COMPONENT_PATTERNS removal)

None of these should have touched the Observatory or tenant creation. Check:
```bash
git log --oneline --name-only HEAD~4..HEAD | grep -i "tenant\|observatory\|select-tenant\|create"
```

If none of these PRs touched the relevant files, the regression may be older than this session.

### Step 4: Check browser console

Open browser DevTools console on `/select-tenant`, click "Create New Tenant". Look for:
- JavaScript errors
- Failed network requests
- Console warnings about missing components or undefined handlers

### Step 5: Check if the modal component still exists

```bash
grep -rn "CreateTenant\|TenantModal\|TenantForm\|tenant.*modal\|tenant.*dialog" src/ --include="*.tsx" --include="*.ts" | head -20
```

---

## FIX

Based on diagnostic findings, restore the Create New Tenant flow to working state. The flow previously:
1. Clicked "Create New Tenant" button
2. Opened a modal/form
3. Collected tenant details (name, slug, industry, etc.) and admin credentials
4. Created tenant record + admin user
5. New tenant appeared in Observatory

Whatever broke this chain needs to be fixed. Do NOT rebuild from scratch — find what broke and restore it.

---

## PROOF GATES

| Gate | Description | Verification |
|------|-------------|-------------|
| PG-01 | Root cause identified | Exact file:line showing what broke the click handler |
| PG-02 | `npm run build` clean | Zero TypeScript errors |
| PG-03 | Create Tenant button responds | Click → modal/form appears |
| PG-04 | Tenant creation succeeds | Fill form → submit → tenant created |
| PG-05 | New tenant appears in Observatory | Fleet card visible after creation |
| PG-06 | New tenant appears in /select-tenant | Selectable in tenant picker |
| PG-07 | Admin login works for new tenant | Login with created credentials → lands in tenant |
| PG-08 | Existing tenants unaffected | All current tenants still accessible |

---

## CC FAILURE PATTERNS TO AVOID

- **Pattern 22 (RLS silent swallow):** If the creation API uses browser client, RLS may silently block the insert. Verify service role is used for privileged operations (auth.admin.createUser).
- **AP-14 (Partial state):** If tenant insert succeeds but user creation fails, clean up the orphaned tenant record.
- **AP-9 (Report PASS on code review):** Must test the full flow — create a tenant, verify it appears, log in as admin.

---

## GIT PROTOCOL

1. All work on `dev` branch
2. Commit diagnostic findings first
3. Commit fix
4. `git push origin dev`
5. Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
6. Test: create new tenant → verify in Observatory → login as admin
7. `gh pr create --base main --head dev --title "HF-080: Fix Create New Tenant button regression" --body "Root cause: [from diagnostic]. Tenant creation flow restored. All proof gates pass."`
