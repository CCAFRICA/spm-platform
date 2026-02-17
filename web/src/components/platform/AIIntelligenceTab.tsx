'use client';

import { useState, useEffect } from 'react';
import type { AIIntelligenceData } from '@/lib/data/platform-queries';
import { Loader2, Sparkles, AlertTriangle, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
        {/* Hero metrics — empty state */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-violet-400" />
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Total Signals</span>
            </div>
            <p className="text-2xl font-bold text-white tabular-nums">0</p>
          </div>
          <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-violet-400" />
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Avg Confidence</span>
            </div>
            <p className="text-2xl font-bold text-zinc-600">—</p>
          </div>
        </div>

        {/* Informative placeholder */}
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-white mb-1">AI signal tracking not yet active</h3>
              <p className="text-xs text-zinc-400">
                Signals will appear here once the AI pipeline captures classification and mapping data
                during file imports and plan interpretation.
              </p>
            </div>
          </div>
        </div>

        {/* Architectural intent */}
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5">
          <h3 className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-4">
            Classification Accuracy By Type (Planned)
          </h3>
          <div className="space-y-3">
            {PLANNED_SIGNAL_TYPES.map(st => (
              <div key={st.type} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/30">
                <div>
                  <p className="text-sm text-zinc-300">{st.label}</p>
                  <p className="text-[10px] text-zinc-600">{SIGNAL_TYPE_DESCRIPTIONS[st.type]}</p>
                </div>
                <span className="text-[10px] text-zinc-600">Not yet configured</span>
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
      {/* Hero metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Total Signals</span>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{data.totalSignals.toLocaleString()}</p>
        </div>
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-violet-400" />
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Avg Confidence</span>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{(data.avgConfidence * 100).toFixed(1)}%</p>
        </div>
      </div>

      {/* By Type */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5">
        <h3 className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-4">
          Classification Accuracy By Type
        </h3>
        <div className="space-y-3">
          {data.signalsByType.map(st => (
            <div key={st.signalType} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/30">
              <div>
                <p className="text-sm text-zinc-300">{st.signalType.replace(/_/g, ' ')}</p>
                <p className="text-[10px] text-zinc-600">{st.count} signals</p>
              </div>
              <ConfidenceBadge value={st.avgConfidence} />
            </div>
          ))}
        </div>
      </div>

      {/* Per Tenant */}
      {data.perTenant.length > 0 && (
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5">
          <h3 className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-4">
            Per-Tenant AI Health
          </h3>
          <div className="space-y-2">
            {data.perTenant.map(t => (
              <div key={t.tenantId} className="flex items-center gap-4 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/30">
                <span className="text-sm text-white font-medium flex-1">{t.tenantName}</span>
                <span className="text-xs text-zinc-400 tabular-nums">{t.signalCount} signals</span>
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
