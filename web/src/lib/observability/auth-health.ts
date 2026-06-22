/**
 * OB-230 — Auth-health synthesis (structural, not an enumerated status registry).
 *
 * Collapses multiple per-user signals into a single-glance health verdict for the user list.
 * Rules are structural thresholds over signal counts/flags — no hardcoded status list, no field-name
 * matching. Returns the worst applicable status plus the human reasons that produced it.
 */

export type AuthHealthStatus = 'healthy' | 'attention' | 'problem';

export interface AuthHealthSignals {
  bannedUntil?: string | null; // ISO; future = currently banned
  lastSignInAt?: string | null; // null = never signed in
  emailConfirmedAt?: string | null; // null = unconfirmed
  mfaFactorCount?: number;
  mfaVerifiedCount?: number;
  loginFailures24h?: number;
  hydrationTimeouts24h?: number;
  sessionChurn24h?: number; // count of platform.user.session_churn in window
  permissionDenied24h?: number;
}

export interface AuthHealthVerdict {
  status: AuthHealthStatus;
  reasons: string[];
}

const FAILURE_PROBLEM_THRESHOLD = 5;
const STALE_LOGIN_DAYS = 30;

function isBanned(bannedUntil?: string | null): boolean {
  if (!bannedUntil) return false;
  const t = Date.parse(bannedUntil);
  return Number.isFinite(t) && t > Date.now();
}

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / 86_400_000;
}

export function synthesizeAuthHealth(s: AuthHealthSignals): AuthHealthVerdict {
  const reasons: string[] = [];
  let status: AuthHealthStatus = 'healthy';
  const escalate = (to: AuthHealthStatus, reason: string) => {
    reasons.push(reason);
    if (to === 'problem' || (to === 'attention' && status === 'healthy')) status = to;
  };

  const failures = s.loginFailures24h ?? 0;
  const churn = s.sessionChurn24h ?? 0;
  const timeouts = s.hydrationTimeouts24h ?? 0;
  const denied = s.permissionDenied24h ?? 0;
  const mfaFactors = s.mfaFactorCount ?? 0;

  if (isBanned(s.bannedUntil)) escalate('problem', 'Account is banned');
  if (failures >= FAILURE_PROBLEM_THRESHOLD) escalate('problem', `${failures} login failures in 24h`);
  if (churn > 0) escalate('problem', `Session churn detected (${churn} in 24h)`);

  if (timeouts > 0) escalate('attention', `${timeouts} hydration timeout${timeouts > 1 ? 's' : ''} in 24h`);
  if (failures > 0 && failures < FAILURE_PROBLEM_THRESHOLD) escalate('attention', `${failures} login failure${failures > 1 ? 's' : ''} in 24h`);
  if (denied > 0) escalate('attention', `${denied} permission-denied event${denied > 1 ? 's' : ''} in 24h`);
  if (!s.lastSignInAt) {
    escalate('attention', 'Never signed in');
  } else {
    const d = daysSince(s.lastSignInAt);
    if (d != null && d > STALE_LOGIN_DAYS) escalate('attention', `No sign-in for ${Math.round(d)} days`);
  }
  if (!s.emailConfirmedAt) escalate('attention', 'Email not confirmed');
  if (mfaFactors === 0) escalate('attention', 'MFA not enrolled');

  if (status === 'healthy') reasons.push('Recent sign-in, no failures');
  return { status, reasons };
}

export const HEALTH_COLOR: Record<AuthHealthStatus, string> = {
  healthy: '#10B981',
  attention: '#F59E0B',
  problem: '#EF4444',
};

export const HEALTH_LABEL: Record<AuthHealthStatus, string> = {
  healthy: 'Healthy',
  attention: 'Attention',
  problem: 'Problem',
};
