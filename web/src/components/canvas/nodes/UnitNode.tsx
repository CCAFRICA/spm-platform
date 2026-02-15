'use client';

/**
 * UnitNode — Zoom Level 2: Store/branch nodes with entity counts
 *
 * Shows internal structure of a unit. Manager names, rule set indicators.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Entity } from '@/lib/supabase/database.types';
import { MapPin, Users, Shield } from 'lucide-react';

interface UnitNodeData {
  entity: Entity;
  childCount: number;
  depth: number;
  [key: string]: unknown;
}

function UnitNodeComponent({ data }: NodeProps) {
  const { entity, childCount } = data as unknown as UnitNodeData;

  const typeIcon = entity.entity_type === 'location'
    ? <MapPin className="h-4 w-4 text-emerald-600" />
    : entity.entity_type === 'team'
      ? <Users className="h-4 w-4 text-violet-600" />
      : <Shield className="h-4 w-4 text-blue-600" />;

  const statusColor = entity.status === 'active'
    ? 'bg-emerald-500'
    : entity.status === 'proposed'
      ? 'bg-amber-500'
      : 'bg-gray-400';

  return (
    <div className="rounded-lg border bg-card px-4 py-3 min-w-[180px] shadow-sm cursor-pointer transition-all hover:shadow-md hover:border-primary/50">
      <Handle type="target" position={Position.Top} className="opacity-0" />

      <div className="flex items-center gap-2">
        {typeIcon}
        <span className="font-medium text-sm truncate">{entity.display_name}</span>
        <span className={`ml-auto h-2 w-2 rounded-full ${statusColor}`} />
      </div>

      {childCount > 0 && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <Users className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{childCount} entities</span>
        </div>
      )}

      {entity.external_id && (
        <div className="text-[10px] text-muted-foreground mt-1 font-mono">
          {entity.external_id}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

export const UnitNode = memo(UnitNodeComponent);
