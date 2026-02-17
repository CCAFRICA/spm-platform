'use client';

import { useState } from 'react';
import { COMPONENT_PALETTE } from '@/lib/design/tokens';

interface ComponentStackProps {
  components: { name: string; value: number }[];
  total: number;
}

export function ComponentStack({ components, total }: ComponentStackProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const effectiveTotal = total > 0 ? total : components.reduce((s, c) => s + c.value, 0);

  return (
    <div className="space-y-2">
      {/* Stacked bar */}
      <div className="flex h-5 w-full rounded-full overflow-hidden bg-zinc-800">
        {components.map((comp, i) => {
          const pct = effectiveTotal > 0 ? (comp.value / effectiveTotal) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div
              key={comp.name}
              className="relative h-full transition-opacity duration-200"
              style={{
                width: `${pct}%`,
                backgroundColor: COMPONENT_PALETTE[i % COMPONENT_PALETTE.length],
                opacity: hoveredIdx === null || hoveredIdx === i ? 1 : 0.4,
              }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              title={`${comp.name}: ${comp.value.toLocaleString()}`}
            />
          );
        })}
      </div>
      {/* Tooltip */}
      {hoveredIdx !== null && components[hoveredIdx] && (
        <div className="text-xs text-zinc-300">
          <span className="font-medium">{components[hoveredIdx].name}</span>
          {': '}
          <span className="tabular-nums">{components[hoveredIdx].value.toLocaleString()}</span>
          {' ('}
          {effectiveTotal > 0 ? ((components[hoveredIdx].value / effectiveTotal) * 100).toFixed(1) : 0}
          {'%)'}
        </div>
      )}
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {components.map((comp, i) => (
          <div key={comp.name} className="flex items-center gap-1.5 text-xs text-zinc-400">
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: COMPONENT_PALETTE[i % COMPONENT_PALETTE.length] }}
            />
            {comp.name}
          </div>
        ))}
      </div>
    </div>
  );
}
