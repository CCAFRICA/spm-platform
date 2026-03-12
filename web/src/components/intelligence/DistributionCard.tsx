'use client';

/**
 * DistributionCard — Admin histogram of payout distribution
 *
 * Five Elements:
 *   Value:      Population distribution visualization
 *   Context:    Mean, median, stdDev statistics
 *   Comparison: Mean and median reference lines on chart
 *   Action:     Implicit (admin reviews distribution for outliers)
 *   Impact:     Understanding population health
 *
 * OB-165: Intelligence Stream Foundation
 */

import {
  BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, ReferenceLine, Tooltip,
} from 'recharts';
import { IntelligenceCard } from './IntelligenceCard';

interface DistributionBucket {
  label: string;
  count: number;
  min: number;
  max: number;
}

interface DistributionCardProps {
  accentColor: string;
  buckets: DistributionBucket[];
  mean: number;
  median: number;
  stdDev: number;
  formatCurrency: (n: number) => string;
  onView?: () => void;
}

export function DistributionCard({
  accentColor,
  buckets,
  mean,
  median,
  stdDev,
  formatCurrency,
  onView,
}: DistributionCardProps) {
  if (buckets.length === 0) return null;

  // Map buckets to chart data
  const chartData = buckets.map(b => ({
    label: b.label,
    count: b.count,
    min: b.min,
    max: b.max,
  }));

  // Find the bucket index closest to mean/median for reference line placement
  const meanBucketIdx = buckets.findIndex(b => mean >= b.min && mean < b.max);
  const medianBucketIdx = buckets.findIndex(b => median >= b.min && median < b.max);

  return (
    <IntelligenceCard
      accentColor={accentColor}
      label="Population Distribution"
      elementId="population-distribution"
      fullWidth
      onView={onView}
    >
      {/* Chart */}
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={{ stroke: '#27272a' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip
              contentStyle={{
                background: '#18181b',
                border: '1px solid #3f3f46',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#e2e8f0',
              }}
              formatter={(value: number) => [`${value} entities`, 'Count']}
              labelFormatter={(label: string) => `Range: ${label}`}
            />
            {/* Mean reference line */}
            {meanBucketIdx >= 0 && (
              <ReferenceLine
                x={chartData[meanBucketIdx]?.label}
                stroke="#60a5fa"
                strokeDasharray="4 4"
                label={{
                  value: 'Mean',
                  position: 'top',
                  fill: '#60a5fa',
                  fontSize: 10,
                }}
              />
            )}
            {/* Median reference line */}
            {medianBucketIdx >= 0 && medianBucketIdx !== meanBucketIdx && (
              <ReferenceLine
                x={chartData[medianBucketIdx]?.label}
                stroke="#a78bfa"
                strokeDasharray="4 4"
                label={{
                  value: 'Median',
                  position: 'top',
                  fill: '#a78bfa',
                  fontSize: 10,
                }}
              />
            )}
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill="rgba(99, 102, 241, 0.5)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Stats row */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        <StatPill label="Mean" value={formatCurrency(mean)} color="text-blue-400" />
        <StatPill label="Median" value={formatCurrency(median)} color="text-violet-400" />
        <StatPill label="Std Dev" value={formatCurrency(stdDev)} color="text-slate-400" />
      </div>
    </IntelligenceCard>
  );
}

// ──────────────────────────────────────────────
// Stat pill
// ──────────────────────────────────────────────

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-slate-500 uppercase tracking-wide">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  );
}
