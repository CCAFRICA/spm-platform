'use client';

/**
 * QualityRing — the scan/integrity outcome ring (DS-031 §3.4).
 * Binary in Slice 1: full green when clean/promoted, full red when held,
 * an indeterminate blue arc while scanning, empty track otherwise. The agent-
 * driven graded ring is a later slice (no agent input exists yet).
 *
 * Mirrors the DS-003 GaugeMetric ring math (r=26, c=2πr) and consumes state
 * colors by name (SEMANTIC) — never a hardcoded theme palette.
 */

import { ringFor } from './prism-status';
import type { FileObjectState } from '@/lib/prism/types';

const R = 26;
const C = 2 * Math.PI * R;

export function QualityRing({ state, size = 64 }: { state: FileObjectState; size?: number }) {
  const { value, color, indeterminate } = ringFor(state);
  const offset = C * (1 - value);
  const empty = value === 0;

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`scan outcome: ${state}`}>
      {/* track */}
      <circle cx="32" cy="32" r={R} fill="none" stroke="var(--vl-line, #E8EAF3)" strokeWidth="5" />
      {/* fill */}
      {!empty && (
        <circle
          cx="32"
          cy="32"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          transform="rotate(-90 32 32)"
          style={{
            transition: 'stroke-dashoffset .5s ease',
            filter: `drop-shadow(0 0 4px ${color}66)`,
            ...(indeterminate ? { animation: 'prism-spin 1.2s linear infinite', transformOrigin: '32px 32px' } : {}),
          }}
        />
      )}
      <style>{`@keyframes prism-spin { from { transform: rotate(-90deg); } to { transform: rotate(270deg); } }`}</style>
    </svg>
  );
}
