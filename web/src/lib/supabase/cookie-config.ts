/**
 * OB-178 / DS-019 Section 4.2: SOC 2 / OWASP / NIST compliant cookie configuration
 *
 * PROVIDER-AGNOSTIC: These values are enforced in OUR code.
 * The Supabase Dashboard has matching server-side settings as defense-in-depth.
 * If the auth provider changes, these values travel with the codebase.
 *
 * Standards:
 * - OWASP Session Management: absolute timeout 4-8 hours
 * - NIST SP 800-63B: re-authentication every 12 hours
 * - SOC 2 CC6: session timeout enforcement mandatory
 */

export const SESSION_COOKIE_OPTIONS = {
  maxAge: 8 * 60 * 60, // 8 hours absolute session lifetime (OWASP)
  sameSite: 'lax' as const,
  secure: true, // HTTPS only
  path: '/',
};

export const SESSION_LIMITS = {
  IDLE_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes inactivity (OWASP/NIST)
  ABSOLUTE_TIMEOUT_MS: 8 * 60 * 60 * 1000, // 8 hours absolute (OWASP)
  WARNING_BEFORE_IDLE_MS: 5 * 60 * 1000, // Warn 5 min before idle timeout
};
