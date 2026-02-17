'use client';

import { useMemo } from 'react';

interface TierThreshold {
  threshold: number;
  label: string;
}

interface PacingConeProps {
  history: number[];
  daysRemaining: number;
  daysTotal: number;
  tiers?: TierThreshold[];
}

export function PacingCone({ history, daysRemaining, daysTotal, tiers = [] }: PacingConeProps) {
  const { pathD, optimistic, expected, pessimistic, tierLines, currentY, svgW, svgH } = useMemo(() => {
    const w = 320;
    const h = 160;
    const padL = 40;
    const padR = 16;
    const padT = 12;
    const padB = 24;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    if (history.length === 0) return { pathD: '', optimistic: '', expected: '', pessimistic: '', tierLines: [] as { y: number; label: string }[], currentY: 0, svgW: w, svgH: h };

    const maxVal = Math.max(...history, ...tiers.map(t => t.threshold)) * 1.2 || 100;
    const totalSteps = history.length + Math.max(1, Math.round((daysRemaining / daysTotal) * history.length));
    const stepX = plotW / Math.max(totalSteps - 1, 1);

    // History path
    const points = history.map((v, i) => ({
      x: padL + i * stepX,
      y: padT + plotH - (v / maxVal) * plotH,
    }));
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

    // Projections from last point
    const last = points[points.length - 1];
    const projSteps = totalSteps - history.length;
    const avgGrowth = history.length > 1 ? (history[history.length - 1] - history[0]) / (history.length - 1) : 0;
    const lastVal = history[history.length - 1];

    function projPath(multiplier: number): string {
      const pts: string[] = [`M${last.x},${last.y}`];
      for (let i = 1; i <= projSteps; i++) {
        const px = last.x + i * stepX;
        const projected = lastVal + avgGrowth * multiplier * i;
        const py = padT + plotH - (Math.max(0, projected) / maxVal) * plotH;
        pts.push(`L${px},${py}`);
      }
      return pts.join(' ');
    }

    const tierLinesComputed = tiers.map(t => ({
      y: padT + plotH - (t.threshold / maxVal) * plotH,
      label: t.label,
    }));

    return {
      pathD: d,
      optimistic: projPath(1.5),
      expected: projPath(1.0),
      pessimistic: projPath(0.5),
      tierLines: tierLinesComputed,
      currentY: last?.y ?? 0,
      svgW: w,
      svgH: h,
    };
  }, [history, daysRemaining, daysTotal, tiers]);

  if (history.length === 0) {
    return <p className="text-sm text-zinc-500">Sin datos de ritmo disponibles.</p>;
  }

  const currentX = history.length > 1 ? 40 + (history.length - 1) * ((svgW - 56) / Math.max(history.length, 2)) : 40;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto" aria-label="Pacing cone projection">
        {/* Tier threshold lines */}
        {tierLines.map((t, i) => (
          <g key={i}>
            <line x1={40} y1={t.y} x2={svgW - 16} y2={t.y} stroke="#52525b" strokeWidth={0.5} strokeDasharray="4 2" />
            <text x={38} y={t.y + 3} textAnchor="end" className="fill-zinc-500 text-[8px]">{t.label}</text>
          </g>
        ))}

        {/* Projection cone */}
        <path d={optimistic} fill="none" stroke="#10b981" strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
        <path d={expected} fill="none" stroke="#a1a1aa" strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
        <path d={pessimistic} fill="none" stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />

        {/* History path */}
        <path d={pathD} fill="none" stroke="#e4e4e7" strokeWidth={1.5} />

        {/* Current position dot */}
        <circle cx={currentX} cy={currentY} r={3} fill="#e4e4e7" />
        <circle cx={currentX} cy={currentY} r={5} fill="none" stroke="#e4e4e7" strokeWidth={0.5} opacity={0.5} />

        {/* Days label */}
        <text x={svgW / 2} y={svgH - 4} textAnchor="middle" className="fill-zinc-500 text-[9px]">
          {daysRemaining} dias restantes de {daysTotal}
        </text>
      </svg>
    </div>
  );
}
