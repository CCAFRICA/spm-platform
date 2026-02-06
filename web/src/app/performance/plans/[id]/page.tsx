'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Save,
  Send,
  Check,
  X,
  Archive,
  History,
  Settings,
  Layers,
  Eye,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  getPlan,
  savePlan,
  submitForApproval,
  approvePlan,
  rejectPlan,
  archivePlan,
  getPlanHistory,
  initializePlans,
} from '@/lib/compensation/plan-storage';
import {
  MatrixEditor,
  TierEditor,
  PercentageEditor,
  ConditionalRateEditor,
} from '@/components/compensation/plan-editors';
import type {
  CompensationPlanConfig,
  PlanStatus,
  PlanComponent,
  AdditiveLookupConfig,
} from '@/types/compensation-plan';
import { cn } from '@/lib/utils';

const STATUS_BADGES: Record<PlanStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  pending_approval: { label: 'Pending Approval', variant: 'outline' },
  active: { label: 'Active', variant: 'default' },
  archived: { label: 'Archived', variant: 'destructive' },
};

export default function PlanDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const planId = params.id as string;
  const initialTab = searchParams.get('tab') || 'general';

  const [plan, setPlan] = useState<CompensationPlanConfig | null>(null);
  const [originalPlan, setOriginalPlan] = useState<CompensationPlanConfig | null>(null);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [expandedComponents, setExpandedComponents] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [planHistory, setPlanHistory] = useState<CompensationPlanConfig[]>([]);

  useEffect(() => {
    initializePlans();

    setIsLoading(true);
    const loadedPlan = getPlan(planId);
    if (loadedPlan) {
      setPlan(loadedPlan);
      setOriginalPlan(JSON.parse(JSON.stringify(loadedPlan)));
      setPlanHistory(getPlanHistory(planId));

      // Expand first component by default
      const config = loadedPlan.configuration;
      if (config.type === 'additive_lookup' && config.variants[0]?.components.length > 0) {
        setExpandedComponents([config.variants[0].components[0].id]);
      }
    }
    setIsLoading(false);
  }, [planId]);

  const handleSave = () => {
    if (!plan) return;
    const updated = savePlan(plan);
    setPlan(updated);
    setOriginalPlan(JSON.parse(JSON.stringify(updated)));
    setHasChanges(false);
  };

  const handleSubmitForApproval = () => {
    if (!plan || !user) return;
    const updated = submitForApproval(plan.id, user.id);
    if (updated) {
      setPlan(updated);
      setOriginalPlan(JSON.parse(JSON.stringify(updated)));
    }
  };

  const handleApprove = () => {
    if (!plan || !user) return;
    const updated = approvePlan(plan.id, user.id);
    if (updated) {
      setPlan(updated);
      setOriginalPlan(JSON.parse(JSON.stringify(updated)));
    }
    setShowApproveDialog(false);
  };

  const handleReject = () => {
    if (!plan || !user) return;
    const updated = rejectPlan(plan.id, user.id);
    if (updated) {
      setPlan(updated);
      setOriginalPlan(JSON.parse(JSON.stringify(updated)));
    }
    setShowRejectDialog(false);
  };

  const handleArchive = () => {
    if (!plan || !user) return;
    const updated = archivePlan(plan.id, user.id);
    if (updated) {
      setPlan(updated);
      setOriginalPlan(JSON.parse(JSON.stringify(updated)));
    }
  };

  const updatePlanField = (field: keyof CompensationPlanConfig, value: unknown) => {
    if (!plan) return;
    setPlan({ ...plan, [field]: value });
    setHasChanges(true);
  };

  const updateComponent = (componentId: string, updates: Partial<PlanComponent>) => {
    if (!plan || plan.configuration.type !== 'additive_lookup') return;

    const config = plan.configuration as AdditiveLookupConfig;
    const newConfig: AdditiveLookupConfig = {
      ...config,
      variants: config.variants.map((variant) => ({
        ...variant,
        components: variant.components.map((comp) =>
          comp.id === componentId ? { ...comp, ...updates } : comp
        ),
      })),
    };

    setPlan({ ...plan, configuration: newConfig });
    setHasChanges(true);
  };

  const toggleComponentExpanded = (componentId: string) => {
    setExpandedComponents((prev) =>
      prev.includes(componentId)
        ? prev.filter((id) => id !== componentId)
        : [...prev, componentId]
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const canEdit = plan?.status === 'draft' && (user?.role === 'admin' || user?.role === 'cc_admin');
  const canApprove = plan?.status === 'pending_approval' && (user?.role === 'admin' || user?.role === 'cc_admin');

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center text-muted-foreground">Loading plan...</div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">Plan not found.</div>
            <Button className="mt-4" onClick={() => router.push('/performance/plans')}>
              Back to Plans
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const additiveLookupConfig = plan.configuration.type === 'additive_lookup'
    ? plan.configuration as AdditiveLookupConfig
    : null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/performance/plans')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{plan.name}</h1>
              <Badge variant={STATUS_BADGES[plan.status].variant}>
                {STATUS_BADGES[plan.status].label}
              </Badge>
              <Badge variant="outline">v{plan.version}</Badge>
            </div>
            <p className="text-muted-foreground mt-1">{plan.description}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {hasChanges && canEdit && (
            <Button onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          )}
          {plan.status === 'draft' && canEdit && (
            <Button variant="outline" onClick={handleSubmitForApproval}>
              <Send className="h-4 w-4 mr-2" />
              Submit for Approval
            </Button>
          )}
          {plan.status === 'pending_approval' && canApprove && (
            <>
              <Button onClick={() => setShowApproveDialog(true)}>
                <Check className="h-4 w-4 mr-2" />
                Approve
              </Button>
              <Button variant="outline" onClick={() => setShowRejectDialog(true)}>
                <X className="h-4 w-4 mr-2" />
                Reject
              </Button>
            </>
          )}
          {plan.status === 'active' && canEdit && (
            <Button variant="outline" onClick={handleArchive}>
              <Archive className="h-4 w-4 mr-2" />
              Archive
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="general" className="gap-2">
            <Settings className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="components" className="gap-2">
            <Layers className="h-4 w-4" />
            Components
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-2">
            <Eye className="h-4 w-4" />
            Preview
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Plan Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Name</Label>
                  {canEdit ? (
                    <Input
                      value={plan.name}
                      onChange={(e) => updatePlanField('name', e.target.value)}
                      className="mt-1"
                    />
                  ) : (
                    <div className="mt-1 text-sm">{plan.name}</div>
                  )}
                </div>
                <div>
                  <Label>Description</Label>
                  {canEdit ? (
                    <Textarea
                      value={plan.description}
                      onChange={(e) => updatePlanField('description', e.target.value)}
                      className="mt-1"
                      rows={3}
                    />
                  ) : (
                    <div className="mt-1 text-sm">{plan.description}</div>
                  )}
                </div>
                <div>
                  <Label>Plan Type</Label>
                  <div className="mt-1">
                    <Badge variant="outline">
                      {plan.planType === 'additive_lookup' ? 'Additive Lookup' : 'Weighted KPI'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Eligibility & Dates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Eligible Roles</Label>
                  <div className="mt-1 flex gap-2 flex-wrap">
                    {plan.eligibleRoles.map((role) => (
                      <Badge key={role} variant="secondary" className="capitalize">
                        {role.replace('_', ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Effective Date</Label>
                  <div className="mt-1 text-sm">{formatDate(plan.effectiveDate)}</div>
                </div>
                <div>
                  <Label>End Date</Label>
                  <div className="mt-1 text-sm">{plan.endDate ? formatDate(plan.endDate) : 'No end date'}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Audit Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Created By</Label>
                    <div className="text-sm">{plan.createdBy}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Created At</Label>
                    <div className="text-sm">{formatDate(plan.createdAt)}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Last Updated By</Label>
                    <div className="text-sm">{plan.updatedBy}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Last Updated At</Label>
                    <div className="text-sm">{formatDate(plan.updatedAt)}</div>
                  </div>
                  {plan.approvedBy && (
                    <>
                      <div>
                        <Label className="text-xs text-muted-foreground">Approved By</Label>
                        <div className="text-sm">{plan.approvedBy}</div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Approved At</Label>
                        <div className="text-sm">{plan.approvedAt ? formatDate(plan.approvedAt) : '-'}</div>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Components Tab */}
        <TabsContent value="components" className="mt-6">
          {additiveLookupConfig && additiveLookupConfig.variants.map((variant) => (
            <div key={variant.variantId} className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">{variant.variantName}</h3>
                {variant.description && (
                  <span className="text-sm text-muted-foreground">{variant.description}</span>
                )}
              </div>

              <div className="space-y-3">
                {variant.components
                  .filter((c) => c.enabled)
                  .sort((a, b) => a.order - b.order)
                  .map((component) => {
                    const isExpanded = expandedComponents.includes(component.id);
                    const originalComponent = originalPlan?.configuration.type === 'additive_lookup'
                      ? (originalPlan.configuration as AdditiveLookupConfig).variants[0]?.components.find(
                          (c) => c.id === component.id
                        )
                      : undefined;

                    return (
                      <Collapsible
                        key={component.id}
                        open={isExpanded}
                        onOpenChange={() => toggleComponentExpanded(component.id)}
                      >
                        <Card>
                          <CollapsibleTrigger asChild>
                            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                  <div>
                                    <CardTitle className="text-base">{component.name}</CardTitle>
                                    <CardDescription>{component.description}</CardDescription>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="capitalize">
                                    {component.componentType.replace('_', ' ')}
                                  </Badge>
                                  <Badge variant="secondary" className="capitalize">
                                    {component.measurementLevel}
                                  </Badge>
                                </div>
                              </div>
                            </CardHeader>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <CardContent className="pt-0">
                              {component.componentType === 'matrix_lookup' && component.matrixConfig && (
                                <MatrixEditor
                                  config={component.matrixConfig}
                                  onChange={(config) =>
                                    updateComponent(component.id, { matrixConfig: config })
                                  }
                                  readOnly={!canEdit}
                                  originalConfig={originalComponent?.matrixConfig}
                                />
                              )}
                              {component.componentType === 'tier_lookup' && component.tierConfig && (
                                <TierEditor
                                  config={component.tierConfig}
                                  onChange={(config) =>
                                    updateComponent(component.id, { tierConfig: config })
                                  }
                                  readOnly={!canEdit}
                                  originalConfig={originalComponent?.tierConfig}
                                />
                              )}
                              {component.componentType === 'percentage' && component.percentageConfig && (
                                <PercentageEditor
                                  config={component.percentageConfig}
                                  onChange={(config) =>
                                    updateComponent(component.id, { percentageConfig: config })
                                  }
                                  readOnly={!canEdit}
                                  originalConfig={originalComponent?.percentageConfig}
                                />
                              )}
                              {component.componentType === 'conditional_percentage' &&
                                component.conditionalConfig && (
                                  <ConditionalRateEditor
                                    config={component.conditionalConfig}
                                    onChange={(config) =>
                                      updateComponent(component.id, { conditionalConfig: config })
                                    }
                                    readOnly={!canEdit}
                                    originalConfig={originalComponent?.conditionalConfig}
                                  />
                                )}
                            </CardContent>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    );
                  })}
              </div>
            </div>
          ))}
        </TabsContent>

        {/* Preview Tab */}
        <TabsContent value="preview" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Sample Calculation Preview</CardTitle>
              <CardDescription>
                See how a typical employee would be calculated under this plan
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center text-muted-foreground py-8">
                Calculation preview will be available once the calculation engine is connected.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Version History</CardTitle>
              <CardDescription>Track changes across plan versions</CardDescription>
            </CardHeader>
            <CardContent>
              {planHistory.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No previous versions found.
                </div>
              ) : (
                <div className="space-y-4">
                  {planHistory.map((historyPlan, index) => (
                    <div
                      key={historyPlan.id}
                      className={cn(
                        'p-4 border rounded-lg',
                        index === 0 && 'border-primary bg-primary/5'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Version {historyPlan.version}</span>
                            <Badge variant={STATUS_BADGES[historyPlan.status].variant}>
                              {STATUS_BADGES[historyPlan.status].label}
                            </Badge>
                            {index === 0 && (
                              <Badge variant="secondary">Current</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            Updated by {historyPlan.updatedBy} on {formatDate(historyPlan.updatedAt)}
                          </div>
                        </div>
                        {index !== 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/performance/plans/${historyPlan.id}`)}
                          >
                            View
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Approve Dialog */}
      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Plan</AlertDialogTitle>
            <AlertDialogDescription>
              This will activate the plan and archive any existing active plans for the same roles.
              Are you sure you want to approve &ldquo;{plan.name}&rdquo;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove}>Approve</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Plan</AlertDialogTitle>
            <AlertDialogDescription>
              This will return the plan to draft status for further edits.
              Are you sure you want to reject &ldquo;{plan.name}&rdquo;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject}>Reject</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
