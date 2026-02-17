'use client';

interface DistributionChartProps {
  data: number[];
  benchmarkLine?: number;
}

const BUCKETS = [
  { label: '<70%', min: -Infinity, max: 70, color: '#f87171' },
  { label: '70-85%', min: 70, max: 85, color: '#fbbf24' },
  { label: '85-100%', min: 85, max: 100, color: '#60a5fa' },
  { label: '100-120%', min: 100, max: 120, color: '#34d399' },
  { label: '120%+', min: 120, max: Infinity, color: '#a78bfa' },
];

function computeStats(data: number[]) {
  if (data.length === 0) return { mean: 0, median: 0, stdDev: 0 };
  const sorted = [...data].sort((a, b) => a - b);
  const mean = data.reduce((s, v) => s + v, 0) / data.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const variance = data.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / data.length;
  const stdDev = Math.sqrt(variance);
  return { mean, median, stdDev };
}

export function DistributionChart({ data, benchmarkLine }: DistributionChartProps) {
  const bucketCounts = BUCKETS.map(bucket => ({
    ...bucket,
    count: data.filter(v => v >= bucket.min && v < bucket.max).length,
  }));
  const maxCount = Math.max(...bucketCounts.map(b => b.count), 1);
  const stats = computeStats(data);

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1.5 h-24">
        {bucketCounts.map((bucket) => {
          const heightPct = (bucket.count / maxCount) * 100;
          return (
            <div key={bucket.label} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[9px] text-zinc-500 tabular-nums">{bucket.count}</span>
              <div className="w-full relative" style={{ height: '64px' }}>
                <div
                  className="absolute bottom-0 w-full rounded-t-md transition-all duration-500"
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: bucket.color,
                    minHeight: bucket.count > 0 ? '4px' : '0px',
                  }}
                />
              </div>
              <span className="text-[10px] text-zinc-400">{bucket.label}</span>
            </div>
          );
        })}
      </div>
      {benchmarkLine !== undefined && (
        <div className="text-[10px] text-zinc-500 text-center">
          Benchmark: {benchmarkLine}%
        </div>
      )}
      <div className="flex gap-4 text-[11px] text-zinc-400">
        <span>Mean: {stats.mean.toFixed(1)}%</span>
        <span>Median: {stats.median.toFixed(1)}%</span>
        <span>Std Dev: {stats.stdDev.toFixed(1)}</span>
      </div>
    </div>
  );
}
