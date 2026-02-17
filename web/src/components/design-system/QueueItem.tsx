'use client';

import { useState } from 'react';
import { PRIORITY_COLORS } from '@/lib/design/tokens';

interface QueueItemProps {
  priority: 'high' | 'medium' | 'low';
  text: string;
  action: string;
  accentColor?: string;
  onAction?: () => void;
}

export function QueueItem({ priority, text, action, onAction }: QueueItemProps) {
  const [hovered, setHovered] = useState(false);

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
