'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { User, Users, AlertTriangle, CheckCircle, ArrowRight, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttributionPerson {
  id: string;
  name: string;
  role?: string;
  percentage: number;
}

interface AttributionDetailsProps {
  creditedTo: AttributionPerson[];
  expectedCredits?: AttributionPerson[];
  isSplit?: boolean;
  hasDispute?: boolean;
  disputeEligible?: boolean;
  notes?: string;
  currentUserId: string;
  onReportProblem?: () => void;
}

export function AttributionDetails({
  creditedTo,
  expectedCredits,
  isSplit = false,
  hasDispute = false,
  disputeEligible = true,
  notes,
  currentUserId,
  onReportProblem,
}: AttributionDetailsProps) {
  const currentUserCredit = creditedTo.find((c) => c.id === currentUserId);
  const currentUserExpected = expectedCredits?.find((c) => c.id === currentUserId);

  const hasAttributionError =
    currentUserExpected &&
    currentUserCredit?.percentage !== currentUserExpected.percentage;

  const isMissingCredit = !currentUserCredit && currentUserExpected;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5" />
          Attribution
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Attribution Warning */}
        {(hasAttributionError || isMissingCredit) && (
          <Alert variant="destructive" className="border-orange-300 bg-orange-50 text-orange-900 dark:bg-orange-900/20 dark:text-orange-100 dark:border-orange-700">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Attribution Discrepancy Detected</AlertTitle>
            <AlertDescription>
              {isMissingCredit
                ? `You should have received ${currentUserExpected?.percentage}% credit for this transaction but received 0%.`
                : `You received ${currentUserCredit?.percentage}% credit but should have received ${currentUserExpected?.percentage}%.`}
            </AlertDescription>
          </Alert>
        )}

        {/* Split Indicator */}
        {isSplit && (
          <Badge variant="secondary" className="flex items-center gap-1 w-fit">
            <Users className="h-3 w-3" />
            Split Transaction
          </Badge>
        )}

        {/* Current Attribution */}
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-2">
            Credited To:
          </div>
          <div className="space-y-2">
            {creditedTo.map((person) => {
              const isCurrentUser = person.id === currentUserId;
              const wasExpectedMore =
                currentUserExpected && isCurrentUser && currentUserExpected.percentage > person.percentage;

              return (
                <div
                  key={person.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border',
                    isCurrentUser
                      ? wasExpectedMore
                        ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-700'
                        : 'bg-primary/5 border-primary/20'
                      : 'bg-muted/30'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center',
                        isCurrentUser ? 'bg-primary/20' : 'bg-muted'
                      )}
                    >
                      <User className={cn('h-4 w-4', isCurrentUser && 'text-primary')} />
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {person.name}
                        {isCurrentUser && <Badge variant="outline" className="text-xs">You</Badge>}
                      </div>
                      {person.role && (
                        <div className="text-xs text-muted-foreground">{person.role}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn('text-lg font-bold', wasExpectedMore && 'text-orange-600')}>
                      {person.percentage}%
                    </div>
                    {wasExpectedMore && (
                      <div className="text-xs text-orange-600">
                        Expected: {currentUserExpected?.percentage}%
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Show missing user if they were expected but got 0% */}
            {isMissingCredit && currentUserExpected && (
              <div className="flex items-center justify-between p-3 rounded-lg border border-dashed border-orange-300 bg-orange-50/50 dark:bg-orange-900/10">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center">
                    <User className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <div className="font-medium flex items-center gap-2 text-orange-700">
                      {currentUserExpected.name}
                      <Badge variant="outline" className="text-xs border-orange-300 text-orange-600">You</Badge>
                    </div>
                    <div className="text-xs text-orange-600">Not credited (should be {currentUserExpected.percentage}%)</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-orange-600">0%</div>
                  <div className="text-xs text-orange-600">
                    Expected: {currentUserExpected.percentage}%
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        {notes && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="text-xs font-medium text-muted-foreground mb-1">Note:</div>
            <div className="text-sm">{notes}</div>
          </div>
        )}

        {/* No Issues */}
        {!hasAttributionError && !isMissingCredit && currentUserCredit && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle className="h-4 w-4" />
            <span>Your attribution appears correct</span>
          </div>
        )}

        {/* Report Problem Button */}
        {(hasAttributionError || isMissingCredit || disputeEligible) && (
          <div className="pt-2 border-t">
            {hasDispute ? (
              <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                <HelpCircle className="h-3 w-3" />
                Dispute In Progress
              </Badge>
            ) : (
              <Button
                variant={hasAttributionError || isMissingCredit ? 'default' : 'outline'}
                className={cn(
                  'gap-2',
                  (hasAttributionError || isMissingCredit) &&
                    'bg-orange-500 hover:bg-orange-600 text-white'
                )}
                onClick={onReportProblem}
              >
                <AlertTriangle className="h-4 w-4" />
                {hasAttributionError || isMissingCredit
                  ? 'Report Attribution Error'
                  : 'Report a Problem'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
