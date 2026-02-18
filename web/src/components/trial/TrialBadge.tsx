'use client';

/**
 * TrialBadge — Small badge showing trial days remaining.
 * Shown in the navigation or top bar during the trial period.
 */

interface TrialBadgeProps {
  daysRemaining: number;
}

export function TrialBadge({ daysRemaining }: TrialBadgeProps) {
  const urgent = daysRemaining <= 3;

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      background: urgent ? '#1C1017' : '#1E293B',
      border: `1px solid ${urgent ? '#EF4444' : '#E8A838'}`,
      borderRadius: '6px',
      padding: '4px 10px',
      fontSize: '13px',
      color: urgent ? '#EF4444' : '#E8A838',
      fontWeight: 500,
    }}>
      {daysRemaining}d remaining in trial
    </div>
  );
}
