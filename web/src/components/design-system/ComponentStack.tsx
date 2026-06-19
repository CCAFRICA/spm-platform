'use client';

/** @cognitiveFit part-of-whole — "What is the breakdown?" */

import { useState } from 'react';
import { COMPONENT_PALETTE } from '@/lib/design/tokens';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

interface ComponentStackProps {
  components: { name: string; value: number }[];
  total: number;
}

// HF-315: Vialuce indigo ramp + gold accent for the stacked-bar series (replaces the dark COMPONENT_PALETTE).
const VIALUCE_PALETTE = [
  'var(--vl-raw-indigo-deep)', // #2D2F8F
  'var(--vl-raw-indigo)',      // #4446B8
  'var(--vl-raw-indigo-light)',// #6668D8
  '#9A9CE0',
  'var(--vl-raw-gold)',        // #E8A838 accent
];

export function ComponentStack({ components, total }: ComponentStackProps) {
  const isVialuce = useIsVialuce(); // HF-315: indigo ramp series + DM Mono numbers under Vialuce
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const effectiveTotal = total > 0 ? total : components.reduce((s, c) => s + c.value, 0);
  const palette = isVialuce ? VIALUCE_PALETTE : COMPONENT_PALETTE;

  if (isVialuce) {
    return (
      <div className="space-y-2">
        {/* Stacked bar */}
        <div className="flex h-5 w-full rounded-full overflow-hidden" style={{ background: 'var(--vl-line)' }}>
          {components.map((comp, i) => {
            const pct = effectiveTotal > 0 ? (comp.value / effectiveTotal) * 100 : 0;
            if (pct <= 0) return null;
            return (
              <div
                key={comp.name}
                className="relative h-full transition-opacity duration-200"
                style={{
                  width: `${pct}%`,
                  backgroundColor: palette[i % palette.length],
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
          <div className="text-xs" style={{ color: 'var(--vl-text-muted)' }}>
            <span style={{ fontWeight: 'var(--vl-fw-med)' as unknown as number, color: 'var(--vl-text)' }}>{components[hoveredIdx].name}</span>
            {': '}
            <span style={{ fontFamily: 'var(--vl-font-mono)' }}>{components[hoveredIdx].value.toLocaleString()}</span>
            {' ('}
            <span style={{ fontFamily: 'var(--vl-font-mono)' }}>
              {effectiveTotal > 0 ? ((components[hoveredIdx].value / effectiveTotal) * 100).toFixed(1) : 0}
            </span>
            {'%)'}
          </div>
        )}
        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {components.map((comp, i) => (
            <div key={comp.name} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--vl-text-muted)' }}>
              <div
                className="w-2 h-2 rounded-sm"
                style={{ backgroundColor: palette[i % palette.length] }}
              />
              {comp.name}
            </div>
          ))}
        </div>
      </div>
    );
  }

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
