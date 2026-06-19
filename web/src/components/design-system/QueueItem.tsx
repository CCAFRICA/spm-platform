'use client';

import { useState } from 'react';
import { PRIORITY_COLORS } from '@/lib/design/tokens';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

interface QueueItemProps {
  priority: 'high' | 'medium' | 'low';
  text: string;
  action: string;
  accentColor?: string;
  onAction?: () => void;
}

// HF-315: map the dark priority bar color → Vialuce semantic ramp (high=danger, medium=gold, low=indigo).
const VIALUCE_PRIORITY: Record<'high' | 'medium' | 'low', string> = {
  high: 'var(--vl-danger)',
  medium: 'var(--vl-raw-gold)',
  low: 'var(--vialuce-indigo)',
};

export function QueueItem({ priority, text, action, onAction }: QueueItemProps) {
  const isVialuce = useIsVialuce(); // HF-315: white surface + line border + indigo action under Vialuce
  const [hovered, setHovered] = useState(false);

  if (isVialuce) {
    return (
      <div
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all cursor-pointer"
        style={{
          background: 'var(--vl-surface)',
          border: `1px solid ${hovered ? 'var(--vl-line)' : 'var(--vl-line-soft)'}`,
          boxShadow: 'var(--vl-sh-1)',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onAction}
      >
        {/* Priority bar */}
        <div className="w-1 h-8 rounded-full" style={{ background: VIALUCE_PRIORITY[priority] }} />
        {/* Text */}
        <p className="flex-1 text-sm truncate" style={{ color: 'var(--vl-text)' }}>{text}</p>
        {/* Action label (revealed on hover) */}
        <span
          className={`text-xs whitespace-nowrap transition-opacity duration-200 ${
            hovered ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ color: 'var(--vialuce-indigo)', fontWeight: 'var(--vl-fw-med)' as unknown as number }}
        >
          {action} &rarr;
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700/60 transition-all cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onAction}
    >
      {/* Priority bar */}
      <div className={`w-1 h-8 rounded-full ${PRIORITY_COLORS[priority]}`} />
      {/* Text */}
      <p className="flex-1 text-sm text-zinc-300 truncate">{text}</p>
      {/* Action button (revealed on hover) */}
      <span
        className={`text-xs text-zinc-400 whitespace-nowrap transition-opacity duration-200 ${
          hovered ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {action} &rarr;
      </span>
    </div>
  );
}
