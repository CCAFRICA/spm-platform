'use client';

/**
 * RelationshipEdge — Typed, styled edges
 *
 * Solid = confirmed/imported. Dashed = AI proposed.
 * Confidence score label displayed on hover.
 * DS-001 inline styles.
 */

import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  type EdgeProps,
} from '@xyflow/react';
import type { EntityRelationship } from '@/lib/supabase/database.types';

interface RelationshipEdgeData {
  relationship: EntityRelationship;
  isConfirmed: boolean;
  confidence: number;
  [key: string]: unknown;
}

function RelationshipEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  style = {},
}: EdgeProps) {
  const edgeData = data as unknown as RelationshipEdgeData;
  const { isConfirmed, confidence, relationship } = edgeData;

  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const strokeColor = isConfirmed ? '#6366f1' : '#f59e0b';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth: isConfirmed ? 2 : 1.5,
          strokeDasharray: isConfirmed ? undefined : '6 4',
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            fontSize: '9px',
            color: '#71717a',
            background: 'rgba(10, 14, 26, 0.9)',
            padding: '1px 4px',
            borderRadius: '3px',
            pointerEvents: 'none',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {relationship.relationship_type}
          {!isConfirmed && (
            <span style={{ marginLeft: '4px', opacity: 0.7 }}>
              {(confidence * 100).toFixed(0)}%
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const RelationshipEdge = memo(RelationshipEdgeComponent);
