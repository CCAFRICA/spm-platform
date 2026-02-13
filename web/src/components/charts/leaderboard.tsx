'use client';

import { Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrency } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import { cn } from '@/lib/utils';

interface LeaderboardItem {
  id: string;
  rank: number;
  name: string;
  value: number;
  change?: number;
  subtitle?: string;
}

interface LeaderboardProps {
  items: LeaderboardItem[];
  title: string;
  highlightId?: string;
  showChange?: boolean;
  maxItems?: number;
}

export function Leaderboard({
  items,
  title,
  highlightId,
  showChange = true,
  maxItems = 10,
}: LeaderboardProps) {
  const { format } = useCurrency();
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const getRankBadgeStyle = (rank: number) => {
    if (rank === 1) return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    if (rank === 2) return 'bg-slate-100 text-slate-700 border-slate-300';
    if (rank === 3) return 'bg-amber-100 text-amber-700 border-amber-300';
    return 'bg-muted text-muted-foreground';
  };

  const getTrendIcon = (change?: number) => {
    if (change === undefined) return null;
    if (change > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (change < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const displayItems = items.slice(0, maxItems);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {displayItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {isSpanish ? 'Sin datos disponibles' : 'No data available'}
            </p>
          ) : (
            displayItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg transition-colors',
                  item.id === highlightId
                    ? 'bg-primary/10 border border-primary'
                    : 'hover:bg-muted/50'
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border',
                      getRankBadgeStyle(item.rank)
                    )}
                  >
                    {item.rank}
                  </span>
                  <div>
                    <span className="font-medium">{item.name}</span>
                    {item.subtitle && (
                      <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{format(item.value)}</span>
                  {showChange && getTrendIcon(item.change)}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
