'use client';

/**
 * BloodworkCard — Critical items requiring attention
 *
 * Only renders when items exist. Silence = health.
 * Severity-colored left border per item (critical=rose, warning=amber).
 *
 * OB-165: Intelligence Stream Foundation
 */

import { AlertTriangle, AlertCircle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IntelligenceCard } from './IntelligenceCard';

interface BloodworkItem {
  entityName: string;
  entityId: string;
  issue: string;
  severity: 'critical' | 'warning';
  actionLabel: string;
  actionRoute: string;
}

interface BloodworkCardProps {
  accentColor: string;
  items: BloodworkItem[];
  onAction?: (item: BloodworkItem) => void;
  onView?: () => void;
}

export function BloodworkCard({
  accentColor,
  items,
  onAction,
  onView,
}: BloodworkCardProps) {
  // Silence = health: don't render if no items
  if (items.length === 0) return null;

  return (
    <IntelligenceCard
      accentColor={accentColor}
      label="Attention Required"
      elementId="bloodwork"
      fullWidth
      onView={onView}
      tier="status"
    >
      <div className="space-y-2">
        {items.map((item, i) => (
          <div
            key={`${item.entityId}-${i}`}
            className={cn(
              'flex items-start justify-between gap-3 rounded-md p-3',
              'border-l-[3px]',
              item.severity === 'critical'
                ? 'bg-rose-500/5 border-l-rose-500'
                : 'bg-amber-500/5 border-l-amber-500',
            )}
          >
            <div className="flex items-start gap-2.5 flex-1 min-w-0">
              {item.severity === 'critical' ? (
                <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">
                  {item.entityName}
                </p>
                <p
                  className={cn(
                    'text-xs mt-0.5',
                    item.severity === 'critical' ? 'text-rose-400/80' : 'text-amber-400/80',
                  )}
                >
                  {item.issue}
                </p>
              </div>
            </div>
            <button
              onClick={() => onAction?.(item)}
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded',
                'bg-zinc-700/60 hover:bg-zinc-700 text-slate-300 transition-colors',
                'flex-shrink-0',
              )}
            >
              {item.actionLabel}
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </IntelligenceCard>
  );
}
