'use client';

/**
 * OB-227 — ComponentBars. Proportional horizontal bars for per-component cost allocation
 * (name + amount + % of total), clickable to filter the entity table. Plain divs for crisp
 * proportions; sequential indigo shades. Korean Test: names come from the data.
 */
import { useCurrency } from '@/contexts/tenant-context';
import type { ComponentTotal } from '@/lib/insights';

const SHADES = ['#2D2F8F', '#4446B8', '#6668D8', '#8A8CE6', '#AEB0F0'];

interface ComponentBarsProps {
  components: ComponentTotal[];
  onComponentClick?: (name: string) => void;
  activeComponent?: string | null;
}

export function ComponentBars({ components, onComponentClick, activeComponent }: ComponentBarsProps) {
  const { format } = useCurrency();
  if (!components.length) return <div className="text-sm text-muted-foreground">No component data.</div>;
  const max = Math.max(...components.map(c => c.total_amount), 1);

  return (
    <div className="space-y-2.5">
      {components.map((c, i) => {
        const active = activeComponent === c.component_name;
        return (
          <button
            key={c.component_name}
            type="button"
            onClick={() => onComponentClick?.(c.component_name)}
            className={`w-full text-left ${onComponentClick ? 'cursor-pointer' : 'cursor-default'} ${active ? 'opacity-100' : ''}`}
          >
            <div className="flex items-baseline justify-between text-xs mb-1">
              <span className="font-medium truncate pr-2" title={c.component_name}>{c.component_name}</span>
              <span className="tabular-nums text-muted-foreground whitespace-nowrap">{format(c.total_amount)} · {c.percentage_of_total.toFixed(1)}%</span>
            </div>
            <div className="h-3 w-full rounded bg-muted overflow-hidden">
              <div
                className="h-full rounded transition-all"
                style={{ width: `${(c.total_amount / max) * 100}%`, background: SHADES[i % SHADES.length], outline: active ? '2px solid var(--vl-cta-signal, #E8A838)' : 'none' }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
