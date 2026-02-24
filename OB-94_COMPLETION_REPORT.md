# OB-94 Completion Report: Persona Wiring — Role-Based Navigation + Content Gating

## Summary

OB-94 wired the persona override system into navigation filtering so that switching personas via the DemoPersonaSwitcher immediately updates the sidebar, command palette, workspace access, and landing page — not just the dashboard content and accent colors.

## Problem

The DemoPersonaSwitcher set `persona` in PersonaContext, and the root dashboard rendered persona-driven content. But the sidebar (ChromeSidebar) and all workspace access checks used `user.role` from auth-context — the raw database role. Switching to "Rep" persona showed a rep dashboard inside an admin sidebar with 7 workspaces visible.

## Architecture

**Single canonical mapping:** `personaToRole(persona: PersonaKey): UserRole` in `role-workspaces.ts`

| PersonaKey | UserRole |
|------------|----------|
| admin | admin |
| manager | manager |
| rep | sales_rep |

**Flow:** PersonaContext (override or derived) → NavigationContext (`effectiveRole`) → ChromeSidebar, CommandPalette, WorkspaceSwitcher, route guards

## Changes Delivered

### Phase 0: Diagnostic (`OB-94_PHASE0_DIAGNOSTIC.md`)
- Mapped all surfaces using auth role vs persona
- Identified gap: 4 access-check call sites + 2 filter call sites using raw auth role

### Phase 1: ADR (`OB-94_ADR.md`)
- Chosen: Persona→Role mapping at navigation layer
- Rejected: Separate persona workspace matrix, sidebar-only filtering

### Phase 2: Sidebar Persona Filtering
**Created:** `personaToRole()` in `web/src/lib/navigation/role-workspaces.ts`

**Modified:** `web/src/contexts/navigation-context.tsx`
- Added `effectiveRole` computed from `persona` via `personaToRole()`
- All workspace access checks (`canAccessWorkspace`, `getDefaultWorkspace`, `navigateToWorkspace`) use `effectiveRole`
- Clock service data still uses raw auth role (`clockPersona`) since it represents actual permissions

**Modified:** `web/src/components/navigation/ChromeSidebar.tsx`
- Workspace filter and section filter use `effectiveRole` instead of `userRole`

**Modified:** `web/src/components/navigation/mission-control/WorkspaceSwitcher.tsx`
- Removed duplicate `PERSONA_TO_ROLE` map, uses centralized `effectiveRole` from NavigationContext

**Modified:** `web/src/components/navigation/command-palette/CommandPalette.tsx`
- Command filtering uses `effectiveRole` instead of `userRole`

### Phase 3: Navigation on Persona Switch + Route Guard
**Modified:** `web/src/components/demo/DemoPersonaSwitcher.tsx`
- On persona switch, navigates to default workspace for that persona
- Uses `personaToRole()` + `getDefaultWorkspace()` + `WORKSPACES[ws].defaultRoute`

**Modified:** `web/src/contexts/navigation-context.tsx`
- Route guard: if pathname maps to a workspace the effective role can't access, redirect to default workspace

### Phase 4-5: /perform Renders Persona Dashboards
**Rewritten:** `web/src/app/perform/page.tsx`
- Was: redirect to `/` (root)
- Now: renders AdminDashboard/ManagerDashboard/RepDashboard based on persona
- Includes PeriodRibbon + PersonaLayout wrapping (matches root dashboard)

## Files Changed

| File | Action |
|------|--------|
| `OB-94_PHASE0_DIAGNOSTIC.md` | Created |
| `OB-94_ADR.md` | Created |
| `web/src/lib/navigation/role-workspaces.ts` | Modified (+personaToRole) |
| `web/src/contexts/navigation-context.tsx` | Modified (effectiveRole, route guard) |
| `web/src/components/navigation/ChromeSidebar.tsx` | Modified (effectiveRole) |
| `web/src/components/navigation/mission-control/WorkspaceSwitcher.tsx` | Simplified |
| `web/src/components/navigation/command-palette/CommandPalette.tsx` | Modified (effectiveRole) |
| `web/src/components/demo/DemoPersonaSwitcher.tsx` | Modified (navigate on switch) |
| `web/src/app/perform/page.tsx` | Rewritten (persona dashboards) |

## Build Status

`npm run build` exits 0 with no new warnings.

## Verification

1. Admin persona → sidebar shows all 7 workspaces, full navigation
2. Manager persona → sidebar shows Perform, Investigate, Govern, Financial
3. Rep persona → sidebar shows Perform only
4. Switching persona navigates to that persona's default workspace
5. Direct URL to unauthorized workspace redirects to default
6. Command palette filters commands by effective persona role
7. /perform renders persona-appropriate dashboard content
