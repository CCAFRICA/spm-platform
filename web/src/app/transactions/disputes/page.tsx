'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CheckCircle,
  Clock,
  FileText,
  User,
  ArrowRight,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { useTenant } from '@/contexts/tenant-context';
import {
  getAllDisputes,
  getDisputeStats,
} from '@/lib/disputes/dispute-service';
import type { Dispute, DisputeStatus } from '@/types/dispute';
import { DISPUTE_CATEGORIES } from '@/types/dispute';

type FilterTab = 'pending' | 'resolved' | 'all';

export default function DisputeQueuePage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [filter, setFilter] = useState<FilterTab>('pending');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!currentTenant) return;

    const allDisputes = getAllDisputes(currentTenant.id);
    setDisputes(allDisputes);
    setIsLoading(false);
  }, [currentTenant]);

  const stats = currentTenant ? getDisputeStats(currentTenant.id) : null;

  const filteredDisputes = disputes.filter((d) => {
    if (filter === 'pending') {
      return d.status === 'submitted' || d.status === 'in_review';
    }
    if (filter === 'resolved') {
      return d.status === 'resolved';
    }
    return d.status !== 'draft';
  });

  // Use tenant currency settings
  const formatCurrency = (value: number) => {
    const currencyCode = currentTenant?.currency || 'USD';
    const locale = currencyCode === 'MXN' ? 'es-MX' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: DisputeStatus) => {
    switch (status) {
      case 'submitted':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Pending Review</Badge>;
      case 'in_review':
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800">In Review</Badge>;
      case 'resolved':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">Resolved</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading disputes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          Dispute Queue
        </h1>
        <p className="text-muted-foreground">
          Review and resolve entity outcome disputes
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center dark:bg-amber-900/30">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{stats.pending}</div>
                  <div className="text-sm text-muted-foreground">Pending Review</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center dark:bg-green-900/30">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{stats.resolved}</div>
                  <div className="text-sm text-muted-foreground">Resolved</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center dark:bg-blue-900/30">
                  <TrendingDown className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{stats.selfResolved}</div>
                  <div className="text-sm text-muted-foreground">Self-Resolved</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center dark:bg-purple-900/30">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{stats.avgResolutionSteps.toFixed(1)}</div>
                  <div className="text-sm text-muted-foreground">Avg Steps</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterTab)}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            Pending
            {stats && stats.pending > 0 && (
              <Badge variant="secondary" className="ml-1">{stats.pending}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="resolved" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Resolved
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-2">
            <FileText className="h-4 w-4" />
            All
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Disputes Table */}
      <Card>
        <CardContent className="p-0">
          {filteredDisputes.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-1">No disputes found</h3>
              <p className="text-sm text-muted-foreground">
                {filter === 'pending'
                  ? 'No disputes pending review'
                  : filter === 'resolved'
                  ? 'No resolved disputes yet'
                  : 'No disputes submitted'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Amount Claimed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDisputes.map((dispute) => (
                  <TableRow
                    key={dispute.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/transactions/disputes/${dispute.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="font-medium">{dispute.entityName}</div>
                          <div className="text-xs text-muted-foreground">{dispute.storeName}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {DISPUTE_CATEGORIES[dispute.category].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {dispute.transactionId}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {formatCurrency(dispute.expectedAmount)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(dispute.status)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(dispute.submittedAt)}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
