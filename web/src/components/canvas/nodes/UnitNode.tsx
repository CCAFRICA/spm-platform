'use client';

/**
 * UnitNode — Zoom Level 2: Store/branch nodes with entity counts
 *
 * Shows internal structure of a unit. Manager initials avatar, status dot.
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

  const typeIconColor = entity.entity_type === 'location'
    ? '#34d399'
    : entity.entity_type === 'team'
      ? '#a78bfa'
      : '#818cf8';

  const TypeIcon = entity.entity_type === 'location'
    ? MapPin
    : entity.entity_type === 'team'
      ? Users
      : Shield;

  const statusColor = entity.status === 'active'
    ? '#34d399'
    : entity.status === 'proposed'
      ? '#fbbf24'
      : '#71717a';

  return (
    <div
      style={{
        background: 'rgba(24, 24, 27, 0.9)',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: '8px',
        padding: '12px 16px',
        minWidth: '180px',
        cursor: 'pointer',
        backdropFilter: 'blur(8px)',
        transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <TypeIcon size={16} style={{ color: typeIconColor, flexShrink: 0 }} />
        <span style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entity.display_name}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: statusColor,
            flexShrink: 0,
          }}
        />
      </div>

      {childCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
          <Users size={12} style={{ color: '#71717a' }} />
          <span style={{ color: '#71717a', fontSize: '11px' }}>{childCount} entities</span>
        </div>
      )}

      {entity.external_id && (
        <div style={{ color: '#52525b', fontSize: '10px', marginTop: '4px', fontFamily: 'monospace' }}>
          {entity.external_id}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export const UnitNode = memo(UnitNodeComponent);
