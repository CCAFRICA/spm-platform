/**
 * HF-167 / DS-019 Section 4.2: SOC 2 / OWASP / NIST compliant cookie configuration
 *
 * PROVIDER-AGNOSTIC: These values are enforced in OUR code.
 * The Supabase Dashboard has matching server-side settings as defense-in-depth.
 * If the auth provider changes, these values travel with the codebase.
 *
 * HF-167: maxAge REMOVED. Without maxAge, cookies are session-scoped —
 * they die when the browser closes. This satisfies:
 * - OWASP Session Management: sessions terminate on browser close
 * - NIST SP 800-63B: re-authentication after browser close
 * - SOC 2 CC6: session timeout enforcement
 *
 * The 8-hour absolute and 30-minute idle timeouts are enforced by:
 * 1. Supabase Dashboard server-side settings (8h time-box, 0.5h inactivity)
 * 2. Middleware timestamp checks (vialuce-session-start, vialuce-last-activity)
 *
 * CRITICAL: @supabase/ssr ignores cookieOptions.maxAge when calling setAll().
 * The setAll callback in middleware.ts and server.ts MUST spread these options
 * over the Supabase-provided options AND delete maxAge to enforce session-scoped behavior.
 * Without this override, Supabase SSR sets a 400-day cookie expiry.
 */
export const SESSION_COOKIE_OPTIONS = {
  sameSite: 'lax' as const,
  secure: true, // HTTPS only
  path: '/',
  // NO maxAge — session-scoped cookie dies on browser close (HF-167)
};

export const SESSION_LIMITS = {
  IDLE_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes inactivity (OWASP/NIST)
  ABSOLUTE_TIMEOUT_MS: 8 * 60 * 60 * 1000, // 8 hours absolute (OWASP)
  WARNING_BEFORE_IDLE_MS: 5 * 60 * 1000, // Warn 5 min before idle timeout
};
