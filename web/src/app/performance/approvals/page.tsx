'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, Clock, CheckCircle, XCircle, Plus, Inbox } from 'lucide-react';
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
        employeeId: 'user-1',
        employeeName: 'Sarah Chen',
        adjustmentAmount: 2500,
        reason: 'Q4 performance bonus',
      },
      reason: 'Exceptional performance in Q4 - exceeded quota by 150%',
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
