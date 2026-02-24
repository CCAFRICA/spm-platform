# OB-94 ADR: Persona-Driven Navigation Filtering

## Decision

**Chosen: Persona → Role Mapping at Navigation Layer**

All workspace visibility, section filtering, and route access checks use the active persona (override or derived) mapped to a UserRole equivalent, rather than the raw auth role from the profile.

## Rationale

The DemoPersonaSwitcher already sets persona context, and the root dashboard already renders persona-driven content. But navigation (sidebar workspaces, sections, routes) still reads `user.role` from auth-context. This means switching to "Rep" persona shows a rep dashboard inside an admin sidebar with 7 workspaces visible — a broken experience.

The persona → role mapping is one function, one canonical location, and all existing workspace access infrastructure (`ROLE_WORKSPACE_ACCESS`, `getAccessibleWorkspaces`, `getWorkspaceRoutesForRole`) works unchanged.

## Alternatives Rejected

### 1. Separate Persona Workspace Matrix
Create `PERSONA_WORKSPACE_ACCESS` independent of `ROLE_WORKSPACE_ACCESS`. Rejected because the matrices would be identical — persona categories map 1:1 to role access levels. Maintaining two identical matrices violates Standing Rule 25 (one canonical location per surface).

### 2. Filter at ChromeSidebar Only
Leave NavigationContext using auth role, only change ChromeSidebar display. Rejected because navigation context controls workspace switching, route validation, and default workspace selection. If sidebar shows "Perform only" but navigation context allows switching to "Operate", the state is inconsistent.

### 3. Propagate PersonaKey Through Navigation Context
Add PersonaKey as a first-class field in NavigationContext and rewrite all access checks. Rejected as over-engineering — the existing UserRole-based infrastructure works perfectly, we just need to feed it the right role based on persona.

## Mapping

```
personaToRole('admin')   → 'admin'
personaToRole('manager') → 'manager'
personaToRole('rep')     → 'sales_rep'
```

## Changes

| File | Change |
|------|--------|
| `role-workspaces.ts` | Add `personaToRole()` function |
| `navigation-context.tsx` | Import usePersona, compute effectiveRole, use for all access checks |
| `ChromeSidebar.tsx` | Use effectiveRole from navigation context |
| `DemoPersonaSwitcher.tsx` | Navigate to default workspace on persona switch |
| `/perform/page.tsx` | Render persona dashboard instead of redirecting |
