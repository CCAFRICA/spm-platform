'use client';

/**
 * Calculation Approval Center
 *
 * Lists pending calculation approval items. Displays AI risk assessment,
 * summary, and component breakdown. Approve/Reject with required comments.
 * Separation of duties enforced: submitter cannot approve own submission.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { isVLAdmin } from '@/types/auth';
import {
  listApprovalItems,
  resolveApproval,
  type ApprovalItem,
} from '@/lib/governance/approval-service';
import {
  transitionBatchLifecycle,
  listCalculationBatches,
} from '@/lib/supabase/calculation-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle, XCircle, AlertTriangle, Shield, DollarSign,
  Users, Clock, ShieldAlert, ExternalLink,
} from 'lucide-react';

export default function CalculationApprovalPage() {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ApprovalItem | null>(null);
  const [comments, setComments] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tenantId = currentTenant?.id || '';
  const hasAccess = user && (isVLAdmin(user) || user.role === 'admin');

  useEffect(() => {
    if (!tenantId) return;
    setItems(listApprovalItems(tenantId));
  }, [tenantId]);

  const pendingItems = items.filter(i => i.status === 'pending');
  const resolvedItems = items.filter(i => i.status !== 'pending');

  const handleResolve = async (action: 'approved' | 'rejected') => {
    if (!selectedItem || !user || !comments.trim()) {
      setError('Comments are required.');
      return;
    }
    setError(null);
    try {
      resolveApproval(selectedItem, user.name, action, comments);
      // Update lifecycle state via Supabase
      try {
        const batches = await listCalculationBatches(tenantId, { periodId: selectedItem.period });
        const batch = batches[0];
        if (batch) {
          const targetState = action === 'approved' ? 'APPROVED' : 'REJECTED';
          await transitionBatchLifecycle(tenantId, batch.id, targetState as import('@/lib/supabase/database.types').LifecycleState, {
            summary: action === 'approved'
              ? { approvalComments: comments }
              : { rejectionReason: comments },
          });
        }
      } catch (lcErr) {
        setError(`Approval saved but lifecycle transition failed: ${lcErr instanceof Error ? lcErr.message : 'Unknown error'}`);
      }
      setItems(listApprovalItems(tenantId));
      setSelectedItem(null);
      setComments('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resolve approval');
    }
  };

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Calculation Approvals</h1>
        <p className="text-slate-500 text-sm">Review and approve outcome calculations</p>
      </div>

      {/* Pending Items */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-500" />
          Pending Approvals ({pendingItems.length})
        </h2>
        {pendingItems.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-slate-400">
              <Shield className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              No pending approvals
            </CardContent>
          </Card>
        ) : (
          pendingItems.map(item => (
            <Card
              key={item.itemId}
              className={`cursor-pointer transition-colors ${selectedItem?.itemId === item.itemId ? 'ring-2 ring-blue-500' : 'hover:bg-zinc-800/50'}`}
              onClick={() => { setSelectedItem(item); setError(null); setComments(''); }}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Badge className="bg-yellow-100 text-yellow-700">Pending</Badge>
                    <div>
                      <p className="font-medium">Period: {item.period}</p>
                      <p className="text-sm text-slate-500">
                        Submitted by {item.submittedBy} on {new Date(item.submittedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <Link
                      href="/admin/launch/calculate"
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3" />
                      View Results
                    </Link>
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-4 w-4 text-emerald-500" />
                      {formatCurrency(item.summary.totalPayout)}
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-blue-500" />
                      {item.summary.entityCount}
                    </div>
                    {item.summary.riskAssessment && (
                      <Badge className={
                        item.summary.riskAssessment.riskLevel === 'HIGH' ? 'bg-red-100 text-red-700' :
                        item.summary.riskAssessment.riskLevel === 'MODERATE' ? 'bg-amber-100 text-amber-700' :
                        'bg-green-100 text-green-700'
                      }>
                        <ShieldAlert className="h-3 w-3 mr-1" />
                        {item.summary.riskAssessment.riskLevel} Risk
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Detail Panel */}
      {selectedItem && (
        <Card className="border-blue-200">
          <CardHeader>
            <CardTitle>Review: Period {selectedItem.period}</CardTitle>
            <CardDescription>
              Submitted by {selectedItem.submittedBy} | {formatCurrency(selectedItem.summary.totalPayout)} total
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Component Breakdown */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Component Totals</h3>
              <div className="grid gap-2 md:grid-cols-3">
                {Object.entries(selectedItem.summary.componentTotals).map(([name, total]) => (
                  <div key={name} className="flex justify-between text-sm border rounded p-2">
                    <span className="truncate">{name}</span>
                    <span className="font-medium">{formatCurrency(total)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Briefing */}
            {selectedItem.summary.aiBriefing && (
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs font-medium text-blue-700 mb-1">AI Briefing</p>
                <p className="text-sm text-blue-900">{selectedItem.summary.aiBriefing}</p>
              </div>
            )}

            {/* Risk Assessment */}
            {selectedItem.summary.riskAssessment && (
              <div className="border rounded-lg p-3">
                <p className="text-xs font-medium mb-2 flex items-center gap-1">
                  <ShieldAlert className="h-4 w-4" />
                  Risk Assessment: {selectedItem.summary.riskAssessment.riskLevel}
                  {!selectedItem.summary.riskAssessment.aiAvailable && (
                    <Badge variant="outline" className="ml-2 text-xs">AI unavailable</Badge>
                  )}
                </p>
                {selectedItem.summary.riskAssessment.observations.map((obs, idx) => (
                  <div key={idx} className="text-sm mb-1">
                    <span className={
                      obs.severity === 'critical' ? 'text-red-600' :
                      obs.severity === 'warning' ? 'text-amber-600' : 'text-slate-600'
                    }>
                      [{obs.category}] {obs.finding}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Separation of duties check */}
            {user?.name === selectedItem.submittedBy && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                You submitted this item. A different user must approve it (separation of duties).
              </div>
            )}

            {/* Action buttons */}
            <div>
              <Textarea
                placeholder="Required: Enter your comments..."
                value={comments}
                onChange={e => setComments(e.target.value)}
                className="mb-3"
              />
              {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
              <div className="flex gap-3">
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => handleResolve('approved')}
                  disabled={user?.name === selectedItem.submittedBy || !comments.trim()}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleResolve('rejected')}
                  disabled={!comments.trim()}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resolved Items */}
      {resolvedItems.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Resolved ({resolvedItems.length})</h2>
          {resolvedItems.map(item => (
            <Card key={item.itemId} className="opacity-75">
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge className={item.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                      {item.status === 'approved' ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                      {item.status}
                    </Badge>
                    <span className="text-sm">Period: {item.period}</span>
                  </div>
                  <span className="text-sm text-slate-400">
                    {item.resolution?.resolvedBy} | {item.resolution?.resolvedAt ? new Date(item.resolution.resolvedAt).toLocaleDateString() : ''}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
