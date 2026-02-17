'use client';

import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, TrendingUp, FileText, Percent } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/financial-service';
import { containerVariants, itemVariants } from '@/lib/animations';
import { cn } from '@/lib/utils';

interface SummaryCard {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: React.ReactNode;
  color: string;
}

interface SummaryCardsProps {
  totalRevenue: number;
  totalDeals: number;
  avgDealSize: number;
  avgCommissionRate: number;
  revenueChange?: number;
  dealsChange?: number;
}

export function SummaryCards({
  totalRevenue,
  totalDeals,
  avgDealSize,
  avgCommissionRate,
  revenueChange = 18.4,
  dealsChange = 12.5,
}: SummaryCardsProps) {
  const cards: SummaryCard[] = [
    {
      title: 'Total Revenue',
      value: formatCurrency(totalRevenue),
      change: revenueChange,
      changeLabel: 'vs last year',
      icon: <DollarSign className="h-5 w-5" />,
      color: 'text-emerald-600',
    },
    {
      title: 'Total Deals',
      value: totalDeals,
      change: dealsChange,
      changeLabel: 'vs last year',
      icon: <FileText className="h-5 w-5" />,
      color: 'text-sky-600',
    },
    {
      title: 'Avg Deal Size',
      value: formatCurrency(avgDealSize),
      icon: <TrendingUp className="h-5 w-5" />,
      color: 'text-purple-600',
    },
    {
      title: 'Avg Commission Rate',
      value: formatPercent(avgCommissionRate),
      icon: <Percent className="h-5 w-5" />,
      color: 'text-amber-600',
    },
  ];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
    >
      {cards.map((card, index) => (
        <motion.div key={card.title} variants={itemVariants} custom={index}>
          <Card className="border-0 shadow-md">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {card.title}
                  </p>
                  <p className="text-2xl font-bold text-slate-50 mt-1">
                    {card.value}
                  </p>
                  {card.change !== undefined && (
                    <p
                      className={cn(
                        'text-xs mt-1 flex items-center gap-1',
                        card.change >= 0 ? 'text-emerald-600' : 'text-red-600'
                      )}
                    >
                      <TrendingUp
                        className={cn(
                          'h-3 w-3',
                          card.change < 0 && 'rotate-180'
                        )}
                      />
                      {card.change >= 0 ? '+' : ''}
                      {card.change}% {card.changeLabel}
                    </p>
                  )}
                </div>
                <div
                  className={cn(
                    'p-2 rounded-lg bg-slate-100 dark:bg-slate-800',
                    card.color
                  )}
                >
                  {card.icon}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}
