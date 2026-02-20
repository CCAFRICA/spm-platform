# OB-67 Phase 1: Architecture Decision

## Problem
91% of pages have no role-based access control. Any authenticated user can navigate to admin pages.

## Option C CHOSEN: Hybrid Middleware + HOC

### Layer 1: Middleware (server-side, fast)
- Checks workspace-level access (e.g., /admin/* requires vl_admin)
- Reads role from user_metadata in JWT (zero additional DB calls)
- Falls through if role not in metadata (legacy users handled by Layer 2)
- Redirects to /unauthorized on failure

### Layer 2: RequireRole HOC (client-side, flexible)
- Wraps page content with role check
- Reads role from useAuth() context
- Shows contextual "Access Restricted" message
- Also provides useCanPerform() hook for action-level checks

### Layer 3: Sidebar filtering (visual)
- Hides/mutes items user can't access
- Integrates with existing accessControl.getAccessibleModules()
- Adds page status badges (active/preview/coming/restricted)

## Why Not Option A (Middleware Only)?
Too coarse — can't show contextual messages or hide individual UI elements.

## Why Not Option B (HOC Only)?
Page renders before checking — flash of unauthorized content.

## Integration with Existing Code
- access-control.ts: Keep as-is for module filtering. New role-permissions.ts adds workspace/page/action layers.
- auth-context.tsx: Already exposes user.role — RequireRole uses this.
- middleware.ts: Add workspace check after auth check.
- Sidebar.tsx: Add page status badges alongside existing module filtering.
