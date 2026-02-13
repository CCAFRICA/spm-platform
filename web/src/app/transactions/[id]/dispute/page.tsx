'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GuidedDisputeFlow } from '@/components/disputes/GuidedDisputeFlow';
import { useAuth } from '@/contexts/auth-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import {
  getByTransaction,
  createDraft,
} from '@/lib/disputes/dispute-service';
import type { Dispute } from '@/types/dispute';

// Transaction data (matching the parent page)
const retailCoTransactions: Record<string, {
  id: string;
  date: string;
  type: string;
  product: string;
  productCategory: string;
  amount: number;
  status: string;
  customerName: string;
  storeId: string;
  storeName: string;
}> = {
  'TXN-2025-0147': {
    id: 'TXN-2025-0147',
    date: '2025-01-15',
    type: 'Insurance Add-on',
    product: 'Premium Protection Plan',
    productCategory: 'Insurance',
    amount: 850,
    status: 'Completed',
    customerName: 'Jennifer Martinez',
    storeId: 'store-101',
    storeName: 'Downtown Flagship',
  },
};

export default function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const transactionId = resolvedParams.id;
  const router = useRouter();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();

  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const transaction = retailCoTransactions[transactionId];

  useEffect(() => {
    if (!currentTenant || !user) return;

    // Check if there's already a dispute for this transaction
    let existingDispute = getByTransaction(transactionId);

    if (!existingDispute) {
      // Create a new draft dispute
      existingDispute = createDraft(
        currentTenant.id,
        transactionId,
        user.id,
        user.name,
        transaction?.storeId || 'store-101',
        transaction?.storeName || 'Downtown Flagship',
        'comp-insurance' // Default to insurance component for demo
      );
    }

    setDispute(existingDispute);
    setIsLoading(false);
  }, [currentTenant, user, transactionId, transaction?.storeId, transaction?.storeName]);

  const handleComplete = () => {
    router.push(`/transactions/${transactionId}`);
  };

  const handleCancel = () => {
    router.push(`/transactions/${transactionId}`);
  };

  if (!transaction) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Transaction not found</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.push('/transactions')}
            >
              Back to Transactions
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading dispute...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/transactions/${transactionId}`)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Report an Issue</h1>
          <p className="text-muted-foreground">
            We&apos;ll help you understand or resolve your compensation question
          </p>
        </div>
      </div>

      {/* Transaction Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
              <Receipt className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold">{transaction.id}</h3>
                <Badge variant="secondary">{transaction.type}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {transaction.product} &bull; {transaction.customerName}
              </p>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-sm">
                  <span className="text-muted-foreground">Amount:</span>{' '}
                  <span className="font-medium">{formatCurrency(transaction.amount)}</span>
                </span>
                <span className="text-sm">
                  <span className="text-muted-foreground">Date:</span>{' '}
                  <span className="font-medium">{transaction.date}</span>
                </span>
                <span className="text-sm">
                  <span className="text-muted-foreground">Store:</span>{' '}
                  <span className="font-medium">{transaction.storeName}</span>
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Guided Dispute Flow */}
      {dispute && currentTenant && (
        <GuidedDisputeFlow
          disputeId={dispute.id}
          tenantId={currentTenant.id}
          onComplete={handleComplete}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
