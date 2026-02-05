'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ArrowRightLeft, TrendingUp, TrendingDown } from 'lucide-react';
import {
  CurrencyCode,
  formatCurrency,
  formatWithConversion,
  SUPPORTED_CURRENCIES,
} from '@/lib/currency';
import { cn } from '@/lib/utils';

interface CurrencyDisplayProps {
  amount: number;
  currency?: CurrencyCode;
  displayCurrency?: CurrencyCode;
  showConversion?: boolean;
  showTrend?: 'up' | 'down' | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  compact?: boolean;
}

export function CurrencyDisplay({
  amount,
  currency = 'USD',
  displayCurrency,
  showConversion = false,
  showTrend = null,
  size = 'md',
  className,
  compact = false,
}: CurrencyDisplayProps) {
  const [isHovered, setIsHovered] = useState(false);

  const effectiveDisplayCurrency = displayCurrency || currency;
  const { original, converted, rate } = formatWithConversion(
    amount,
    currency,
    effectiveDisplayCurrency
  );

  const displayValue = showConversion && converted ? converted : original;

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg font-semibold',
  };

  const currencyInfo = SUPPORTED_CURRENCIES.find((c) => c.code === currency);
  const displayCurrencyInfo = SUPPORTED_CURRENCIES.find(
    (c) => c.code === effectiveDisplayCurrency
  );

  if (!showConversion || !converted) {
    return (
      <span className={cn(sizeClasses[size], className)}>
        {formatCurrency(amount, currency, { compact })}
        {showTrend === 'up' && (
          <TrendingUp className="inline-block ml-1 h-4 w-4 text-green-500" />
        )}
        {showTrend === 'down' && (
          <TrendingDown className="inline-block ml-1 h-4 w-4 text-red-500" />
        )}
      </span>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.span
            className={cn(
              sizeClasses[size],
              'cursor-help inline-flex items-center gap-1',
              className
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={isHovered ? 'original' : 'converted'}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                transition={{ duration: 0.15 }}
              >
                {isHovered ? original : displayValue}
              </motion.span>
            </AnimatePresence>
            <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
            {showTrend === 'up' && (
              <TrendingUp className="h-4 w-4 text-green-500" />
            )}
            {showTrend === 'down' && (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </motion.span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Original:</span>
              <span className="font-medium">{original}</span>
              <span className="text-muted-foreground">({currencyInfo?.name})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Converted:</span>
              <span className="font-medium">{converted}</span>
              <span className="text-muted-foreground">
                ({displayCurrencyInfo?.name})
              </span>
            </div>
            {rate && (
              <div className="text-muted-foreground pt-1 border-t">
                Rate: 1 {currency} = {rate.toFixed(4)} {effectiveDisplayCurrency}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface CurrencyBadgeProps {
  currency: CurrencyCode;
  className?: string;
}

export function CurrencyBadge({ currency, className }: CurrencyBadgeProps) {
  const currencyInfo = SUPPORTED_CURRENCIES.find((c) => c.code === currency);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        'bg-muted text-muted-foreground',
        className
      )}
    >
      <span>{currencyInfo?.symbol}</span>
      <span>{currency}</span>
    </span>
  );
}
