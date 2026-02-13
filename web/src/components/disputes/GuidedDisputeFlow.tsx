'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  HelpCircle,
  AlertTriangle,
  Send,
  PartyPopper,
  Calculator,
  Users,
  FileText,
} from 'lucide-react';
import { useCurrency } from '@/contexts/tenant-context';
import { CalculationBreakdown } from '@/components/compensation/CalculationBreakdown';
import {
  getDispute,
  updateDraft,
  completeStep,
  markResolvedAtStep,
  submitDispute,
} from '@/lib/disputes/dispute-service';
import { calculateIncentive, getMariaMetrics } from '@/lib/compensation/calculation-engine';
import type { DisputeCategory } from '@/types/dispute';
import type { CalculationResult } from '@/types/compensation-plan';
import { DISPUTE_CATEGORIES } from '@/types/dispute';
import { cn } from '@/lib/utils';

interface GuidedDisputeFlowProps {
  disputeId: string;
  tenantId: string;
  onComplete: () => void;
  onCancel: () => void;
}

const STEPS = [
  { number: 1, title: "Let's Review the Calculation", icon: Calculator },
  { number: 2, title: 'Compare with Similar Transactions', icon: Users },
  { number: 3, title: 'Build Your Case', icon: FileText },
];

// Similar transactions for comparison
const SIMILAR_TRANSACTIONS = [
  { id: 'TXN-2025-0098', amount: 780, incentive: 39, rep: 'James Wilson', date: '2024-12-28' },
  { id: 'TXN-2025-0112', amount: 920, incentive: 46, rep: 'Emily Johnson', date: '2024-12-30' },
  { id: 'TXN-2025-0135', amount: 650, incentive: 32.5, rep: 'Maria Rodriguez', date: '2025-01-01' },
];

export function GuidedDisputeFlow({
  disputeId,
  tenantId,
  onComplete,
  onCancel,
}: GuidedDisputeFlowProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [calculationResult, setCalculationResult] = useState<CalculationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Form state
  const [expectedAmount, setExpectedAmount] = useState('');
  const [justification, setJustification] = useState('');
  const [category, setCategory] = useState<DisputeCategory>('wrong_attribution');

  useEffect(() => {
    // Load dispute
    const loaded = getDispute(disputeId);
    if (loaded) {
      setCategory(loaded.category);
      setJustification(loaded.justification);
      setExpectedAmount(loaded.expectedAmount?.toString() || '');
    }
    setIsLoading(false);

    // Load calculation
    const metrics = getMariaMetrics();
    const result = calculateIncentive(metrics, tenantId);
    setCalculationResult(result);
  }, [disputeId, tenantId]);

  const handleUnderstood = () => {
    // User understood after explanation - mark as self-resolved
    markResolvedAtStep(disputeId, currentStep as 1 | 2);
    setShowSuccess(true);
    setTimeout(() => {
      onComplete();
    }, 2000);
  };

  const handleContinue = () => {
    completeStep(disputeId, currentStep as 1 | 2 | 3);

    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    // Update dispute with form data
    updateDraft(disputeId, {
      category,
      expectedAmount: parseFloat(expectedAmount) || 0,
      actualAmount: 0, // From calculation
      difference: parseFloat(expectedAmount) || 0,
      justification,
    });

    // Submit the dispute
    submitDispute(disputeId);

    setTimeout(() => {
      setIsSubmitting(false);
      onComplete();
    }, 1000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (showSuccess) {
    return (
      <Card className="max-w-lg mx-auto">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <PartyPopper className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold mb-2">Great, glad that helped!</h2>
          <p className="text-muted-foreground">
            If you have any other questions about your compensation, feel free to review your
            transactions anytime.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = step.number === currentStep;
              const isCompleted = step.number < currentStep;

              return (
                <div key={step.number} className="flex items-center">
                  <div
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-full transition-colors',
                      isActive && 'bg-primary text-primary-foreground',
                      isCompleted && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                      !isActive && !isCompleted && 'bg-muted text-muted-foreground'
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                    <span className="font-medium hidden sm:inline">{step.title}</span>
                    <span className="font-medium sm:hidden">Step {step.number}</span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <ChevronRight className="h-5 w-5 mx-2 text-muted-foreground" />
                  )}
                </div>
              );
            })}
          </div>
          <Progress value={(currentStep / 3) * 100} className="h-2" />
        </CardContent>
      </Card>

      {/* Step Content */}
      {currentStep === 1 && (
        <Step1ReviewCalculation
          calculationResult={calculationResult}
          onUnderstood={handleUnderstood}
          onContinue={handleContinue}
          onCancel={onCancel}
        />
      )}

      {currentStep === 2 && (
        <Step2CompareTransactions
          expectedAmount={expectedAmount}
          setExpectedAmount={setExpectedAmount}
          justification={justification}
          setJustification={setJustification}
          onUnderstood={handleUnderstood}
          onContinue={handleContinue}
          onBack={handleBack}
        />
      )}

      {currentStep === 3 && (
        <Step3BuildCase
          category={category}
          setCategory={setCategory}
          justification={justification}
          setJustification={setJustification}
          expectedAmount={expectedAmount}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onBack={handleBack}
        />
      )}
    </div>
  );
}

// ============================================
// STEP 1: Review Calculation
// ============================================

interface Step1Props {
  calculationResult: CalculationResult | null;
  onUnderstood: () => void;
  onContinue: () => void;
  onCancel: () => void;
}

function Step1ReviewCalculation({
  calculationResult,
  onUnderstood,
  onContinue,
  onCancel,
}: Step1Props) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Let&apos;s Review Your Calculation
          </CardTitle>
          <CardDescription>
            Here&apos;s exactly how your incentive was calculated for this component. Take a moment to
            review it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {calculationResult ? (
            <CalculationBreakdown result={calculationResult} compact />
          ) : (
            <div className="text-center text-muted-foreground py-8">
              Unable to load calculation details.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <HelpCircle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100">
                Does this answer your question?
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                If you now understand how the calculation works, you can close this inquiry. If you
                still believe there&apos;s an error, we&apos;ll help you investigate further.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onUnderstood}>
            <CheckCircle className="h-4 w-4 mr-2" />
            Yes, all clear
          </Button>
          <Button onClick={onContinue}>
            No, there&apos;s an error
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// STEP 2: Compare Transactions
// ============================================

interface Step2Props {
  expectedAmount: string;
  setExpectedAmount: (value: string) => void;
  justification: string;
  setJustification: (value: string) => void;
  onUnderstood: () => void;
  onContinue: () => void;
  onBack: () => void;
}

function Step2CompareTransactions({
  expectedAmount,
  setExpectedAmount,
  justification,
  setJustification,
  onUnderstood,
  onContinue,
  onBack,
}: Step2Props) {
  const { format: fmt } = useCurrency();
  const avgIncentive =
    SIMILAR_TRANSACTIONS.reduce((sum, t) => sum + t.incentive, 0) / SIMILAR_TRANSACTIONS.length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Compare with Similar Transactions
          </CardTitle>
          <CardDescription>
            Here are similar insurance transactions from your store. Compare your expected payout.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {SIMILAR_TRANSACTIONS.map((txn) => (
              <div
                key={txn.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
              >
                <div>
                  <div className="font-medium">{txn.id}</div>
                  <div className="text-sm text-muted-foreground">
                    {txn.rep} • {txn.date}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">{fmt(txn.incentive)}</div>
                  <div className="text-sm text-muted-foreground">
                    on {fmt(txn.amount)}
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between p-3 rounded-lg border-2 border-primary bg-primary/5">
              <div>
                <div className="font-medium">Average Incentive</div>
                <div className="text-sm text-muted-foreground">For similar transactions</div>
              </div>
              <div className="text-2xl font-bold text-primary">{fmt(avgIncentive)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What did you expect?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="expectedAmount">Expected Incentive Amount</Label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-muted-foreground">$</span>
              <Input
                id="expectedAmount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={expectedAmount}
                onChange={(e) => setExpectedAmount(e.target.value)}
                className="max-w-[150px]"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="justification">Why should it be different?</Label>
            <Textarea
              id="justification"
              placeholder="Explain why you believe you should have received a different amount..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              className="mt-1"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-amber-900 dark:text-amber-100">
                Still have questions?
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                If the comparison helps clarify things, you can close this inquiry. Otherwise,
                continue to build your case for review.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onUnderstood}>
            <CheckCircle className="h-4 w-4 mr-2" />
            I understand now
          </Button>
          <Button onClick={onContinue} disabled={!expectedAmount}>
            I want to report this
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// STEP 3: Build Case
// ============================================

interface Step3Props {
  category: DisputeCategory;
  setCategory: (value: DisputeCategory) => void;
  justification: string;
  setJustification: (value: string) => void;
  expectedAmount: string;
  isSubmitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
}

function Step3BuildCase({
  category,
  setCategory,
  justification,
  setJustification,
  expectedAmount,
  isSubmitting,
  onSubmit,
  onBack,
}: Step3Props) {
  const { format: formatCurrencyNum } = useCurrency();
  const formatCurrency = (value: string) => {
    const num = parseFloat(value) || 0;
    return formatCurrencyNum(num);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Build Your Case
          </CardTitle>
          <CardDescription>
            Provide the details we need to investigate your concern.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="category">Issue Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as DisputeCategory)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DISPUTE_CATEGORIES).map(([key, { label, description }]) => (
                  <SelectItem key={key} value={key}>
                    <div>
                      <div className="font-medium">{label}</div>
                      <div className="text-xs text-muted-foreground">{description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category-specific fields */}
          {category === 'wrong_attribution' && (
            <Card className="bg-orange-50 border-orange-200 dark:bg-orange-900/20">
              <CardContent className="pt-4">
                <div className="text-sm">
                  <strong>Attribution Issue Detected:</strong> This transaction was credited to
                  James Wilson (100%) but you should have received 50% credit.
                </div>
              </CardContent>
            </Card>
          )}

          <div>
            <Label htmlFor="justification2">Your Explanation</Label>
            <Textarea
              id="justification2"
              placeholder="Describe what happened and why you believe the attribution is incorrect..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              className="mt-1"
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {/* Summary Card */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="text-lg">Dispute Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Category</span>
              <Badge variant="secondary">{DISPUTE_CATEGORIES[category].label}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expected Amount</span>
              <span className="font-bold">{formatCurrency(expectedAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current Amount</span>
              <span className="font-medium">$0.00</span>
            </div>
            <div className="flex justify-between border-t pt-3">
              <span className="text-muted-foreground">Difference Claimed</span>
              <span className="font-bold text-primary">{formatCurrency(expectedAmount)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button
          onClick={onSubmit}
          disabled={!justification || isSubmitting}
          className="gap-2"
        >
          {isSubmitting ? (
            <>
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Submit Dispute
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
