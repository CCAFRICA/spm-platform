# OB-67: TMR ROLE GUARDS + USER PROVISIONING + PAGE STATUS INDICATORS

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

**MANDATORY:** Read CC_STANDING_ARCHITECTURE_RULES.md FIRST. Every decision in this OB must comply with all sections.

**CRITICAL RULE: Build EXACTLY what this prompt specifies. Do NOT substitute simpler alternatives. Do NOT skip deliverables. (Standing Rule 15)**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — All principles, anti-patterns, operational rules
2. `SCHEMA_TRUTH.md` — Authoritative column reference. Check BEFORE writing ANY Supabase query.
3. `OB-66_PLATFORM_AUDIT_MASTER.md` — This OB directly addresses P0 #3 (TMR gating at 9%)

---

## WHY THIS OB EXISTS

OB-66 audit found that **91% of pages have zero role guards**. A sales rep can navigate to `/admin/launch/calculate` and run calculations. A viewer can access `/api/platform/settings` and toggle feature flags. Authorization is decorative — authentication exists but authorization does not.

Simultaneously, the platform has no way to create users through the UI. Every user is created via Supabase Dashboard or seed scripts. This blocks all testing with real personas and makes demos fragile.

Finally, the 135-page sprawl needs a visual signal to users. Rather than cutting pages now, sidebar links to unfinished pages get a status indicator so users know what's active, what's coming, and what's placeholder.

**This OB delivers three things:**
1. **TMR Role Guards** — Middleware + component-level authorization across the entire platform
2. **User Provisioning** — Entity-to-user promotion + invite flow + user management table
3. **Page Status Indicators** — Sidebar badges showing page readiness

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev`
4. Supabase migrations: execute live AND verify with DB query
5. Fix logic, not data
6. Commit this prompt to git as first action
7. Domain-agnostic always
8. Brand palette: Deep Indigo (#2D2F8F) + Gold (#E8A838). DM Sans / Inter font family.
9. Before writing ANY Supabase query, verify column names against SCHEMA_TRUTH.md (AP-13)
10. profiles.id ≠ auth.uid(). Always use auth_user_id for auth matching.
11. Profile-to-entity linkage: entities.profile_id → profiles.id (NOT profiles.entity_id)

---

## PHASE 0: DIAGNOSTIC — CURRENT AUTH STATE

Before writing any code, understand exactly what exists.

```bash
echo "=== CURRENT AUTH/ROLE INFRASTRUCTURE ==="

echo "--- PersonaContext ---"
cat web/src/contexts/persona-context.tsx | head -80

echo ""
echo "--- Auth Context ---"
cat web/src/contexts/auth-context.tsx | head -80

echo ""
echo "--- Middleware ---"
cat web/src/middleware.ts | head -60

echo ""
echo "--- Role values in profiles ---"
echo "Known roles: vl_admin, admin, manager, viewer, sales_rep"

echo ""
echo "--- Pages with existing role guards ---"
grep -rn "role.*===\|role.*!==\|isAdmin\|isVlAdmin\|canAccess\|requireRole\|persona\s*===\|persona\s*!==\|capabilities.*includes" \
  web/src/app/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -30

echo ""
echo "--- Sidebar component ---"
find web/src/components -name "*sidebar*" -o -name "*Sidebar*" | grep -v node_modules | sort

echo ""
echo "--- User management pages ---"
find web/src/app -path "*personnel*" -o -path "*users*" -o -path "*invite*" | grep -v node_modules | sort

echo ""
echo "--- Existing invite API ---"
find web/src/app/api -path "*invite*" -o -path "*users*" -o -path "*signup*" | grep -v node_modules | sort
```

**Commit:** `OB-67 Phase 0: Diagnostic — current auth state audit`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD
============================
Problem: 91% of pages have no role-based access control. Need authorization
layer that restricts page access by role without breaking existing functionality.

Option A: Next.js Middleware only
  - Check role in middleware.ts, redirect unauthorized users
  - Scale test: Works at 10x? YES
  - AI-first: Any hardcoding? YES — role-to-page mapping in middleware
  - Transport: Data through HTTP bodies? NO
  - Atomicity: Clean state on failure? YES — redirect to /unauthorized

Option B: HOC wrapper (requireRole component)
  - Wrap page components with <RequireRole roles={['admin', 'vl_admin']}>
  - Scale test: Works at 10x? YES
  - AI-first: Any hardcoding? MINIMAL — roles declared per page
  - Transport: Data through HTTP bodies? NO
  - Atomicity: Clean state on failure? YES — renders unauthorized component

Option C: HYBRID — Middleware for workspace-level + HOC for page-level
  - Middleware blocks entire workspaces by role (fast, server-side)
  - HOC provides fine-grained page-level + action-level control (flexible)
  - Both read from PersonaContext (single source of truth)
  - Scale test: Works at 10x? YES
  - AI-first: Any hardcoding? MINIMAL — config-driven role maps
  - Transport: Data through HTTP bodies? NO
  - Atomicity: Clean state on failure? YES — two layers of protection

CHOSEN: Option C — Defense in depth. Middleware catches workspace-level violations
server-side (fast, zero client render). HOC catches page-level violations
client-side (flexible, can show contextual messaging).
REJECTED: Option A alone — too coarse. Option B alone — renders page before checking.
```

**Commit:** `OB-67 Phase 1: Architecture decision — hybrid middleware + HOC`

---

## PHASE 2: ROLE PERMISSION CONFIGURATION

### 2A: Create role permission config

Create `web/src/lib/auth/role-permissions.ts`:

```typescript
// SCHEMA_TRUTH.md role values: vl_admin, admin, tenant_admin, manager, viewer
// PersonaContext derives: admin, manager, rep

// Workspace-level access (checked by middleware)
export const WORKSPACE_ACCESS: Record<string, string[]> = {
  // workspace path prefix → roles that can access
  '/admin':        ['vl_admin'],
  '/operate':      ['vl_admin', 'admin', 'tenant_admin'],
  '/configure':    ['vl_admin', 'admin', 'tenant_admin'],
  '/configuration':['vl_admin', 'admin', 'tenant_admin'],
  '/govern':       ['vl_admin', 'admin', 'tenant_admin'],
  '/data':         ['vl_admin', 'admin', 'tenant_admin'],
  '/perform':      ['vl_admin', 'admin', 'tenant_admin', 'manager', 'viewer', 'sales_rep'],
  '/insights':     ['vl_admin', 'admin', 'tenant_admin', 'manager', 'viewer', 'sales_rep'],
  '/my-compensation': ['vl_admin', 'admin', 'tenant_admin', 'manager', 'viewer', 'sales_rep'],
  '/financial':    ['vl_admin', 'admin', 'tenant_admin', 'manager'],
  '/transactions': ['vl_admin', 'admin', 'tenant_admin', 'manager', 'viewer', 'sales_rep'],
  '/performance':  ['vl_admin', 'admin', 'tenant_admin', 'manager', 'viewer', 'sales_rep'],
};

// Page-level access (checked by RequireRole HOC — for finer grain)
export const PAGE_ACCESS: Record<string, string[]> = {
  '/admin/launch/calculate':       ['vl_admin', 'admin'],
  '/admin/launch/reconciliation':  ['vl_admin'],
  '/admin/launch/plan-import':     ['vl_admin', 'admin'],
  '/operate/calculate':            ['vl_admin', 'admin'],
  '/operate/approve':              ['vl_admin', 'admin', 'manager'],
  '/operate/pay':                  ['vl_admin', 'admin'],
  '/govern/calculation-approvals': ['vl_admin', 'admin'],
  '/configure/personnel':          ['vl_admin', 'admin'],
  '/configure/users':              ['vl_admin', 'admin'],
};

// Action-level permissions (checked inline)
export const ACTION_PERMISSIONS: Record<string, string[]> = {
  'import_data':        ['vl_admin', 'admin', 'tenant_admin'],
  'run_calculation':    ['vl_admin', 'admin'],
  'approve_results':    ['vl_admin', 'admin', 'manager'],
  'publish_results':    ['vl_admin', 'admin'],
  'manage_users':       ['vl_admin', 'admin'],
  'manage_tenants':     ['vl_admin'],
  'toggle_features':    ['vl_admin'],
  'submit_dispute':     ['vl_admin', 'admin', 'manager', 'viewer', 'sales_rep'],
  'view_team':          ['vl_admin', 'admin', 'manager'],
  'export_payroll':     ['vl_admin', 'admin'],
};

// Helper functions
export function canAccessWorkspace(role: string, path: string): boolean {
  const workspace = Object.keys(WORKSPACE_ACCESS).find(prefix => path.startsWith(prefix));
  if (!workspace) return true; // Unmatched paths are open (dashboard, login, etc.)
  return WORKSPACE_ACCESS[workspace].includes(role);
}

export function canAccessPage(role: string, path: string): boolean {
  const pageRoles = PAGE_ACCESS[path];
  if (!pageRoles) return true; // Unlisted pages use workspace-level access only
  return pageRoles.includes(role);
}

export function canPerformAction(role: string, action: string): boolean {
  const actionRoles = ACTION_PERMISSIONS[action];
  if (!actionRoles) return false; // Unknown actions are denied by default
  return actionRoles.includes(role);
}
```

### 2B: Create RequireRole HOC

Create `web/src/components/auth/RequireRole.tsx`:

```typescript
'use client';
import { usePersona } from '@/contexts/persona-context';
import { canAccessPage, canPerformAction } from '@/lib/auth/role-permissions';
import { usePathname } from 'next/navigation';

interface RequireRoleProps {
  roles?: string[];        // Explicit role list (overrides page config)
  action?: string;         // Check action permission instead of page
  fallback?: React.ReactNode; // Custom fallback (default: unauthorized message)
  children: React.ReactNode;
}

export function RequireRole({ roles, action, fallback, children }: RequireRoleProps) {
  const { profile } = usePersona();
  const pathname = usePathname();
  
  if (!profile?.role) {
    return fallback || <UnauthorizedMessage reason="loading" />;
  }
  
  const hasAccess = roles 
    ? roles.includes(profile.role)
    : action 
      ? canPerformAction(profile.role, action)
      : canAccessPage(profile.role, pathname);
  
  if (!hasAccess) {
    return fallback || <UnauthorizedMessage reason="role" role={profile.role} />;
  }
  
  return <>{children}</>;
}

function UnauthorizedMessage({ reason, role }: { reason: string; role?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
      <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
        <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m4-6a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-slate-800 mb-2">Access Restricted</h3>
      <p className="text-sm text-slate-500 max-w-md">
        {reason === 'loading' 
          ? 'Verifying your permissions...'
          : 'Your current role does not have access to this page. Contact your administrator if you believe this is an error.'}
      </p>
    </div>
  );
}

// Hook for inline permission checks
export function useCanPerform(action: string): boolean {
  const { profile } = usePersona();
  if (!profile?.role) return false;
  return canPerformAction(profile.role, action);
}
```

**Commit:** `OB-67 Phase 2: Role permission config + RequireRole HOC + useCanPerform hook`

---

## PHASE 3: MIDDLEWARE AUTHORIZATION

### 3A: Update middleware.ts

Find the existing middleware file and add workspace-level role checking. The middleware must:

1. Check if the route is public (login, landing, signup, api/auth) — skip auth check
2. Check if user has a valid session — redirect to /login if not
3. **NEW: Check if user's role can access the workspace** — redirect to /unauthorized if not
4. Allow the request to proceed

```bash
echo "=== CURRENT MIDDLEWARE ==="
cat web/src/middleware.ts
```

The middleware needs to read the user's role. Two approaches:
- **Option A:** Query profiles table in middleware (adds DB call per request)
- **Option B:** Store role in Supabase auth user_metadata (read from JWT, zero DB calls)

**USE OPTION B** — Store role in auth user_metadata during user creation/invite. Read from JWT in middleware. Zero additional DB calls.

To read from JWT in middleware:
```typescript
const { data: { user } } = await supabase.auth.getUser();
const role = user?.user_metadata?.role || user?.app_metadata?.role;
```

If role is not in metadata (legacy users), fall through to PersonaContext client-side check (the HOC handles it).

### 3B: Create /unauthorized page

Create `web/src/app/unauthorized/page.tsx`:

Simple page that says "You don't have access to this area" with a button to go to the dashboard. Clean, professional, not scary.

### 3C: Wire middleware authorization

Update middleware to check `canAccessWorkspace(role, pathname)` for every authenticated request. If the check fails AND the role is available from JWT, redirect to `/unauthorized`. If the role is NOT available from JWT, allow through (client-side HOC will catch it).

**Commit:** `OB-67 Phase 3: Middleware workspace authorization + /unauthorized page`

---

## PHASE 4: APPLY ROLE GUARDS TO CRITICAL PAGES

### 4A: Wrap admin/operational pages with RequireRole

The following pages MUST have RequireRole guards. Do NOT modify page logic — just wrap the existing content.

```
/admin/launch/calculate        → RequireRole roles={['vl_admin', 'admin']}
/admin/launch/reconciliation   → RequireRole roles={['vl_admin']}
/admin/launch/plan-import      → RequireRole roles={['vl_admin', 'admin']}
/admin/launch                  → RequireRole roles={['vl_admin']}
/operate/calculate             → RequireRole roles={['vl_admin', 'admin']}
/operate/approve               → RequireRole roles={['vl_admin', 'admin', 'manager']}
/operate/pay                   → RequireRole roles={['vl_admin', 'admin']}
/operate/results               → RequireRole roles={['vl_admin', 'admin']}
/govern/calculation-approvals  → RequireRole roles={['vl_admin', 'admin']}
/configure/personnel           → RequireRole roles={['vl_admin', 'admin']}
/data/import/enhanced          → RequireRole roles={['vl_admin', 'admin']}
```

### 4B: Hide action buttons by permission

Find these action buttons and wrap them with permission checks:

```
"Run Calculation" button     → useCanPerform('run_calculation')
"Approve" buttons            → useCanPerform('approve_results')
"Import Data" buttons        → useCanPerform('import_data')
"Export Payroll" buttons     → useCanPerform('export_payroll')
"Publish" buttons            → useCanPerform('publish_results')
```

If the user doesn't have permission, the button is hidden (not disabled, not greyed — hidden). Don't show people things they can't use.

### 4C: Filter sidebar items by role

In the sidebar component, each navigation item should check `canAccessWorkspace(role, item.path)`. Items the user can't access are still shown but visually muted and non-clickable (they become status indicators — see Phase 7).

**Commit:** `OB-67 Phase 4: Role guards on 11 critical pages + action button permissions + sidebar filtering`

---

## PHASE 5: USER MANAGEMENT TABLE

### 5A: Create user management page

Create `web/src/app/configure/users/page.tsx`:

This is the admin's primary user management surface. NOT the Organizational Canvas — a practical table.

**Layout:**
- Page title: "Users" with subtitle "Manage platform access and permissions"
- Action bar: "Invite User" button (primary CTA), search input, role filter dropdown
- Table columns: Name, Email, Role, Status, Linked Entity, Last Login, Actions

```bash
echo "=== VERIFY SCHEMA ==="
echo "profiles: id, tenant_id, auth_user_id, display_name, email, role, capabilities, locale, avatar_url, created_at, updated_at"
echo "entities: id, tenant_id, entity_type, status, external_id, display_name, profile_id, ..."
```

**Data query:**
```typescript
// Get all profiles for current tenant
const { data: users } = await supabase
  .from('profiles')
  .select('id, auth_user_id, display_name, email, role, capabilities, created_at, updated_at')
  .eq('tenant_id', tenantId)
  .order('display_name');

// Get entities linked to profiles (for the "Linked Entity" column)
const profileIds = users?.map(u => u.id) || [];
const { data: entities } = await supabase
  .from('entities')
  .select('id, display_name, external_id, profile_id')
  .eq('tenant_id', tenantId)
  .in('profile_id', profileIds);
```

**Table features:**
- Inline role editing: click role cell → dropdown with vl_admin/admin/manager/viewer/sales_rep → save immediately
- Status indicator: green dot for active (logged in last 30 days), yellow for invited (never logged in), grey for inactive
- "Linked Entity" shows the entity display_name if entities.profile_id matches, or "—" if no linked entity
- Actions column: "Edit", "Resend Invite", "Suspend"

### 5B: Role inline edit API

Create `web/src/app/api/users/update-role/route.ts`:

```typescript
// PATCH — update user role
// Uses service role client (needs admin privileges)
// Validates: caller is admin/vl_admin, target user is in same tenant
// Updates: profiles.role AND auth.user_metadata.role (for middleware JWT check)
```

**Commit:** `OB-67 Phase 5: User management table + inline role editing + role update API`

---

## PHASE 6: USER INVITE FLOW

### 6A: Invite user modal/form

When the admin clicks "Invite User" on the user management page, show a modal:

**Fields:**
- Email (required) — text input
- Display Name (required) — text input
- Role (required) — dropdown: Admin, Manager, Viewer, Sales Rep
- Link to Entity (optional) — searchable dropdown of unlinked entities in the tenant

That's it. Four fields. Minimal friction.

### 6B: Invite API route

Create or update `web/src/app/api/users/invite/route.ts`:

```typescript
export async function POST(request: Request) {
  const supabase = createServiceRoleClient();
  const body = await request.json();
  // body: { email, displayName, role, tenantId, entityId? }
  
  // 1. Validate caller is admin/vl_admin for this tenant
  // (check auth header → get profile → check role)
  
  // 2. Create auth user with invite
  const { data: authUser, error: authError } = await supabase.auth.admin.inviteUserByEmail(
    body.email,
    {
      data: { 
        display_name: body.displayName, 
        tenant_id: body.tenantId,
        role: body.role  // Store in user_metadata for middleware JWT access
      },
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/login`,
    }
  );
  
  if (authError) return Response.json({ error: authError.message }, { status: 400 });
  
  // 3. Create profile
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      auth_user_id: authUser.user.id,
      tenant_id: body.tenantId,
      email: body.email,
      display_name: body.displayName,
      role: body.role,
      capabilities: deriveCapabilities(body.role),
    });
  
  if (profileError) {
    // Cleanup: delete the auth user if profile creation fails
    await supabase.auth.admin.deleteUser(authUser.user.id);
    return Response.json({ error: profileError.message }, { status: 400 });
  }
  
  // 4. Link to entity if provided
  if (body.entityId) {
    await supabase
      .from('entities')
      .update({ profile_id: /* the new profile's id — query it */ })
      .eq('id', body.entityId)
      .eq('tenant_id', body.tenantId);
  }
  
  // 5. Metering event
  await supabase.from('usage_metering').insert({
    tenant_id: body.tenantId,
    metric_name: 'user_invited',
    metric_value: 1,
    period_key: new Date().toISOString().slice(0, 7),
    dimensions: { role: body.role, email: body.email },
  }).catch(() => {});
  
  return Response.json({ 
    success: true, 
    user: { id: authUser.user.id, email: body.email, role: body.role } 
  });
}

function deriveCapabilities(role: string): string[] {
  switch (role) {
    case 'vl_admin': return ['full_access'];
    case 'admin': return ['admin', 'approve', 'import', 'calculate', 'configure', 'view_all'];
    case 'manager': return ['view_team', 'approve_team'];
    case 'viewer': return ['view_own'];
    case 'sales_rep': return ['view_own', 'dispute'];
    default: return ['view_own'];
  }
}
```

**CRITICAL:** The invite API must use `createServiceRoleClient()` — not the browser client. Only the service role can call `auth.admin.inviteUserByEmail()`.

**CRITICAL:** If profile creation fails, delete the auth user (atomic operation — AP-14).

### 6C: Entity-to-User bulk promotion

On the user management page, add a second tab or section: "Entities Without Platform Access"

This shows entities from the `entities` table where `profile_id IS NULL` — people in the data who can't log in.

**Layout:**
- Table: Entity Name, External ID, Type, Status
- Checkbox selection for bulk operations
- Bulk action: "Invite Selected as [Role dropdown]" → creates auth users + profiles + links entities
- Individual action: "Invite" button per row → opens invite modal pre-filled with entity name

```typescript
// Entities without platform access
const { data: unlinkedEntities } = await supabase
  .from('entities')
  .select('id, display_name, external_id, entity_type, status')
  .eq('tenant_id', tenantId)
  .is('profile_id', null)
  .eq('entity_type', 'individual')  // Only individuals, not locations/teams
  .order('display_name');
```

**Commit:** `OB-67 Phase 6: User invite flow — modal, API route, entity-to-user promotion`

---

## PHASE 7: PAGE STATUS INDICATORS

### 7A: Define page status taxonomy

Every sidebar navigation item gets a status:

| Status | Badge | Meaning |
|--------|-------|---------|
| **ACTIVE** | (none) | Page has real data queries, renders meaningful content |
| **PREVIEW** | Small blue dot | Page renders with seed/demo data, not yet connected to real pipeline |
| **COMING** | Small outline circle | Page exists as stub, functionality planned |
| **RESTRICTED** | Small lock icon | Page exists but user's role can't access it |

### 7B: Create page status config

Create `web/src/lib/navigation/page-status.ts`:

Based on the OB-66 navigation audit, classify every sidebar item:

```typescript
export type PageStatus = 'active' | 'preview' | 'coming' | 'restricted';

export const PAGE_STATUS: Record<string, PageStatus> = {
  // ACTIVE — real data queries, functional
  '/':                        'active',
  '/data/import/enhanced':    'active',
  '/admin/launch/calculate':  'active',
  '/admin/launch/plan-import':'active',
  '/admin/launch/reconciliation': 'active',
  '/signup':                  'active',
  '/login':                   'active',
  '/operate/import/history':  'active',
  '/configure/users':         'active',  // Built in this OB
  
  // PREVIEW — renders with seed data
  '/my-compensation':         'preview',
  '/insights':                'preview',
  '/insights/analytics':      'preview',
  '/insights/performance':    'preview',
  '/insights/my-team':        'preview',
  '/insights/compensation':   'preview',
  '/insights/disputes':       'preview',
  '/insights/trends':         'preview',
  '/financial':               'preview',
  '/financial/performance':   'preview',
  '/financial/timeline':      'preview',
  '/financial/staff':         'preview',
  '/financial/leakage':       'preview',
  '/performance/plans':       'preview',
  '/performance/scenarios':   'preview',
  '/transactions':            'preview',
  '/transactions/orders':     'preview',
  '/transactions/find':       'preview',
  '/operate/results':         'preview',
  '/operate/pay':             'preview',
  '/operate/approve':         'preview',
  
  // COMING — stubs or placeholders
  '/insights/sales-finance':  'coming',
  '/transactions/disputes':   'coming',
  '/transactions/inquiries':  'coming',
  '/performance/goals':       'coming',
  '/performance/adjustments': 'coming',
  '/performance/approvals':   'coming',
  '/configuration':           'coming',
  '/configuration/personnel': 'coming',
  '/configuration/teams':     'coming',
  '/configuration/locations': 'coming',
  '/configuration/terminology':'coming',
  '/data/operations':         'coming',
  '/data/quality':            'coming',
  '/data/reports':            'coming',
  '/operations/audits':       'coming',
  '/operations/data-readiness':'coming',
  '/operations/messaging':    'coming',
  '/operations/rollback':     'coming',
  '/approvals':               'coming',
};

export function getPageStatus(path: string): PageStatus {
  return PAGE_STATUS[path] || 'coming';
}
```

### 7C: Render status badges in sidebar

In the sidebar component, next to each navigation item label, render a small indicator:

- **active**: no badge (clean, default)
- **preview**: `<span className="w-1.5 h-1.5 rounded-full bg-blue-400 ml-1.5" title="Preview — demo data" />`
- **coming**: `<span className="w-1.5 h-1.5 rounded-full border border-slate-400 ml-1.5" title="Coming soon" />`
- **restricted**: `<svg className="w-3 h-3 text-slate-400 ml-1.5" ...lock icon... />` — AND disable the link (`onClick={e => e.preventDefault()}`, muted text color)

These are intentionally tiny — a small dot in the corner of the link area. Not a banner, not a badge with text. Just a subtle signal.

### 7D: Combine with role filtering

When rendering sidebar items:
1. Check `canAccessWorkspace(role, item.path)` — if false, status = 'restricted' regardless of page status
2. Otherwise use `getPageStatus(item.path)`
3. Render accordingly

**Commit:** `OB-67 Phase 7: Page status indicators — taxonomy, config, sidebar badges`

---

## PHASE 8: BUILD + VERIFY + PR

### 8A: Standing CLT regression

```bash
echo "=== CLT REGRESSION ==="
echo "1. Build clean?"
cd web && npm run build && echo "BUILD: PASS" || echo "BUILD: FAIL"

echo ""
echo "2. Dev server responds?"
npm run dev &
sleep 10
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 && echo " RESPOND: PASS"

echo ""
echo "3. Console errors?"
echo "(Check manually on localhost:3000 — zero errors expected)"
```

### 8B: Proof gates

| # | Gate | Pass Criteria | Method |
|---|------|--------------|--------|
| PG-1 | role-permissions.ts exists | File at lib/auth/role-permissions.ts | ls |
| PG-2 | RequireRole component exists | File at components/auth/RequireRole.tsx | ls |
| PG-3 | useCanPerform hook exports | grep "export function useCanPerform" | grep |
| PG-4 | Middleware checks workspace access | grep "canAccessWorkspace" in middleware.ts | grep |
| PG-5 | /unauthorized page exists | File at app/unauthorized/page.tsx | ls |
| PG-6 | 11 critical pages wrapped with RequireRole | grep "RequireRole" in target pages | grep count ≥ 11 |
| PG-7 | User management page exists | File at app/configure/users/page.tsx | ls |
| PG-8 | User invite API exists | File at app/api/users/invite/route.ts | ls |
| PG-9 | Invite creates profile + auth user | API route has createServiceRoleClient + inviteUserByEmail + profiles.insert | grep |
| PG-10 | Atomic cleanup on profile failure | API deletes auth user if profile insert fails | grep "deleteUser" |
| PG-11 | Entity-to-user query uses profile_id | grep "profile_id" not "entity_id" in users page | grep |
| PG-12 | Page status config exists | File at lib/navigation/page-status.ts | ls |
| PG-13 | Sidebar renders status indicators | grep for status badge classes in sidebar | grep |
| PG-14 | Role update API exists | File at app/api/users/update-role/route.ts | ls |
| PG-15 | Zero entity_id references on profiles | grep returns 0 | grep -c |
| PG-16 | Build clean | npm run build exit 0 | terminal |
| PG-17 | Dev server responds | localhost:3000 returns 200 | curl |

### 8C: Completion report

Create `OB-67_COMPLETION_REPORT.md` at project root.

### 8D: PR

```bash
git add -A && git commit -m "OB-67 Phase 8: Build verification + completion report"
git push origin dev
gh pr create --base main --head dev \
  --title "OB-67: TMR Role Guards + User Provisioning + Page Status Indicators" \
  --body "## What This OB Delivers

### Mission 1: TMR Role Guards (Phases 2-4)
- role-permissions.ts — workspace, page, and action level permission config
- RequireRole HOC + useCanPerform hook for component-level access control
- Middleware workspace authorization (reads role from JWT, zero DB calls)
- 11 critical pages wrapped with role guards
- Action buttons hidden by permission (run calc, approve, import, export, publish)
- Sidebar items filtered by role

### Mission 2: User Provisioning (Phases 5-6)
- /configure/users — User management table with inline role editing
- User invite modal: email, name, role, entity link (4 fields)
- Invite API: auth.admin.inviteUserByEmail + profile creation + entity linking
- Atomic cleanup: auth user deleted if profile creation fails
- Entity-to-user promotion: unlinked entities table with bulk invite
- Role update API for inline editing

### Mission 3: Page Status Indicators (Phase 7)
- Page status taxonomy: active, preview, coming, restricted
- 60+ pages classified based on OB-66 audit
- Sidebar badges: blue dot (preview), outline circle (coming), lock (restricted)
- Combined with role filtering — restricted overrides other statuses

## Proof Gates: 17 — see OB-67_COMPLETION_REPORT.md"
```

**Commit:** `OB-67 Phase 8: PR creation`

---

## WHAT IS EXPLICITLY OUT OF SCOPE

| Item | Why | When |
|------|-----|------|
| Page sprawl reduction | Deferred — status indicators provide visibility | Future OB |
| MFA configuration | Infrastructure dependency | Access Ladder OB |
| Invitation codes | Stage 2 access model | Access Ladder OB |
| Self-service signup | Stage 4 access model | Access Ladder OB |
| Cloudflare Turnstile | Infrastructure config | Access Ladder OB |
| Organizational Canvas | Visual enhancement, not core user management | Future |
| Bulk CSV user import | Needs entity resolution design | Future OB |
| SSO/SAML/OIDC | Enterprise feature | Future |
| Dispute DB persistence | Separate P0 fix | Next HF |
| Approval DB persistence | Separate P0 fix | Next HF |

---

*OB-67 — February 20, 2026*
*"Authorization without authentication is theater. Authentication without authorization is a lobby."*
