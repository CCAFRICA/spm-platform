'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, Clock, CheckCircle, XCircle, Plus } from 'lucide-react';
import { ApprovalCard } from '@/components/approvals/approval-card';
import { approvalService } from '@/lib/approval-service';
import { ApprovalRequest } from '@/types/audit';

export default function ApprovalsPage() {
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  const [myRequests, setMyRequests] = useState<ApprovalRequest[]>([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setPendingApprovals(approvalService.getPendingForApprover());
    setMyRequests(approvalService.getMyRequests());
    const c = approvalService.getCounts();
    setCounts({
      pending: c.pending,
      approved: c.approved,
      rejected: c.rejected,
    });
  };

  // Demo: Create a sample request
  const createSampleRequest = () => {
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
    loadData();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <ClipboardCheck className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Approvals</h1>
                <p className="text-muted-foreground text-sm">
                  Manage approval requests and track status
                </p>
              </div>
            </div>
            <Button onClick={createSampleRequest}>
              <Plus className="mr-2 h-4 w-4" />
              New Request (Demo)
            </Button>
          </div>

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-yellow-500" />
                  Pending
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{counts.pending}</div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Approved
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{counts.approved}</div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  Rejected
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{counts.rejected}</div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="pending">
            <TabsList>
              <TabsTrigger value="pending" className="flex items-center gap-2">
                Pending Approval
                {counts.pending > 0 && (
                  <Badge variant="secondary">{counts.pending}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="my-requests">My Requests</TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-4">
              {pendingApprovals.length === 0 ? (
                <Card className="border-0 shadow-lg">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <CheckCircle className="mx-auto h-12 w-12 mb-4 text-green-500" />
                    <p className="font-medium">No pending approvals!</p>
                    <p className="text-sm">You&apos;re all caught up.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {pendingApprovals.map((req) => (
                    <ApprovalCard
                      key={req.id}
                      request={req}
                      canApprove
                      onUpdate={loadData}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="my-requests" className="mt-4">
              {myRequests.length === 0 ? (
                <Card className="border-0 shadow-lg">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <ClipboardCheck className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p className="font-medium">No requests yet</p>
                    <p className="text-sm">Your submitted requests will appear here.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {myRequests.map((req) => (
                    <ApprovalCard key={req.id} request={req} onUpdate={loadData} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
