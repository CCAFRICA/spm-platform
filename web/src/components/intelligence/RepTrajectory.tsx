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
import { useIsVialuce } from '@/hooks/use-is-vialuce';

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
  const { format } = useCurrency();
  const { activePeriodLabel } = usePeriod();
  const isVialuce = useIsVialuce(); // HF-316: panel→.card, table→.tbl DM Mono, bars→indigo ramp

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

  // HF-316: under Vialuce the panel is a .card surface, the period chip is a .pill open, the best-
  // opportunity sub-card is the .insight gold banner, the progress bar uses the indigo ramp, the
  // breakdown is a .tbl (DM Mono numeric cells), and totals are DM Mono. The else-branch is byte-
  // identical to the original (Dark/Bliss cannot regress).
  if (isVialuce) {
    return (
      <div className="card" style={{ marginTop: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <TrendingUp size={18} style={{ color: 'var(--vialuce-indigo)' }} />
          <span style={{ color: 'var(--vl-text)', fontSize: '16px', fontWeight: 600 }}>
            Performance Trajectory
          </span>
          <span className="pill open">{activePeriodLabel}</span>
        </div>

        {/* Best Opportunity — .insight gold banner */}
        {bestOpportunity && (
          <div className="insight" style={{ marginBottom: '16px', flexDirection: 'column', gap: '0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Target size={16} style={{ color: '#9A6B12' }} />
              <span className="lbl" style={{ marginBottom: 0 }}>BEST OPPORTUNITY</span>
            </div>
            <p style={{ color: 'var(--vl-text)', fontSize: '15px', fontWeight: 600 }}>
              {bestOpportunity.componentName}:{' '}
              <span style={{ fontFamily: 'var(--vl-font-mono)' }}>
                {bestOpportunity.currentAttainment.toFixed(0)}% → {bestOpportunity.nextTierThreshold.toFixed(0)}%
              </span>{' '}
              ({bestOpportunity.nextTierName})
            </p>
            {/* Progress bar — indigo ramp */}
            <div style={{ background: 'var(--vl-line-soft)', borderRadius: '6px', height: '8px', marginTop: '10px', overflow: 'hidden' }}>
              <div style={{
                background: 'linear-gradient(to right, var(--vl-raw-indigo-deep), var(--vl-raw-indigo-light))',
                height: '100%',
                width: `${bestOpportunity.progressPercent}%`,
                borderRadius: '6px',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
              <span style={{ color: 'var(--vl-text-soft)', fontSize: '11px', fontFamily: 'var(--vl-font-mono)' }}>
                {bestOpportunity.distanceToNextTier.toFixed(1)}% to go
              </span>
              <span style={{ color: 'var(--vl-success)', fontSize: '13px', fontWeight: 600, fontFamily: 'var(--vl-font-mono)' }}>
                +{format(bestOpportunity.incrementalValue)}
              </span>
            </div>
          </div>
        )}

        {/* Component Breakdown — .tbl */}
        {trajectories.length > 1 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Current</th>
                  <th>Next Tier</th>
                  <th className="r">Gap</th>
                  <th className="r">Value</th>
                </tr>
              </thead>
              <tbody>
                {trajectories.map(t => (
                  <tr key={t.componentName}>
                    <td className="name">{t.componentName}</td>
                    <td className="num mut">{t.currentAttainment.toFixed(0)}% ({t.currentTier})</td>
                    <td className="num mut">{t.nextTierThreshold.toFixed(0)}% ({t.nextTierName})</td>
                    <td className="num">
                      <span style={{ color: 'var(--vialuce-gold)' }}>{t.distanceToNextTier.toFixed(1)}%</span>
                    </td>
                    <td className="num">
                      <span className="up">+{format(t.incrementalValue)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Total Potential */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: '16px', padding: '12px', background: 'var(--vl-bg)', borderRadius: 'var(--vl-r-sm)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Zap size={14} style={{ color: 'var(--vialuce-gold)' }} />
            <span style={{ color: 'var(--vl-text-muted)', fontSize: '13px' }}>
              Total current payout
            </span>
          </div>
          <span style={{ color: 'var(--vl-text)', fontSize: '15px', fontWeight: 600, fontFamily: 'var(--vl-font-mono)' }}>
            {format(data.totalPayout)}
          </span>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: '4px', padding: '12px', background: 'var(--vl-indigo-50)',
          borderRadius: 'var(--vl-r-sm)', border: '1px solid var(--vl-indigo-100)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowUpRight size={14} style={{ color: 'var(--vialuce-indigo)' }} />
            <span style={{ color: 'var(--vialuce-indigo)', fontSize: '13px' }}>
              Potential with all next tiers
            </span>
          </div>
          <span style={{ color: 'var(--vialuce-indigo)', fontSize: '15px', fontWeight: 700, fontFamily: 'var(--vl-font-mono)' }}>
            {format(data.totalPayout + totalPotential)}
            <span style={{ fontSize: '12px', fontWeight: 500, marginLeft: '4px' }}>
              (+{format(totalPotential)})
            </span>
          </span>
        </div>
      </div>
    );
  }

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
              +{format(bestOpportunity.incrementalValue)}
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
                      +{format(t.incrementalValue)}
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
          {format(data.totalPayout)}
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
          {format(data.totalPayout + totalPotential)}
          <span style={{ fontSize: '12px', fontWeight: 500, marginLeft: '4px' }}>
            (+{format(totalPotential)})
          </span>
        </span>
      </div>
    </div>
  );
}
