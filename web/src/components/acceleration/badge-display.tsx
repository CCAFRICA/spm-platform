'use client';

import { motion } from 'framer-motion';
import {
  Trophy,
  Star,
  Flame,
  Target,
  Zap,
  Award,
  Medal,
  Crown,
  Rocket,
  TrendingUp,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { containerVariants, itemVariants } from '@/lib/animations';

export type BadgeType =
  | 'quota-crusher'
  | 'rising-star'
  | 'streak'
  | 'target-hitter'
  | 'fast-closer'
  | 'top-performer'
  | 'consistency'
  | 'champion'
  | 'rocket'
  | 'growth';

interface Badge {
  id: string;
  type: BadgeType;
  name: string;
  description: string;
  earnedDate: string;
  level?: 'bronze' | 'silver' | 'gold' | 'platinum';
  progress?: number; // 0-100 for badges in progress
}

interface BadgeDisplayProps {
  badges: Badge[];
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
  className?: string;
}

export function BadgeDisplay({
  badges,
  size = 'md',
  showLabels = false,
  className,
}: BadgeDisplayProps) {
  const getBadgeIcon = (type: BadgeType) => {
    switch (type) {
      case 'quota-crusher':
        return Target;
      case 'rising-star':
        return Star;
      case 'streak':
        return Flame;
      case 'target-hitter':
        return Trophy;
      case 'fast-closer':
        return Zap;
      case 'top-performer':
        return Award;
      case 'consistency':
        return Medal;
      case 'champion':
        return Crown;
      case 'rocket':
        return Rocket;
      case 'growth':
        return TrendingUp;
    }
  };

  const getBadgeColors = (type: BadgeType, level?: Badge['level']) => {
    const baseColors = {
      'quota-crusher': 'from-purple-400 to-purple-600',
      'rising-star': 'from-amber-400 to-amber-600',
      'streak': 'from-orange-400 to-red-500',
      'target-hitter': 'from-emerald-400 to-emerald-600',
      'fast-closer': 'from-sky-400 to-sky-600',
      'top-performer': 'from-pink-400 to-rose-600',
      'consistency': 'from-indigo-400 to-indigo-600',
      'champion': 'from-yellow-400 to-amber-500',
      'rocket': 'from-cyan-400 to-teal-600',
      'growth': 'from-lime-400 to-green-600',
    };

    const levelOverrides = {
      bronze: 'from-amber-600 to-amber-800',
      silver: 'from-slate-300 to-slate-500',
      gold: 'from-yellow-400 to-amber-500',
      platinum: 'from-slate-200 via-slate-400 to-slate-200',
    };

    return level ? levelOverrides[level] : baseColors[type];
  };

  const sizeClasses = {
    sm: { container: 'w-8 h-8', icon: 'h-4 w-4' },
    md: { container: 'w-12 h-12', icon: 'h-6 w-6' },
    lg: { container: 'w-16 h-16', icon: 'h-8 w-8' },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={cn('flex flex-wrap gap-3', className)}
    >
      {badges.map((badge, index) => {
        const Icon = getBadgeIcon(badge.type);
        const colors = getBadgeColors(badge.type, badge.level);
        const isInProgress = badge.progress !== undefined && badge.progress < 100;

        return (
          <TooltipProvider key={badge.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.div
                  variants={itemVariants}
                  custom={index}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex flex-col items-center"
                >
                  <div className="relative">
                    <div
                      className={cn(
                        'rounded-full flex items-center justify-center bg-gradient-to-br shadow-lg',
                        sizeClasses[size].container,
                        colors,
                        isInProgress && 'opacity-50'
                      )}
                    >
                      <Icon className={cn('text-white', sizeClasses[size].icon)} />
                    </div>
                    {/* Progress ring for in-progress badges */}
                    {isInProgress && (
                      <svg
                        className="absolute inset-0 transform -rotate-90"
                        viewBox="0 0 100 100"
                      >
                        <circle
                          cx="50"
                          cy="50"
                          r="45"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="8"
                          className="text-slate-200 dark:text-slate-700"
                        />
                        <motion.circle
                          cx="50"
                          cy="50"
                          r="45"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="8"
                          strokeLinecap="round"
                          className="text-sky-500"
                          initial={{ strokeDashoffset: 283 }}
                          animate={{
                            strokeDashoffset: 283 - (283 * (badge.progress || 0)) / 100,
                          }}
                          strokeDasharray="283"
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                      </svg>
                    )}
                    {/* Level indicator */}
                    {badge.level && !isInProgress && (
                      <div
                        className={cn(
                          'absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center text-[8px] font-bold',
                          badge.level === 'bronze' && 'bg-amber-600 text-white',
                          badge.level === 'silver' && 'bg-slate-400 text-white',
                          badge.level === 'gold' && 'bg-yellow-400 text-yellow-900',
                          badge.level === 'platinum' && 'bg-slate-300 text-slate-700'
                        )}
                      >
                        {badge.level === 'bronze' && 'B'}
                        {badge.level === 'silver' && 'S'}
                        {badge.level === 'gold' && 'G'}
                        {badge.level === 'platinum' && 'P'}
                      </div>
                    )}
                  </div>
                  {showLabels && (
                    <span className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 text-center max-w-[60px] truncate">
                      {badge.name}
                    </span>
                  )}
                </motion.div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[200px]">
                <div className="space-y-1">
                  <p className="font-medium">{badge.name}</p>
                  <p className="text-xs text-slate-500">{badge.description}</p>
                  {isInProgress ? (
                    <p className="text-xs text-sky-500">{badge.progress}% complete</p>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Earned{' '}
                      {new Date(badge.earnedDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </motion.div>
  );
}

// Compact badge list for use in tables/cards
interface BadgeListProps {
  badges: Badge[];
  maxVisible?: number;
  className?: string;
}

export function BadgeList({ badges, maxVisible = 3, className }: BadgeListProps) {
  const visibleBadges = badges.slice(0, maxVisible);
  const hiddenCount = badges.length - maxVisible;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {visibleBadges.map((badge) => {
        const Icon = getBadgeIcon(badge.type);
        const colors = getBadgeColors(badge.type, badge.level);

        return (
          <TooltipProvider key={badge.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-br',
                    colors
                  )}
                >
                  <Icon className="h-3 w-3 text-white" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs font-medium">{badge.name}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
      {hiddenCount > 0 && (
        <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-medium text-slate-500">
          +{hiddenCount}
        </div>
      )}
    </div>
  );
}

function getBadgeIcon(type: BadgeType) {
  switch (type) {
    case 'quota-crusher':
      return Target;
    case 'rising-star':
      return Star;
    case 'streak':
      return Flame;
    case 'target-hitter':
      return Trophy;
    case 'fast-closer':
      return Zap;
    case 'top-performer':
      return Award;
    case 'consistency':
      return Medal;
    case 'champion':
      return Crown;
    case 'rocket':
      return Rocket;
    case 'growth':
      return TrendingUp;
  }
}

function getBadgeColors(type: BadgeType, level?: Badge['level']) {
  const baseColors = {
    'quota-crusher': 'from-purple-400 to-purple-600',
    'rising-star': 'from-amber-400 to-amber-600',
    'streak': 'from-orange-400 to-red-500',
    'target-hitter': 'from-emerald-400 to-emerald-600',
    'fast-closer': 'from-sky-400 to-sky-600',
    'top-performer': 'from-pink-400 to-rose-600',
    'consistency': 'from-indigo-400 to-indigo-600',
    'champion': 'from-yellow-400 to-amber-500',
    'rocket': 'from-cyan-400 to-teal-600',
    'growth': 'from-lime-400 to-green-600',
  };

  const levelOverrides = {
    bronze: 'from-amber-600 to-amber-800',
    silver: 'from-slate-300 to-slate-500',
    gold: 'from-yellow-400 to-amber-500',
    platinum: 'from-slate-200 via-slate-400 to-slate-200',
  };

  return level ? levelOverrides[level] : baseColors[type];
}
