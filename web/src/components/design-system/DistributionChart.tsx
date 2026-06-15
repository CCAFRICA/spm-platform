'use client';

/** @cognitiveFit distribution — "What is the shape of this population?"
 *
 * OB-211 WS-2 inc-2 (B3): extended backward-compatibly so the canonical primitive serves
 * BOTH the attainment-% case (default — existing callers on /results, /lifecycle) AND the
 * payout-currency case (DistributionCard). The extension is additive + optional: callers
 * passing only `data: number[]` render IDENTICALLY to before. SR-34: one canonical primitive,
 * no inline recharts parallel.
 */

export interface DistributionBucket {
  label: string;
  count: number;
  min: number;
  max: number;
  color?: string;
}

interface DistributionChartProps {
  data: number[];
  benchmarkLine?: number;
  // ─── OB-211 WS-2 inc-2: optional extensions (default = current attainment-% behavior) ───
  buckets?: DistributionBucket[];           // pre-computed buckets (e.g. payout ranges); else compute attainment buckets from `data`
  valueFormatter?: (n: number) => string;   // format stats/markers (e.g. currency); else "%"
  mean?: number;                            // explicit stats (currency mode); else computed from `data`
  median?: number;
  stdDev?: number;
  showReferenceLines?: boolean;             // draw mean/median markers on the bars (ported from DistributionCard)
}

const ATTAINMENT_BUCKETS = [
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

export function DistributionChart({
  data,
  benchmarkLine,
  buckets,
  valueFormatter,
  mean: meanProp,
  median: medianProp,
  stdDev: stdDevProp,
  showReferenceLines,
}: DistributionChartProps) {
  // Bucket source: explicit (currency/payout) or computed attainment bands (default).
  const bucketCounts = buckets
    ? buckets.map(b => ({ ...b, color: b.color ?? '#60a5fa' }))
    : ATTAINMENT_BUCKETS.map(bucket => ({
        ...bucket,
        count: data.filter(v => v >= bucket.min && v < bucket.max).length,
      }));
  const maxCount = Math.max(...bucketCounts.map(b => b.count), 1);

  // Stats: explicit (currency mode) or computed from raw data (default attainment mode).
  const computed = computeStats(data);
  const mean = meanProp ?? computed.mean;
  const median = medianProp ?? computed.median;
  const stdDev = stdDevProp ?? computed.stdDev;
  const fmt = valueFormatter ?? ((n: number) => `${n.toFixed(1)}%`);

  // Reference-line placement: the bucket index whose [min,max) contains mean / median.
  const meanIdx = showReferenceLines ? bucketCounts.findIndex(b => mean >= b.min && mean < b.max) : -1;
  const medianIdx = showReferenceLines ? bucketCounts.findIndex(b => median >= b.min && median < b.max) : -1;

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1.5 h-24">
        {bucketCounts.map((bucket, i) => {
          const heightPct = (bucket.count / maxCount) * 100;
          const isMean = i === meanIdx;
          const isMedian = i === medianIdx && medianIdx !== meanIdx;
          return (
            <div key={bucket.label} className="flex-1 flex flex-col items-center gap-1">
              {showReferenceLines && (isMean || isMedian) ? (
                <span className={`text-[8px] uppercase tracking-wide ${isMean ? 'text-blue-400' : 'text-violet-400'}`}>
                  {isMean ? 'Mean' : 'Median'}
                </span>
              ) : (
                <span className="text-[9px] text-zinc-400 tabular-nums">{bucket.count}</span>
              )}
              <div className="w-full relative" style={{ height: '64px' }}>
                <div
                  className="absolute bottom-0 w-full rounded-t-md transition-all duration-500"
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: bucket.color,
                    minHeight: bucket.count > 0 ? '4px' : '0px',
                  }}
                />
                {/* mean/median reference marker (ported from DistributionCard's ReferenceLine) */}
                {showReferenceLines && (isMean || isMedian) && (
                  <div
                    className={`absolute top-0 bottom-0 left-1/2 w-px border-l border-dashed ${isMean ? 'border-blue-400' : 'border-violet-400'}`}
                  />
                )}
              </div>
              <span className="text-[10px] text-zinc-400">{bucket.label}</span>
            </div>
          );
        })}
      </div>
      {benchmarkLine !== undefined && (
        <div className="text-[10px] text-zinc-400 text-center">
          {/* Backward-compat: default (attainment) mode keeps the raw `N%`; currency mode uses the formatter. */}
          Benchmark: {valueFormatter ? valueFormatter(benchmarkLine) : `${benchmarkLine}%`}
        </div>
      )}
      <div className="flex gap-4 text-[11px] text-zinc-400">
        <span>Mean: {fmt(mean)}</span>
        <span>Median: {fmt(median)}</span>
        <span>Std Dev: {fmt(stdDev)}</span>
      </div>
    </div>
  );
}
