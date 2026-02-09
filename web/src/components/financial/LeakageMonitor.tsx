'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  ArrowRight,
  FileWarning,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { isCCAdmin } from '@/types/auth';

export type LeakageType = 'dispute' | 'adjustment' | 'refund' | 'void' | 'error';
export type LeakageStatus = 'pending' | 'approved' | 'denied' | 'escalated';

export interface LeakageItem {
  id: string;
  type: LeakageType;
  description: string;
  amount: number;
  transactionId: string;
  employeeName: string;
  locationName: string;
  createdAt: string;
  status: LeakageStatus;
}

interface LeakageMonitorProps {
  items?: LeakageItem[];
  showCount?: number;
  className?: string;
  onApprove?: (id: string) => void;
  onDeny?: (id: string) => void;
  onEscalate?: (id: string) => void;
}

// Default demo data
const defaultItems: LeakageItem[] = [
  {
    id: 'leak-001',
    type: 'dispute',
    description: 'Commission attribution dispute',
    amount: 450,
    transactionId: 'TXN-2025-0147',
    employeeName: 'Maria Rodriguez',
    locationName: 'Downtown Flagship',
    createdAt: new Date().toISOString(),
    status: 'pending',
  },
  {
    id: 'leak-002',
    type: 'adjustment',
    description: 'Incorrect commission rate applied',
    amount: 275,
    transactionId: 'TXN-2025-0089',
    employeeName: 'James Wilson',
    locationName: 'Westside Mall',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    status: 'pending',
  },
  {
    id: 'leak-003',
    type: 'refund',
    description: 'Customer return - partial refund',
    amount: 890,
    transactionId: 'TXN-2025-0032',
    employeeName: 'Sarah Chen',
    locationName: 'Airport Terminal',
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    status: 'escalated',
  },
  {
    id: 'leak-004',
    type: 'error',
    description: 'System sync error - duplicate transaction',
    amount: 1250,
    transactionId: 'TXN-2025-0018',
    employeeName: 'System',
    locationName: 'Tech Park',
    createdAt: new Date(Date.now() - 259200000).toISOString(),
    status: 'pending',
  },
];

export function LeakageMonitor({
  items,
  showCount = 4,
  className = '',
  onApprove,
  onDeny,
  onEscalate,
}: LeakageMonitorProps) {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const { user } = useAuth();
  const userIsCCAdmin = user && isCCAdmin(user);
  const isSpanish = userIsCCAdmin ? false : currentTenant?.locale === 'es-MX';

  const displayItems = useMemo(() => {
    return (items || defaultItems).slice(0, showCount);
  }, [items, showCount]);

  // Calculate summary
  const summary = useMemo(() => {
    const all = items || defaultItems;
    return {
      total: all.reduce((sum, item) => sum + item.amount, 0),
      pending: all.filter((i) => i.status === 'pending').length,
      escalated: all.filter((i) => i.status === 'escalated').length,
    };
  }, [items]);

  const getTypeIcon = (type: LeakageType) => {
    switch (type) {
      case 'dispute':
        return <FileWarning className="h-4 w-4 text-amber-500" />;
      case 'adjustment':
        return <DollarSign className="h-4 w-4 text-blue-500" />;
      case 'refund':
        return <Clock className="h-4 w-4 text-purple-500" />;
      case 'void':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
    }
  };

  const getTypeBadge = (type: LeakageType) => {
    switch (type) {
      case 'dispute':
        return 'bg-amber-100 text-amber-700';
      case 'adjustment':
        return 'bg-blue-100 text-blue-700';
      case 'refund':
        return 'bg-purple-100 text-purple-700';
      case 'void':
        return 'bg-red-100 text-red-700';
      case 'error':
        return 'bg-red-100 text-red-700';
    }
  };

  const getStatusBadge = (status: LeakageStatus) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-700';
      case 'approved':
        return 'bg-emerald-100 text-emerald-700';
      case 'denied':
        return 'bg-red-100 text-red-700';
      case 'escalated':
        return 'bg-orange-100 text-orange-700';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(isSpanish ? 'es-MX' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Card className={`border-0 shadow-lg ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-slate-500" />
            {isSpanish ? 'Monitor de Fugas' : 'Leakage Monitor'}
          </CardTitle>
          <Link href="/transactions/disputes">
            <Button variant="ghost" size="sm" className="gap-1 text-xs">
              {isSpanish ? 'Ver todos' : 'View all'}
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
        {/* Summary badges */}
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="outline" className="text-xs">
            {isSpanish ? 'Total' : 'Total'}: {format(summary.total)}
          </Badge>
          {summary.pending > 0 && (
            <Badge className="bg-yellow-100 text-yellow-700 text-xs">
              {summary.pending} {isSpanish ? 'pendientes' : 'pending'}
            </Badge>
          )}
          {summary.escalated > 0 && (
            <Badge className="bg-orange-100 text-orange-700 text-xs">
              {summary.escalated} {isSpanish ? 'escalados' : 'escalated'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {displayItems.map((item) => (
            <div
              key={item.id}
              className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{getTypeIcon(item.type)}</div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={`text-xs ${getTypeBadge(item.type)}`}>
                        {item.type}
                      </Badge>
                      <Badge className={`text-xs ${getStatusBadge(item.status)}`}>
                        {item.status}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
                      {item.description}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {item.employeeName} • {item.locationName} • {formatDate(item.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-red-600">{format(item.amount)}</p>
                  <Link href={`/transactions/${item.transactionId}`}>
                    <span className="text-xs text-indigo-600 hover:underline">
                      {item.transactionId}
                    </span>
                  </Link>
                </div>
              </div>

              {/* Quick actions */}
              {item.status === 'pending' && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                    onClick={() => onApprove?.(item.id)}
                  >
                    <CheckCircle className="h-3 w-3" />
                    {isSpanish ? 'Aprobar' : 'Approve'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => onDeny?.(item.id)}
                  >
                    <XCircle className="h-3 w-3" />
                    {isSpanish ? 'Rechazar' : 'Deny'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => onEscalate?.(item.id)}
                  >
                    <ArrowRight className="h-3 w-3" />
                    {isSpanish ? 'Escalar' : 'Escalate'}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
