'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Wallet,
  Calendar,
  RefreshCw,
  User,
  Building,
  Award,
} from 'lucide-react';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { calculateIncentive, getMariaMetrics } from '@/lib/compensation/calculation-engine';
import { getByEmployee } from '@/lib/disputes/dispute-service';
import { EarningsSummaryCard } from '@/components/compensation/EarningsSummaryCard';
import { ComponentBreakdownCard } from '@/components/compensation/ComponentBreakdownCard';
import { RecentTransactionsCard } from '@/components/compensation/RecentTransactionsCard';
import { QuickActionsCard } from '@/components/compensation/QuickActionsCard';
import type { CalculationResult } from '@/types/compensation-plan';

// Demo transactions for Maria
const MARIA_TRANSACTIONS = [
  {
    id: 'TXN-2025-0162',
    date: '2025-01-20',
    type: 'Optical',
    product: 'Progressive Lenses + Designer Frame',
    amount: 1450,
    incentive: 72.50,
    status: 'credited' as const,
    creditPercentage: 100,
  },
  {
    id: 'TXN-2025-0158',
    date: '2025-01-18',
    type: 'Insurance',
    product: 'Vision Protection Plan',
    amount: 680,
    incentive: 34.00,
    status: 'credited' as const,
    creditPercentage: 100,
  },
  {
    id: 'TXN-2025-0147',
    date: '2025-01-15',
    type: 'Insurance',
    product: 'Premium Protection Plan',
    amount: 850,
    incentive: 0,
    status: 'disputed' as const,
    creditPercentage: 0,
  },
  {
    id: 'TXN-2025-0142',
    date: '2025-01-12',
    type: 'Optical',
    product: 'Bifocal Lenses + Frame',
    amount: 980,
    incentive: 49.00,
    status: 'credited' as const,
    creditPercentage: 100,
  },
  {
    id: 'TXN-2025-0135',
    date: '2025-01-10',
    type: 'Services',
    product: 'Eye Exam + Fitting',
    amount: 320,
    incentive: 16.00,
    status: 'credited' as const,
    creditPercentage: 100,
  },
];

type Period = 'current' | 'previous' | 'ytd';

export default function MyCompensationPage() {
  const { currentTenant } = useTenant();
  useAuth();
  const [period, setPeriod] = useState<Period>('current');
  const [calculationResult, setCalculationResult] = useState<CalculationResult | null>(null);
  const [pendingDisputes, setPendingDisputes] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!currentTenant) return;

    // Load calculation for current user (Maria for demo)
    const metrics = getMariaMetrics();
    const result = calculateIncentive(metrics, currentTenant.id);
    setCalculationResult(result);

    // Load pending disputes
    const disputes = getByEmployee('maria-rodriguez');
    const pending = disputes.filter((d) => d.status === 'submitted' || d.status === 'in_review');
    setPendingDisputes(pending.length);

    setIsLoading(false);
  }, [currentTenant]);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your compensation...</p>
        </div>
      </div>
    );
  }

  // Demo data for earnings
  const currentPeriodEarnings = calculationResult?.totalIncentive || 0;
  const earningsData = {
    currentPeriod: {
      label: 'January 2025',
      earnings: currentPeriodEarnings,
      target: 1500,
      previousPeriod: 1280,
    },
    ytdEarnings: currentPeriodEarnings,
    ytdTarget: 18000,
    pendingPayouts: currentPeriodEarnings,
    nextPayDate: 'Feb 15, 2025',
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            My Compensation
          </h1>
          <p className="text-muted-foreground">
            Track your earnings, incentives, and transactions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[160px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">January 2025</SelectItem>
              <SelectItem value="previous">December 2024</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Employee Info Banner */}
      <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-xl font-bold text-primary">MR</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Maria Rodriguez</h2>
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  <Award className="h-3 w-3 mr-1" />
                  Certified
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Sales Associate
                </span>
                <span className="flex items-center gap-1">
                  <Building className="h-3 w-3" />
                  Downtown Flagship
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Plan</div>
              <div className="font-medium">RetailCo Optical Sales</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Earnings Summary */}
      <EarningsSummaryCard {...earningsData} />

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Component Breakdown - Takes 2 columns */}
        <div className="lg:col-span-2">
          {calculationResult && (
            <ComponentBreakdownCard
              result={calculationResult}
              onViewDetails={(componentId) => {
                // Could navigate to detailed view
                console.log('View details for', componentId);
              }}
            />
          )}
        </div>

        {/* Sidebar - Quick Actions */}
        <div className="space-y-6">
          <QuickActionsCard pendingDisputes={pendingDisputes} />

          {/* Pending Items Alert */}
          {pendingDisputes > 0 && (
            <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <span className="text-amber-600 font-bold text-sm">{pendingDisputes}</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-amber-900 dark:text-amber-100">
                      Pending Dispute{pendingDisputes > 1 ? 's' : ''}
                    </h4>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      You have {pendingDisputes} dispute{pendingDisputes > 1 ? 's' : ''} awaiting review.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Recent Transactions */}
      <RecentTransactionsCard transactions={MARIA_TRANSACTIONS} />
    </div>
  );
}
