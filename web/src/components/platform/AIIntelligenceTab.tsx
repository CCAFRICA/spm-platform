'use client';

import { useState, useEffect } from 'react';
import type { AIIntelligenceData } from '@/lib/data/platform-queries';
import { Loader2, Sparkles, AlertTriangle, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ──── STYLES ──── */
const LABEL_STYLE: React.CSSProperties = {
  color: '#94A3B8',
  fontSize: '13px',
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const SIGNAL_TYPE_DESCRIPTIONS: Record<string, string> = {
  sheet_classification: 'Tracks accuracy of AI sheet type detection',
  field_mapping: 'Tracks accuracy of AI column-to-semantic field mapping',
  period_detection: 'Tracks accuracy of temporal inference from data',
  plan_interpretation: 'Tracks accuracy of component/tier extraction from plans',
};

const PLANNED_SIGNAL_TYPES = [
  { type: 'sheet_classification', label: 'Sheet Classification' },
  { type: 'field_mapping', label: 'Field Mapping' },
  { type: 'period_detection', label: 'Period Detection' },
  { type: 'plan_interpretation', label: 'Plan Interpretation' },
];

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
        {/* Tab heading */}
        <div>
          <h2 style={{ color: '#E2E8F0', fontSize: '18px', fontWeight: 600 }}>AI Intelligence</h2>
          <p style={{ color: '#94A3B8', fontSize: '14px' }}>Classification accuracy, signal tracking, and confidence metrics</p>
        </div>

        {/* Hero metrics — empty state */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-violet-400" />
              <span style={LABEL_STYLE}>Total Signals</span>
            </div>
            <p style={{ color: '#F8FAFC', fontSize: '28px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>0</p>
          </div>
          <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-violet-400" />
              <span style={LABEL_STYLE}>Avg Confidence</span>
            </div>
            <p style={{ color: '#94A3B8', fontSize: '28px', fontWeight: 700 }}>—</p>
          </div>
        </div>

        {/* Informative placeholder */}
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '24px' }}>
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

        {/* Architectural intent */}
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
          <h3 style={{ ...LABEL_STYLE, marginBottom: '16px' }}>
            Classification Accuracy By Type (Planned)
          </h3>
          <div className="space-y-3">
            {PLANNED_SIGNAL_TYPES.map(st => (
              <div key={st.type} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/30">
                <div>
                  <p style={{ color: '#E2E8F0', fontSize: '14px' }}>{st.label}</p>
                  <p style={{ color: '#94A3B8', fontSize: '13px' }}>{SIGNAL_TYPE_DESCRIPTIONS[st.type]}</p>
                </div>
                <span style={{ color: '#94A3B8', fontSize: '13px' }}>Not yet configured</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Real signal data exists
  return (
    <div className="space-y-8">
      {/* Tab heading */}
      <div>
        <h2 style={{ color: '#E2E8F0', fontSize: '18px', fontWeight: 600 }}>AI Intelligence</h2>
        <p style={{ color: '#94A3B8', fontSize: '14px' }}>Classification accuracy, signal tracking, and confidence metrics</p>
      </div>

      {/* Hero metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <span style={LABEL_STYLE}>Total Signals</span>
          </div>
          <p style={{ color: '#F8FAFC', fontSize: '28px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{data.totalSignals.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-violet-400" />
            <span style={LABEL_STYLE}>Avg Confidence</span>
          </div>
          <p style={{ color: '#F8FAFC', fontSize: '28px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{(data.avgConfidence * 100).toFixed(1)}%</p>
        </div>
      </div>

      {/* By Type */}
      <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
        <h3 style={{ ...LABEL_STYLE, marginBottom: '16px' }}>
          Classification Accuracy By Type
        </h3>
        <div className="space-y-3">
          {data.signalsByType.map(st => (
            <div key={st.signalType} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/30">
              <div>
                <p style={{ color: '#E2E8F0', fontSize: '14px' }}>{st.signalType.replace(/_/g, ' ')}</p>
                <p style={{ color: '#94A3B8', fontSize: '13px' }}>{st.count} signals</p>
              </div>
              <ConfidenceBadge value={st.avgConfidence} />
            </div>
          ))}
        </div>
      </div>

      {/* Per Tenant */}
      {data.perTenant.length > 0 && (
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
          <h3 style={{ ...LABEL_STYLE, marginBottom: '16px' }}>
            Per-Tenant AI Health
          </h3>
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

function ConfidenceBadge({ value }: { value: number }) {
  const pct = value * 100;
  return (
    <span className={cn(
      'text-xs font-medium tabular-nums px-2 py-0.5 rounded-full border',
      pct >= 80 ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' :
      pct >= 60 ? 'border-amber-500/40 text-amber-400 bg-amber-500/10' :
      'border-red-500/40 text-red-400 bg-red-500/10'
    )}>
      {pct.toFixed(0)}%
    </span>
  );
}
