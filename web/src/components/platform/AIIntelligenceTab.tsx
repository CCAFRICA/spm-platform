'use client';

import { useState, useEffect } from 'react';
import type { AIIntelligenceData } from '@/lib/data/platform-queries';
import { Loader2, Sparkles, AlertTriangle, BarChart3, TrendingUp, TrendingDown, Minus, Activity, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ──── STYLES ──── */
const CARD_STYLE: React.CSSProperties = {
  background: 'rgba(24, 24, 27, 0.8)',
  border: '1px solid rgba(39, 39, 42, 0.6)',
  borderRadius: '16px',
  padding: '20px',
};

const LABEL_STYLE: React.CSSProperties = {
  color: '#94A3B8',
  fontSize: '13px',
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

export function AIIntelligenceTab() {
  const [data, setData] = useState<AIIntelligenceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch('/api/platform/observatory?tab=ai')
      .then(res => {
        if (!res.ok) throw new Error(`AI API: ${res.status}`);
        return res.json();
      })
      .then((result: AIIntelligenceData) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('[AIIntelligenceTab] Fetch failed:', err);
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!data) return null;

  // No signals at all — table may not exist or is empty
  if (!data.tableExists || data.totalSignals === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h2 style={{ color: '#E2E8F0', fontSize: '18px', fontWeight: 600 }}>AI Intelligence</h2>
          <p style={{ color: '#94A3B8', fontSize: '14px' }}>Classification accuracy, signal tracking, and confidence metrics</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl" style={CARD_STYLE}>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-violet-400" />
              <span style={LABEL_STYLE}>Total Signals</span>
            </div>
            <p style={{ color: '#F8FAFC', fontSize: '28px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>0</p>
          </div>
          <div className="rounded-2xl" style={CARD_STYLE}>
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-violet-400" />
              <span style={LABEL_STYLE}>Avg Confidence</span>
            </div>
            <p style={{ color: '#94A3B8', fontSize: '28px', fontWeight: 700 }}>--</p>
          </div>
        </div>

        <div className="rounded-2xl" style={CARD_STYLE}>
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 style={{ color: '#E2E8F0', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>AI signal tracking not yet active</h3>
              <p style={{ color: '#94A3B8', fontSize: '14px' }}>
                Signals will appear here once the AI pipeline captures classification and mapping data
                during file imports and plan interpretation.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const health = data.healthSummary;

  // Real signal data exists
  return (
    <div className="space-y-6">
      {/* Tab heading */}
      <div>
        <h2 style={{ color: '#E2E8F0', fontSize: '18px', fontWeight: 600 }}>AI Intelligence</h2>
        <p style={{ color: '#94A3B8', fontSize: '14px' }}>Classification accuracy, calibration, and flywheel metrics</p>
      </div>

      {/* ── Hero metrics row (4 cards) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl" style={CARD_STYLE}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <span style={LABEL_STYLE}>Total Signals</span>
          </div>
          <p style={{ color: '#F8FAFC', fontSize: '28px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{data.totalSignals.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl" style={CARD_STYLE}>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-violet-400" />
            <span style={LABEL_STYLE}>Avg Confidence</span>
          </div>
          <p style={{ color: '#F8FAFC', fontSize: '28px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{(data.avgConfidence * 100).toFixed(1)}%</p>
        </div>
        <div className="rounded-2xl" style={CARD_STYLE}>
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-violet-400" />
            <span style={LABEL_STYLE}>Acceptance Rate</span>
          </div>
          <p style={{ color: '#F8FAFC', fontSize: '28px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {health ? `${(health.overallAccuracy * 100).toFixed(1)}%` : '--'}
          </p>
        </div>
        <div className="rounded-2xl" style={CARD_STYLE}>
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-violet-400" />
            <span style={LABEL_STYLE}>Trend</span>
          </div>
          <div className="flex items-center gap-2">
            {health ? <TrendIcon direction={health.trendDirection} /> : null}
            <p style={{ color: '#F8FAFC', fontSize: '28px', fontWeight: 700 }}>
              {health ? health.trendDirection.charAt(0).toUpperCase() + health.trendDirection.slice(1) : '--'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Health Summary Card ── */}
      {health && (
        <div className="rounded-2xl" style={{
          background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.15), rgba(109, 40, 217, 0.10))',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: '16px',
          padding: '20px',
        }}>
          <h3 style={{ ...LABEL_STYLE, marginBottom: '12px' }}>AI Health Summary</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p style={{ color: '#94A3B8', fontSize: '12px' }}>Calibration Error</p>
              <p style={{ color: '#E2E8F0', fontSize: '16px', fontWeight: 600 }}>
                {(health.calibrationError * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <p style={{ color: '#94A3B8', fontSize: '12px' }}>Acceptance Rate</p>
              <p style={{ color: '#E2E8F0', fontSize: '16px', fontWeight: 600 }}>
                {(health.overallAccuracy * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <p style={{ color: '#94A3B8', fontSize: '12px' }}>Avg Confidence</p>
              <p style={{ color: '#E2E8F0', fontSize: '16px', fontWeight: 600 }}>
                {(health.avgConfidence * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <p style={{ color: '#94A3B8', fontSize: '12px' }}>Trend Direction</p>
              <div className="flex items-center gap-1">
                <TrendIcon direction={health.trendDirection} size={14} />
                <p style={{ color: '#E2E8F0', fontSize: '16px', fontWeight: 600 }}>
                  {health.trendDirection.charAt(0).toUpperCase() + health.trendDirection.slice(1)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Accuracy By Type ── */}
      {data.accuracyByType && data.accuracyByType.length > 0 && (
        <div className="rounded-2xl" style={CARD_STYLE}>
          <h3 style={{ ...LABEL_STYLE, marginBottom: '16px' }}>Accuracy By Signal Type</h3>
          <div className="space-y-3">
            {data.accuracyByType.map(at => (
              <div key={at.signalType} className="px-3 py-3 rounded-lg border border-zinc-800 bg-zinc-900/30">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p style={{ color: '#E2E8F0', fontSize: '14px' }}>{formatSignalType(at.signalType)}</p>
                    <p style={{ color: '#94A3B8', fontSize: '12px' }}>{at.total} signals</p>
                  </div>
                  <ConfidenceBadge value={at.acceptanceRate} label="accept" />
                </div>
                {/* Stacked bar: accepted / corrected / rejected */}
                <AccuracyBar accepted={at.accepted} corrected={at.corrected} rejected={at.rejected} total={at.total} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Calibration Chart ── */}
      {data.calibration && data.calibration.length > 0 && (
        <div className="rounded-2xl" style={CARD_STYLE}>
          <h3 style={{ ...LABEL_STYLE, marginBottom: '16px' }}>Calibration Curve</h3>
          <p style={{ color: '#64748B', fontSize: '12px', marginBottom: '12px' }}>
            Stated confidence vs actual accuracy per bucket. Perfect calibration = bars match.
          </p>
          <CalibrationChart buckets={data.calibration} />
        </div>
      )}

      {/* ── Flywheel Trend ── */}
      {data.flywheel && data.flywheel.length > 0 && (
        <div className="rounded-2xl" style={CARD_STYLE}>
          <h3 style={{ ...LABEL_STYLE, marginBottom: '16px' }}>Flywheel Trend</h3>
          <p style={{ color: '#64748B', fontSize: '12px', marginBottom: '12px' }}>
            Acceptance rate over time — the improvement story.
          </p>
          <FlywheelChart points={data.flywheel} />
        </div>
      )}

      {/* ── Signals By Type (existing) ── */}
      <div className="rounded-2xl" style={CARD_STYLE}>
        <h3 style={{ ...LABEL_STYLE, marginBottom: '16px' }}>Signals By Type</h3>
        <div className="space-y-3">
          {data.signalsByType.map(st => (
            <div key={st.signalType} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/30">
              <div>
                <p style={{ color: '#E2E8F0', fontSize: '14px' }}>{formatSignalType(st.signalType)}</p>
                <p style={{ color: '#94A3B8', fontSize: '13px' }}>{st.count} signals</p>
              </div>
              <ConfidenceBadge value={st.avgConfidence} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Per Tenant ── */}
      {data.perTenant.length > 0 && (
        <div className="rounded-2xl" style={CARD_STYLE}>
          <h3 style={{ ...LABEL_STYLE, marginBottom: '16px' }}>Per-Tenant AI Health</h3>
          <div className="space-y-2">
            {data.perTenant.map(t => (
              <div key={t.tenantId} className="flex items-center gap-4 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/30">
                <span style={{ color: '#E2E8F0', fontSize: '14px', fontWeight: 500, flex: 1 }}>{t.tenantName}</span>
                <span style={{ color: '#94A3B8', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>{t.signalCount} signals</span>
                <ConfidenceBadge value={t.avgConfidence} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ──── Sub-components ──── */

function ConfidenceBadge({ value, label }: { value: number; label?: string }) {
  const pct = value * 100;
  return (
    <span className={cn(
      'text-xs font-medium tabular-nums px-2 py-0.5 rounded-full border',
      pct >= 80 ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' :
      pct >= 60 ? 'border-amber-500/40 text-amber-400 bg-amber-500/10' :
      'border-red-500/40 text-red-400 bg-red-500/10'
    )}>
      {pct.toFixed(0)}%{label ? ` ${label}` : ''}
    </span>
  );
}

function TrendIcon({ direction, size = 20 }: { direction: string; size?: number }) {
  if (direction === 'improving') return <TrendingUp size={size} style={{ color: '#34d399' }} />;
  if (direction === 'declining') return <TrendingDown size={size} style={{ color: '#f87171' }} />;
  return <Minus size={size} style={{ color: '#94A3B8' }} />;
}

function AccuracyBar({ accepted, corrected, rejected, total }: { accepted: number; corrected: number; rejected: number; total: number }) {
  if (total === 0) return <div style={{ height: 8, background: '#27272a', borderRadius: 4 }} />;
  const pending = total - accepted - corrected - rejected;
  const pctA = (accepted / total) * 100;
  const pctC = (corrected / total) * 100;
  const pctR = (rejected / total) * 100;
  const pctP = (pending / total) * 100;

  return (
    <div>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#27272a' }}>
        {pctA > 0 && <div style={{ width: `${pctA}%`, background: '#34d399' }} />}
        {pctC > 0 && <div style={{ width: `${pctC}%`, background: '#fbbf24' }} />}
        {pctR > 0 && <div style={{ width: `${pctR}%`, background: '#f87171' }} />}
        {pctP > 0 && <div style={{ width: `${pctP}%`, background: '#3f3f46' }} />}
      </div>
      <div className="flex gap-3 mt-1">
        <span style={{ color: '#34d399', fontSize: '11px' }}>{accepted} accepted</span>
        <span style={{ color: '#fbbf24', fontSize: '11px' }}>{corrected} corrected</span>
        <span style={{ color: '#f87171', fontSize: '11px' }}>{rejected} rejected</span>
        {pending > 0 && <span style={{ color: '#71717a', fontSize: '11px' }}>{pending} pending</span>}
      </div>
    </div>
  );
}

function CalibrationChart({ buckets }: { buckets: NonNullable<AIIntelligenceData['calibration']> }) {
  const maxCount = Math.max(...buckets.map(b => b.count), 1);
  const chartH = 160;
  const barW = 40;
  const gap = 16;
  const chartW = buckets.length * (barW * 2 + gap) + gap;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={chartW} height={chartH + 40} style={{ display: 'block' }}>
        {buckets.map((b, i) => {
          const x = gap + i * (barW * 2 + gap);
          const statedH = b.statedConfidence * chartH;
          const actualH = b.actualAccuracy * chartH;
          return (
            <g key={b.range}>
              {/* Stated confidence bar */}
              <rect x={x} y={chartH - statedH} width={barW - 2} height={statedH} rx={3}
                fill="rgba(99, 102, 241, 0.5)" stroke="rgba(99, 102, 241, 0.8)" strokeWidth={1} />
              {/* Actual accuracy bar */}
              <rect x={x + barW} y={chartH - actualH} width={barW - 2} height={actualH} rx={3}
                fill="rgba(52, 211, 153, 0.5)" stroke="rgba(52, 211, 153, 0.8)" strokeWidth={1} />
              {/* Label */}
              <text x={x + barW} y={chartH + 14} textAnchor="middle"
                style={{ fill: '#94A3B8', fontSize: '10px' }}>
                {b.range}
              </text>
              {/* Count */}
              <text x={x + barW} y={chartH + 28} textAnchor="middle"
                style={{ fill: '#64748B', fontSize: '9px' }}>
                n={b.count}
              </text>
            </g>
          );
        })}
        {/* Zero line */}
        <line x1={0} y1={chartH} x2={chartW} y2={chartH} stroke="#3f3f46" strokeWidth={1} />
      </svg>
      <div className="flex gap-4 mt-2">
        <div className="flex items-center gap-1">
          <div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(99, 102, 241, 0.5)', border: '1px solid rgba(99, 102, 241, 0.8)' }} />
          <span style={{ color: '#94A3B8', fontSize: '11px' }}>Stated Confidence</span>
        </div>
        <div className="flex items-center gap-1">
          <div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(52, 211, 153, 0.5)', border: '1px solid rgba(52, 211, 153, 0.8)' }} />
          <span style={{ color: '#94A3B8', fontSize: '11px' }}>Actual Accuracy</span>
        </div>
      </div>
    </div>
  );
}

function FlywheelChart({ points }: { points: NonNullable<AIIntelligenceData['flywheel']> }) {
  if (points.length === 0) return null;

  const chartW = 500;
  const chartH = 120;
  const padX = 40;
  const padY = 10;
  const innerW = chartW - padX * 2;
  const innerH = chartH - padY * 2;

  const maxSignals = Math.max(...points.map(p => p.signalCount), 1);

  // Build acceptance rate line path
  const linePoints = points.map((p, i) => {
    const x = padX + (i / Math.max(points.length - 1, 1)) * innerW;
    const y = padY + (1 - p.acceptanceRate) * innerH;
    return { x, y };
  });

  const pathD = linePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // Build signal count bars
  const barWidth = Math.min(30, innerW / points.length - 4);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={chartW} height={chartH + 30} style={{ display: 'block' }}>
        {/* Y-axis labels */}
        <text x={padX - 4} y={padY + 4} textAnchor="end" style={{ fill: '#64748B', fontSize: '10px' }}>100%</text>
        <text x={padX - 4} y={padY + innerH / 2 + 4} textAnchor="end" style={{ fill: '#64748B', fontSize: '10px' }}>50%</text>
        <text x={padX - 4} y={padY + innerH + 4} textAnchor="end" style={{ fill: '#64748B', fontSize: '10px' }}>0%</text>

        {/* Grid lines */}
        <line x1={padX} y1={padY} x2={padX + innerW} y2={padY} stroke="#27272a" strokeWidth={1} />
        <line x1={padX} y1={padY + innerH / 2} x2={padX + innerW} y2={padY + innerH / 2} stroke="#27272a" strokeWidth={1} strokeDasharray="4 4" />
        <line x1={padX} y1={padY + innerH} x2={padX + innerW} y2={padY + innerH} stroke="#3f3f46" strokeWidth={1} />

        {/* Signal count bars */}
        {points.map((p, i) => {
          const x = padX + (i / Math.max(points.length - 1, 1)) * innerW - barWidth / 2;
          const barH = (p.signalCount / maxSignals) * innerH * 0.6;
          return (
            <rect key={`bar-${i}`}
              x={x} y={padY + innerH - barH} width={barWidth} height={barH}
              rx={2} fill="rgba(99, 102, 241, 0.15)" />
          );
        })}

        {/* Acceptance rate line */}
        <path d={pathD} fill="none" stroke="#34d399" strokeWidth={2} />

        {/* Data points */}
        {linePoints.map((p, i) => (
          <circle key={`pt-${i}`} cx={p.x} cy={p.y} r={3}
            fill="#34d399" stroke="#18181b" strokeWidth={1.5} />
        ))}

        {/* Period labels */}
        {points.map((p, i) => {
          const x = padX + (i / Math.max(points.length - 1, 1)) * innerW;
          return (
            <text key={`label-${i}`} x={x} y={chartH + 16} textAnchor="middle"
              style={{ fill: '#64748B', fontSize: '10px' }}>
              {p.period}
            </text>
          );
        })}
      </svg>
      <div className="flex gap-4 mt-1">
        <div className="flex items-center gap-1">
          <div style={{ width: 12, height: 3, borderRadius: 1, background: '#34d399' }} />
          <span style={{ color: '#94A3B8', fontSize: '11px' }}>Acceptance Rate</span>
        </div>
        <div className="flex items-center gap-1">
          <div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(99, 102, 241, 0.15)' }} />
          <span style={{ color: '#94A3B8', fontSize: '11px' }}>Signal Volume</span>
        </div>
      </div>
    </div>
  );
}

function formatSignalType(type: string): string {
  return type
    .replace(/^training:/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
