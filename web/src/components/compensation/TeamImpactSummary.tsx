'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmployeeImpact {
  id: string;
  name: string;
  role: string;
  baseline: number;
  scenario: number;
  difference: number;
  percentChange: number;
}

interface TeamImpactSummaryProps {
  impacts: EmployeeImpact[];
}

export function TeamImpactSummary({ impacts }: TeamImpactSummaryProps) {
  const totalBaseline = impacts.reduce((sum, e) => sum + e.baseline, 0);
  const totalScenario = impacts.reduce((sum, e) => sum + e.scenario, 0);
  const totalDifference = totalScenario - totalBaseline;

  const gainers = impacts.filter((e) => e.difference > 0);
  const losers = impacts.filter((e) => e.difference < 0);
  const unchanged = impacts.filter((e) => e.difference === 0);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const sortedByImpact = [...impacts].sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center dark:bg-blue-900/30">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{impacts.length}</div>
                <div className="text-sm text-muted-foreground">Employees Affected</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={cn(
                'h-10 w-10 rounded-lg flex items-center justify-center',
                totalDifference >= 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
              )}>
                <DollarSign className={cn(
                  'h-5 w-5',
                  totalDifference >= 0 ? 'text-green-600' : 'text-red-600'
                )} />
              </div>
              <div>
                <div className={cn(
                  'text-2xl font-bold',
                  totalDifference >= 0 ? 'text-green-600' : 'text-red-600'
                )}>
                  {totalDifference >= 0 ? '+' : ''}{formatCurrency(totalDifference)}
                </div>
                <div className="text-sm text-muted-foreground">Total Cost Impact</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center dark:bg-green-900/30">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{gainers.length}</div>
                <div className="text-sm text-muted-foreground">Would Earn More</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center dark:bg-red-900/30">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{losers.length}</div>
                <div className="text-sm text-muted-foreground">Would Earn Less</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribution Bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Impact Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-6 rounded-full overflow-hidden flex">
            {gainers.length > 0 && (
              <div
                className="bg-green-500 transition-all"
                style={{ width: `${(gainers.length / impacts.length) * 100}%` }}
              />
            )}
            {unchanged.length > 0 && (
              <div
                className="bg-gray-300 dark:bg-gray-600 transition-all"
                style={{ width: `${(unchanged.length / impacts.length) * 100}%` }}
              />
            )}
            {losers.length > 0 && (
              <div
                className="bg-red-500 transition-all"
                style={{ width: `${(losers.length / impacts.length) * 100}%` }}
              />
            )}
          </div>
          <div className="flex justify-between mt-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-green-500" />
              <span>Increase ({gainers.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-gray-300 dark:bg-gray-600" />
              <span>No Change ({unchanged.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-red-500" />
              <span>Decrease ({losers.length})</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Employee Impact List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Individual Impact</CardTitle>
          <CardDescription>Sorted by magnitude of change</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sortedByImpact.map((employee) => {
              const isPositive = employee.difference > 0;
              const isNegative = employee.difference < 0;

              return (
                <div
                  key={employee.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border',
                    isPositive && 'border-green-200 bg-green-50/50 dark:bg-green-900/10',
                    isNegative && 'border-red-200 bg-red-50/50 dark:bg-red-900/10'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium',
                      isPositive && 'bg-green-100 text-green-700',
                      isNegative && 'bg-red-100 text-red-700',
                      !isPositive && !isNegative && 'bg-muted text-muted-foreground'
                    )}>
                      {employee.name.split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{employee.name}</div>
                      <div className="text-xs text-muted-foreground">{employee.role}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">
                        {formatCurrency(employee.baseline)}
                      </div>
                    </div>
                    <div className="text-right min-w-[100px]">
                      <div className={cn(
                        'font-medium',
                        isPositive && 'text-green-600',
                        isNegative && 'text-red-600'
                      )}>
                        {formatCurrency(employee.scenario)}
                      </div>
                      <div className={cn(
                        'text-xs flex items-center justify-end gap-1',
                        isPositive && 'text-green-600',
                        isNegative && 'text-red-600',
                        !isPositive && !isNegative && 'text-muted-foreground'
                      )}>
                        {isPositive && <ArrowUp className="h-3 w-3" />}
                        {isNegative && <ArrowDown className="h-3 w-3" />}
                        {!isPositive && !isNegative && <Minus className="h-3 w-3" />}
                        {employee.difference >= 0 ? '+' : ''}
                        {formatCurrency(employee.difference)}
                        {' '}({employee.percentChange >= 0 ? '+' : ''}{employee.percentChange.toFixed(1)}%)
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Warnings */}
      {losers.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-amber-900 dark:text-amber-100">
                  Compensation Decrease Warning
                </h4>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  {losers.length} employee{losers.length > 1 ? 's' : ''} would see a decrease in
                  compensation under this scenario. Consider the impact on retention and morale
                  before implementing.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
