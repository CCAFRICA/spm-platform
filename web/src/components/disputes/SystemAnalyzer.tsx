'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Bot,
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Users,
  FileText,
  Loader2,
} from 'lucide-react';
import type { Dispute } from '@/types/dispute';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/contexts/tenant-context';

interface SystemAnalyzerProps {
  dispute: Dispute;
  onAnalysisComplete?: (analysis: AnalysisResult) => void;
  formatCurrency?: (value: number) => string;
}

export interface AnalysisResult {
  recommendation: 'approve' | 'partial' | 'deny' | 'needs_review';
  confidence: number;
  suggestedAmount: number;
  findings: Finding[];
  similarCases: SimilarCase[];
  riskFactors: RiskFactor[];
}

interface Finding {
  type: 'positive' | 'negative' | 'neutral';
  title: string;
  description: string;
}

interface SimilarCase {
  id: string;
  category: string;
  outcome: string;
  amount: number;
  similarity: number;
}

interface RiskFactor {
  factor: string;
  level: 'low' | 'medium' | 'high';
  description: string;
}

// Mock analysis based on dispute data
function generateAnalysis(dispute: Dispute): AnalysisResult {
  // For the demo, Maria's attribution dispute should show strong evidence
  const isMariaDispute = dispute.employeeId === 'maria-rodriguez';

  if (dispute.category === 'wrong_attribution' && isMariaDispute) {
    return {
      recommendation: 'approve',
      confidence: 92,
      suggestedAmount: 42.5,
      findings: [
        {
          type: 'positive',
          title: 'POS System Logs Confirm Joint Sale',
          description: 'Transaction logs show Maria Rodriguez logged into POS terminal during initial customer consultation (10:15 AM - 10:32 AM).',
        },
        {
          type: 'positive',
          title: 'Customer Interaction Records',
          description: 'CRM notes indicate Maria conducted product demonstration and needs assessment before handoff.',
        },
        {
          type: 'positive',
          title: 'Consistent with Store Policy',
          description: 'Store 101 policy requires 50/50 split for assisted sales with documented handoff.',
        },
        {
          type: 'neutral',
          title: 'Attribution Override Detected',
          description: 'System shows manual attribution change at 10:45 AM by shift supervisor.',
        },
      ],
      similarCases: [
        { id: 'DSP-2024-0892', category: 'wrong_attribution', outcome: 'approved', amount: 38.50, similarity: 94 },
        { id: 'DSP-2024-0756', category: 'wrong_attribution', outcome: 'approved', amount: 45.00, similarity: 87 },
        { id: 'DSP-2024-0621', category: 'wrong_attribution', outcome: 'partial', amount: 22.75, similarity: 72 },
      ],
      riskFactors: [
        { factor: 'Employee History', level: 'low', description: 'First dispute filed by this employee in 12 months' },
        { factor: 'Documentation', level: 'low', description: 'Strong supporting evidence from system logs' },
        { factor: 'Amount', level: 'low', description: 'Claim amount is within expected range for this transaction type' },
      ],
    };
  }

  // Default analysis for other disputes
  return {
    recommendation: 'needs_review',
    confidence: 65,
    suggestedAmount: dispute.expectedAmount * 0.5,
    findings: [
      {
        type: 'neutral',
        title: 'Standard Review Required',
        description: 'This dispute requires manual review of supporting documentation.',
      },
    ],
    similarCases: [],
    riskFactors: [
      { factor: 'Documentation', level: 'medium', description: 'Limited automated evidence available' },
    ],
  };
}

export function SystemAnalyzer({ dispute, onAnalysisComplete, formatCurrency: formatCurrencyProp }: SystemAnalyzerProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [progress, setProgress] = useState(0);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const { format: formatCurrencyHook } = useCurrency();

  useEffect(() => {
    // Simulate analysis progress
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + Math.random() * 15;
      });
    }, 200);

    // Complete analysis after animation
    const timer = setTimeout(() => {
      const result = generateAnalysis(dispute);
      setAnalysis(result);
      setIsAnalyzing(false);
      onAnalysisComplete?.(result);
    }, 1500);

    return () => {
      clearInterval(progressInterval);
      clearTimeout(timer);
    };
  }, [dispute, onAnalysisComplete]);

  const getRecommendationColor = (rec: string) => {
    switch (rec) {
      case 'approve':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'partial':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
      case 'deny':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    }
  };

  const getRecommendationLabel = (rec: string) => {
    switch (rec) {
      case 'approve':
        return 'Approve';
      case 'partial':
        return 'Partial Approval';
      case 'deny':
        return 'Deny';
      default:
        return 'Needs Review';
    }
  };

  // Use provided formatter or tenant-aware default
  const formatCurrency = formatCurrencyProp || formatCurrencyHook;

  if (isAnalyzing) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Analyzing Dispute</h3>
              <p className="text-sm text-muted-foreground">
                Reviewing transaction logs, similar cases, and policy compliance...
              </p>
            </div>
          </div>
          <Progress value={Math.min(progress, 100)} className="h-2" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>Checking system logs...</span>
            <span>{Math.min(Math.round(progress), 100)}%</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!analysis) return null;

  return (
    <div className="space-y-4">
      {/* Recommendation Card */}
      <Card className="border-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">System Analysis</CardTitle>
            </div>
            <Badge className={getRecommendationColor(analysis.recommendation)}>
              {getRecommendationLabel(analysis.recommendation)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-3xl font-bold text-primary">{analysis.confidence}%</div>
              <div className="text-sm text-muted-foreground">Confidence</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-3xl font-bold text-green-600">
                {formatCurrency(analysis.suggestedAmount)}
              </div>
              <div className="text-sm text-muted-foreground">Suggested Amount</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-3xl font-bold">{analysis.findings.length}</div>
              <div className="text-sm text-muted-foreground">Evidence Items</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Findings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Key Findings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {analysis.findings.map((finding, index) => (
            <div
              key={index}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg',
                finding.type === 'positive' && 'bg-green-50 dark:bg-green-900/20',
                finding.type === 'negative' && 'bg-red-50 dark:bg-red-900/20',
                finding.type === 'neutral' && 'bg-muted/50'
              )}
            >
              {finding.type === 'positive' && (
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              )}
              {finding.type === 'negative' && (
                <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              )}
              {finding.type === 'neutral' && (
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              )}
              <div>
                <div className="font-medium">{finding.title}</div>
                <div className="text-sm text-muted-foreground">{finding.description}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Similar Cases */}
      {analysis.similarCases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Similar Past Cases
            </CardTitle>
            <CardDescription>
              Historical disputes with similar characteristics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analysis.similarCases.map((similarCase) => (
                <div
                  key={similarCase.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'h-2 w-2 rounded-full',
                        similarCase.outcome === 'approved' && 'bg-green-500',
                        similarCase.outcome === 'partial' && 'bg-amber-500',
                        similarCase.outcome === 'denied' && 'bg-red-500'
                      )}
                    />
                    <div>
                      <div className="font-medium text-sm">{similarCase.id}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {similarCase.outcome} - {formatCurrency(similarCase.amount)}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline">{similarCase.similarity}% match</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Risk Factors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Risk Assessment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {analysis.riskFactors.map((risk, index) => (
              <div key={index} className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{risk.factor}</div>
                  <div className="text-xs text-muted-foreground">{risk.description}</div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    risk.level === 'low' && 'border-green-500 text-green-600',
                    risk.level === 'medium' && 'border-amber-500 text-amber-600',
                    risk.level === 'high' && 'border-red-500 text-red-600'
                  )}
                >
                  {risk.level} risk
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
