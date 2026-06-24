'use client';

/**
 * DS-003 §1.5 — PrioritySortedList. Decision task: SELECTION / triage. Severity-encoded rows (left
 * border + icon), sorted by urgency (critical → opportunity = the reference frame), each carrying an
 * action (the thermostat). `splitView` renders gainers/decliners side by side. Actions are honest:
 * a disabled action renders muted with its label (no fabricated click).
 */

import type { ReactNode } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Info, TrendingUp } from 'lucide-react';
import { bySeverity, SEVERITY, type Severity, TEXT } from './ds003-tokens';

export interface PriorityAction {
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}

export interface PriorityItem {
  id: string;
  severity: Severity;
  label: string;
  detail?: string;
  /** trailing value (e.g. delta) shown right-aligned. */
  value?: string;
  action?: PriorityAction;
}

const ICON: Record<Severity, typeof Info> = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
  opportunity: TrendingUp,
};

function Row({ item }: { item: PriorityItem }) {
  const s = SEVERITY[item.severity];
  const Icon = ICON[item.severity];
  return (
    <div
      className="flex items-center gap-3 rounded-lg border-l-2 px-3 py-2.5"
      style={{ borderLeftColor: s.color, backgroundColor: s.bg }}
    >
      <Icon className="h-4 w-4 shrink-0" style={{ color: s.color }} />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm font-medium text-foreground`}>{item.label}</div>
        {item.detail && <div className={`truncate text-xs ${TEXT.muted}`}>{item.detail}</div>}
      </div>
      {item.value && <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: s.color }}>{item.value}</span>}
      {item.action && <ActionButton action={item.action} />}
    </div>
  );
}

function ActionButton({ action }: { action: PriorityAction }) {
  const base = 'shrink-0 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors';
  if (action.disabled) {
    return (
      <span className={`${base} ${TEXT.disabled} cursor-not-allowed border border-border`} title="Coming soon">
        {action.label}
      </span>
    );
  }
  if (action.href) {
    return (
      <a href={action.href} className={`${base} border border-border text-foreground hover:bg-muted`}>
        {action.label} <ArrowRight className="h-3 w-3" />
      </a>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={`${base} border border-border text-foreground hover:bg-muted`}>
      {action.label} <ArrowRight className="h-3 w-3" />
    </button>
  );
}

export interface PrioritySortedListProps {
  items: PriorityItem[];
  /** render two columns (e.g. opportunities | risks) split by tone. */
  splitView?: boolean;
  emptyLabel?: string;
  emptyIcon?: ReactNode;
}

export function PrioritySortedList({ items, splitView, emptyLabel = 'Nothing needs attention.', emptyIcon }: PrioritySortedListProps) {
  if (items.length === 0) {
    return (
      <div className={`flex flex-col items-center gap-2 py-8 text-sm ${TEXT.muted}`}>
        {emptyIcon ?? <CheckCircle2 className="h-8 w-8 text-muted-foreground" />}
        <span>{emptyLabel}</span>
      </div>
    );
  }

  if (splitView) {
    const positive = items.filter((i) => i.severity === 'opportunity').sort(bySeverity);
    const negative = items.filter((i) => i.severity !== 'opportunity').sort(bySeverity);
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: SEVERITY.opportunity.color }}>Gaining</div>
          {positive.length ? positive.map((i) => <Row key={i.id} item={i} />) : <div className={`text-xs ${TEXT.muted}`}>None.</div>}
        </div>
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: SEVERITY.warning.color }}>Needs attention</div>
          {negative.length ? negative.map((i) => <Row key={i.id} item={i} />) : <div className={`text-xs ${TEXT.muted}`}>None.</div>}
        </div>
      </div>
    );
  }

  return <div className="space-y-2">{[...items].sort(bySeverity).map((i) => <Row key={i.id} item={i} />)}</div>;
}
