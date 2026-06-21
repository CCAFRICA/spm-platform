'use client';

/**
 * OB-227 — DistributionChart. Payout histogram with mean/median reference lines + statistical
 * summary; clickable bars (filter the entity table). recharts BarChart, Vialuce indigo bars.
 */
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { useCurrency } from '@/contexts/tenant-context';
import type { DistributionResult, DistributionBin } from '@/lib/insights';

interface DistributionChartProps {
  distribution: DistributionResult;
  height?: number;
  onBinClick?: (bin: DistributionBin) => void;
  activeBinIndex?: number | null;
}

export function DistributionChart({ distribution, height = 280, onBinClick, activeBinIndex }: DistributionChartProps) {
  const { format } = useCurrency();
  const { bins, mean, median, std_dev, total_entities, zero_payout_count } = distribution;
  if (!bins.length) return <div className="text-sm text-muted-foreground">No distribution data.</div>;

  const data = bins.map((b, i) => ({ idx: i, label: format(Math.round(b.range_start)), count: b.count, range_start: b.range_start, range_end: b.range_end, percentage: b.percentage }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} interval={0} angle={-30} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} allowDecimals={false} />
          <Tooltip
            formatter={(v: number) => [`${v} entities`, 'Count']}
            labelFormatter={(_l, p) => { const d = p?.[0]?.payload; return d ? `${format(Math.round(d.range_start))} – ${format(Math.round(d.range_end))}` : ''; }}
            contentStyle={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
          <ReferenceLine x={data.reduce((best, d) => (Math.abs(d.range_start - mean) < Math.abs(data[best].range_start - mean) ? d.idx : best), 0) as unknown as string} stroke="var(--vl-cta-signal, #E8A838)" strokeDasharray="4 2" label={{ value: 'mean', fontSize: 10, fill: 'var(--vl-cta-signal, #E8A838)' }} />
          <Bar dataKey="count" cursor={onBinClick ? 'pointer' : undefined} radius={[3, 3, 0, 0]} onClick={(_d, i) => onBinClick?.(bins[i])}>
            {data.map((_d, i) => (
              <Cell key={i} fill={activeBinIndex === i ? 'var(--vl-cta-signal, #E8A838)' : 'var(--vl-kpi-accent, #4446B8)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-5">
        <span>Mean <b className="text-foreground">{format(mean)}</b></span>
        <span>Median <b className="text-foreground">{format(median)}</b></span>
        <span>Std dev <b className="text-foreground">{format(std_dev)}</b></span>
        <span>Entities <b className="text-foreground">{total_entities}</b></span>
        <span>Zero-payout <b className="text-foreground">{zero_payout_count}</b></span>
      </div>
    </div>
  );
}
