'use client';

/**
 * OB-227 — SummaryHero. Responsive row of metric cards (max 6, wraps on narrow screens).
 * Values are pre-formatted by the caller or formatted here via the requested format hint.
 * Replaces ad-hoc 3-card heroes. Korean Test: labels supplied by the caller from data/i18n.
 */
import { Card } from '@/components/ui/card';
import { useCurrency } from '@/contexts/tenant-context';

export interface HeroCard {
  label: string;
  value: string | number;
  format?: 'currency' | 'percentage' | 'number' | 'text';
  detail?: string;
  /** optional emphasis (e.g. the primary KPI) */
  emphasis?: boolean;
  /** optional signed delta coloring */
  tone?: 'up' | 'down' | 'neutral';
}

export function SummaryHero({ cards }: { cards: HeroCard[] }) {
  const { format: fmtCurrency } = useCurrency();

  const fmt = (c: HeroCard): string => {
    if (typeof c.value === 'string') return c.value;
    switch (c.format) {
      case 'currency': return fmtCurrency(c.value);
      case 'percentage': return `${c.value.toFixed(1)}%`;
      case 'number': return c.value.toLocaleString();
      default: return String(c.value);
    }
  };

  const toneClass = (t?: HeroCard['tone']) =>
    t === 'up' ? 'text-[color:var(--vl-success,#15936A)]'
    : t === 'down' ? 'text-[color:var(--vl-danger,#DC5454)]'
    : '';

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.slice(0, 6).map((c, i) => (
        <Card key={i} className={`p-4 ${c.emphasis ? 'ring-1 ring-[color:var(--vl-kpi-accent,#4446B8)]' : ''}`}>
          <div className="text-xs text-muted-foreground truncate" title={c.label}>{c.label}</div>
          <div className={`mt-1 text-xl font-semibold tabular-nums ${toneClass(c.tone)}`}>{fmt(c)}</div>
          {c.detail && <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{c.detail}</div>}
        </Card>
      ))}
    </div>
  );
}
