'use client';

/**
 * SystemHealthCard — Admin hero card
 *
 * Five Elements:
 *   Value:      Total payout
 *   Context:    Entity count, component count, exception count
 *   Comparison: Trend vs prior period (delta + arrow)
 *   Action:     Next lifecycle action button
 *   Impact:     Advance to next lifecycle state
 *
 * OB-165: Intelligence Stream Foundation
 */

import { TrendingUp, TrendingDown, Minus, Users, Layers, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { IntelligenceCard } from './IntelligenceCard';

interface SystemHealthCardProps {
  accentColor: string;
  totalPayout: number;
  entityCount: number;
  componentCount: number;
  exceptionCount: number;
  priorPeriodTotal: number | null;
  nextAction: { label: string; route: string } | null;
  nextLifecycleState: string | null;
  formatCurrency: (n: number) => string;
  onAction?: () => void;
  onView?: () => void;
  // OB-170: Five Elements additions
  reconciliationStatus?: string; // "100.00% match" or "No reconciliation run"
  impactText?: string; // describes what the action produces
}

export function SystemHealthCard({
  accentColor,
  totalPayout,
  entityCount,
  componentCount,
  exceptionCount,
  priorPeriodTotal,
  formatCurrency,
  onView,
  reconciliationStatus,
}: SystemHealthCardProps) {
  const isVialuce = useIsVialuce(); // Vialuce: hero number → DM Mono kpi-val, delta → .kpi-delta, recon → .pill
  const delta = priorPeriodTotal != null ? totalPayout - priorPeriodTotal : null;
  const deltaPct = priorPeriodTotal != null && priorPeriodTotal !== 0
    ? ((totalPayout - priorPeriodTotal) / priorPeriodTotal) * 100
    : null;

  return (
    <IntelligenceCard
      accentColor={accentColor}
      label="System Health"
      elementId="system-health"
      fullWidth
      onView={onView}
      tier="status"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {/* Value: hero number */}
        <div>
          {isVialuce ? (
            <p className="kpi-val">{formatCurrency(totalPayout)}</p>
          ) : (
            <p className="text-3xl font-bold text-slate-100 tracking-tight">
              {formatCurrency(totalPayout)}
            </p>
          )}
          <p className={isVialuce ? 'kpi-label' : 'text-sm text-slate-500 mt-1'}>Total payout this period</p>
        </div>

        {/* Comparison: trend arrow */}
        {delta != null && deltaPct != null && (
          isVialuce ? (
            <span className={cn('kpi-delta', delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat')}>
              {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              {delta > 0 ? '+' : ''}{deltaPct.toFixed(1)}% vs prior period
            </span>
          ) : (
            <div className="flex items-center gap-2">
              {delta > 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-400" />
              ) : delta < 0 ? (
                <TrendingDown className="h-4 w-4 text-rose-400" />
              ) : (
                <Minus className="h-4 w-4 text-slate-500" />
              )}
              <span
                className={cn(
                  'text-sm font-medium',
                  delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-slate-500',
                )}
              >
                {delta > 0 ? '+' : ''}{deltaPct.toFixed(1)}% vs prior period
              </span>
            </div>
          )
        )}
      </div>

      {/* Context: supporting stats */}
      <div className="mt-4 flex flex-wrap gap-4">
        <Stat icon={Users} label="Entities" value={entityCount.toLocaleString()} isVialuce={isVialuce} />
        <Stat icon={Layers} label="Components" value={componentCount.toString()} isVialuce={isVialuce} />
        {exceptionCount > 0 && (
          <Stat
            icon={AlertTriangle}
            label="Exceptions"
            value={exceptionCount.toString()}
            alert
            isVialuce={isVialuce}
          />
        )}
      </div>

      {/* OB-170: Comparison — Reconciliation status */}
      {reconciliationStatus && (
        isVialuce ? (
          <div className="mt-3 flex items-center gap-2">
            <span className={cn('pill',
              reconciliationStatus.includes('100') ? 'success' :
              reconciliationStatus.includes('No ') ? 'neutral' : 'neutral',
            )}>
              {reconciliationStatus}
            </span>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2">
            <span className={cn(
              'text-xs font-medium',
              reconciliationStatus.includes('100') ? 'text-emerald-400' :
              reconciliationStatus.includes('No ') ? 'text-slate-500' : 'text-amber-400',
            )}>
              {reconciliationStatus}
            </span>
          </div>
        )
      )}

      {/* OB-173B: Action removed — lifecycle actions live in LifecycleCard only (C2.2 dedup) */}
    </IntelligenceCard>
  );
}

// ──────────────────────────────────────────────
// Stat chip
// ──────────────────────────────────────────────

function Stat({
  icon: Icon,
  label,
  value,
  alert,
  isVialuce,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
  alert?: boolean;
  isVialuce?: boolean;
}) {
  if (isVialuce) {
    // Vialuce: muted uppercase label + DM Mono value, gold accent for alert (exceptions).
    return (
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: alert ? 'var(--vl-raw-gold)' : 'var(--vl-text-soft)' }} />
        <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--vl-text-soft)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '13px', fontWeight: 'var(--vl-fw-med)', color: alert ? 'var(--vl-raw-gold)' : 'var(--vl-text)' }}>
          {value}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Icon
        className={cn(
          'h-4 w-4',
          alert ? 'text-amber-400' : 'text-slate-500',
        )}
      />
      <span className="text-xs text-slate-500 uppercase tracking-wide">{label}</span>
      <span
        className={cn(
          'text-sm font-semibold',
          alert ? 'text-amber-400' : 'text-slate-300',
        )}
      >
        {value}
      </span>
    </div>
  );
}
