'use client';

// EntityTable — Sortable, filterable, searchable entity results table
// OB-145 Phase 4 — DS-007 L4 Entity detail layer

import React, { useState, useMemo, useCallback } from 'react';
import type { EntityResult, ComponentDef } from '@/lib/data/results-loader';
import { NarrativeSpine } from './NarrativeSpine';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Search,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EntityTableProps {
  entities: EntityResult[];
  componentDefinitions: ComponentDef[];
  formatCurrency: (value: number) => string;
  storeFilter: string | null;
  onStoreFilter: (store: string | null) => void;
}

type SortField = 'payout' | 'attainment' | 'name' | 'externalId';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

export function EntityTable({
  entities,
  componentDefinitions,
  formatCurrency,
  storeFilter,
  onStoreFilter,
}: EntityTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('payout');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [statusFilter, setStatusFilter] = useState<'all' | 'exceeds' | 'on_track' | 'below'>('all');
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Peer averages for NarrativeSpine
  const peerAverages = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    for (const ent of entities) {
      for (const cp of ent.componentPayouts) {
        const existing = map.get(cp.componentId) || { sum: 0, count: 0 };
        existing.sum += cp.payout;
        existing.count += 1;
        map.set(cp.componentId, existing);
      }
    }
    const result = new Map<string, number>();
    for (const [id, data] of Array.from(map.entries())) {
      result.set(id, data.count > 0 ? data.sum / data.count : 0);
    }
    return result;
  }, [entities]);

  // Unique stores for filter dropdown
  const uniqueStores = useMemo(() => {
    const set = new Set<string>();
    for (const e of entities) {
      if (e.store) set.add(e.store);
    }
    return Array.from(set).sort();
  }, [entities]);

  // Filter + sort
  const filteredEntities = useMemo(() => {
    let filtered = entities;

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(e => e.status === statusFilter);
    }

    // Store filter
    if (storeFilter) {
      filtered = filtered.filter(e => e.store === storeFilter);
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(e =>
        e.externalId.toLowerCase().includes(q) ||
        e.displayName.toLowerCase().includes(q) ||
        e.store.toLowerCase().includes(q)
      );
    }

    // Sort
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'payout':
          cmp = a.totalPayout - b.totalPayout;
          break;
        case 'attainment':
          cmp = (a.attainment ?? -1) - (b.attainment ?? -1);
          break;
        case 'name':
          cmp = a.displayName.localeCompare(b.displayName);
          break;
        case 'externalId':
          cmp = a.externalId.localeCompare(b.externalId);
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [entities, statusFilter, storeFilter, searchQuery, sortField, sortDir]);

  const totalPages = Math.ceil(filteredEntities.length / PAGE_SIZE);
  const paginatedEntities = filteredEntities.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setCurrentPage(1);
  }, [sortField]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === 'desc'
      ? <ChevronDown className="w-3 h-3 inline ml-0.5" />
      : <ChevronUp className="w-3 h-3 inline ml-0.5" />;
  };

  return (
    <div className="rounded-xl border border-zinc-800/60 overflow-hidden">
      {/* Filters bar */}
      <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search ID, name, store..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1">
          {(['all', 'exceeds', 'on_track', 'below'] as const).map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setCurrentPage(1); }}
              className={cn(
                'px-2.5 py-1 text-[10px] rounded-md font-medium transition-colors uppercase tracking-wider',
                statusFilter === s
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-zinc-500 hover:text-zinc-400 border border-transparent'
              )}
            >
              {s === 'all' ? 'All' : s === 'on_track' ? 'On Track' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Store filter badge */}
        {storeFilter && (
          <button
            onClick={() => onStoreFilter(null)}
            className="px-2.5 py-1 text-[10px] rounded-md bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 transition-colors"
          >
            Store: {storeFilter} &times;
          </button>
        )}

        {/* Store dropdown if stores exist */}
        {uniqueStores.length > 1 && !storeFilter && (
          <select
            onChange={e => { onStoreFilter(e.target.value || null); setCurrentPage(1); }}
            value=""
            className="text-[10px] bg-zinc-800/50 border border-zinc-700/50 rounded-md px-2 py-1 text-zinc-400"
          >
            <option value="">All Stores</option>
            {uniqueStores.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        {/* Count */}
        <span className="text-[10px] text-zinc-500 ml-auto">
          {filteredEntities.length.toLocaleString()} of {entities.length.toLocaleString()}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800/60">
              <th className="w-8 py-2.5 px-2"></th>
              <th className="text-left py-2.5 px-2 w-8 text-zinc-500">#</th>
              <th
                className="text-left py-2.5 px-3 text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors select-none"
                onClick={() => handleSort('externalId')}
              >
                ID <SortIcon field="externalId" />
              </th>
              <th
                className="text-left py-2.5 px-3 text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors select-none"
                onClick={() => handleSort('name')}
              >
                Name <SortIcon field="name" />
              </th>
              <th className="text-left py-2.5 px-3 text-zinc-500">Store</th>
              <th
                className="text-right py-2.5 px-3 text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors select-none"
                onClick={() => handleSort('attainment')}
              >
                Attainment <SortIcon field="attainment" />
              </th>
              <th className="text-center py-2.5 px-3 text-zinc-500 min-w-[100px]">Components</th>
              <th
                className="text-right py-2.5 px-3 text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors select-none"
                onClick={() => handleSort('payout')}
              >
                Payout <SortIcon field="payout" />
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedEntities.map((entity, idx) => {
              const isExpanded = expandedEntity === entity.entityId;
              const rank = (currentPage - 1) * PAGE_SIZE + idx + 1;

              return (
                <React.Fragment key={entity.entityId}>
                  <tr
                    className={cn(
                      'cursor-pointer transition-colors',
                      isExpanded ? 'bg-zinc-800/40' : 'hover:bg-zinc-800/20'
                    )}
                    onClick={() => setExpandedEntity(isExpanded ? null : entity.entityId)}
                  >
                    <td className="py-2 px-2">
                      {isExpanded
                        ? <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                        : <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />}
                    </td>
                    <td className="py-2 px-2 text-zinc-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {rank}
                    </td>
                    <td className="py-2 px-3 font-mono font-medium text-zinc-300">
                      {entity.externalId || entity.entityId.substring(0, 8)}
                    </td>
                    <td className="py-2 px-3 text-zinc-400 truncate max-w-[160px]" title={entity.displayName}>
                      {entity.displayName !== entity.externalId ? entity.displayName : '—'}
                    </td>
                    <td className="py-2 px-3 text-zinc-500">
                      {entity.store || '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {entity.attainment !== null ? (
                        <span className={cn(
                          entity.attainment >= 120 ? 'text-emerald-400' :
                          entity.attainment >= 80 ? 'text-amber-400' :
                          'text-zinc-500'
                        )}>
                          {entity.attainment.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <MiniBar
                        componentPayouts={entity.componentPayouts}
                        componentDefinitions={componentDefinitions}
                        totalPayout={entity.totalPayout}
                      />
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-zinc-200"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {formatCurrency(entity.totalPayout)}
                    </td>
                  </tr>

                  {/* Expanded row: Narrative + Spine */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={8} className="p-0">
                        <div className="border-t border-zinc-800/60 bg-zinc-900/60">
                          <NarrativeSpine
                            entity={entity}
                            componentDefinitions={componentDefinitions}
                            peerAverages={peerAverages}
                            formatCurrency={formatCurrency}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800/60">
          <p className="text-[10px] text-zinc-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {((currentPage - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(currentPage * PAGE_SIZE, filteredEntities.length).toLocaleString()} of {filteredEntities.length.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="p-1.5 rounded-md border border-zinc-700/50 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-[10px] text-zinc-500 font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {currentPage}/{totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              className="p-1.5 rounded-md border border-zinc-700/50 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// MiniBar — 6px stacked bar per row
// ──────────────────────────────────────────────

function MiniBar({
  componentPayouts,
  componentDefinitions,
  totalPayout,
}: {
  componentPayouts: EntityResult['componentPayouts'];
  componentDefinitions: ComponentDef[];
  totalPayout: number;
}) {
  if (totalPayout <= 0) {
    return <div className="h-1.5 w-full rounded-full bg-zinc-800/50" />;
  }

  const colorMap = new Map<string, string>();
  for (const cd of componentDefinitions) {
    colorMap.set(cd.id, cd.color);
    colorMap.set(cd.name, cd.color);
  }

  return (
    <div className="flex rounded-full h-1.5 overflow-hidden bg-zinc-800/50" title={componentPayouts.map(c => `${c.componentName}: ${c.payout}`).join(' | ')}>
      {componentPayouts
        .filter(c => c.payout > 0)
        .sort((a, b) => b.payout - a.payout)
        .map(c => {
          const pct = (c.payout / totalPayout) * 100;
          const color = colorMap.get(c.componentId) || colorMap.get(c.componentName) || '#6366f1';
          return (
            <div
              key={c.componentId}
              style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }}
              className="h-1.5"
            />
          );
        })}
    </div>
  );
}
