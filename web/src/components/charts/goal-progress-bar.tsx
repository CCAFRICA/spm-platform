'use client';

import { useCurrency } from '@/contexts/tenant-context';
import { cn } from '@/lib/utils';

interface GoalProgressBarProps {
  current: number;
  target: number;
  label: string;
  showAmount?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function GoalProgressBar({
  current,
  target,
  label,
  showAmount = true,
  size = 'md',
}: GoalProgressBarProps) {
  const { format } = useCurrency();
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;

  const getColor = () => {
    if (pct >= 100) return 'bg-green-500';
    if (pct >= 75) return 'bg-blue-500';
    if (pct >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getTextColor = () => {
    if (pct >= 100) return 'text-green-600';
    if (pct >= 75) return 'text-blue-600';
    if (pct >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const barHeights = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4',
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-sm">
        <span className="font-medium">{label}</span>
        <span className={cn('font-bold', getTextColor())}>{pct.toFixed(0)}%</span>
      </div>
      <div className={cn('bg-muted rounded-full overflow-hidden', barHeights[size])}>
        <div
          className={cn('h-full transition-all duration-500 ease-out', getColor())}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showAmount && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{format(current)}</span>
          <span>Meta: {format(target)}</span>
        </div>
      )}
    </div>
  );
}
