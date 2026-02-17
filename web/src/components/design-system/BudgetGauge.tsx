'use client';

interface BudgetGaugeProps {
  actual: number;
  budget: number;
  currency?: string;
  label?: string;
}

export function BudgetGauge({ actual, budget, currency = '$', label }: BudgetGaugeProps) {
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
    ? `${currency}${Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 0 })} sobre presupuesto`
    : `${currency}${Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 0 })} bajo presupuesto`;

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
            {currency}{actual.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <span className="text-[11px] text-zinc-500">
            de {currency}{budget.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({pct}%)
          </span>
        </div>
        <span className={`text-[11px] ${deltaColor}`}>{deltaLabel}</span>
      </div>
    </div>
  );
}
