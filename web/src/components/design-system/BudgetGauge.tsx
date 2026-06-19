'use client';

import { useIsVialuce } from '@/hooks/use-is-vialuce';

interface BudgetGaugeProps {
  actual: number;
  budget: number;
  currency?: string;
  label?: string;
}

function fmtAmt(v: number, sym: string) {
  const fd = Math.abs(v) >= 10_000 ? 0 : 2;
  return `${sym}${v.toLocaleString(undefined, { minimumFractionDigits: fd, maximumFractionDigits: fd })}`;
}

export function BudgetGauge({ actual, budget, currency = '$', label }: BudgetGaugeProps) {
  const isVialuce = useIsVialuce(); // HF-316: track→line, bar→tokens, numbers→DM Mono under Vialuce
  const max = Math.max(actual, budget) * 1.15 || 1;
  const actualPercent = (actual / max) * 100;
  const budgetPercent = (budget / max) * 100;
  const delta = actual - budget;
  const isOver = delta > 0;
  const pct = budget > 0 ? ((actual / budget) * 100).toFixed(1) : '0.0';

  const barColor = isOver
    ? actual / budget > 1.1 ? 'bg-rose-500/70' : 'bg-amber-500/70'
    : 'bg-emerald-500/70';

  const deltaColor = isOver
    ? actual / budget > 1.1 ? 'text-rose-400' : 'text-amber-400'
    : 'text-emerald-400';

  const deltaLabel = isOver
    ? `${fmtAmt(Math.abs(delta), currency)} sobre presupuesto`
    : `${fmtAmt(Math.abs(delta), currency)} bajo presupuesto`;

  if (isVialuce) {
    // Design-spec: line-soft track + indigo reference marker; over-budget = danger, otherwise success.
    const vlBar = isOver ? 'var(--vl-danger)' : 'var(--vl-success)';
    const vlDelta = isOver ? 'var(--vl-danger)' : 'var(--vl-success)';
    return (
      <div className="space-y-2">
        {label && <span style={{ fontSize: '12.5px', color: 'var(--vl-text-muted)' }}>{label}</span>}

        <div className="relative h-4 rounded-full overflow-hidden" style={{ background: 'var(--vl-line-soft)' }}>
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all"
            style={{ width: `${actualPercent}%`, background: vlBar }}
          />
          <div
            className="absolute inset-y-0 w-0.5"
            style={{ left: `${budgetPercent}%`, background: 'var(--vl-raw-indigo)' }}
          />
        </div>

        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '13px', fontWeight: 500, color: 'var(--vl-text)' }}>
              {fmtAmt(actual, currency)}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--vl-text-soft)', fontFamily: 'var(--vl-font-mono)' }}>
              de {fmtAmt(budget, currency)} ({pct}%)
            </span>
          </div>
          <span style={{ fontSize: '11px', color: vlDelta, fontFamily: 'var(--vl-font-mono)' }}>{deltaLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {label && <span className="text-xs text-zinc-400">{label}</span>}

      <div className="relative h-4 bg-zinc-800 rounded-full overflow-hidden">
        {/* Actual bar */}
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all ${barColor}`}
          style={{ width: `${actualPercent}%` }}
        />
        {/* Budget reference line */}
        <div
          className="absolute inset-y-0 w-0.5 bg-zinc-300"
          style={{ left: `${budgetPercent}%` }}
        />
      </div>

      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-zinc-200 tabular-nums">
            {fmtAmt(actual, currency)}
          </span>
          <span className="text-[11px] text-zinc-500">
            de {fmtAmt(budget, currency)} ({pct}%)
          </span>
        </div>
        <span className={`text-[11px] ${deltaColor}`}>{deltaLabel}</span>
      </div>
    </div>
  );
}
