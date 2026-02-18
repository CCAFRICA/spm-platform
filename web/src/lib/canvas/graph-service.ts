/**
 * Graph Service — Supabase queries for entity graph data
 *
 * Provides the data layer for the Organizational Canvas.
 * All queries filter by tenant_id and respect temporal bounds.
 */

import { createClient } from '@/lib/supabase/client';
import type { Entity, EntityRelationship } from '@/lib/supabase/database.types';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface GraphNode {
  id: string;
  entity: Entity;
  childCount: number;
  depth: number;
}

export interface GraphEdge {
  id: string;
  relationship: EntityRelationship;
  sourceId: string;
  targetId: string;
}

export interface EntityGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rootIds: string[];
}

export interface RelatedEntityInfo {
  relationship: EntityRelationship;
  relatedEntity: { id: string; display_name: string; entity_type: string } | null;
  direction: 'incoming' | 'outgoing';
}

export interface EntityCardData {
  entity: Entity;
  relationships: EntityRelationship[];
  relatedEntities: RelatedEntityInfo[];
  outcomes: {
    total_payout: number;
    component_breakdown: Record<string, unknown>[];
    period_id: string;
  } | null;
  ruleSetAssignments: Array<{ rule_set_id: string; effective_from: string | null }>;
}

// ──────────────────────────────────────────────
// Graph Queries
// ──────────────────────────────────────────────

/**
 * Get the full entity graph for a tenant.
 * Returns all entities + current relationships (effective_to IS NULL).
 */
export async function getEntityGraph(tenantId: string): Promise<EntityGraph> {
  const supabase = createClient();

  // Fetch all entities
  const { data: entities, error: entErr } = await supabase
    .from('entities')
    .select('*')
    .eq('tenant_id', tenantId);
  if (entErr) throw entErr;

  // Fetch current relationships (not end-dated)
  const { data: relationships, error: relErr } = await supabase
    .from('entity_relationships')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('effective_to', null);
  if (relErr) throw relErr;

  const entityList = (entities || []) as Entity[];
  const relList = (relationships || []) as EntityRelationship[];

  // Build parent map: for each entity, who is their parent (via 'contains' or 'manages')?
  const parentMap = new Map<string, string>();
  const childCountMap = new Map<string, number>();

  for (const rel of relList) {
    if (rel.relationship_type === 'contains' || rel.relationship_type === 'manages') {
      parentMap.set(rel.target_entity_id, rel.source_entity_id);
      childCountMap.set(
        rel.source_entity_id,
        (childCountMap.get(rel.source_entity_id) || 0) + 1
      );
    }
  }

  // Compute depth for each entity (root = 0)
  const depthMap = new Map<string, number>();
  function getDepth(entityId: string): number {
    if (depthMap.has(entityId)) return depthMap.get(entityId)!;
    const parent = parentMap.get(entityId);
    if (!parent) {
      depthMap.set(entityId, 0);
      return 0;
    }
    const d = getDepth(parent) + 1;
    depthMap.set(entityId, d);
    return d;
  }
  for (const e of entityList) getDepth(e.id);

  // Find root IDs (no parent)
  const rootIds = entityList
    .filter(e => !parentMap.has(e.id))
    .map(e => e.id);

  const nodes: GraphNode[] = entityList.map(e => ({
    id: e.id,
    entity: e,
    childCount: childCountMap.get(e.id) || 0,
    depth: depthMap.get(e.id) || 0,
  }));

  const edges: GraphEdge[] = relList.map(r => ({
    id: r.id,
    relationship: r,
    sourceId: r.source_entity_id,
    targetId: r.target_entity_id,
  }));

  return { nodes, edges, rootIds };
}

/**
 * Get direct children of an entity in the hierarchy.
 */
export async function getEntityChildren(
  tenantId: string,
  entityId: string
): Promise<Entity[]> {
  const supabase = createClient();
  const { data: rels, error: relErr } = await supabase
    .from('entity_relationships')
    .select('target_entity_id')
    .eq('tenant_id', tenantId)
    .eq('source_entity_id', entityId)
    .in('relationship_type', ['contains', 'manages'])
    .is('effective_to', null);
  if (relErr) throw relErr;

  const childIds = (rels || []).map(r => r.target_entity_id);
  if (childIds.length === 0) return [];

  const { data: entities, error: entErr } = await supabase
    .from('entities')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('id', childIds);
  if (entErr) throw entErr;

  return (entities || []) as Entity[];
}

/**
 * Get all relationships for a single entity (both directions).
 */
export async function getEntityRelationships(
  tenantId: string,
  entityId: string
): Promise<EntityRelationship[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('entity_relationships')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`)
    .is('effective_to', null);
  if (error) throw error;
  return (data || []) as EntityRelationship[];
}

/**
 * Get full entity card data including outcomes and rule set assignments.
 */
export async function getEntityCard(
  tenantId: string,
  entityId: string
): Promise<EntityCardData | null> {
  const supabase = createClient();

  // Fetch entity
  const { data: entity, error: entErr } = await supabase
    .from('entities')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', entityId)
    .single();
  if (entErr) return null;

  // Fetch relationships
  const relationships = await getEntityRelationships(tenantId, entityId);

  // Resolve related entity names
  const relatedIds = relationships.map(r =>
    r.source_entity_id === entityId ? r.target_entity_id : r.source_entity_id
  );
  const uniqueRelatedIds = Array.from(new Set(relatedIds)).filter(Boolean);

  const relatedEntityMap = new Map<string, { id: string; display_name: string; entity_type: string }>();
  if (uniqueRelatedIds.length > 0) {
    const { data: relatedRows } = await supabase
      .from('entities')
      .select('id, display_name, entity_type')
      .in('id', uniqueRelatedIds);
    for (const r of (relatedRows || [])) {
      relatedEntityMap.set(r.id, r);
    }
  }

  const relatedEntities: RelatedEntityInfo[] = relationships.map(r => {
    const isOutgoing = r.source_entity_id === entityId;
    const relatedId = isOutgoing ? r.target_entity_id : r.source_entity_id;
    return {
      relationship: r,
      relatedEntity: relatedEntityMap.get(relatedId) || null,
      direction: isOutgoing ? 'outgoing' : 'incoming',
    };
  });

  // Fetch latest outcomes
  const { data: outcomes } = await supabase
    .from('entity_period_outcomes')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(1);

  const outcome = outcomes && outcomes.length > 0 ? {
    total_payout: Number(outcomes[0].total_payout) || 0,
    component_breakdown: (outcomes[0].component_breakdown || []) as Record<string, unknown>[],
    period_id: outcomes[0].period_id,
  } : null;

  // Fetch rule set assignments
  const { data: assignments } = await supabase
    .from('rule_set_assignments')
    .select('rule_set_id, effective_from')
    .eq('tenant_id', tenantId)
    .eq('entity_id', entityId);

  return {
    entity: entity as Entity,
    relationships,
    relatedEntities,
    outcomes: outcome,
    ruleSetAssignments: (assignments || []) as Array<{ rule_set_id: string; effective_from: string | null }>,
  };
}

/**
 * Search entities by name or external_id.
 */
export async function searchEntities(
  tenantId: string,
  query: string
): Promise<Entity[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('entities')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(`display_name.ilike.%${query}%,external_id.ilike.%${query}%`)
    .limit(20);
  if (error) throw error;
  return (data || []) as Entity[];
}
