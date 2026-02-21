/**
 * Trial Status Utilities
 *
 * Checks trial state from tenant settings JSONB.
 * Gates: lifecycle, export, invite, period, forensics.
 */

export interface TrialStatus {
  isTrialing: boolean;
  daysRemaining: number;
  expired: boolean;
  isPaid: boolean;
}

export function getTrialStatus(tenantSettings: Record<string, unknown> | null | undefined): TrialStatus {
  if (!tenantSettings) {
    // OB-73 Mission 3 / F-18: No settings at all = demo tenant, allow everything
    return { isTrialing: false, daysRemaining: 0, expired: false, isPaid: true };
  }

  const billing = tenantSettings.billing as Record<string, unknown> | undefined;
  const trial = tenantSettings.trial as Record<string, unknown> | undefined;

  // Paid tenant — no trial gates
  if (billing?.stripe_subscription_id || billing?.status === 'active') {
    return { isTrialing: false, daysRemaining: 0, expired: false, isPaid: true };
  }

  // OB-73 Mission 3 / F-18: No trial info AND no billing info = demo/provisioned tenant.
  // These should not see trial gates. Only tenants that explicitly started a trial get gated.
  if (!trial?.started_at && !billing) {
    return { isTrialing: false, daysRemaining: 0, expired: false, isPaid: true };
  }

  // No trial start but has billing section = genuinely expired
  if (!trial?.started_at) {
    return { isTrialing: false, daysRemaining: 0, expired: true, isPaid: false };
  }

  const startedAt = new Date(trial.started_at as string);
  const expiresAt = trial.expires_at
    ? new Date(trial.expires_at as string)
    : new Date(startedAt.getTime() + 14 * 24 * 60 * 60 * 1000);

  const now = new Date();
  const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  return {
    isTrialing: daysRemaining > 0,
    daysRemaining,
    expired: daysRemaining <= 0,
    isPaid: false,
  };
}

export type TrialGateType = 'lifecycle' | 'export' | 'invite' | 'period' | 'forensics';

const GATE_MESSAGES: Record<TrialGateType, string> = {
  lifecycle: 'Upgrade to advance beyond Preview. Preview calculations are free during your trial.',
  export: 'Upgrade to export your calculation results.',
  invite: 'Upgrade to invite your full team. Free trial allows 2 collaborators.',
  period: 'Upgrade to process multiple periods. Free trial includes 1 period.',
  forensics: 'Upgrade for full calculation drill-down. Preview shows summary results.',
};

export function checkTrialGate(
  tenantSettings: Record<string, unknown> | null | undefined,
  gate: TrialGateType
): { allowed: boolean; message: string } {
  const status = getTrialStatus(tenantSettings);

  if (status.isPaid) return { allowed: true, message: '' };
  if (status.expired) return { allowed: false, message: 'Your trial has expired. Upgrade to continue.' };

  // During trial, all gates are blocked (user must upgrade)
  return { allowed: false, message: GATE_MESSAGES[gate] };
}
