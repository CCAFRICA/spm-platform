'use client';

import { SEVERITY_COLORS, type SeverityLevel } from '@/lib/design/tokens';

interface AccelerationCardProps {
  severity: SeverityLevel;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

export function AccelerationCard({ severity, title, description, actionLabel, onAction }: AccelerationCardProps) {
  const colors = SEVERITY_COLORS[severity];

  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-zinc-200">{title}</h4>
        <span className={`text-[10px] uppercase tracking-wider font-medium ${colors.text}`}>
          {severity}
        </span>
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">{description}</p>
      <button
        onClick={onAction}
        className={`text-xs font-medium ${colors.text} hover:underline underline-offset-2 transition-colors`}
      >
        {actionLabel} &rarr;
      </button>
    </div>
  );
}
