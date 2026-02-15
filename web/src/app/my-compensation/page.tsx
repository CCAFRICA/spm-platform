'use client';

/**
 * My Compensation - Personal Performance Dashboard
 *
 * OB-34 Phase 7: Enhanced with lifecycle visibility gate, AI personal
 * performance narrative, and inline dispute form.
 *
 * Visibility: Results only shown when cycle state permits for user's role.
 * Korean Test: All component names, labels, and metrics come from plan data.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  Sparkles,
  MessageCircle,
  Send,
  ShieldCheck,
  Clock,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { getByEmployee } from '@/lib/disputes/dispute-service';
import { createDraft, submitDispute } from '@/lib/disputes/dispute-service';
import { EarningsSummaryCard } from '@/components/compensation/EarningsSummaryCard';
import { ComponentBreakdownCard } from '@/components/compensation/ComponentBreakdownCard';
import { RecentTransactionsCard } from '@/components/compensation/RecentTransactionsCard';
import { QuickActionsCard } from '@/components/compensation/QuickActionsCard';
import type { CalculationResult } from '@/types/compensation-plan';
import {
  listCalculationBatches,
  getCalculationResults,
} from '@/lib/supabase/calculation-service';
import { canViewResults } from '@/lib/calculation/lifecycle-utils';
import type { CalculationState } from '@/lib/calculation/lifecycle-utils';
import { getAIService } from '@/lib/ai/ai-service';

type Period = 'current' | 'previous' | 'ytd';

/**
 * Extract employee ID from user email.
 * e.g., "96568046@retailcgmx.com" -> "96568046"
 */
function extractEmployeeId(email: string | undefined): string | null {
  if (!email) return null;
  const match = email.match(/^(\d+)@/);
  if (match) return match[1];
  const nameMatch = email.match(/^([^@]+)@/);
  return nameMatch ? nameMatch[1] : null;
}

/**
 * Get current period as YYYY-MM.
 */

/**
 * Map auth role to lifecycle role for visibility check.
 */
function mapRole(role: string): 'vl_admin' | 'platform_admin' | 'manager' | 'sales_rep' | 'approver' {
  switch (role) {
    case 'vl_admin': return 'vl_admin';
    case 'admin': return 'platform_admin';
    case 'manager': return 'manager';
    default: return 'sales_rep';
  }
}

export default function MyCompensationPage() {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { format: formatCurrency } = useCurrency();
  const [period, setPeriod] = useState<Period>('current');
  const [calculationResult, setCalculationResult] = useState<CalculationResult | null>(null);
  const [pendingDisputes, setPendingDisputes] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasResults, setHasResults] = useState(false);

  // OB-34: Visibility gate state
  const [cycleState, setCycleState] = useState<CalculationState | null>(null);
  const [resultsVisible, setResultsVisible] = useState(false);

  // OB-34: AI personal narrative
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);

  // OB-34: Inline dispute form
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeComponent, setDisputeComponent] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeSubmitted, setDisputeSubmitted] = useState(false);

  // OB-34: Expanded component detail
  const [expandedComponent, setExpandedComponent] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTenant || !user) return;

    const entityId = extractEmployeeId(user.email);

    const loadData = async () => {
      try {
        const userRole = mapRole(user.role);
        const batches = await listCalculationBatches(currentTenant.id);

        // Find first batch visible to this role
        const visibleBatch = batches.find(b => canViewResults(b.lifecycle_state, userRole));

        if (!visibleBatch) {
          if (batches.length > 0) {
            // Batches exist but not visible to this role
            setCycleState(batches[0].lifecycle_state as CalculationState);
            setResultsVisible(false);
          } else {
            setResultsVisible(true); // No batches = show empty state
          }
          setIsLoading(false);
          return;
        }

        setCycleState(visibleBatch.lifecycle_state as CalculationState);
        setResultsVisible(true);

        // Get results from Supabase
        const calcResults = await getCalculationResults(currentTenant.id, visibleBatch.id);

        // Map to CalculationResult format and find this employee
        let result: CalculationResult | null = null;
        if (entityId && calcResults.length > 0) {
          const match = calcResults.find((r) => r.entity_id === entityId);
          if (match) {
            const meta = (match.metadata as Record<string, unknown>) || {};
            const comps = Array.isArray(match.components) ? match.components : [];
            result = {
              entityId: match.entity_id,
              entityName: (meta.entityName as string) || match.entity_id,
              entityRole: (meta.entityRole as string) || '',
              ruleSetId: (meta.ruleSetId as string) || '',
              ruleSetName: (meta.ruleSetName as string) || '',
              ruleSetVersion: 1,
              ruleSetType: 'weighted_kpi' as const,
              period: visibleBatch.period_id,
              periodStart: '',
              periodEnd: '',
              totalIncentive: match.total_payout || 0,
              currency: currentTenant.currency || 'USD',
              calculatedAt: match.created_at,
              storeId: (meta.storeId as string) || '',
              components: comps.map((c: unknown) => {
                const comp = c as Record<string, unknown>;
                return {
                  componentId: String(comp.componentId || comp.component_id || ''),
                  componentName: String(comp.componentName || comp.component_name || ''),
                  outputValue: Number(comp.outputValue || comp.output_value || 0),
                  attainment: typeof comp.attainment === 'number' ? comp.attainment : undefined,
                  metrics: comp.metrics as Record<string, unknown> || {},
                } as unknown as CalculationResult['components'][0];
              }),
            };
          }
        }

        if (result) {
          setCalculationResult(result);
          setHasResults(true);
        } else {
          setCalculationResult(null);
          setHasResults(false);
        }
      } catch (err) {
        console.warn('[MyCompensation] Failed to load:', err);
        setResultsVisible(true);
        setHasResults(false);
      }

      setIsLoading(false);
    };

    loadData();

    // Load pending disputes
    if (entityId) {
      const disputes = getByEmployee(entityId);
      const pending = disputes.filter((d) => d.status === 'submitted' || d.status === 'in_review');
      setPendingDisputes(pending.length);
    }

    setIsLoading(false);
  }, [currentTenant, user]);

  // OB-34: Generate AI personal performance narrative
  const handleGenerateNarrative = async () => {
    if (!calculationResult || !currentTenant) return;
    setNarrativeLoading(true);
    try {
      const aiService = getAIService();
      const response = await aiService.execute(
        {
          task: 'recommendation',
          input: {
            analysisData: {
              entityName: calculationResult.entityName,
              totalIncentive: calculationResult.totalIncentive,
              components: calculationResult.components.map(c => ({
                name: c.componentName,
                value: c.outputValue,
                type: c.componentType,
              })),
              variant: calculationResult.variantName,
              store: calculationResult.storeName,
            },
            context: {
              type: 'personal_performance_narrative',
              instructions: [
                'Generate a brief, encouraging personal performance narrative for this employee.',
                'Mention their top-performing component by name and value.',
                'If they have multiple components, note the balance or areas for growth.',
                'Use second person (you/your). Keep it 3-4 sentences.',
                'Be specific about which components contribute most to their total.',
                'End with one actionable suggestion based on their data pattern.',
              ].join(' '),
            },
          },
          options: { responseFormat: 'text' },
        },
        true,
        { tenantId: currentTenant.id, userId: calculationResult.entityId }
      );
      const text = typeof response.result === 'string'
        ? response.result
        : (response.result as Record<string, unknown>)?.text as string || null;
      setNarrative(text);
    } catch (err) {
      console.warn('[MyCompensation] AI narrative generation failed (non-fatal):', err);
      setNarrative(null);
    } finally {
      setNarrativeLoading(false);
    }
  };

  // OB-34: Handle inline dispute submission
  const handleSubmitDispute = () => {
    if (!currentTenant || !user || !calculationResult || !disputeComponent || !disputeReason.trim()) return;

    const entityId = extractEmployeeId(user.email) || calculationResult.entityId;
    const draft = createDraft(
      currentTenant.id,
      `comp-${calculationResult.period}-${disputeComponent}`,
      entityId,
      calculationResult.entityName,
      calculationResult.storeId || '',
      calculationResult.storeName || '',
      disputeComponent
    );
    submitDispute(draft.id);

    setDisputeSubmitted(true);
    setDisputeReason('');
    setDisputeComponent('');
    setTimeout(() => {
      setDisputeSubmitted(false);
      setShowDisputeForm(false);
    }, 3000);

    // Refresh pending count
    const disputes = getByEmployee(entityId);
    const pending = disputes.filter((d) => d.status === 'submitted' || d.status === 'in_review');
    setPendingDisputes(pending.length);
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your outcomes...</p>
        </div>
      </div>
    );
  }

  // OB-34: Visibility gate -- block non-admin users when cycle not approved
  if (!resultsVisible && cycleState) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            My Outcome
          </h1>
          <p className="text-muted-foreground">Track your earnings, incentives, and transactions</p>
        </div>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-8">
            <div className="text-center">
              <ShieldCheck className="h-12 w-12 text-amber-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-amber-900 mb-2">
                Results Pending Approval
              </h3>
              <p className="text-amber-700 max-w-md mx-auto">
                Your outcome results for this period are being reviewed.
                They will be available once the approval process is complete.
              </p>
              <Badge className="mt-4 bg-amber-100 text-amber-700">
                <Clock className="h-3 w-3 mr-1" />
                Status: {cycleState.replace('_', ' ')}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const entityName = calculationResult?.entityName || user?.name || 'Entity';
  const entityRole = calculationResult?.entityRole || user?.role || 'Rep';
  const storeName = calculationResult?.storeName || 'Store';
  const ruleSetName = calculationResult?.ruleSetName || 'Rule Set';
  const initials = entityName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const now = new Date();
  const currentPeriodLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const currentPeriodEarnings = calculationResult?.totalIncentive || 0;
  const earningsData = {
    currentPeriod: {
      label: currentPeriodLabel,
      earnings: currentPeriodEarnings,
      target: 2000,
      previousPeriod: 0,
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
            My Outcome
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
                <h2 className="text-lg font-semibold">{entityName}</h2>
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
                  {entityRole}
                </span>
                <span className="flex items-center gap-1">
                  <Building className="h-3 w-3" />
                  {storeName}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Plan</div>
              <div className="font-medium">{ruleSetName}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* No Results State */}
      {!hasResults && (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
          <CardContent className="py-8">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-blue-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
                No Outcome Results Yet
              </h3>
              <p className="text-blue-700 dark:text-blue-300 max-w-md mx-auto">
                Your outcome for this period has not been calculated yet.
                Results will appear here once your administrator runs the calculation.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Earnings Summary */}
      {hasResults && <EarningsSummaryCard {...earningsData} />}

      {/* OB-34: AI Personal Performance Narrative */}
      {hasResults && calculationResult && (
        <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-white dark:from-purple-950/20 dark:to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-purple-900 dark:text-purple-100">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Performance Insights
            </CardTitle>
            <CardDescription>AI-powered analysis of your outcome</CardDescription>
          </CardHeader>
          <CardContent>
            {narrative ? (
              <p className="text-sm text-purple-900 dark:text-purple-100 leading-relaxed">{narrative}</p>
            ) : narrativeLoading ? (
              <div className="flex items-center gap-2 text-sm text-purple-600">
                <div className="animate-spin h-4 w-4 border-2 border-purple-500 border-t-transparent rounded-full" />
                Generating your performance insights...
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateNarrative}
                className="text-purple-700 border-purple-200 hover:bg-purple-50"
              >
                <Sparkles className="h-4 w-4 mr-1" />
                Generate My Insights
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* OB-34: Dynamic Component Cards (Korean Test) */}
      {hasResults && calculationResult && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-slate-500" />
            Component Breakdown
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {calculationResult.components.map((comp) => (
              <Card
                key={comp.componentId}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setExpandedComponent(
                  expandedComponent === comp.componentId ? null : comp.componentId
                )}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{comp.componentName}</span>
                        <Badge variant="outline" className="text-xs">{comp.componentType}</Badge>
                      </div>
                      <p className="text-2xl font-bold text-emerald-600 mt-1">
                        {formatCurrency(comp.outputValue)}
                      </p>
                    </div>
                    {expandedComponent === comp.componentId ? (
                      <ChevronUp className="h-5 w-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-slate-400" />
                    )}
                  </div>
                  {expandedComponent === comp.componentId && (
                    <div className="mt-3 pt-3 border-t text-sm text-slate-600 space-y-1">
                      <p><span className="font-medium">Calculation:</span> {comp.calculation}</p>
                      <p>
                        <span className="font-medium">Share of Total:</span>{' '}
                        {calculationResult.totalIncentive > 0
                          ? Math.round((comp.outputValue / calculationResult.totalIncentive) * 100)
                          : 0}%
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      {hasResults && (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Component Breakdown Card (existing) */}
          <div className="lg:col-span-2">
            {calculationResult && (
              <ComponentBreakdownCard
                result={calculationResult}
                onViewDetails={(componentId) => {
                  setExpandedComponent(componentId);
                }}
              />
            )}
          </div>

          {/* Sidebar */}
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

      {/* OB-34: Inline Dispute Form */}
      {hasResults && calculationResult && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-slate-500" />
                Dispute a Component
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDisputeForm(!showDisputeForm)}
              >
                {showDisputeForm ? 'Cancel' : 'File Dispute'}
              </Button>
            </div>
          </CardHeader>
          {showDisputeForm && (
            <CardContent className="space-y-4">
              {disputeSubmitted ? (
                <div className="text-center py-4">
                  <ShieldCheck className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-green-700 font-medium">Dispute submitted successfully!</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Component</label>
                    <Select value={disputeComponent} onValueChange={setDisputeComponent}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select component to dispute" />
                      </SelectTrigger>
                      <SelectContent>
                        {calculationResult.components.map(c => (
                          <SelectItem key={c.componentId} value={c.componentName}>
                            {c.componentName} ({formatCurrency(c.outputValue)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Reason</label>
                    <Textarea
                      placeholder="Describe why you believe this component is incorrect..."
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={handleSubmitDispute}
                    disabled={!disputeComponent || !disputeReason.trim()}
                  >
                    <Send className="h-4 w-4 mr-1" />
                    Submit Dispute
                  </Button>
                </>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Recent Transactions */}
      {hasResults && calculationResult?.components && (
        <RecentTransactionsCard transactions={[]} />
      )}
    </div>
  );
}
