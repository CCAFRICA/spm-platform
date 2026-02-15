'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Wallet,
  Clock,
  CheckCircle,
  DollarSign,
  Users,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { PayoutBatchCard } from '@/components/approvals/PayoutBatchCard';
import { payoutService, PayoutBatch } from '@/lib/payout-service';
import { toast } from 'sonner';
import Link from 'next/link';
import { useCurrency } from '@/contexts/tenant-context';

export default function PayoutApprovalsPage() {
  const [pendingBatches, setPendingBatches] = useState<PayoutBatch[]>([]);
  const [completedBatches, setCompletedBatches] = useState<PayoutBatch[]>([]);
  const [stats, setStats] = useState({
    pendingCount: 0,
    pendingAmount: 0,
    completedCount: 0,
    completedAmount: 0,
    totalEmployees: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { format: formatCurrency } = useCurrency();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setIsLoading(true);
    payoutService.initialize();

    setTimeout(() => {
      setPendingBatches(payoutService.getPendingBatches());
      setCompletedBatches(payoutService.getCompletedBatches());
      setStats(payoutService.getStats());
      setIsLoading(false);
    }, 500);
  };

  const handleApprove = async (batchId: string) => {
    setProcessingId(batchId);

    // Simulate processing
    await new Promise(r => setTimeout(r, 1000));

    const batch = payoutService.approveBatch(batchId, 'Mike Chen');

    if (batch) {
      toast.success('Payout Approved', {
        description: `${batch.periodLabel} payout for ${batch.entityCount} employees has been approved`,
      });
    }

    setProcessingId(null);
    loadData();
  };

  const handleReject = async (batchId: string, reason: string) => {
    setProcessingId(batchId);

    await new Promise(r => setTimeout(r, 800));

    const batch = payoutService.rejectBatch(batchId, 'Mike Chen', reason);

    if (batch) {
      toast.error('Payout Rejected', {
        description: `${batch.periodLabel} payout has been rejected`,
      });
    }

    setProcessingId(null);
    loadData();
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading payout batches...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/performance/approvals">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wallet className="h-6 w-6 text-primary" />
              Payout Approvals
            </h1>
            <p className="text-muted-foreground">
              Review and approve incentive payout batches
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={loadData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              Pending Batches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingCount}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(stats.pendingAmount)} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Employees Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEmployees}</div>
            <p className="text-xs text-muted-foreground">awaiting payout</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completedCount}</div>
            <p className="text-xs text-muted-foreground">batches processed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-500" />
              Total Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats.completedAmount)}
            </div>
            <p className="text-xs text-muted-foreground">all time</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            Pending Approval
            {stats.pendingCount > 0 && (
              <Badge variant="secondary">{stats.pendingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {pendingBatches.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <h3 className="text-lg font-medium mb-2">All caught up!</h3>
                <p className="text-muted-foreground">
                  No payout batches pending approval
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {pendingBatches.map((batch) => (
                <PayoutBatchCard
                  key={batch.id}
                  batch={batch}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  isProcessing={processingId === batch.id}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          {completedBatches.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No completed batches</h3>
                <p className="text-muted-foreground">
                  Completed payout batches will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {completedBatches.map((batch) => (
                <PayoutBatchCard
                  key={batch.id}
                  batch={batch}
                  showActions={false}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
