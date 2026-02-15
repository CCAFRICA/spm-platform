'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, Clock, CheckCircle, XCircle, Plus, Inbox, Wallet, ChevronRight, FileText } from 'lucide-react';
import Link from 'next/link';
import { ApprovalCard } from '@/components/approvals/approval-card';
import { approvalService } from '@/lib/approval-service';
import { ApprovalRequest } from '@/types/audit';
import { pageVariants, containerVariants, itemVariants } from '@/lib/animations';
import { CardGridSkeleton } from '@/components/ui/skeleton-loaders';
import { LoadingButton } from '@/components/ui/loading-button';
import { EmptyState } from '@/components/ui/empty-state';

export default function ApprovalsPage() {
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  const [myRequests, setMyRequests] = useState<ApprovalRequest[]>([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (showLoader = true) => {
    if (showLoader) setIsLoading(true);
    await new Promise(r => setTimeout(r, showLoader ? 600 : 0));

    setPendingApprovals(approvalService.getPendingForApprover());
    setMyRequests(approvalService.getMyRequests());
    const c = approvalService.getCounts();
    setCounts({
      pending: c.pending,
      approved: c.approved,
      rejected: c.rejected,
    });
    setIsLoading(false);
  };

  // Demo: Create a sample request
  const createSampleRequest = async () => {
    setIsCreating(true);
    await new Promise(r => setTimeout(r, 800));

    approvalService.createRequest({
      requestType: 'compensation_adjustment',
      tier: 2,
      changeData: {
        entityId: 'user-1',
        entityName: 'Sarah Chen',
        adjustmentAmount: 2500,
        reason: 'Q4 performance bonus',
      },
      reason: 'Exceptional performance in Q4 - exceeded target by 150%',
    });

    setIsCreating(false);
    toast.success('Request Created', {
      description: 'A new approval request has been submitted'
    });
    loadData(false);
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900"
    >
      <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="p-2 bg-primary/10 rounded-lg"
              >
                <ClipboardCheck className="h-6 w-6 text-primary" />
              </motion.div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                  Approvals
                </h1>
                <p className="text-muted-foreground text-sm">
                  Manage approval requests and track status
                </p>
              </div>
            </div>
            <LoadingButton
              onClick={createSampleRequest}
              loading={isCreating}
              loadingText="Creating..."
            >
              <Plus className="mr-2 h-4 w-4" />
              New Request (Demo)
            </LoadingButton>
          </div>

          {/* Stats */}
          {isLoading ? (
            <CardGridSkeleton count={3} />
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid gap-3 md:gap-4 grid-cols-3"
            >
              <motion.div variants={itemVariants}>
                <Card className="border-0 shadow-md transition-all hover:shadow-lg">
                  <CardHeader className="pb-2 p-4">
                    <CardTitle className="text-xs md:text-sm font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4 text-yellow-500" />
                      <span className="hidden sm:inline">Pending</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="text-xl md:text-2xl font-bold">{counts.pending}</div>
                  </CardContent>
                </Card>
              </motion.div>
              <motion.div variants={itemVariants}>
                <Card className="border-0 shadow-md transition-all hover:shadow-lg">
                  <CardHeader className="pb-2 p-4">
                    <CardTitle className="text-xs md:text-sm font-medium flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="hidden sm:inline">Approved</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="text-xl md:text-2xl font-bold text-green-600">{counts.approved}</div>
                  </CardContent>
                </Card>
              </motion.div>
              <motion.div variants={itemVariants}>
                <Card className="border-0 shadow-md transition-all hover:shadow-lg">
                  <CardHeader className="pb-2 p-4">
                    <CardTitle className="text-xs md:text-sm font-medium flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span className="hidden sm:inline">Rejected</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="text-xl md:text-2xl font-bold text-red-600">{counts.rejected}</div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          )}

          {/* Quick Links */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid md:grid-cols-2 gap-4"
          >
            {/* Payout Approvals */}
            <Link href="/performance/approvals/payouts">
              <Card className="border-0 shadow-md hover:shadow-lg transition-all cursor-pointer bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-200 dark:border-green-800 h-full">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-lg bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                        <Wallet className="h-6 w-6 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-green-900 dark:text-green-100">Outcome Approvals</h3>
                        <p className="text-sm text-green-700 dark:text-green-300">
                          Review and approve incentive outcome batches
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        1 pending
                      </Badge>
                      <ChevronRight className="h-5 w-5 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {/* Plan Approvals */}
            <Link href="/performance/approvals/plans">
              <Card className="border-0 shadow-md hover:shadow-lg transition-all cursor-pointer bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800 h-full">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                        <FileText className="h-6 w-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-blue-900 dark:text-blue-100">Plan Approvals</h3>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          Review rule set changes
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        2 pending
                      </Badge>
                      <ChevronRight className="h-5 w-5 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          {/* Tabs */}
          <Tabs defaultValue="pending">
            <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:inline-flex">
              <TabsTrigger value="pending" className="flex items-center gap-2">
                <span className="hidden sm:inline">Pending </span>Approval
                {counts.pending > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {counts.pending}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="my-requests">My Requests</TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-4">
              {isLoading ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Card key={i} className="border-0 shadow-md">
                      <CardContent className="p-4">
                        <div className="space-y-3 animate-pulse">
                          <div className="h-5 bg-muted rounded w-2/3" />
                          <div className="h-4 bg-muted rounded w-full" />
                          <div className="h-4 bg-muted rounded w-1/2" />
                          <div className="flex gap-2 pt-2">
                            <div className="h-9 bg-muted rounded flex-1" />
                            <div className="h-9 bg-muted rounded flex-1" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : pendingApprovals.length === 0 ? (
                <Card className="border-0 shadow-lg">
                  <CardContent className="py-8">
                    <EmptyState
                      icon={CheckCircle}
                      title="No pending approvals!"
                      description="You're all caught up. Great job!"
                    />
                  </CardContent>
                </Card>
              ) : (
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="grid gap-4 md:grid-cols-2"
                >
                  {pendingApprovals.map((req) => (
                    <motion.div key={req.id} variants={itemVariants}>
                      <ApprovalCard
                        request={req}
                        canApprove
                        onUpdate={() => loadData(false)}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </TabsContent>

            <TabsContent value="my-requests" className="mt-4">
              {isLoading ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Card key={i} className="border-0 shadow-md">
                      <CardContent className="p-4">
                        <div className="space-y-3 animate-pulse">
                          <div className="h-5 bg-muted rounded w-2/3" />
                          <div className="h-4 bg-muted rounded w-full" />
                          <div className="h-4 bg-muted rounded w-1/2" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : myRequests.length === 0 ? (
                <Card className="border-0 shadow-lg">
                  <CardContent className="py-8">
                    <EmptyState
                      icon={Inbox}
                      title="No requests yet"
                      description="Your submitted requests will appear here."
                      action={{
                        label: 'Create Request',
                        onClick: createSampleRequest
                      }}
                    />
                  </CardContent>
                </Card>
              ) : (
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="grid gap-4 md:grid-cols-2"
                >
                  {myRequests.map((req) => (
                    <motion.div key={req.id} variants={itemVariants}>
                      <ApprovalCard
                        request={req}
                        onUpdate={() => loadData(false)}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </motion.div>
  );
}
