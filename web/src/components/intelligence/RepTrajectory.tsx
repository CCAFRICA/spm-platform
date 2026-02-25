'use client';

/**
 * RepTrajectory — Visual Performance Trajectory
 *
 * OB-98 Phase 5: Shows where a rep is on their earning curve and
 * what actions move the needle toward higher payouts.
 *
 * Best opportunity highlighted. Progress bars toward next tier.
 * Actionable gaps translated into business terms.
 * Korean Test: zero hardcoded component names, tier names, or currencies.
 */

import { useMemo } from 'react';
import { Target, ArrowUpRight, TrendingUp, Zap } from 'lucide-react';
import { useCurrency } from '@/contexts/tenant-context';
import { usePeriod } from '@/contexts/period-context';
import { computeRepTrajectory } from '@/lib/intelligence/trajectory-engine';
import type { RepDashboardData } from '@/lib/data/persona-queries';

// ──────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────

interface RepTrajectoryProps {
  data: RepDashboardData;
  ruleSetConfig: unknown;
  attainments?: Record<string, number>;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const ACCENT = '#10b981'; // emerald for rep

const CARD_STYLE = {
  background: 'rgba(24, 24, 27, 0.8)',
  border: '1px solid rgba(39, 39, 42, 0.6)',
  borderRadius: '16px',
  padding: '20px',
};

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export function RepTrajectoryPanel({ data, ruleSetConfig, attainments }: RepTrajectoryProps) {
  const { symbol: currencySymbol } = useCurrency();
  const { activePeriodLabel } = usePeriod();

  // Compute trajectory deterministically
  const trajectory = useMemo(() => {
    if (!data || !ruleSetConfig) return null;
    return computeRepTrajectory(
      'current-user',
      data.components.length > 0 ? 'You' : '',
      data.totalPayout,
      data.components,
      ruleSetConfig as Parameters<typeof computeRepTrajectory>[4],
      attainments
    );
  }, [data, ruleSetConfig, attainments]);

  if (!trajectory || trajectory.trajectories.length === 0) {
    return null; // Empty state: don't render if no trajectory data
  }

  const { bestOpportunity, trajectories, totalPotential } = trajectory;

  return (
    <div style={CARD_STYLE}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <TrendingUp size={18} style={{ color: ACCENT }} />
        <span style={{ color: '#E2E8F0', fontSize: '16px', fontWeight: 600 }}>
          Performance Trajectory
        </span>
        <span style={{
          background: `${ACCENT}22`,
          color: ACCENT,
          fontSize: '11px',
          padding: '2px 8px',
          borderRadius: '4px',
          fontWeight: 500,
        }}>
          {activePeriodLabel}
        </span>
      </div>

      {/* Best Opportunity Card */}
      {bestOpportunity && (
        <div style={{
          background: `${ACCENT}0A`,
          border: `1px solid ${ACCENT}33`,
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Target size={16} style={{ color: ACCENT }} />
            <span style={{ color: ACCENT, fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Best Opportunity
            </span>
          </div>
          <p style={{ color: '#E2E8F0', fontSize: '15px', fontWeight: 600 }}>
            {bestOpportunity.componentName}: {bestOpportunity.currentAttainment.toFixed(0)}% → {bestOpportunity.nextTierThreshold.toFixed(0)}% ({bestOpportunity.nextTierName})
          </p>
          {/* Progress bar */}
          <div style={{
            background: 'rgba(39, 39, 42, 0.8)',
            borderRadius: '6px',
            height: '8px',
            marginTop: '10px',
            overflow: 'hidden',
          }}>
            <div style={{
              background: `linear-gradient(to right, ${ACCENT}, ${ACCENT}CC)`,
              height: '100%',
              width: `${bestOpportunity.progressPercent}%`,
              borderRadius: '6px',
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ color: '#71717a', fontSize: '11px' }}>
              {bestOpportunity.distanceToNextTier.toFixed(1)}% to go
            </span>
            <span style={{ color: ACCENT, fontSize: '13px', fontWeight: 600 }}>
              +{currencySymbol}{bestOpportunity.incrementalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      )}

      {/* Component Breakdown Table */}
      {trajectories.length > 1 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Component', 'Current', 'Next Tier', 'Gap', 'Value'].map(h => (
                  <th key={h} style={{
                    color: '#71717a',
                    fontSize: '11px',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '8px 12px',
                    textAlign: 'left',
                    borderBottom: '1px solid rgba(63, 63, 70, 0.5)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trajectories.map(t => (
                <tr key={t.componentName}>
                  <td style={{ color: '#E2E8F0', fontSize: '13px', fontWeight: 500, padding: '8px 12px' }}>
                    {t.componentName}
                  </td>
                  <td style={{ color: '#94a3b8', fontSize: '13px', padding: '8px 12px' }}>
                    {t.currentAttainment.toFixed(0)}% ({t.currentTier})
                  </td>
                  <td style={{ color: '#94a3b8', fontSize: '13px', padding: '8px 12px' }}>
                    {t.nextTierThreshold.toFixed(0)}% ({t.nextTierName})
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ color: '#f59e0b', fontSize: '13px', fontWeight: 500 }}>
                      {t.distanceToNextTier.toFixed(1)}%
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ color: ACCENT, fontSize: '13px', fontWeight: 600 }}>
                      +{currencySymbol}{t.incrementalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Total Potential */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '16px',
        padding: '12px',
        background: 'rgba(39, 39, 42, 0.4)',
        borderRadius: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Zap size={14} style={{ color: '#f59e0b' }} />
          <span style={{ color: '#94a3b8', fontSize: '13px' }}>
            Total current payout
          </span>
        </div>
        <span style={{ color: '#E2E8F0', fontSize: '15px', fontWeight: 600 }}>
          {currencySymbol}{data.totalPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '4px',
        padding: '12px',
        background: `${ACCENT}08`,
        borderRadius: '8px',
        border: `1px solid ${ACCENT}22`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ArrowUpRight size={14} style={{ color: ACCENT }} />
          <span style={{ color: ACCENT, fontSize: '13px' }}>
            Potential with all next tiers
          </span>
        </div>
        <span style={{ color: ACCENT, fontSize: '15px', fontWeight: 700 }}>
          {currencySymbol}{(data.totalPayout + totalPotential).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          <span style={{ fontSize: '12px', fontWeight: 500, marginLeft: '4px' }}>
            (+{currencySymbol}{totalPotential.toLocaleString(undefined, { maximumFractionDigits: 0 })})
          </span>
        </span>
      </div>
    </div>
  );
}
