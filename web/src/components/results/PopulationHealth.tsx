'use client';

// PopulationHealth — Three-segment bar (Exceeds / On Track / Below)
// OB-145 Phase 4 — DS-007 L4 Population summary

import React, { useMemo } from 'react';
import type { EntityResult } from '@/lib/data/results-loader';

interface PopulationHealthProps {
  entities: EntityResult[];
}

export function PopulationHealth({ entities }: PopulationHealthProps) {
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
