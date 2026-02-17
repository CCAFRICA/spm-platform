'use client';

/**
 * Queue Panel Component
 *
 * Displays action items needing attention, grouped by urgency.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useQueue } from '@/contexts/navigation-context';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/contexts/tenant-context';
import { markQueueItemRead, getUnreadQueueCount } from '@/lib/navigation/queue-service';
import { logQueueClick } from '@/lib/navigation/navigation-signals';
import type { QueueItem, QueueUrgency } from '@/types/navigation';
import { QUEUE_URGENCY_CONFIG, QUEUE_TYPE_CONFIG, QUEUE_URGENCY_ORDER } from '@/types/navigation';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  MessageCircle,
  Bell,
  Info,
  XCircle,
  GitCompare,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface QueuePanelProps {
  collapsed?: boolean;
}

const TYPE_ICONS = {
  approval: CheckCircle,
  data_quality: AlertTriangle,
  dispute: MessageCircle,
  alert: Bell,
  notification: Info,
  exception: XCircle,
  reconciliation: GitCompare,
};

export function QueuePanel({ collapsed = false }: QueuePanelProps) {
  const router = useRouter();
  const { items, isSpanish } = useQueue();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const [expandedUrgencies, setExpandedUrgencies] = useState<QueueUrgency[]>(['critical', 'high']);

  const unreadCount = getUnreadQueueCount(items);

  const handleItemClick = (item: QueueItem) => {
    if (user && currentTenant) {
      logQueueClick(item.id, user.id, currentTenant.id);
    }
    markQueueItemRead(item.id);
    router.push(item.route);
  };

  const toggleUrgency = (urgency: QueueUrgency) => {
    setExpandedUrgencies(prev =>
      prev.includes(urgency)
        ? prev.filter(u => u !== urgency)
        : [...prev, urgency]
    );
  };

  // Collapsed view - show only count badge
  if (collapsed) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-col items-center py-3 px-2">
              <div className="relative">
                <Bell className="h-5 w-5 text-zinc-500" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            <div className="text-sm">
              <p className="font-medium">{isSpanish ? 'Cola de Tareas' : 'Action Queue'}</p>
              <p className="text-muted-foreground text-xs">
                {unreadCount} {isSpanish ? 'elementos pendientes' : 'items pending'}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div className="px-3 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            {isSpanish ? 'La Cola' : 'The Queue'}
          </h3>
        </div>
        <div className="text-center py-6 text-sm text-zinc-500">
          <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
          <p>{isSpanish ? 'Todo en orden' : 'All clear'}</p>
        </div>
      </div>
    );
  }

  // Group items by urgency
  const groupedItems: Record<QueueUrgency, QueueItem[]> = {
    critical: items.filter(i => i.urgency === 'critical'),
    high: items.filter(i => i.urgency === 'high'),
    medium: items.filter(i => i.urgency === 'medium'),
    low: items.filter(i => i.urgency === 'low'),
  };

  return (
    <div className="px-3 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          {isSpanish ? 'La Cola' : 'The Queue'}
        </h3>
        <Badge variant="secondary" className="text-xs">
          {unreadCount}
        </Badge>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {QUEUE_URGENCY_ORDER.map(urgency => {
          const urgencyItems = groupedItems[urgency];
          if (urgencyItems.length === 0) return null;

          const config = QUEUE_URGENCY_CONFIG[urgency];
          const isExpanded = expandedUrgencies.includes(urgency);

          return (
            <div key={urgency}>
              <button
                onClick={() => toggleUrgency(urgency)}
                className={cn(
                  'w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
                  config.bgColor,
                  config.color,
                  'hover:opacity-80'
                )}
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  <span>{isSpanish ? config.labelEs : config.label}</span>
                </div>
                <span className="font-bold">{urgencyItems.length}</span>
              </button>

              {isExpanded && (
                <div className="mt-1 space-y-1 pl-2">
                  {urgencyItems.slice(0, 5).map(item => {
                    const TypeIcon = TYPE_ICONS[item.type] || Info;
                    const typeConfig = QUEUE_TYPE_CONFIG[item.type];

                    return (
                      <button
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        className={cn(
                          'w-full flex items-start gap-2 p-2 rounded-md text-left transition-colors',
                          'hover:bg-zinc-800/50',
                          !item.read && 'bg-blue-950/30'
                        )}
                      >
                        <TypeIcon className={cn('h-4 w-4 mt-0.5 shrink-0', typeConfig.color)} />
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-xs font-medium text-zinc-300 truncate', !item.read && 'font-semibold')}>
                            {isSpanish ? item.titleEs : item.title}
                          </p>
                          <p className="text-[11px] text-zinc-500 truncate">
                            {isSpanish ? item.descriptionEs : item.description}
                          </p>
                        </div>
                        {!item.read && (
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                        )}
                      </button>
                    );
                  })}

                  {urgencyItems.length > 5 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-zinc-500"
                      onClick={() => router.push('/notifications')}
                    >
                      {isSpanish
                        ? `Ver ${urgencyItems.length - 5} más`
                        : `View ${urgencyItems.length - 5} more`}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
