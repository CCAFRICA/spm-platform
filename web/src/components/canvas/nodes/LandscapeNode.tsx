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

  const statusColor = entity.status === 'active'
    ? '#34d399'
    : entity.status === 'proposed'
      ? '#fbbf24'
      : '#71717a';

  return (
    <div
      style={{
        background: `rgba(15, 23, 42, ${0.8 + density * 0.15})`,
        border: '2px solid rgba(232, 168, 56, 0.4)',
        borderRadius: '12px',
        padding: '16px 24px',
        minWidth: '200px',
        cursor: 'pointer',
        backdropFilter: 'blur(8px)',
        transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Building2 size={24} style={{ color: '#E8A838', flexShrink: 0 }} />
        <div>
          <div style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 600 }}>
            {entity.display_name}
          </div>
          <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '2px' }}>
            {entity.entity_type}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
        <Users size={14} style={{ color: '#94a3b8' }} />
        <span style={{ color: '#94a3b8', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
          {childCount}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: statusColor,
          }}
        />
      </div>

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export const LandscapeNode = memo(LandscapeNodeComponent);
