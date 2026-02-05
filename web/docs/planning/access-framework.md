# Access Framework Planning

## Overview
This document tracks the evolution of the access control and permissions framework for the Entity B Platform.

## Current State (Session 2C)
- Multi-tenant architecture with CC Admin and Tenant User types
- CC Admin can access all tenants via tenant selection screen
- Tenant users are scoped to their assigned tenant
- Role-based permissions: admin, manager, sales_rep
- Permission-based access control via `usePermissions` hook

## Future Enhancements

### User Impersonation Feature
**Priority:** Medium
**Related Issue:** ISSUE-001

**Problem:**
The simplified login page (email-only) improves security and scalability by not exposing tenant information. However, it removes the ability to quickly switch between different user personas (Admin, Manager, Sales Rep) for testing and demo purposes.

**Proposed Solutions:**

1. **CC Admin Impersonation Panel**
   - After selecting a tenant, CC Admins see an "Impersonate User" option
   - Dropdown shows all users within the selected tenant
   - Maintains audit trail of impersonation sessions
   - Clear visual indicator when impersonating

2. **Debug/Demo Mode**
   - Environment flag `NEXT_PUBLIC_DEMO_MODE=true`
   - When enabled, login page shows full user picker with role tabs
   - Only available in development/staging environments
   - Production always uses simple email login

3. **Persona Switcher Component**
   - Navbar component for CC Admins only
   - Quick dropdown to switch user context within current tenant
   - No logout/login required
   - Session maintains impersonation state

**Recommended Approach:**
Implement Option 1 (CC Admin Impersonation) as the primary solution, with Option 2 as a supplementary feature for local development.

**Implementation Considerations:**
- Audit logging for all impersonation sessions
- Clear UI indication of impersonation state
- "Return to self" action always visible
- Time-limited impersonation sessions (optional)
- Permission inheritance during impersonation

### Related Future Work
- Role hierarchy visualization
- Permission matrix editor
- Tenant-specific role customization
- API-level permission enforcement
- Session management and timeout policies

---
*Last Updated: 2026-02-04*
