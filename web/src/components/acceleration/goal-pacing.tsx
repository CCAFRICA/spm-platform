'use client';

import { motion } from 'framer-motion';
import { Target, TrendingUp, TrendingDown, Calendar, Flag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { containerVariants, itemVariants } from '@/lib/animations';

interface GoalMilestone {
  date: string;
  target: number;
  actual: number;
}

interface Goal {
  id: string;
  name: string;
  target: number;
  current: number;
  startDate: string;
  endDate: string;
  milestones: GoalMilestone[];
  status: 'on-track' | 'ahead' | 'behind' | 'at-risk';
}

interface GoalPacingProps {
  goals: Goal[];
  className?: string;
}

export function GoalPacing({ goals, className }: GoalPacingProps) {
  const getStatusConfig = (status: Goal['status']) => {
    switch (status) {
      case 'ahead':
        return {
          label: 'Ahead',
          color: 'text-emerald-600',
          bg: 'bg-emerald-100 dark:bg-emerald-900/30',
          icon: TrendingUp,
        };
      case 'on-track':
        return {
          label: 'On Track',
          color: 'text-sky-600',
          bg: 'bg-sky-100 dark:bg-sky-900/30',
          icon: Target,
        };
      case 'behind':
        return {
          label: 'Behind',
          color: 'text-amber-600',
          bg: 'bg-amber-100 dark:bg-amber-900/30',
          icon: TrendingDown,
        };
      case 'at-risk':
        return {
          label: 'At Risk',
          color: 'text-red-600',
          bg: 'bg-red-100 dark:bg-red-900/30',
          icon: Flag,
        };
    }
  };

  const calculatePacing = (goal: Goal) => {
    const now = new Date();
    const start = new Date(goal.startDate);
    const end = new Date(goal.endDate);
    const totalDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    const daysElapsed = Math.max(0, (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const timeProgress = Math.min(100, (daysElapsed / totalDays) * 100);
    const expectedProgress = (goal.target * timeProgress) / 100;
    const actualProgress = (goal.current / goal.target) * 100;
    const pacingDiff = actualProgress - timeProgress;

    return {
      timeProgress,
      expectedProgress,
      actualProgress: Math.min(100, actualProgress),
      pacingDiff,
      daysRemaining: Math.max(0, Math.ceil(totalDays - daysElapsed)),
    };
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={cn('space-y-4', className)}
    >
      {goals.map((goal) => {
        const statusConfig = getStatusConfig(goal.status);
        const pacing = calculatePacing(goal);
        const StatusIcon = statusConfig.icon;

        return (
          <motion.div key={goal.id} variants={itemVariants}>
            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base font-medium">{goal.name}</CardTitle>
                    <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{pacing.daysRemaining} days remaining</span>
                    </div>
                  </div>
                  <Badge className={cn('flex items-center gap-1', statusConfig.bg, statusConfig.color)}>
                    <StatusIcon className="h-3.5 w-3.5" />
                    {statusConfig.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {/* Progress Bars */}
                <div className="space-y-3">
                  {/* Actual Progress */}
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-slate-600 dark:text-slate-400">Progress</span>
                      <span className="font-medium">
                        {formatCurrency(goal.current)} / {formatCurrency(goal.target)}
                      </span>
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="relative h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            {/* Expected progress marker */}
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-slate-400 z-10"
                              style={{ left: `${pacing.timeProgress}%` }}
                            />
                            {/* Actual progress bar */}
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pacing.actualProgress}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut' }}
                              className={cn(
                                'h-full rounded-full',
                                goal.status === 'ahead' && 'bg-emerald-500',
                                goal.status === 'on-track' && 'bg-sky-500',
                                goal.status === 'behind' && 'bg-amber-500',
                                goal.status === 'at-risk' && 'bg-red-500'
                              )}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            Expected: {pacing.timeProgress.toFixed(0)}% | Actual: {pacing.actualProgress.toFixed(0)}%
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  {/* Pacing Indicator */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-sm text-slate-500">Pacing</span>
                    <div className="flex items-center gap-1.5">
                      {pacing.pacingDiff >= 0 ? (
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      )}
                      <span
                        className={cn(
                          'text-sm font-medium',
                          pacing.pacingDiff >= 0 ? 'text-emerald-600' : 'text-red-600'
                        )}
                      >
                        {pacing.pacingDiff >= 0 ? '+' : ''}
                        {pacing.pacingDiff.toFixed(1)}%
                      </span>
                      <span className="text-xs text-slate-400">vs expected</span>
                    </div>
                  </div>
                </div>

                {/* Milestones */}
                {goal.milestones.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-medium text-slate-500 mb-2">Milestones</p>
                    <div className="flex items-center gap-1">
                      {goal.milestones.map((milestone, index) => {
                        const isPast = new Date(milestone.date) < new Date();
                        const isHit = milestone.actual >= milestone.target;
                        return (
                          <TooltipProvider key={index}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className={cn(
                                    'flex-1 h-2 rounded-full',
                                    isPast
                                      ? isHit
                                        ? 'bg-emerald-500'
                                        : 'bg-red-500'
                                      : 'bg-slate-200 dark:bg-slate-700'
                                  )}
                                />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">
                                  {new Date(milestone.date).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                  : {formatCurrency(milestone.actual)} / {formatCurrency(milestone.target)}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
