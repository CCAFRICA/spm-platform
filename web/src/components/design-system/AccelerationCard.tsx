'use client';

import { SEVERITY_COLORS, type SeverityLevel } from '@/lib/design/tokens';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

interface AccelerationCardProps {
  severity: SeverityLevel;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

// HF-316: design-spec severity accent — success / gold / danger left border under Vialuce.
const VIALUCE_SEVERITY: Record<SeverityLevel, { accent: string; text: string }> = {
  opportunity: { accent: 'var(--vl-success)', text: 'var(--vl-success)' },
  watch: { accent: 'var(--vl-raw-gold)', text: '#9A6B12' },
  critical: { accent: 'var(--vl-danger)', text: 'var(--vl-danger)' },
};

export function AccelerationCard({ severity, title, description, actionLabel, onAction }: AccelerationCardProps) {
  const isVialuce = useIsVialuce(); // HF-316: design-spec .card with token severity accent under Vialuce
  const colors = SEVERITY_COLORS[severity];

  if (isVialuce) {
    const vl = VIALUCE_SEVERITY[severity];
    return (
      <div className="card space-y-3" style={{ marginTop: 0, borderLeft: `3px solid ${vl.accent}` }}>
        <div className="flex items-start justify-between gap-2">
          <h4 style={{ fontSize: '14.5px', fontWeight: 500, color: 'var(--vl-text)' }}>{title}</h4>
          <span style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '10px', letterSpacing: '1.2px', textTransform: 'uppercase', fontWeight: 500, color: vl.text }}>
            {severity}
          </span>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--vl-text-muted)', lineHeight: 1.6 }}>{description}</p>
        <button
          onClick={onAction}
          className="hover:underline underline-offset-2 transition-colors"
          style={{ fontSize: '12.5px', fontWeight: 500, color: vl.text }}
        >
          {actionLabel} &rarr;
        </button>
      </div>
    );
  }

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
