/**
 * useCanvasLayout — Computes React Flow nodes/edges from graph data
 */

import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { EntityGraph } from '@/lib/canvas/graph-service';
import { computeLayout, type LayoutConfig, type ZoomLevel } from '@/lib/canvas/layout-engine';

interface UseCanvasLayoutReturn {
  flowNodes: Node[];
  flowEdges: Edge[];
}

/**
 * Map zoom level to React Flow node type.
 */
function nodeTypeForZoom(zoomLevel: ZoomLevel): string {
  switch (zoomLevel) {
    case 'landscape': return 'landscapeNode';
    case 'unit': return 'unitNode';
    case 'team': return 'teamNode';
    case 'entity': return 'teamNode';
  }
}

export function useCanvasLayout(
  graph: EntityGraph | null,
  zoomLevel: ZoomLevel,
  layoutMode: LayoutConfig['mode'] = 'hierarchical'
): UseCanvasLayoutReturn {
  return useMemo(() => {
    if (!graph || graph.nodes.length === 0) {
      return { flowNodes: [], flowEdges: [] };
    }

    const layoutNodes = computeLayout(
      graph.nodes,
      graph.edges,
      graph.rootIds,
      { mode: layoutMode }
    );

    const layoutMap = new Map(layoutNodes.map(ln => [ln.id, ln]));
    const nodeType = nodeTypeForZoom(zoomLevel);

    const flowNodes: Node[] = graph.nodes.map(gn => {
      const layout = layoutMap.get(gn.id);
      return {
        id: gn.id,
        type: nodeType,
        position: {
          x: layout?.x || 0,
          y: layout?.y || 0,
        },
        data: {
          entity: gn.entity,
          childCount: gn.childCount,
          depth: gn.depth,
          zoomLevel,
        },
      };
    });

    const flowEdges: Edge[] = graph.edges.map(ge => {
      const rel = ge.relationship;
      const isConfirmed = rel.source === 'human_confirmed' || rel.source === 'human_created' || rel.source === 'imported_explicit';

      return {
        id: ge.id,
        source: ge.sourceId,
        target: ge.targetId,
        type: 'relationshipEdge',
        data: {
          relationship: rel,
          isConfirmed,
          confidence: rel.confidence,
        },
        animated: !isConfirmed,
        style: {
          strokeDasharray: isConfirmed ? undefined : '5 5',
          opacity: Math.max(0.3, rel.confidence),
        },
      };
    });

    return { flowNodes, flowEdges };
  }, [graph, zoomLevel, layoutMode]);
}
