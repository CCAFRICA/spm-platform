'use client';

/**
 * OB-227 — TrendLine. recharts line chart over period series; optional secondary line; clickable
 * points (e.g. switch the selected period). Vialuce palette (indigo primary, gold secondary).
 */
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useCurrency } from '@/contexts/tenant-context';

export interface TrendPoint { label: string; value: number; secondary?: number }

interface TrendLineProps {
  data: TrendPoint[];
  primaryName?: string;
  secondaryName?: string;
  height?: number;
  onPointClick?: (index: number) => void;
}

export function TrendLine({ data, primaryName = 'Total', secondaryName, height = 260, onPointClick }: TrendLineProps) {
  const { format } = useCurrency();
  if (!data.length) return null;
  const hasSecondary = data.some(d => typeof d.secondary === 'number');

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
        onClick={(s) => { if (onPointClick && s && typeof s.activeTooltipIndex === 'number') onPointClick(s.activeTooltipIndex); }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={(v) => format(Number(v))} width={70} />
        <Tooltip formatter={(v: number) => format(v)} contentStyle={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
        {(hasSecondary || secondaryName) && <Legend wrapperStyle={{ fontSize: 11 }} />}
        <Line type="monotone" dataKey="value" name={primaryName} stroke="var(--vl-kpi-accent, #4446B8)" strokeWidth={2.5} dot={{ r: 3, cursor: 'pointer' }} activeDot={{ r: 5 }} />
        {hasSecondary && <Line type="monotone" dataKey="secondary" name={secondaryName ?? 'Avg'} stroke="var(--vl-cta-signal, #E8A838)" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2 }} />}
      </LineChart>
    </ResponsiveContainer>
  );
}
