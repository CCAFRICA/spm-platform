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
  AlertCircle,
} from 'lucide-react';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { getByEmployee } from '@/lib/disputes/dispute-service';
import { EarningsSummaryCard } from '@/components/compensation/EarningsSummaryCard';
import { ComponentBreakdownCard } from '@/components/compensation/ComponentBreakdownCard';
import { RecentTransactionsCard } from '@/components/compensation/RecentTransactionsCard';
import { QuickActionsCard } from '@/components/compensation/QuickActionsCard';
import type { CalculationResult } from '@/types/compensation-plan';
// OB-29 Phase 9: Get real results from orchestrator
import { getPeriodResults } from '@/lib/orchestration/calculation-orchestrator';

type Period = 'current' | 'previous' | 'ytd';

/**
 * OB-29: Extract employee ID from user email
 * e.g., "96568046@retailcgmx.com" → "96568046"
 */
function extractEmployeeId(email: string | undefined): string | null {
  if (!email) return null;
  // Extract everything before @ that looks like an employee ID
  const match = email.match(/^(\d+)@/);
  if (match) return match[1];
  // For admin/manager emails, extract name part
  const nameMatch = email.match(/^([^@]+)@/);
  return nameMatch ? nameMatch[1] : null;
}

/**
 * OB-29: Get current period as YYYY-MM
 */
function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function MyCompensationPage() {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('current');
  const [calculationResult, setCalculationResult] = useState<CalculationResult | null>(null);
  const [pendingDisputes, setPendingDisputes] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasResults, setHasResults] = useState(false);

  useEffect(() => {
    if (!currentTenant || !user) return;

    // OB-29 Phase 9: Get real calculation results from orchestrator
    const employeeId = extractEmployeeId(user.email);
    const currentPeriodId = getCurrentPeriod();

    console.log(`[MyCompensation] Looking for results: tenant=${currentTenant.id}, period=${currentPeriodId}, employeeId=${employeeId}`);

    // Get all results for this period
    const allResults = getPeriodResults(currentTenant.id, currentPeriodId);
    console.log(`[MyCompensation] Found ${allResults.length} total results for period`);

    // Find this employee's result
    let result: CalculationResult | null = null;
    if (employeeId && allResults.length > 0) {
      result = allResults.find((r) => r.employeeId === employeeId) || null;
      if (!result) {
        // Try matching by name if ID doesn't match
        result = allResults.find((r) =>
          r.employeeName?.toLowerCase() === user.name?.toLowerCase()
        ) || null;
      }
    }

    if (result) {
      console.log(`[MyCompensation] Found result for ${employeeId}: $${result.totalIncentive}`);
      setCalculationResult(result);
      setHasResults(true);
    } else {
      console.log(`[MyCompensation] No result found for ${employeeId}`);
      setCalculationResult(null);
      setHasResults(false);
    }

    // Load pending disputes
    if (employeeId) {
      const disputes = getByEmployee(employeeId);
      const pending = disputes.filter((d) => d.status === 'submitted' || d.status === 'in_review');
      setPendingDisputes(pending.length);
    }

    setIsLoading(false);
  }, [currentTenant, user]);

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

  // OB-29 Phase 9: Use real data from calculation result or user
  const employeeName = calculationResult?.employeeName || user?.name || 'Employee';
  const employeeRole = calculationResult?.employeeRole || user?.role || 'Sales Rep';
  const storeName = calculationResult?.storeName || 'Store';
  const planName = calculationResult?.planName || 'Compensation Plan';
  const initials = employeeName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  // Current period label
  const now = new Date();
  const currentPeriodLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Earnings data from real result
  const currentPeriodEarnings = calculationResult?.totalIncentive || 0;
  const earningsData = {
    currentPeriod: {
      label: currentPeriodLabel,
      earnings: currentPeriodEarnings,
      target: 2000, // Could be from plan config
      previousPeriod: 0, // Could be from previous period result
    },
    ytdEarnings: currentPeriodEarnings,
    ytdTarget: 24000,
    pendingPayouts: currentPeriodEarnings,
    nextPayDate: new Date(now.getFullYear(), now.getMonth() + 1, 15).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
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
            <SelectTrigger className="w-[180px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">{currentPeriodLabel}</SelectItem>
              <SelectItem value="previous">Previous Month</SelectItem>
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
              <span className="text-xl font-bold text-primary">{initials}</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{employeeName}</h2>
                {calculationResult?.variantName?.toLowerCase().includes('certified') && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    <Award className="h-3 w-3 mr-1" />
                    Certified
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {employeeRole}
                </span>
                <span className="flex items-center gap-1">
                  <Building className="h-3 w-3" />
                  {storeName}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Plan</div>
              <div className="font-medium">{planName}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* OB-29: No Results State */}
      {!hasResults && (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
          <CardContent className="py-8">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-blue-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
                No Compensation Results Yet
              </h3>
              <p className="text-blue-700 dark:text-blue-300 max-w-md mx-auto">
                Your compensation for this period has not been calculated yet.
                Results will appear here once your administrator runs the calculation.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Earnings Summary - Only show if results exist */}
      {hasResults && <EarningsSummaryCard {...earningsData} />}

      {/* Main Content Grid */}
      {hasResults && (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Component Breakdown - Takes 2 columns */}
          <div className="lg:col-span-2">
            {calculationResult && (
              <ComponentBreakdownCard
                result={calculationResult}
                onViewDetails={(componentId) => {
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
      )}

      {/* Recent Transactions - Only show if results exist */}
      {hasResults && calculationResult?.components && (
        <RecentTransactionsCard transactions={[]} />
      )}
    </div>
  );
}
