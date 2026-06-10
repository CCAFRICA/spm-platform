/**
 * HF-282 Phase 2.1 — tenant-gate decision (pure, testable).
 *
 * HALT-3 (DIAG-060 paste omitted auth-shell.tsx:82): the auth-shell effect already
 * returns early while `isLoading || tenantLoading`, so the `/select-tenant` gate
 * cannot fire during tenant hydration (the race Phase 2.1 assumed). This function
 * encodes that decision so the property is unit-testable: the gate fires ONLY when
 * auth AND tenant hydration have completed and the platform admin genuinely has no
 * selected tenant (DD-7: the real no-selection case still lands on /select-tenant).
 */
export interface TenantGateState {
  /** auth context still resolving */
  isLoading: boolean;
  /** tenant context still hydrating (the HALT-3 guard input) */
  tenantLoading: boolean;
  /** on an MFA ceremony route (never interrupt) */
  onMfaRoute: boolean;
  isAuthenticated: boolean;
  isVLAdmin: boolean;
  /** a tenant is currently selected/loaded */
  hasTenant: boolean;
  /** route is tenant-exempt (/login, /select-tenant, /admin/tenants/new, MFA) */
  isTenantExempt: boolean;
}

export function shouldGateToSelectTenant(s: TenantGateState): boolean {
  // Never evaluate the gate until BOTH auth and tenant hydration have completed.
  if (s.isLoading || s.tenantLoading) return false;
  if (s.onMfaRoute) return false;
  if (!s.isAuthenticated) return false; // the !isAuthenticated path is handled separately (loop-break)
  return s.isVLAdmin && !s.hasTenant && !s.isTenantExempt;
}
