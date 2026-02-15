'use client';

/**
 * LandscapeNode — Zoom Level 1: Large unit nodes with population density
 *
 * Shows the entire organization at a glance. Color intensity = population density.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Entity } from '@/lib/supabase/database.types';
import { Building2, Users } from 'lucide-react';

interface LandscapeNodeData {
  entity: Entity;
  childCount: number;
  depth: number;
  [key: string]: unknown;
}

function LandscapeNodeComponent({ data }: NodeProps) {
  const { entity, childCount } = data as unknown as LandscapeNodeData;
  const density = Math.min(1, childCount / 20);
  const bgOpacity = 0.1 + density * 0.4;

  const statusColor = entity.status === 'active'
    ? 'hsl(142, 71%, 45%)'
    : entity.status === 'proposed'
      ? 'hsl(38, 92%, 50%)'
      : 'hsl(0, 0%, 60%)';

  return (
    <div
      className="rounded-xl border-2 px-6 py-4 min-w-[200px] cursor-pointer transition-shadow hover:shadow-lg"
      style={{
        backgroundColor: `hsla(217, 91%, 60%, ${bgOpacity})`,
        borderColor: 'hsl(217, 91%, 60%)',
      }}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />

      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-blue-600" />
        <div>
          <div className="font-semibold text-sm text-foreground">
            {entity.display_name}
          </div>
          <div className="text-xs text-muted-foreground">
            {entity.entity_type}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{childCount}</span>
        <span
          className="ml-auto h-2 w-2 rounded-full"
          style={{ backgroundColor: statusColor }}
        />
      </div>

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

export const LandscapeNode = memo(LandscapeNodeComponent);
