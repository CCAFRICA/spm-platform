'use client';

/**
 * TeamNode — Zoom Level 3: Entity tiles clustered by variant/performance
 *
 * Shows every entity in the team. Compact tiles with status indicators.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Entity } from '@/lib/supabase/database.types';

interface TeamNodeData {
  entity: Entity;
  childCount: number;
  depth: number;
  [key: string]: unknown;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function TeamNodeComponent({ data }: NodeProps) {
  const { entity, childCount } = data as unknown as TeamNodeData;
  const initials = getInitials(entity.display_name);

  const statusDot = entity.status === 'active'
    ? 'bg-emerald-500'
    : entity.status === 'proposed'
      ? 'bg-amber-500'
      : 'bg-gray-400';

  const typeLabel = entity.entity_type === 'individual' ? '' : entity.entity_type;

  return (
    <div className="rounded-md border bg-card px-3 py-2 min-w-[150px] shadow-sm cursor-pointer transition-all hover:shadow-md hover:border-primary/50 group">
      <Handle type="target" position={Position.Top} className="opacity-0" />

      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{entity.display_name}</div>
          {typeLabel && (
            <div className="text-[10px] text-muted-foreground">{typeLabel}</div>
          )}
        </div>
        <span className={`h-2 w-2 rounded-full shrink-0 ${statusDot}`} />
      </div>

      {childCount > 0 && (
        <div className="text-[10px] text-muted-foreground mt-1">
          {childCount} reports
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

export const TeamNode = memo(TeamNodeComponent);
