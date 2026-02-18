/**
 * useCanvasData — Fetches entities + relationships from Supabase
 */

import { useState, useEffect, useCallback } from 'react';
import { useTenant } from '@/contexts/tenant-context';
import {
  type EntityGraph,
  type GraphNode,
  type GraphEdge,
} from '@/lib/canvas/graph-service';
import type { Entity, EntityRelationship } from '@/lib/supabase/database.types';

interface UseCanvasDataReturn {
  graph: EntityGraph | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  search: (query: string) => Promise<Entity[]>;
}

export function useCanvasData(
  filters?: { entityType?: string; status?: string }
): UseCanvasDataReturn {
  const { currentTenant } = useTenant();
  const [graph, setGraph] = useState<EntityGraph | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tenantId = currentTenant?.id || null;

  const fetchGraph = useCallback(async () => {
    if (!tenantId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch via API route (bypasses RLS for admin canvas view)
      const res = await fetch(`/api/canvas?tenant_id=${encodeURIComponent(tenantId)}`);
      if (!res.ok) throw new Error(`Canvas API returned ${res.status}`);
      const { entities, relationships } = await res.json();

      // Build graph structure from API response
      const entityList = (entities || []) as Entity[];
      const relList = (relationships || []) as EntityRelationship[];

      const parentMap = new Map<string, string>();
      const childCountMap = new Map<string, number>();
      for (const rel of relList) {
        if (rel.relationship_type === 'contains' || rel.relationship_type === 'manages') {
          parentMap.set(rel.target_entity_id, rel.source_entity_id);
          childCountMap.set(rel.source_entity_id, (childCountMap.get(rel.source_entity_id) || 0) + 1);
        }
      }

      const depthMap = new Map<string, number>();
      const getDepth = (entityId: string): number => {
        if (depthMap.has(entityId)) return depthMap.get(entityId)!;
        const parent = parentMap.get(entityId);
        if (!parent) { depthMap.set(entityId, 0); return 0; }
        const d = getDepth(parent) + 1;
        depthMap.set(entityId, d);
        return d;
      };
      for (const e of entityList) getDepth(e.id);

      const rootIds = entityList.filter(e => !parentMap.has(e.id)).map(e => e.id);
      const nodes: GraphNode[] = entityList.map(e => ({
        id: e.id,
        entity: e,
        childCount: childCountMap.get(e.id) || 0,
        depth: depthMap.get(e.id) || 0,
      }));
      const edges: GraphEdge[] = relList.map((r: EntityRelationship) => ({
        id: r.id,
        relationship: r,
        sourceId: r.source_entity_id,
        targetId: r.target_entity_id,
      }));

      const data: EntityGraph = { nodes, edges, rootIds };

      // Apply client-side filters if specified
      if (filters?.entityType || filters?.status) {
        data.nodes = data.nodes.filter(n => {
          if (filters.entityType && n.entity.entity_type !== filters.entityType) return false;
          if (filters.status && n.entity.status !== filters.status) return false;
          return true;
        });
        const nodeIds = new Set(data.nodes.map(n => n.id));
        data.edges = data.edges.filter(
          e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId)
        );
        data.rootIds = data.rootIds.filter(id => nodeIds.has(id));
      }

      setGraph(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entity graph');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, filters?.entityType, filters?.status]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  const search = useCallback(async (query: string): Promise<Entity[]> => {
    if (!tenantId || !query.trim()) return [];
    // Search within locally cached graph data
    if (!graph) return [];
    const q = query.toLowerCase();
    return graph.nodes
      .filter(n =>
        n.entity.display_name.toLowerCase().includes(q) ||
        (n.entity.external_id && n.entity.external_id.toLowerCase().includes(q))
      )
      .slice(0, 20)
      .map(n => n.entity);
  }, [tenantId, graph]);

  return { graph, isLoading, error, refresh: fetchGraph, search };
}
