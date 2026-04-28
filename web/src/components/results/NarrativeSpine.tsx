'use client';

// NarrativeSpine — AI narrative summary + attainment spine tracks
// OB-145 Phase 5 — DS-007 L3 Explanation layer + L2 Source teaser

import React, { useMemo } from 'react';
import Link from 'next/link';
import type { EntityResult, ComponentDef } from '@/lib/data/results-loader';
import { cn } from '@/lib/utils';

interface NarrativeSpineProps {
  entity: EntityResult;
  componentDefinitions: ComponentDef[];
  peerAverages: Map<string, number>;
  formatCurrency: (value: number) => string;
}

interface ExceptionBadge {
  label: string;
  type: 'gate_failed' | 'above_average' | 'below_average' | 'normal';
}

export function NarrativeSpine({
  entity,
  componentDefinitions,
  peerAverages,
  formatCurrency,
}: NarrativeSpineProps) {
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cd of componentDefinitions) {
      map.set(cd.id, cd.color);
      map.set(cd.name, cd.color);
    }
    return map;
  }, [componentDefinitions]);

  // Sort components by payout (largest first)
  const sortedComps = useMemo(() =>
    [...entity.componentPayouts].sort((a, b) => b.payout - a.payout),
    [entity.componentPayouts]
  );

  // Build narrative
  const narrative = useMemo(() => {
    const { totalPayout, displayName, externalId } = entity;
    const name = displayName !== externalId ? displayName : externalId;

    if (totalPayout <= 0) {
      const gateFailedComps = sortedComps.filter(c => c.gateStatus === 'failed');
      if (gateFailedComps.length > 0) {
        return `${name} earned nothing. ${gateFailedComps.map(c => c.componentName).join(', ')} — gate not met.`;
      }
      return `${name} earned nothing across all components. No attainment thresholds reached.`;
    }

    const topComp = sortedComps[0];
    const topAttStr = topComp.attainment !== null ? `, ${topComp.attainment.toFixed(0)}% attainment` : '';

    // Build exception list
    const exceptions: string[] = [];
    for (const comp of sortedComps) {
      if (comp.gateStatus === 'failed') {
        exceptions.push(`${comp.componentName} — gate not met`);
      } else {
        const peerAvg = peerAverages.get(comp.componentId) || 0;
        if (peerAvg > 0 && comp.payout > peerAvg * 1.3) {
          exceptions.push(`${comp.componentName} above peer average`);
        } else if (peerAvg > 0 && comp.payout > 0 && comp.payout < peerAvg * 0.6) {
          exceptions.push(`${comp.componentName} below peer average`);
        }
      }
    }

    const exceptionStr = exceptions.length > 0
      ? exceptions.join('. ') + '.'
      : 'All components within expected range.';

    return `Earned ${formatCurrency(totalPayout)}, driven by ${topComp.componentName} (${formatCurrency(topComp.payout)}${topAttStr}). ${exceptionStr}`;
  }, [entity, sortedComps, peerAverages, formatCurrency]);

  // Build exception badges
  const badges = useMemo((): ExceptionBadge[] => {
    const result: ExceptionBadge[] = [];
    let hasException = false;

    for (const comp of sortedComps) {
      if (comp.gateStatus === 'failed') {
        result.push({ label: `${comp.componentName}: gate not met`, type: 'gate_failed' });
        hasException = true;
      } else {
        const peerAvg = peerAverages.get(comp.componentId) || 0;
        if (peerAvg > 0 && comp.payout > peerAvg * 1.3) {
          result.push({ label: `${comp.componentName}: above average`, type: 'above_average' });
          hasException = true;
        } else if (peerAvg > 0 && comp.payout > 0 && comp.payout < peerAvg * 0.6) {
          result.push({ label: `${comp.componentName}: below average`, type: 'below_average' });
          hasException = true;
        }
      }
    }

    if (!hasException && entity.totalPayout > 0) {
      result.push({ label: 'All components within expected range', type: 'normal' });
    }

    return result;
  }, [sortedComps, peerAverages, entity.totalPayout]);

  // Max attainment for spine track scaling
  const maxAttainment = useMemo(() => {
    let max = 120;
    for (const c of sortedComps) {
      if (c.attainment !== null && c.attainment > max) max = c.attainment;
    }
    return max * 1.1; // 10% headroom
  }, [sortedComps]);

  return (
    <div className="px-6 py-5 space-y-4">
      {/* Narrative */}
      <div>
        <p className="text-sm text-zinc-300 leading-relaxed">{narrative}</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {badges.map((badge, i) => (
            <span
              key={i}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium',
                badge.type === 'gate_failed' && 'bg-red-500/10 text-red-400',
                badge.type === 'above_average' && 'bg-emerald-500/10 text-emerald-400',
                badge.type === 'below_average' && 'bg-amber-500/10 text-amber-400',
                badge.type === 'normal' && 'bg-emerald-500/10 text-emerald-400',
              )}
            >
              {badge.type === 'gate_failed' && <span>&#10005;</span>}
              {badge.type === 'above_average' && <span>&#9650;</span>}
              {badge.type === 'below_average' && <span>&#9651;</span>}
              {badge.type === 'normal' && <span>&#10003;</span>}
              {badge.label}
            </span>
          ))}
        </div>
      </div>

      {/* Spine tracks */}
      <div className="space-y-2">
        {sortedComps.map(comp => {
          const color = colorMap.get(comp.componentId) || colorMap.get(comp.componentName) || '#6366f1';
          const hasAttainment = comp.attainment !== null;

          // Gate marker position (for conditional_percentage)
          let gatePosition: number | null = null;
          if (comp.componentType === 'conditional_gate' && comp.details) {
            const condMetric = comp.details.conditionMetric;
            if (condMetric) {
              // Gate at 100% of condition metric
              gatePosition = (100 / maxAttainment) * 100;
            }
          }

          // Attainment fill width
          const fillWidth = hasAttainment && maxAttainment > 0
            ? Math.min((comp.attainment! / maxAttainment) * 100, 100)
            : 0;

          // 100% reference position
          const refPosition = (100 / maxAttainment) * 100;

          return (
            <div key={comp.componentId} className="flex items-center gap-3">
              {/* Component name */}
              <span className="text-xs text-zinc-400 w-[120px] truncate flex-shrink-0" title={comp.componentName}>
                {comp.componentName}
              </span>

              {/* Track */}
              <div className="flex-1 relative h-5">
                {hasAttainment ? (
                  <>
                    {/* Track background */}
                    <div className="absolute inset-0 rounded bg-zinc-800/30" />

                    {/* Fill */}
                    <div
                      className="absolute inset-y-0 left-0 rounded transition-all duration-500"
                      style={{
                        width: `${fillWidth}%`,
                        backgroundColor: comp.payout > 0 ? color : '#ef4444',
                        opacity: 0.25,
                      }}
                    />

                    {/* 100% reference tick */}
                    <div
                      className="absolute top-0 bottom-0 w-px bg-zinc-600/50"
                      style={{ left: `${refPosition}%` }}
                    />
                    <span
                      className="absolute -top-0.5 text-[8px] text-zinc-600 transform -translate-x-1/2"
                      style={{ left: `${refPosition}%` }}
                    >
                      100%
                    </span>

                    {/* Gate marker */}
                    {gatePosition !== null && (
                      <>
                        <div
                          className={cn(
                            'absolute top-0 bottom-0 w-0.5',
                            comp.gateStatus === 'passed' ? 'bg-emerald-500' : 'bg-red-500'
                          )}
                          style={{ left: `${gatePosition}%` }}
                        />
                        <span
                          className={cn(
                            'absolute -top-0.5 text-[8px] transform -translate-x-1/2',
                            comp.gateStatus === 'passed' ? 'text-emerald-500' : 'text-red-500'
                          )}
                          style={{ left: `${gatePosition}%` }}
                        >
                          gate
                        </span>
                      </>
                    )}

                    {/* Dot at attainment value */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 transition-all duration-500"
                      style={{
                        left: `${fillWidth}%`,
                        transform: `translate(-50%, -50%)`,
                        backgroundColor: comp.payout > 0 ? color : '#ef4444',
                        borderColor: 'rgba(15,23,42,0.8)',
                        boxShadow: comp.payout > 0
                          ? `0 0 6px ${color}40`
                          : '0 0 6px rgba(239,68,68,0.25)',
                      }}
                    />

                    {/* Attainment label */}
                    <span
                      className="absolute top-1/2 -translate-y-1/2 text-[10px] font-mono ml-2"
                      style={{
                        left: `${fillWidth}%`,
                        color: comp.payout > 0 ? color : '#ef4444',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {comp.attainment!.toFixed(0)}%
                    </span>
                  </>
                ) : (
                  /* No attainment track — flat rate or no data */
                  <div className="absolute inset-0 rounded bg-zinc-800/30 flex items-center justify-center">
                    <span className="text-[10px] text-zinc-600 italic">
                      {comp.componentType === 'percentage' ? 'flat rate' : 'no data'}
                    </span>
                  </div>
                )}
              </div>

              {/* Payout amount */}
              <span
                className={cn(
                  'text-xs font-mono w-[80px] text-right flex-shrink-0',
                  comp.payout > 0 ? 'text-zinc-200' : 'text-zinc-600'
                )}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatCurrency(comp.payout)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Source data teaser (L2) */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/40">
        <div className="text-[10px] text-zinc-600">
          {entity.sourceSheets.length > 0 && (
            <span>Sources: {entity.sourceSheets.join(', ')}</span>
          )}
        </div>
        <Link
          href={`/investigate/trace/${entity.entityId}?from=results`}
          className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
          onClick={e => e.stopPropagation()}
        >
          View Full Trace &rarr;
        </Link>
      </div>
    </div>
  );
}
