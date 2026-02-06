'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DollarSign,
  TrendingUp,
  Calendar,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EarningsSummaryCardProps {
  currentPeriod: {
    label: string;
    earnings: number;
    target: number;
    previousPeriod: number;
  };
  ytdEarnings: number;
  ytdTarget: number;
  pendingPayouts: number;
  nextPayDate: string;
}

export function EarningsSummaryCard({
  currentPeriod,
  ytdEarnings,
  ytdTarget,
  pendingPayouts,
  nextPayDate,
}: EarningsSummaryCardProps) {
  const periodProgress = currentPeriod.target > 0
    ? (currentPeriod.earnings / currentPeriod.target) * 100
    : 0;

  const ytdProgress = ytdTarget > 0
    ? (ytdEarnings / ytdTarget) * 100
    : 0;

  const periodChange = currentPeriod.previousPeriod > 0
    ? ((currentPeriod.earnings - currentPeriod.previousPeriod) / currentPeriod.previousPeriod) * 100
    : 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Current Period Earnings */}
      <Card className="col-span-1 sm:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            {currentPeriod.label} Earnings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className="text-3xl font-bold">{formatCurrency(currentPeriod.earnings)}</div>
              <div className="text-sm text-muted-foreground">
                of {formatCurrency(currentPeriod.target)} target
              </div>
            </div>
            <div className={cn(
              'flex items-center gap-1 text-sm font-medium',
              periodChange >= 0 ? 'text-green-600' : 'text-red-600'
            )}>
              {periodChange >= 0 ? (
                <ArrowUp className="h-4 w-4" />
              ) : (
                <ArrowDown className="h-4 w-4" />
              )}
              {Math.abs(periodChange).toFixed(1)}% vs last period
            </div>
          </div>
          <Progress value={Math.min(periodProgress, 100)} className="h-3" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{periodProgress.toFixed(0)}% of target</span>
            {periodProgress >= 100 && (
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                Target Met!
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* YTD Earnings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            YTD Earnings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(ytdEarnings)}</div>
          <Progress value={Math.min(ytdProgress, 100)} className="h-2 mt-2" />
          <div className="text-xs text-muted-foreground mt-1">
            {ytdProgress.toFixed(0)}% of {formatCurrency(ytdTarget)}
          </div>
        </CardContent>
      </Card>

      {/* Pending Payouts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Next Payout
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">{formatCurrency(pendingPayouts)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Expected {nextPayDate}
          </div>
          {pendingPayouts > 0 && (
            <Badge variant="outline" className="mt-2 text-xs">
              Processing
            </Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
