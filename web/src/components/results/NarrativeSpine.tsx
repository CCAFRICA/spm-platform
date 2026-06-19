'use client';

// NarrativeSpine — AI narrative summary + attainment spine tracks
// OB-145 Phase 5 — DS-007 L3 Explanation layer + L2 Source teaser

import React, { useMemo } from 'react';
import Link from 'next/link';
import type { EntityResult, ComponentDef } from '@/lib/data/results-loader';
import { cn } from '@/lib/utils';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

// OB-221: indigo ramp for attainment-track fills under Vialuce (replaces per-component dark hex).
const VIALUCE_RAMP = ['#2D2F8F', '#4446B8', '#6668D8', '#9A9CE0', '#E8A838'];

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
  const isVialuce = useIsVialuce(); // OB-221: badges → .pill, spine tracks → indigo ramp, payout → DM Mono
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

  // Vialuce: explanation layer on the white surface. Narrative reads in body color, exception badges
  // become design-spec .pill chips, attainment spine fills use the indigo ramp, and every payout/percent
  // is DM Mono. The else-branch is the existing dark rendering, byte-identical (Dark/Bliss cannot regress).
  if (isVialuce) {
    const pillVariant = (type: ExceptionBadge['type']): string =>
      type === 'gate_failed' ? 'danger' : type === 'below_average' ? 'neutral' : 'success';
    return (
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Narrative */}
        <div>
          <p style={{ fontSize: '13px', color: 'var(--vl-text)', lineHeight: 1.6, margin: 0 }}>{narrative}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {badges.map((badge, i) => (
              <span key={i} className={`pill ${pillVariant(badge.type)}`}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedComps.map((comp, ci) => {
            const color = comp.payout > 0 ? VIALUCE_RAMP[ci % VIALUCE_RAMP.length] : 'var(--vl-danger)';
            const hasAttainment = comp.attainment !== null;

            let gatePosition: number | null = null;
            if (comp.componentType === 'conditional_gate' && comp.details) {
              const condMetric = comp.details.conditionMetric;
              if (condMetric) gatePosition = (100 / maxAttainment) * 100;
            }

            const fillWidth = hasAttainment && maxAttainment > 0
              ? Math.min((comp.attainment! / maxAttainment) * 100, 100)
              : 0;
            const refPosition = (100 / maxAttainment) * 100;

            return (
              <div key={comp.componentId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '12px', color: 'var(--vl-text-muted)', width: 120, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={comp.componentName}>
                  {comp.componentName}
                </span>

                <div style={{ flex: 1, position: 'relative', height: 20 }}>
                  {hasAttainment ? (
                    <>
                      <div style={{ position: 'absolute', inset: 0, borderRadius: 6, background: 'var(--vl-line-soft)' }} />
                      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 6, width: `${fillWidth}%`, background: color, opacity: 0.35, transition: 'all .5s' }} />
                      <div style={{ position: 'absolute', top: 0, bottom: 0, width: 1, background: 'var(--vl-line)', left: `${refPosition}%` }} />
                      <span style={{ position: 'absolute', top: -2, fontFamily: 'var(--vl-font-mono)', fontSize: '8px', color: 'var(--vl-text-soft)', transform: 'translateX(-50%)', left: `${refPosition}%` }}>
                        100%
                      </span>
                      {gatePosition !== null && (
                        <>
                          <div style={{ position: 'absolute', top: 0, bottom: 0, width: 2, left: `${gatePosition}%`, background: comp.gateStatus === 'passed' ? 'var(--vl-success)' : 'var(--vl-danger)' }} />
                          <span style={{ position: 'absolute', top: -2, fontFamily: 'var(--vl-font-mono)', fontSize: '8px', transform: 'translateX(-50%)', left: `${gatePosition}%`, color: comp.gateStatus === 'passed' ? 'var(--vl-success)' : 'var(--vl-danger)' }}>
                            gate
                          </span>
                        </>
                      )}
                      <div style={{ position: 'absolute', top: '50%', left: `${fillWidth}%`, transform: 'translate(-50%, -50%)', width: 12, height: 12, borderRadius: '50%', border: '2px solid var(--vl-surface)', background: color, transition: 'all .5s' }} />
                      <span style={{ position: 'absolute', top: '50%', left: `${fillWidth}%`, transform: 'translateY(-50%)', marginLeft: 8, fontFamily: 'var(--vl-font-mono)', fontSize: '10px', color }}>
                        {comp.attainment!.toFixed(0)}%
                      </span>
                    </>
                  ) : (
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 6, background: 'var(--vl-line-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '10px', color: 'var(--vl-text-soft)', fontStyle: 'italic' }}>
                        {comp.componentType === 'scalar_multiply' ? 'flat rate' : 'no data'}
                      </span>
                    </div>
                  )}
                </div>

                <span style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '12px', width: 80, textAlign: 'right', flexShrink: 0, color: comp.payout > 0 ? 'var(--vl-text)' : 'var(--vl-text-soft)' }}>
                  {formatCurrency(comp.payout)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Source data teaser (L2) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--vl-line-soft)' }}>
          <div style={{ fontSize: '10px', color: 'var(--vl-text-soft)' }}>
            {entity.sourceSheets.length > 0 && (
              <span>Sources: {entity.sourceSheets.join(', ')}</span>
            )}
          </div>
          <Link
            href={`/investigate/trace/${entity.entityId}?from=results`}
            style={{ fontSize: '10px', color: 'var(--vialuce-indigo)' }}
            onClick={e => e.stopPropagation()}
          >
            View Full Trace &rarr;
          </Link>
        </div>
      </div>
    );
  }

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
                      {comp.componentType === 'scalar_multiply' ? 'flat rate' : 'no data'}
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
