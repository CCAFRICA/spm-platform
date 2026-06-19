'use client';

/**
 * OB-219 — Commission Statement page.
 * Route: /operate/statement/[entityId]/[periodId]
 * Admin drill-down: /operate/results → entity → this statement → per-transaction detail.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText } from 'lucide-react';
import { useTenant } from '@/contexts/tenant-context';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { CardGridSkeleton } from '@/components/ui/skeleton-loaders';
import { CommissionStatementView } from '@/components/compensation/CommissionStatementView';
import type { CommissionStatement } from '@/lib/compensation/commission-statement';

export default function CommissionStatementPage() {
  const params = useParams();
  const router = useRouter();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const entityId = params?.entityId as string;
  const periodId = params?.periodId as string;

  const [statement, setStatement] = useState<CommissionStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || !entityId || !periodId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/compensation/statement?tenantId=${encodeURIComponent(tenantId)}&entityId=${encodeURIComponent(entityId)}&periodId=${encodeURIComponent(periodId)}`,
        );
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || 'Failed to load commission statement');
          setStatement(null);
        } else {
          setStatement(json.statement);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load commission statement');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, entityId, periodId]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/operate/results')}
        className="text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Results
      </Button>

      {loading ? (
        <CardGridSkeleton count={3} />
      ) : error ? (
        <EmptyState icon={FileText} title="Commission statement unavailable" description={error} />
      ) : !statement ? (
        <EmptyState
          icon={FileText}
          title="No statement"
          description="No calculation results for this entity and period."
        />
      ) : (
        <CommissionStatementView statement={statement} />
      )}
    </div>
  );
}
