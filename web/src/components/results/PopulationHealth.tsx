'use client';

// PopulationHealth — Three-segment bar (Exceeds / On Track / Below)
// OB-145 Phase 4 — DS-007 L4 Population summary

import React, { useMemo } from 'react';
import type { EntityResult } from '@/lib/data/results-loader';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

interface PopulationHealthProps {
  entities: EntityResult[];
}

export function PopulationHealth({ entities }: PopulationHealthProps) {
  const isVialuce = useIsVialuce(); // OB-221: container → .card, segments → indigo ramp, numbers → DM Mono
  const counts = useMemo(() => {
    let exceeds = 0;
    let onTrack = 0;
    let below = 0;
    for (const e of entities) {
      if (e.status === 'exceeds') exceeds++;
      else if (e.status === 'on_track') onTrack++;
      else below++;
    }
    return { exceeds, onTrack, below, total: entities.length };
  }, [entities]);

  const pctExceeds = counts.total > 0 ? (counts.exceeds / counts.total) * 100 : 0;
  const pctOnTrack = counts.total > 0 ? (counts.onTrack / counts.total) * 100 : 0;
  const pctBelow = counts.total > 0 ? (counts.below / counts.total) * 100 : 0;

  // Vialuce: white .card surface; indigo-ramp segments (deep=exceeds, mid=on-track, soft=below);
  // header eyebrow + all legend counts in DM Mono. Else-branch byte-identical (dark cannot regress).
  if (isVialuce) {
    return (
      <div className="card">
        <div className="card-h" style={{ marginBottom: 14 }}>
          <h3 style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '10.5px', letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--vl-text-soft)', fontWeight: 400 }}>
            Population Health
          </h3>
          <span style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '12px', color: 'var(--vl-text-muted)' }}>
            {counts.total.toLocaleString()} entities
          </span>
        </div>

        {/* Three-segment bar — indigo ramp */}
        <div style={{ display: 'flex', height: 12, borderRadius: 'var(--vl-r-pill)', overflow: 'hidden', background: 'var(--vl-line-soft)' }}>
          {pctExceeds > 0 && (
            <div style={{ width: `${pctExceeds}%`, background: 'var(--vl-raw-indigo-deep)', transition: 'all .5s' }} title={`Exceeds: ${counts.exceeds}`} />
          )}
          {pctOnTrack > 0 && (
            <div style={{ width: `${pctOnTrack}%`, background: 'var(--vl-raw-indigo)', transition: 'all .5s' }} title={`On Track: ${counts.onTrack}`} />
          )}
          {pctBelow > 0 && (
            <div style={{ width: `${pctBelow}%`, background: 'var(--vl-raw-indigo-light)', transition: 'all .5s' }} title={`Below: ${counts.below}`} />
          )}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 14, fontSize: '13px', color: 'var(--vl-text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--vl-raw-indigo-deep)' }} />
            <span>Exceeds <span style={{ fontFamily: 'var(--vl-font-mono)', color: 'var(--vl-text)' }}>{counts.exceeds.toLocaleString()}</span></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--vl-raw-indigo)' }} />
            <span>On Track <span style={{ fontFamily: 'var(--vl-font-mono)', color: 'var(--vl-text)' }}>{counts.onTrack.toLocaleString()}</span></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--vl-raw-indigo-light)' }} />
            <span>Below <span style={{ fontFamily: 'var(--vl-font-mono)', color: 'var(--vl-text)' }}>{counts.below.toLocaleString()}</span></span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
          Population Health
        </p>
        <p className="text-xs text-zinc-500">
          {counts.total.toLocaleString()} entities
        </p>
      </div>

      {/* Three-segment bar */}
      <div className="flex rounded-full h-3 overflow-hidden bg-zinc-800/50">
        {pctExceeds > 0 && (
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${pctExceeds}%` }}
            title={`Exceeds: ${counts.exceeds}`}
          />
        )}
        {pctOnTrack > 0 && (
          <div
            className="bg-amber-500 transition-all duration-500"
            style={{ width: `${pctOnTrack}%` }}
            title={`On Track: ${counts.onTrack}`}
          />
        )}
        {pctBelow > 0 && (
          <div
            className="bg-zinc-600 transition-all duration-500"
            style={{ width: `${pctBelow}%` }}
            title={`Below: ${counts.below}`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 mt-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
          <span className="text-xs text-zinc-400">
            Exceeds <span className="font-mono text-zinc-300" style={{ fontVariantNumeric: 'tabular-nums' }}>{counts.exceeds.toLocaleString()}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
          <span className="text-xs text-zinc-400">
            On Track <span className="font-mono text-zinc-300" style={{ fontVariantNumeric: 'tabular-nums' }}>{counts.onTrack.toLocaleString()}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-zinc-600" />
          <span className="text-xs text-zinc-400">
            Below <span className="font-mono text-zinc-300" style={{ fontVariantNumeric: 'tabular-nums' }}>{counts.below.toLocaleString()}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
