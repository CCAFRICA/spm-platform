'use client';

/**
 * OB-224 — DrillThroughPanel: the orchestrator and the single embeddable unit.
 *
 * Manages the progressive-disclosure state machine via useDrillThrough (one entity expanded at a
 * time, auto-reset when period/batch changes). Selecting an entity injects ComponentCards directly
 * beneath its row (Intuitive Adjacency); ComponentCards then self-manages the deeper source-data and
 * dispute expansions. This is the component every surface embeds (AP-17 single code path).
 */
import { useEffect } from 'react';
import { useDrillThrough } from '@/hooks/useDrillThrough';
import { EntityResultsList } from './EntityResultsList';
import { ComponentCards } from './ComponentCards';
import type { EntityScope } from '@/lib/drill-through';

interface Props {
  tenantId: string;
  scope: EntityScope;
  periodId?: string;
  batchId?: string;
  initialEntityId?: string;
  /** Reconciliation context: entityId → componentName → { expected, delta }. */
  comparisonData?: Record<string, Record<string, { expected: number; delta: number }>>;
  compact?: boolean;
  showExport?: boolean;
  emptyMessage?: string;
}

export function DrillThroughPanel({
  tenantId, scope, periodId, batchId, initialEntityId, comparisonData, compact, showExport, emptyMessage,
}: Props) {
  const entityDrill = useDrillThrough<string>(`${periodId ?? ''}|${batchId ?? ''}`);

  // Open directly to a specific entity when requested (e.g. /stream "Top Accelerator" click).
  useEffect(() => {
    if (initialEntityId) entityDrill.open(initialEntityId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEntityId]);

  return (
    <EntityResultsList
      tenantId={tenantId}
      scope={scope}
      periodId={periodId}
      batchId={batchId}
      showExport={showExport}
      compact={compact}
      emptyMessage={emptyMessage}
      selectedEntityId={entityDrill.target ?? undefined}
      expandedEntityId={entityDrill.target ?? undefined}
      onEntitySelect={(id) => (entityDrill.target === id ? entityDrill.close() : entityDrill.open(id))}
      renderExpanded={(id, result) => (
        <ComponentCards
          tenantId={tenantId}
          entityId={id}
          periodId={result.periodId}
          batchId={batchId}
          entityName={result.displayName}
          periodLabel={result.periodLabel}
          comparisonData={comparisonData?.[id]}
        />
      )}
    />
  );
}
