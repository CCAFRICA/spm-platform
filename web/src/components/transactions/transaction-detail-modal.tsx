'use client';

import { useState, useEffect } from 'react';
import { audit } from '@/lib/audit-service';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calculator, Clock, User, Package, DollarSign, FileQuestion } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { InquiryForm } from './inquiry-form';

interface Transaction {
  id: string;
  orderId: string;
  date: string;
  customerName: string;
  productName: string;
  salesRepName: string;
  amount: number;
  commissionAmount: number;
  status: string;
  region: string;
}

interface Props {
  transaction: Transaction;
  open: boolean;
  onClose: () => void;
}

export function TransactionDetailModal({ transaction, open, onClose }: Props) {
  const [showInquiry, setShowInquiry] = useState(false);

  // Audit log when viewing transaction details
  useEffect(() => {
    if (open && transaction) {
      audit.log({
        action: 'view',
        entityType: 'transaction',
        entityId: transaction.id,
        entityName: transaction.orderId
      });
    }
  }, [open, transaction]);

  // Calculate commission breakdown
  const calc = {
    baseRate: 0.08,
    baseCommission: transaction.amount * 0.08,
    hasAccelerator: transaction.amount > 50000,
    acceleratorMultiplier: transaction.amount > 50000 ? 1.5 : 1.0,
    acceleratorBonus: transaction.amount > 50000 ? transaction.amount * 0.04 : 0,
    total: transaction.commissionAmount,
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>Transaction Details</DialogTitle>
                <p className="text-sm text-muted-foreground font-mono mt-1">
                  {transaction.orderId}
                </p>
              </div>
              <Badge variant={transaction.status === 'completed' ? 'default' : 'secondary'}>
                {transaction.status}
              </Badge>
            </div>
          </DialogHeader>

          <Tabs defaultValue="details">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Order Details</TabsTrigger>
              <TabsTrigger value="calculation">Commission Calculation</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase">
                    Order Info
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      {formatDate(transaction.date)}
                    </div>
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      {transaction.productName}
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{formatCurrency(transaction.amount)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase">
                    People
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>Customer: {transaction.customerName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>Rep: {transaction.salesRepName}</span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="bg-green-50 dark:bg-green-950 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Commission Earned</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(transaction.commissionAmount)}
                    </p>
                  </div>
                  <Badge variant="outline">Accelerator Plan</Badge>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="calculation" className="mt-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  <h4 className="font-semibold">Commission Breakdown</h4>
                </div>

                <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm space-y-2">
                  <div className="flex justify-between">
                    <span>Sale Amount:</span>
                    <span>{formatCurrency(transaction.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>× Base Rate ({(calc.baseRate * 100)}%):</span>
                    <span>{formatCurrency(calc.baseCommission)}</span>
                  </div>

                  {calc.hasAccelerator && (
                    <>
                      <Separator />
                      <div className="flex justify-between text-blue-600">
                        <span>+ Accelerator Bonus (1.5x tier):</span>
                        <span>{formatCurrency(calc.acceleratorBonus)}</span>
                      </div>
                    </>
                  )}

                  <Separator />
                  <div className="flex justify-between font-bold text-green-600">
                    <span>Total Commission:</span>
                    <span>{formatCurrency(calc.total)}</span>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3 text-sm">
                  <p className="text-blue-800 dark:text-blue-200">
                    <strong>Plan:</strong> Accelerator Plan
                    {calc.hasAccelerator && ' • Tier 2 bonus applied (sales > $50K)'}
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <Separator />

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setShowInquiry(true)}>
              <FileQuestion className="mr-2 h-4 w-4" />
              Submit Inquiry
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <InquiryForm
        orderId={transaction.orderId}
        transactionId={transaction.id}
        open={showInquiry}
        onClose={() => setShowInquiry(false)}
      />
    </>
  );
}
