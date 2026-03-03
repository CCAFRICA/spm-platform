'use client';

// StoreHeatmap — Store × Component heatmap grid
// OB-145 Phase 3 — DS-007 L4 Population pattern layer

import React, { useMemo, useState } from 'react';
import type { StoreComponentCell, ComponentDef, EntityResult } from '@/lib/data/results-loader';

interface StoreHeatmapProps {
  storeComponentMatrix: StoreComponentCell[];
  stores: string[];
  componentDefinitions: ComponentDef[];
  entities: EntityResult[];
  formatCurrency: (value: number) => string;
  onStoreFilter: (store: string | null) => void;
}

interface Tooltip {
  x: number;
  y: number;
  store: string;
  component: string;
  avgPayout: number;
  entityCount: number;
}

export function StoreHeatmap({
  storeComponentMatrix,
  stores,
  componentDefinitions,
  entities,
  formatCurrency,
  onStoreFilter,
}: StoreHeatmapProps) {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  // Build lookup: store → componentId → cell
  const cellLookup = useMemo(() => {
    const map = new Map<string, Map<string, StoreComponentCell>>();
    for (const cell of storeComponentMatrix) {
      if (!map.has(cell.store)) map.set(cell.store, new Map());
      map.get(cell.store)!.set(cell.componentId, cell);
    }
    return map;
  }, [storeComponentMatrix]);

  // Store totals for sorting
  const storeTotals = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const ent of entities) {
      const store = ent.store || 'unassigned';
      const existing = map.get(store) || { total: 0, count: 0 };
      existing.total += ent.totalPayout;
      existing.count += 1;
      map.set(store, existing);
    }
    return map;
  }, [entities]);

  // Sort stores by avg total payout (highest first)
  const sortedStores = useMemo(() => {
    return [...stores].sort((a, b) => {
      const aData = storeTotals.get(a);
      const bData = storeTotals.get(b);
      const aAvg = aData ? aData.total / aData.count : 0;
      const bAvg = bData ? bData.total / bData.count : 0;
      return bAvg - aAvg;
    });
  }, [stores, storeTotals]);

  // Global max for color intensity
  const maxAvgPayout = useMemo(() => {
    let max = 0;
    for (const cell of storeComponentMatrix) {
      if (cell.avgPayout > max) max = cell.avgPayout;
    }
    return max || 1;
  }, [storeComponentMatrix]);

  // Filter out stores with 0 entities or only 'unassigned'
  const displayStores = sortedStores.filter(s => {
    const data = storeTotals.get(s);
    return data && data.count > 0;
  });

  if (displayStores.length <= 1 && displayStores[0] === 'unassigned') {
    return (
      <div className="rounded-xl border border-zinc-800/60 p-6">
        <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-3">
          Population Pattern
        </p>
        <p className="text-sm text-zinc-500">
          No store association available. Entity-level results shown in the table below.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800/60 p-6 relative">
      <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-4">
        Population Pattern — Store &times; Component
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="text-left text-zinc-500 font-medium py-2 px-3 min-w-[120px]">Store</th>
              <th className="text-center text-zinc-500 font-medium py-2 px-1 w-8">#</th>
              {componentDefinitions.map(cd => (
                <th key={cd.id} className="text-center text-zinc-500 font-medium py-2 px-2 min-w-[80px]">
                  <div className="flex items-center justify-center gap-1">
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: cd.color }} />
                    <span className="truncate max-w-[70px]" title={cd.name}>{cd.name}</span>
                  </div>
                </th>
              ))}
              <th className="text-right text-zinc-500 font-medium py-2 px-3 min-w-[80px]">Avg Total</th>
            </tr>
          </thead>
          <tbody>
            {displayStores.map(store => {
              const storeData = storeTotals.get(store);
              const entityCount = storeData?.count || 0;
              const avgTotal = entityCount > 0 ? (storeData?.total || 0) / entityCount : 0;
              const compCells = cellLookup.get(store);

              return (
                <tr
                  key={store}
                  className="cursor-pointer hover:bg-zinc-800/30 transition-colors"
                  onClick={() => onStoreFilter(store)}
                >
                  <td className="py-1.5 px-3 text-zinc-300 font-medium truncate max-w-[120px]" title={store}>
                    {store === 'unassigned' ? '—' : store}
                  </td>
                  <td className="py-1.5 px-1 text-center text-zinc-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {entityCount}
                  </td>
                  {componentDefinitions.map(cd => {
                    const cell = compCells?.get(cd.id);
                    const avg = cell?.avgPayout || 0;
                    const intensity = maxAvgPayout > 0 ? avg / maxAvgPayout : 0;

                    return (
                      <td
                        key={cd.id}
                        className="py-1.5 px-2 text-center relative"
                        onMouseEnter={(e) => {
                          const rect = (e.target as HTMLElement).getBoundingClientRect();
                          setTooltip({
                            x: rect.left + rect.width / 2,
                            y: rect.top - 8,
                            store,
                            component: cd.name,
                            avgPayout: avg,
                            entityCount: cell?.entityCount || 0,
                          });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        <div
                          className="rounded-md h-7 flex items-center justify-center text-[10px] font-mono"
                          style={{
                            backgroundColor: intensity > 0
                              ? `${cd.color}${Math.round(intensity * 40 + 10).toString(16).padStart(2, '0')}`
                              : 'rgba(100,116,139,0.05)',
                            color: intensity > 0.3 ? '#e2e8f0' : '#64748b',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {avg > 0 ? formatCurrency(avg) : '—'}
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-3 text-right text-zinc-300 font-mono font-medium"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatCurrency(avgTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <p className="text-xs font-medium text-zinc-200">{tooltip.component}</p>
          <p className="text-xs text-zinc-400">
            Store: {tooltip.store} &middot; {tooltip.entityCount} entities
          </p>
          <p className="text-xs font-mono text-zinc-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
            Avg: {formatCurrency(tooltip.avgPayout)}
          </p>
        </div>
      )}
    </div>
  );
}
