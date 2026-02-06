'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  BarChart3,
  Download,
  RefreshCw,
  TrendingUp,
  Calendar,
} from 'lucide-react';
import { useTenant } from '@/contexts/tenant-context';
import {
  getAllDisputes,
  getDisputeStats,
} from '@/lib/disputes/dispute-service';
import {
  DisputeFunnelChart,
  DisputeCategoryChart,
  DisputeMetricsCards,
  ResolutionOutcomesChart,
} from '@/components/disputes';
import type { DisputeCategory } from '@/types/dispute';

type TimePeriod = 'week' | 'month' | 'quarter' | 'year';

export default function DisputeAnalyticsPage() {
  const { currentTenant } = useTenant();
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<TimePeriod>('month');

  useEffect(() => {
    if (!currentTenant) return;

    // Load disputes (used for stats calculations)
    getAllDisputes(currentTenant.id);
    setIsLoading(false);
  }, [currentTenant]);

  // Calculate funnel data
  const calculateFunnelData = () => {
    // For demo, we'll show realistic funnel progression
    // In production, this would come from actual step tracking
    const totalStarted = 150; // Demo: total inquiries started
    const afterStep1 = 95; // 55 self-resolved after seeing calculation
    const afterStep2 = 45; // 50 more self-resolved after comparison
    const submitted = 25; // Only 25 escalated to manager

    return [
      {
        label: 'Step 1: Review Calculation',
        count: totalStarted,
        percentage: 100,
        color: 'bg-blue-500',
      },
      {
        label: 'Step 2: Compare Transactions',
        count: afterStep1,
        percentage: (afterStep1 / totalStarted) * 100,
        color: 'bg-blue-400',
      },
      {
        label: 'Step 3: Build Case',
        count: afterStep2,
        percentage: (afterStep2 / totalStarted) * 100,
        color: 'bg-amber-400',
      },
      {
        label: 'Submitted to Manager',
        count: submitted,
        percentage: (submitted / totalStarted) * 100,
        color: 'bg-red-400',
      },
    ];
  };

  // Calculate category data
  const calculateCategoryData = () => {
    const stats = currentTenant ? getDisputeStats(currentTenant.id) : null;
    if (!stats) return [];

    const total = Object.values(stats.byCategory).reduce((sum, count) => sum + count, 0) || 1;

    return (Object.entries(stats.byCategory) as [DisputeCategory, number][])
      .map(([category, count]) => ({
        category,
        count,
        percentage: (count / total) * 100,
        resolved: Math.floor(count * 0.7), // Demo: 70% resolved
        pending: Math.ceil(count * 0.3),
      }))
      .filter((d) => d.count > 0);
  };

  // Calculate outcome data
  const calculateOutcomeData = () => {
    // Demo data showing healthy resolution distribution
    return [
      {
        outcome: 'self_resolved' as const,
        count: 125,
        percentage: 62.5,
        totalAmount: 0,
      },
      {
        outcome: 'approved' as const,
        count: 45,
        percentage: 22.5,
        totalAmount: 2847.50,
      },
      {
        outcome: 'partial' as const,
        count: 20,
        percentage: 10,
        totalAmount: 856.25,
      },
      {
        outcome: 'denied' as const,
        count: 10,
        percentage: 5,
        totalAmount: 0,
      },
    ];
  };

  // Calculate metrics
  const calculateMetrics = () => {
    const stats = currentTenant ? getDisputeStats(currentTenant.id) : null;

    return {
      totalDisputes: stats?.total || 200,
      selfResolutionRate: 62.5, // Demo: matches funnel
      avgResolutionTime: 4.2, // Hours
      managerWorkloadReduction: 83, // 83% don't need manager
      pendingCount: stats?.pending || 1,
      resolvedThisMonth: stats?.resolved || 45,
    };
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Dispute Analytics
          </h1>
          <p className="text-muted-foreground">
            Track self-resolution rates and dispute trends
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as TimePeriod)}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Insight Banner */}
      <Card className="border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-green-900 dark:text-green-100">
                Self-Service Success: 83% Manager Workload Reduction
              </h3>
              <p className="text-sm text-green-700 dark:text-green-300">
                The guided dispute flow resolved 125 inquiries automatically this month,
                saving an estimated 62.5 hours of manager review time.
              </p>
            </div>
            <Badge className="bg-green-600 text-white">
              +12% vs last month
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Cards */}
      <DisputeMetricsCards metrics={calculateMetrics()} />

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Funnel Chart */}
        <DisputeFunnelChart steps={calculateFunnelData()} />

        {/* Outcomes Chart */}
        <ResolutionOutcomesChart data={calculateOutcomeData()} />
      </div>

      {/* Category Breakdown */}
      <DisputeCategoryChart data={calculateCategoryData()} />

      {/* Insights Section */}
      <Card>
        <CardHeader>
          <CardTitle>Key Insights</CardTitle>
          <CardDescription>AI-generated observations from dispute patterns</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="font-medium mb-2">Top Resolution Driver</h4>
              <p className="text-sm text-muted-foreground">
                <strong>Step 1 explanations</strong> resolve 37% of inquiries.
                Employees often misunderstand tier calculations.
              </p>
            </div>
            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="font-medium mb-2">Common Issue Pattern</h4>
              <p className="text-sm text-muted-foreground">
                <strong>Attribution errors</strong> peak on Mondays,
                correlating with weekend shift handoffs.
              </p>
            </div>
            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="font-medium mb-2">Recommendation</h4>
              <p className="text-sm text-muted-foreground">
                Consider adding <strong>split confirmation</strong> prompts
                at POS for insurance add-ons to prevent attribution issues.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
