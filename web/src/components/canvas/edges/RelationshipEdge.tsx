'use client';

/**
 * RelationshipEdge — Typed, styled edges
 *
 * Solid = confirmed/imported. Dashed = AI proposed.
 * Confidence score label displayed on hover.
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

  const strokeColor = isConfirmed ? 'hsl(217, 91%, 60%)' : 'hsl(38, 92%, 50%)';

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
          className="absolute text-[9px] text-muted-foreground bg-background/90 px-1 rounded pointer-events-none"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {relationship.relationship_type}
          {!isConfirmed && (
            <span className="ml-1 opacity-70">
              {(confidence * 100).toFixed(0)}%
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const RelationshipEdge = memo(RelationshipEdgeComponent);
