'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Receipt,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Clock,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface Transaction {
  id: string;
  date: string;
  type: string;
  product: string;
  amount: number;
  incentive: number;
  status: 'credited' | 'pending' | 'disputed';
  creditPercentage: number;
}

interface RecentTransactionsCardProps {
  transactions: Transaction[];
  showViewAll?: boolean;
}

export function RecentTransactionsCard({
  transactions,
  showViewAll = true,
}: RecentTransactionsCardProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: Transaction['status']) => {
    switch (status) {
      case 'credited':
        return (
          <Badge variant="secondary" className="bg-green-100 text-green-800 gap-1">
            <CheckCircle className="h-3 w-3" />
            Credited
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 gap-1">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
      case 'disputed':
        return (
          <Badge variant="secondary" className="bg-red-100 text-red-800 gap-1">
            <AlertTriangle className="h-3 w-3" />
            Disputed
          </Badge>
        );
    }
  };

  const totalIncentives = transactions
    .filter((t) => t.status === 'credited')
    .reduce((sum, t) => sum + t.incentive, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Recent Transactions
            </CardTitle>
            <CardDescription>
              Your credited sales and incentive earnings
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-green-600">
              +{formatCurrency(totalIncentives)}
            </div>
            <div className="text-xs text-muted-foreground">
              from {transactions.length} transactions
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="text-center py-8">
            <Receipt className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No recent transactions</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((txn) => (
              <Link
                key={txn.id}
                href={`/transactions/${txn.id}`}
                className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
              >
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <Receipt className="h-5 w-5 text-muted-foreground" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{txn.id}</span>
                    {getStatusBadge(txn.status)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {txn.product} • {txn.type} • {formatDate(txn.date)}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-medium text-sm">{formatCurrency(txn.amount)}</div>
                  <div className={cn(
                    'text-xs',
                    txn.status === 'credited' ? 'text-green-600 font-medium' : 'text-muted-foreground'
                  )}>
                    {txn.status === 'credited' && '+'}
                    {formatCurrency(txn.incentive)}
                    {txn.creditPercentage < 100 && (
                      <span className="text-muted-foreground ml-1">
                        ({txn.creditPercentage}%)
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:translate-x-1 transition-transform" />
              </Link>
            ))}
          </div>
        )}

        {showViewAll && transactions.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <Button variant="outline" className="w-full" asChild>
              <Link href="/transactions">
                View All Transactions
                <ExternalLink className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
