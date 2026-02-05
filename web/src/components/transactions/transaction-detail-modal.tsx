'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { audit } from '@/lib/audit-service';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Calculator, Clock, User, Package, DollarSign, FileQuestion,
  CheckCircle, ArrowRight, FileText, TrendingUp
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { InquiryForm } from './inquiry-form';
import { DetailModalSkeleton } from '@/components/ui/skeleton-loaders';

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

// Animated number component
function AnimatedValue({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 600;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <span>
      {prefix}{formatCurrency(displayValue)}{suffix}
    </span>
  );
}

// Mock timeline events
function generateTimelineEvents(transaction: Transaction) {
  const baseDate = new Date(transaction.date);
  return [
    {
      id: 1,
      date: new Date(baseDate.getTime() - 86400000 * 3).toISOString(),
      event: 'Opportunity Created',
      description: `New opportunity with ${transaction.customerName}`,
      icon: FileText,
    },
    {
      id: 2,
      date: new Date(baseDate.getTime() - 86400000 * 1).toISOString(),
      event: 'Quote Sent',
      description: `${transaction.productName} quote sent to customer`,
      icon: ArrowRight,
    },
    {
      id: 3,
      date: transaction.date,
      event: 'Order Placed',
      description: `Order ${transaction.orderId} confirmed`,
      icon: Package,
    },
    {
      id: 4,
      date: new Date(baseDate.getTime() + 86400000 * 1).toISOString(),
      event: 'Commission Calculated',
      description: `${formatCurrency(transaction.commissionAmount)} commission credited`,
      icon: TrendingUp,
    },
    ...(transaction.status === 'completed' ? [{
      id: 5,
      date: new Date(baseDate.getTime() + 86400000 * 5).toISOString(),
      event: 'Completed',
      description: 'Transaction finalized and paid',
      icon: CheckCircle,
    }] : []),
  ];
}

export function TransactionDetailModal({ transaction, open, onClose }: Props) {
  const [showInquiry, setShowInquiry] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('details');

  // Simulate loading
  useEffect(() => {
    if (open) {
      setIsLoading(true);
      const timer = setTimeout(() => setIsLoading(false), 400);
      return () => clearTimeout(timer);
    }
  }, [open, transaction.id]);

  // Audit log when viewing transaction details
  useEffect(() => {
    if (open && transaction && !isLoading) {
      audit.log({
        action: 'view',
        entityType: 'transaction',
        entityId: transaction.id,
        entityName: transaction.orderId
      });
    }
  }, [open, transaction, isLoading]);

  // Calculate commission breakdown
  const calc = {
    baseRate: 0.08,
    baseCommission: transaction.amount * 0.08,
    hasAccelerator: transaction.amount > 50000,
    acceleratorMultiplier: transaction.amount > 50000 ? 1.5 : 1.0,
    acceleratorBonus: transaction.amount > 50000 ? transaction.amount * 0.04 : 0,
    total: transaction.commissionAmount,
  };

  const timelineEvents = generateTimelineEvents(transaction);

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <DetailModalSkeleton />
              </motion.div>
            ) : (
              <motion.div
                key="content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <DialogHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <DialogTitle className="text-lg sm:text-xl">Transaction Details</DialogTitle>
                      <p className="text-sm text-muted-foreground font-mono mt-1">
                        {transaction.orderId}
                      </p>
                    </div>
                    <Badge
                      variant={transaction.status === 'completed' ? 'default' : 'secondary'}
                      className="w-fit"
                    >
                      {transaction.status}
                    </Badge>
                  </div>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="details" className="text-xs sm:text-sm">
                      <Package className="h-4 w-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Order </span>Details
                    </TabsTrigger>
                    <TabsTrigger value="calculation" className="text-xs sm:text-sm">
                      <Calculator className="h-4 w-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Commission </span>Calc
                    </TabsTrigger>
                    <TabsTrigger value="timeline" className="text-xs sm:text-sm">
                      <Clock className="h-4 w-4 mr-1 sm:mr-2" />
                      Timeline
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="space-y-4 mt-4">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-6"
                    >
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
                    </motion.div>

                    <Separator />

                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.1 }}
                      className="bg-green-50 dark:bg-green-950 rounded-lg p-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <p className="text-sm text-muted-foreground">Commission Earned</p>
                          <p className="text-2xl font-bold text-green-600">
                            <AnimatedValue value={transaction.commissionAmount} />
                          </p>
                        </div>
                        <Badge variant="outline">Accelerator Plan</Badge>
                      </div>
                    </motion.div>
                  </TabsContent>

                  <TabsContent value="calculation" className="mt-4">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center gap-2">
                        <Calculator className="h-5 w-5" />
                        <h4 className="font-semibold">Commission Breakdown</h4>
                      </div>

                      <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm space-y-2">
                        <motion.div
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 }}
                          className="flex justify-between"
                        >
                          <span>Sale Amount:</span>
                          <span>{formatCurrency(transaction.amount)}</span>
                        </motion.div>
                        <motion.div
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 }}
                          className="flex justify-between"
                        >
                          <span>× Base Rate ({(calc.baseRate * 100)}%):</span>
                          <span>{formatCurrency(calc.baseCommission)}</span>
                        </motion.div>

                        {calc.hasAccelerator && (
                          <>
                            <Separator />
                            <motion.div
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.3 }}
                              className="flex justify-between text-blue-600"
                            >
                              <span>+ Accelerator Bonus (1.5x tier):</span>
                              <span>{formatCurrency(calc.acceleratorBonus)}</span>
                            </motion.div>
                          </>
                        )}

                        <Separator />
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.4 }}
                          className="flex justify-between font-bold text-green-600"
                        >
                          <span>Total Commission:</span>
                          <span><AnimatedValue value={calc.total} /></span>
                        </motion.div>
                      </div>

                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3 text-sm"
                      >
                        <p className="text-blue-800 dark:text-blue-200">
                          <strong>Plan:</strong> Accelerator Plan
                          {calc.hasAccelerator && ' • Tier 2 bonus applied (sales > $50K)'}
                        </p>
                      </motion.div>
                    </motion.div>
                  </TabsContent>

                  <TabsContent value="timeline" className="mt-4">
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="relative"
                    >
                      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-muted" />
                      <div className="space-y-4">
                        {timelineEvents.map((event, index) => (
                          <motion.div
                            key={event.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="relative pl-10"
                          >
                            <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-background border-2 border-muted flex items-center justify-center">
                              <event.icon className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="bg-muted/30 rounded-lg p-3">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                <p className="font-medium text-sm">{event.event}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(event.date)}
                                </p>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {event.description}
                              </p>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  </TabsContent>
                </Tabs>

                <Separator className="my-4" />

                <div className="flex flex-col-reverse sm:flex-row justify-between gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowInquiry(true)}
                    className="w-full sm:w-auto"
                  >
                    <FileQuestion className="mr-2 h-4 w-4" />
                    Submit Inquiry
                  </Button>
                  <Button
                    variant="outline"
                    onClick={onClose}
                    className="w-full sm:w-auto"
                  >
                    Close
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
