'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  User,
  Receipt,
  Store,
  DollarSign,
  Clock,
  CheckCircle,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  getDispute,
  startReview,
  resolveDispute,
} from '@/lib/disputes/dispute-service';
import { SystemAnalyzer, DisputeResolutionForm } from '@/components/disputes';
import type { AnalysisResult } from '@/components/disputes/SystemAnalyzer';
import type { Dispute, DisputeOutcome } from '@/types/dispute';
import { DISPUTE_CATEGORIES } from '@/types/dispute';

export default function DisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const disputeId = resolvedParams.id;
  const router = useRouter();
  const { user } = useAuth();

  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showResolutionForm, setShowResolutionForm] = useState(false);

  const loadDispute = useCallback(() => {
    const loaded = getDispute(disputeId);
    if (loaded) {
      setDispute(loaded);

      // Start review if not already in review
      if (loaded.status === 'submitted') {
        startReview(disputeId);
        setDispute({ ...loaded, status: 'in_review' });
      }
    }
    setIsLoading(false);
  }, [disputeId]);

  useEffect(() => {
    loadDispute();
  }, [loadDispute]);

  const handleAnalysisComplete = (result: AnalysisResult) => {
    setAnalysis(result);
  };

  const handleResolve = async (outcome: DisputeOutcome, amount: number, explanation: string) => {
    if (!dispute || !user) return;

    const result = resolveDispute(dispute.id, {
      outcome,
      adjustmentAmount: amount,
      explanation,
      resolvedBy: user.id,
      resolvedByName: user.name,
      adjustmentApplied: false,
    });

    if (result) {
      router.push('/transactions/disputes?resolved=true');
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading dispute...</p>
        </div>
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Dispute Not Found</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">Dispute {disputeId} not found</p>
            <Button className="mt-4" asChild>
              <Link href="/transactions/disputes">Back to Queue</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isResolved = dispute.status === 'resolved';

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/transactions/disputes">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Dispute Review
            </h1>
            <p className="text-muted-foreground">
              {dispute.id}
            </p>
          </div>
        </div>
        <Badge
          variant="secondary"
          className={
            isResolved
              ? 'bg-green-100 text-green-800'
              : 'bg-amber-100 text-amber-800'
          }
        >
          {isResolved ? 'Resolved' : 'In Review'}
        </Badge>
      </div>

      {/* Employee & Transaction Info */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Employee Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-lg font-bold text-primary">
                  {dispute.employeeName.split(' ').map((n) => n[0]).join('')}
                </span>
              </div>
              <div>
                <div className="font-medium">{dispute.employeeName}</div>
                <div className="text-sm text-muted-foreground">{dispute.employeeId}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Store className="h-4 w-4 text-muted-foreground" />
              <span>{dispute.storeName}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Transaction Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transaction ID</span>
              <Link
                href={`/transactions/${dispute.transactionId}`}
                className="font-mono text-sm text-primary hover:underline"
              >
                {dispute.transactionId}
              </Link>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Component</span>
              <span className="font-medium">{dispute.component}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Category</span>
              <Badge variant="outline">
                {DISPUTE_CATEGORIES[dispute.category].label}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Claim Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Claim Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <div className="text-sm text-muted-foreground mb-1">Claimed Amount</div>
              <div className="text-2xl font-bold text-primary">
                {formatCurrency(dispute.expectedAmount)}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <div className="text-sm text-muted-foreground mb-1">Current Amount</div>
              <div className="text-2xl font-bold">
                {formatCurrency(dispute.actualAmount)}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <div className="text-sm text-muted-foreground mb-1">Difference</div>
              <div className="text-2xl font-bold text-amber-600">
                {formatCurrency(dispute.difference)}
              </div>
            </div>
          </div>

          {dispute.justification && (
            <div className="mt-4 p-4 rounded-lg border">
              <div className="text-sm font-medium mb-2">Employee Justification:</div>
              <p className="text-sm text-muted-foreground">{dispute.justification}</p>
            </div>
          )}

          {dispute.attributionDetails && (
            <div className="mt-4 p-4 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-orange-900 dark:text-orange-100">
                    Attribution Issue
                  </div>
                  <div className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                    Currently credited to: <strong>{dispute.attributionDetails.currentlyCreditedToName}</strong>
                    <br />
                    Should be credited to: <strong>{dispute.attributionDetails.shouldBeCreditedToName}</strong>
                    {dispute.attributionDetails.requestedSplit && (
                      <>
                        <br />
                        Requested split:{' '}
                        {Object.entries(dispute.attributionDetails.requestedSplit)
                          .map(([id, pct]) => `${id}: ${(pct * 100).toFixed(0)}%`)
                          .join(', ')}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="text-sm">Created: {formatDate(dispute.createdAt)}</span>
            </div>
            {dispute.submittedAt && (
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-sm">Submitted: {formatDate(dispute.submittedAt)}</span>
              </div>
            )}
            {dispute.resolvedAt && (
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm">Resolved: {formatDate(dispute.resolvedAt)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resolution Details (if resolved) */}
      {isResolved && dispute.resolution && (
        <Card className="border-2 border-green-200 dark:border-green-800">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              Resolution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Outcome</div>
                <Badge
                  className={
                    dispute.resolution.outcome === 'approved'
                      ? 'bg-green-100 text-green-800'
                      : dispute.resolution.outcome === 'partial'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-800'
                  }
                >
                  {dispute.resolution.outcome === 'approved'
                    ? 'Approved'
                    : dispute.resolution.outcome === 'partial'
                    ? 'Partial'
                    : 'Denied'}
                </Badge>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Adjustment Amount</div>
                <div className="font-bold">{formatCurrency(dispute.resolution.adjustmentAmount)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Resolved By</div>
                <div className="font-medium">{dispute.resolution.resolvedByName}</div>
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Explanation</div>
              <p className="text-sm">{dispute.resolution.explanation}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Analyzer & Resolution Form (if not resolved) */}
      {!isResolved && (
        <>
          <SystemAnalyzer
            dispute={dispute}
            onAnalysisComplete={handleAnalysisComplete}
          />

          {analysis && !showResolutionForm && (
            <div className="flex justify-center">
              <Button size="lg" onClick={() => setShowResolutionForm(true)}>
                Proceed to Resolution
              </Button>
            </div>
          )}

          {showResolutionForm && user && (
            <DisputeResolutionForm
              dispute={dispute}
              analysis={analysis}
              onResolve={handleResolve}
              onCancel={() => setShowResolutionForm(false)}
            />
          )}
        </>
      )}

      {/* Back Button */}
      <div className="pt-4">
        <Button variant="outline" asChild>
          <Link href="/transactions/disputes">Back to Queue</Link>
        </Button>
      </div>
    </div>
  );
}
