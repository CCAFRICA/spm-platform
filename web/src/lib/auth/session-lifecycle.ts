/**
 * HF-284 (Addendum 1) — Login-path session lifecycle via SESSION-OWNERSHIP TAGGING.
 *
 * THE invariant: the bookkeeping cookies (`vialuce-last-activity`,
 * `vialuce-session-start`) belong to the auth session that wound them. The residue
 * signal is SESSION IDENTITY, not age — the access token's `session_id` claim is
 * tagged into `vialuce-session-sid`. Age was withdrawn as a proxy (A1.1): token
 * refresh advances `iat` while `session-start` is fixed at birth, so an
 * iat-clamp both defeated the 8h absolute cap and blessed idle sessions on
 * refresh-resumption.
 *
 * Per authenticated request, before any expiry kill:
 *   - sid cookie ABSENT or != token session_id  -> the cookies are a PRIOR session's
 *     residue (or legacy-untagged): REINITIALIZE the clocks + tag, DO NOT kill.
 *   - sid MATCH -> run the idle + absolute checks on RAW values, byte-preserved.
 *
 * This module is a pure, deterministic decision; timeout limits are injected, so the
 * values live solely in cookie-config. No session lifetime extension (CC6 /
 * NIST 800-63B): session-start resets only when a NEW auth session is observed; an
 * expired Supabase session never reaches this code (getUser() nulls upstream).
 */

export interface SessionLimits {
  /** Idle timeout in ms (e.g. SESSION_LIMITS.IDLE_TIMEOUT_MS). */
  IDLE_TIMEOUT_MS: number;
  /** Absolute session timeout in ms (e.g. SESSION_LIMITS.ABSOLUTE_TIMEOUT_MS). */
  ABSOLUTE_TIMEOUT_MS: number;
}

export type LifecycleAction = 'reinit' | 'pass' | 'expired_absolute' | 'expired_idle';

export interface OwnershipInput {
  /** Current wall clock (ms). */
  now: number;
  /** Raw `vialuce-session-start` cookie value, or undefined if absent. */
  sessionStartCookie: string | undefined;
  /** Raw `vialuce-last-activity` cookie value, or undefined if absent. */
  lastActivityCookie: string | undefined;
  /** Raw `vialuce-session-sid` cookie value, or undefined if absent. */
  sidCookie: string | undefined;
  /** Current access token's `session_id` claim, or null if unobtainable. */
  tokenSessionId: string | null;
  limits: SessionLimits;
}

export interface OwnershipResult {
  action: LifecycleAction;
  /** When true: rewrite last-activity=now, session-start=now, sid=tokenSessionId; do NOT kill. */
  reinit: boolean;
  /** Whether any prior bookkeeping cookie existed (for the reset event). */
  hadPrior: boolean;
  priorLastActivityAgeMs: number | null;
  priorSessionStartAgeMs: number | null;
}

/**
 * Pure session-ownership decision (HF-284 A1). Mirrors middleware STEP 3 (absolute)
 * + STEP 4 (idle) for the owned case, gated by the ownership tag. Cookie writes
 * (reinit / refresh) remain the middleware's concern.
 */
export function resolveSessionOwnership(input: OwnershipInput): OwnershipResult {
  const { now, sessionStartCookie, lastActivityCookie, sidCookie, tokenSessionId, limits } = input;

  // Ownership: the tag must be present AND equal to the current token's session_id.
  // Absent (new/legacy) or mismatched (prior session's residue) -> not owned.
  const owned = tokenSessionId !== null && sidCookie !== undefined && sidCookie === tokenSessionId;

  if (!owned) {
    const hadPrior = Boolean(sessionStartCookie || lastActivityCookie || sidCookie);
    return {
      action: 'reinit',
      reinit: true,
      hadPrior,
      priorLastActivityAgeMs: lastActivityCookie ? now - Number(lastActivityCookie) : null,
      priorSessionStartAgeMs: sessionStartCookie ? now - Number(sessionStartCookie) : null,
    };
  }

  // Owned: raw checks, semantics byte-preserved within the session.
  const sessionStartMs = sessionStartCookie ? Number(sessionStartCookie) : now;
  const lastActivityMs = lastActivityCookie ? Number(lastActivityCookie) : now;

  let action: LifecycleAction = 'pass';
  if (now - sessionStartMs > limits.ABSOLUTE_TIMEOUT_MS) {
    action = 'expired_absolute';
  } else if (now - lastActivityMs > limits.IDLE_TIMEOUT_MS) {
    action = 'expired_idle';
  }

  return {
    action,
    reinit: false,
    hadPrior: true,
    priorLastActivityAgeMs: null,
    priorSessionStartAgeMs: null,
  };
}

/**
 * Decode a JWT's `session_id` claim. Edge-runtime safe: base64url via atob with a
 * Buffer fallback; JWT claim payloads are ASCII JSON. Returns null if the token is
 * malformed or lacks a string `session_id`.
 */
export function decodeJwtSessionId(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('binary');
    const payload = JSON.parse(json) as { session_id?: unknown };
    return typeof payload.session_id === 'string' ? payload.session_id : null;
  } catch {
    return null;
  }
}
