/**
 * MFA Route Guard — HF-148
 *
 * When a user is on an MFA route (/auth/mfa/*), NO other redirect should fire.
 * The MFA ceremony must complete without interference from:
 * - Tenant selection redirects (platform users → /select-tenant)
 * - Persona routing (effectivePersona → workspace)
 * - Financial-only routing (useFinancialOnly → /financial)
 * - Any other client-side redirect
 */

const MFA_ROUTE_PREFIX = '/auth/mfa';

export function isOnMfaRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.startsWith(MFA_ROUTE_PREFIX);
}

export function isMfaRoute(pathname: string): boolean {
  return pathname.startsWith(MFA_ROUTE_PREFIX);
}
