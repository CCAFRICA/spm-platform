/**
 * useCanvasData — Fetches entities + relationships from Supabase
 */

import { useState, useEffect, useCallback } from 'react';
import { useTenant } from '@/contexts/tenant-context';
import {
  getEntityGraph,
  searchEntities,
  type EntityGraph,
} from '@/lib/canvas/graph-service';
import type { Entity } from '@/lib/supabase/database.types';

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
      const data = await getEntityGraph(tenantId);

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
    return searchEntities(tenantId, query);
  }, [tenantId]);

  return { graph, isLoading, error, refresh: fetchGraph, search };
}
