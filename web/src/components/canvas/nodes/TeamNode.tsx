'use client';

/**
 * TeamNode — Zoom Level 3/4: Entity tiles with initials avatar
 *
 * At team zoom: compact tiles with initials + name + status
 * At entity zoom: adds external_id, variant badge
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Entity } from '@/lib/supabase/database.types';

interface TeamNodeData {
  entity: Entity;
  childCount: number;
  depth: number;
  zoomLevel?: string;
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
  const { entity, childCount, zoomLevel } = data as unknown as TeamNodeData;
  const initials = getInitials(entity.display_name);
  const isEntityZoom = zoomLevel === 'entity';

  const statusColor = entity.status === 'active'
    ? '#34d399'
    : entity.status === 'proposed'
      ? '#fbbf24'
      : '#71717a';

  const typeLabel = entity.entity_type === 'individual' ? '' : entity.entity_type;

  return (
    <div
      style={{
        background: 'rgba(24, 24, 27, 0.9)',
        border: '1px solid rgba(99, 102, 241, 0.25)',
        borderRadius: '6px',
        padding: isEntityZoom ? '10px 12px' : '8px 12px',
        minWidth: isEntityZoom ? '180px' : '150px',
        cursor: 'pointer',
        backdropFilter: 'blur(8px)',
        transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            width: isEntityZoom ? '32px' : '28px',
            height: isEntityZoom ? '32px' : '28px',
            borderRadius: '50%',
            background: 'rgba(99, 102, 241, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: isEntityZoom ? '12px' : '11px',
            fontWeight: 600,
            color: '#818cf8',
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entity.display_name}
          </div>
          {typeLabel && (
            <div style={{ color: '#71717a', fontSize: '10px' }}>{typeLabel}</div>
          )}
        </div>
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: statusColor,
            flexShrink: 0,
          }}
        />
      </div>

      {/* Entity-level detail: external_id + report count */}
      {isEntityZoom && (
        <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(63, 63, 70, 0.4)' }}>
          {entity.external_id && (
            <div style={{ color: '#52525b', fontSize: '10px', fontFamily: 'monospace' }}>
              ID: {entity.external_id}
            </div>
          )}
          {childCount > 0 && (
            <div style={{ color: '#71717a', fontSize: '10px', marginTop: '2px' }}>
              {childCount} reports
            </div>
          )}
        </div>
      )}

      {!isEntityZoom && childCount > 0 && (
        <div style={{ color: '#71717a', fontSize: '10px', marginTop: '4px' }}>
          {childCount} reports
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export const TeamNode = memo(TeamNodeComponent);
