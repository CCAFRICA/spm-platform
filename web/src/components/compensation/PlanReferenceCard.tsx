'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, ExternalLink, Calendar, Shield } from 'lucide-react';

interface PlanReferenceCardProps {
  ruleSetId: string;
  ruleSetName: string;
  ruleSetVersion: number;
  variantName?: string;
  effectiveDate?: string;
  showLink?: boolean;
  compact?: boolean;
}

export function PlanReferenceCard({
  ruleSetId,
  ruleSetName,
  ruleSetVersion,
  variantName,
  effectiveDate,
  showLink = true,
  compact = false,
}: PlanReferenceCardProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Plan:</span>
        <span className="font-medium">{ruleSetName}</span>
        <Badge variant="outline" className="text-xs">v{ruleSetVersion}</Badge>
        {showLink && (
          <Link href={`/performance/plans/${ruleSetId}`} className="text-primary hover:underline">
            View
          </Link>
        )}
      </div>
    );
  }

  return (
    <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{ruleSetName}</span>
                <Badge variant="secondary" className="text-xs">v{ruleSetVersion}</Badge>
              </div>
              {variantName && (
                <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                  <Shield className="h-3 w-3" />
                  <span>{variantName}</span>
                </div>
              )}
              {effectiveDate && (
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>Effective: {formatDate(effectiveDate)}</span>
                </div>
              )}
            </div>
          </div>
          {showLink && (
            <Link href={`/performance/plans/${ruleSetId}`}>
              <Button variant="outline" size="sm" className="gap-1">
                <ExternalLink className="h-3 w-3" />
                View Plan
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
