# OB-94 Phase 0: Persona Wiring Diagnostic

## Current State

### PersonaContext (`web/src/contexts/persona-context.tsx`)
- Exposes: `persona`, `tokens`, `scope`, `profileId`, `entityId`, `setPersonaOverride`
- `persona = override ?? derivedPersona` — override mechanism works
- `derivePersona()`: vl_admin/admin → 'admin', manager → 'manager', else → 'rep'
- Override persists to `sessionStorage` key `vl_persona_override`

### ChromeSidebar (`web/src/components/navigation/ChromeSidebar.tsx`)
- Line 142: `const { persona } = usePersona();` — **imported but only used for accent color**
- Line 168: `getAccessibleWorkspaces(userRole as UserRole)` — **filters by AUTH ROLE, not persona**
- Line 181: `getWorkspaceRoutesForRole(activeWorkspace, userRole as UserRole)` — **same issue**
- `userRole` comes from NavigationContext, which reads `user.role` from auth-context

### DemoPersonaSwitcher (`web/src/components/demo/DemoPersonaSwitcher.tsx`)
- Calls `setPersonaOverride(key)` on click
- **Does NOT navigate on switch** — user stays on current page

### Navigation Context (`web/src/contexts/navigation-context.tsx`)
- Line 106: `userRole = user?.role || null` — raw auth role
- Line 133: `getDefaultWorkspace(userRole)` — default workspace from auth role
- Line 146: `canAccessWorkspace(userRole, wsForRoute)` — access check from auth role
- Line 213/243: workspace switch validation uses auth role

### Workspace Access Matrix (`web/src/lib/navigation/role-workspaces.ts`)
- `ROLE_WORKSPACE_ACCESS` already has correct visibility:
  - vl_admin/admin → all 7 workspaces
  - manager → perform, investigate, govern, financial
  - sales_rep → perform only
- `DEFAULT_WORKSPACE_BY_ROLE`: vl_admin/admin → 'operate', manager/sales_rep → 'perform'

### Root Dashboard (`web/src/app/page.tsx`)
- Already persona-driven: renders AdminDashboard/ManagerDashboard/RepDashboard based on `persona`
- Works correctly with persona override

### /perform/page.tsx
- **Redirects to `/`** — rep clicking Perform falls back to root

### Provider Hierarchy (auth-shell.tsx)
- PersonaProvider → PeriodProvider → NavigationProvider → AuthShellInner
- NavigationProvider CAN use usePersona() (no circular dependency)

## Gap Analysis

| Surface | Uses Persona? | Uses Auth Role? | Fix Needed |
|---------|--------------|-----------------|------------|
| Sidebar workspace filter | No | Yes (line 168) | Use persona → role mapping |
| Sidebar section filter | No | Yes (line 181) | Use persona → role mapping |
| NavContext default workspace | No | Yes (line 133) | Use persona → role mapping |
| NavContext access validation | No | Yes (lines 146,213,243) | Use persona → role mapping |
| Persona switcher navigation | N/A | N/A | Navigate on switch |
| /perform route | N/A | N/A | Render dashboard, don't redirect |
| Root dashboard | Yes | No | Already correct |
| Accent colors | Yes | No | Already correct |

## Key Mapping

| PersonaKey | UserRole for access |
|------------|-------------------|
| 'admin' | 'admin' |
| 'manager' | 'manager' |
| 'rep' | 'sales_rep' |

## Implementation Strategy

1. Add `personaToRole(persona: PersonaKey): UserRole` to `role-workspaces.ts`
2. NavigationContext: use persona for effective role in all workspace access checks
3. ChromeSidebar: use persona-derived role for workspace + section filtering
4. DemoPersonaSwitcher: navigate to default workspace on persona switch
5. /perform/page.tsx: render persona dashboards instead of redirecting to /
