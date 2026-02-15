/**
 * Entity Service — Domain-agnostic entity CRUD, temporal resolution, graph traversal
 *
 * HG-11: EntityService exists with CRUD, temporal attribute resolution,
 * and graph traversal.
 *
 * Dual-mode: Supabase when configured, localStorage fallback for demo.
 */

import { isSupabaseConfigured, createClient } from './client';
import type {
  Database,
  Entity,
  EntityRelationship,
  ReassignmentEvent,
  PeriodEntityState,
  ProfileScope,
  Json,
  EntityType,
  EntityStatus,
} from './database.types';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface TemporalAttribute {
  key: string;
  value: Json;
  effective_from: string;
  effective_to: string | null;
  source?: string;
}

export interface ResolvedEntity {
  id: string;
  tenant_id: string;
  entity_type: string;
  status: string;
  external_id: string | null;
  display_name: string;
  profile_id: string | null;
  metadata: Record<string, unknown>;
  /** Resolved attributes for the given date — flattened from temporal history */
  resolved_attributes: Record<string, Json>;
  /** Direct relationships */
  relationships: EntityRelationship[];
}

export interface GraphTraversalResult {
  entity: Entity;
  depth: number;
  path: string[];
  relationship_type: string;
}

// ──────────────────────────────────────────────
// localStorage fallback keys
// ──────────────────────────────────────────────
const ENTITIES_KEY = (tenantId: string) => `vialuce_entities_${tenantId}`;
const RELATIONSHIPS_KEY = (tenantId: string) => `vialuce_entity_relationships_${tenantId}`;
const REASSIGNMENTS_KEY = (tenantId: string) => `vialuce_reassignment_events_${tenantId}`;

function loadLocal<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocal<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
}

// ──────────────────────────────────────────────
// Entity CRUD
// ──────────────────────────────────────────────

export async function createEntity(
  tenantId: string,
  entity: Omit<Entity, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>
): Promise<Entity> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const insertRow: Database['public']['Tables']['entities']['Insert'] = {
      tenant_id: tenantId,
      entity_type: entity.entity_type as EntityType,
      status: entity.status as EntityStatus,
      external_id: entity.external_id,
      display_name: entity.display_name,
      profile_id: entity.profile_id,
      temporal_attributes: entity.temporal_attributes,
      metadata: entity.metadata,
    };
    const { data, error } = await supabase
      .from('entities')
      .insert(insertRow)
      .select()
      .single();
    if (error) throw error;
    return data as Entity;
  }

  // localStorage fallback
  const now = new Date().toISOString();
  const newEntity: Entity = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    entity_type: entity.entity_type || 'individual',
    status: entity.status || 'active',
    external_id: entity.external_id || null,
    display_name: entity.display_name,
    profile_id: entity.profile_id || null,
    temporal_attributes: entity.temporal_attributes || [],
    metadata: entity.metadata || {},
    created_at: now,
    updated_at: now,
  };
  const all = loadLocal<Entity>(ENTITIES_KEY(tenantId));
  all.push(newEntity);
  saveLocal(ENTITIES_KEY(tenantId), all);
  return newEntity;
}

export async function getEntity(tenantId: string, entityId: string): Promise<Entity | null> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('entities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', entityId)
      .single();
    if (error) return null;
    return data as Entity;
  }

  const all = loadLocal<Entity>(ENTITIES_KEY(tenantId));
  return all.find(e => e.id === entityId) || null;
}

export async function listEntities(
  tenantId: string,
  filters?: { entity_type?: string; status?: string; external_id?: string }
): Promise<Entity[]> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    let query = supabase.from('entities').select('*').eq('tenant_id', tenantId);
    if (filters?.entity_type) query = query.eq('entity_type', filters.entity_type as EntityType);
    if (filters?.status) query = query.eq('status', filters.status as EntityStatus);
    if (filters?.external_id) query = query.eq('external_id', filters.external_id);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Entity[];
  }

  let all = loadLocal<Entity>(ENTITIES_KEY(tenantId));
  if (filters?.entity_type) all = all.filter(e => e.entity_type === filters.entity_type);
  if (filters?.status) all = all.filter(e => e.status === filters.status);
  if (filters?.external_id) all = all.filter(e => e.external_id === filters.external_id);
  return all;
}

export async function updateEntity(
  tenantId: string,
  entityId: string,
  updates: Partial<Pick<Entity, 'display_name' | 'status' | 'entity_type' | 'external_id' | 'profile_id' | 'temporal_attributes' | 'metadata'>>
): Promise<Entity> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const updateRow: Database['public']['Tables']['entities']['Update'] = updates as Database['public']['Tables']['entities']['Update'];
    const { data, error } = await supabase
      .from('entities')
      .update(updateRow)
      .eq('tenant_id', tenantId)
      .eq('id', entityId)
      .select()
      .single();
    if (error) throw error;
    return data as Entity;
  }

  const all = loadLocal<Entity>(ENTITIES_KEY(tenantId));
  const idx = all.findIndex(e => e.id === entityId);
  if (idx === -1) throw new Error(`Entity ${entityId} not found`);
  all[idx] = { ...all[idx], ...updates, updated_at: new Date().toISOString() };
  saveLocal(ENTITIES_KEY(tenantId), all);
  return all[idx];
}

export async function deleteEntity(tenantId: string, entityId: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const { error } = await supabase
      .from('entities')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', entityId);
    if (error) throw error;
    return;
  }

  const all = loadLocal<Entity>(ENTITIES_KEY(tenantId));
  saveLocal(ENTITIES_KEY(tenantId), all.filter(e => e.id !== entityId));
}

/**
 * Find or create entity by external_id — used during data import.
 * Auto-creates entity if not found.
 */
export async function findOrCreateEntity(
  tenantId: string,
  externalId: string,
  defaults: { display_name: string; entity_type?: string; metadata?: Record<string, unknown> }
): Promise<Entity> {
  const existing = await listEntities(tenantId, { external_id: externalId });
  if (existing.length > 0) return existing[0];

  return createEntity(tenantId, {
    external_id: externalId,
    display_name: defaults.display_name,
    entity_type: (defaults.entity_type || 'individual') as Entity['entity_type'],
    status: 'active' as Entity['status'],
    profile_id: null,
    temporal_attributes: [],
    metadata: (defaults.metadata || {}) as Json,
  });
}

// ──────────────────────────────────────────────
// Temporal Attribute Resolution
// ──────────────────────────────────────────────

/**
 * Resolve temporal attributes for an entity at a given date.
 * For each key, returns the value from the most recent effective period.
 */
export function resolveTemporalAttributes(
  entity: Entity,
  asOfDate: string = new Date().toISOString().split('T')[0]
): Record<string, Json> {
  const attrs = (entity.temporal_attributes || []) as unknown as TemporalAttribute[];
  const resolved: Record<string, Json> = {};

  // Sort by effective_from descending to get most recent first
  const sorted = [...attrs].sort((a, b) =>
    (b.effective_from || '').localeCompare(a.effective_from || '')
  );

  for (const attr of sorted) {
    // Skip if we already have a more recent value for this key
    if (attr.key in resolved) continue;

    // Check if within effective range
    const from = attr.effective_from;
    const to = attr.effective_to;
    if (from && from > asOfDate) continue;
    if (to && to < asOfDate) continue;

    resolved[attr.key] = attr.value;
  }

  return resolved;
}

/**
 * Materialize period_entity_state — resolves attributes + relationships
 * for all entities in a period.
 */
export async function materializePeriodEntityState(
  tenantId: string,
  periodId: string,
  asOfDate: string
): Promise<PeriodEntityState[]> {
  const entities = await listEntities(tenantId, { status: 'active' });
  const results: PeriodEntityState[] = [];

  for (const entity of entities) {
    const resolvedAttrs = resolveTemporalAttributes(entity, asOfDate);
    const relationships = await getEntityRelationships(tenantId, entity.id);

    const state: PeriodEntityState = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      entity_id: entity.id,
      period_id: periodId,
      resolved_attributes: resolvedAttrs as Json,
      resolved_relationships: relationships.map(r => ({
        target_id: r.target_entity_id,
        type: r.relationship_type,
        confidence: r.confidence,
      })) as unknown as Json,
      entity_type: entity.entity_type,
      status: entity.status,
      materialized_at: new Date().toISOString(),
    };
    results.push(state);
  }

  if (isSupabaseConfigured()) {
    const supabase = createClient();
    // Upsert: delete existing + insert new
    await supabase
      .from('period_entity_state')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('period_id', periodId);
    if (results.length > 0) {
      const insertRows: Database['public']['Tables']['period_entity_state']['Insert'][] =
        results.map(r => ({
          id: r.id,
          tenant_id: r.tenant_id,
          entity_id: r.entity_id,
          period_id: r.period_id,
          resolved_attributes: r.resolved_attributes,
          resolved_relationships: r.resolved_relationships,
          entity_type: r.entity_type,
          status: r.status,
        }));
      await supabase.from('period_entity_state').insert(insertRows);
    }
  }

  return results;
}

// ──────────────────────────────────────────────
// Relationship CRUD
// ──────────────────────────────────────────────

export async function createRelationship(
  tenantId: string,
  rel: Omit<EntityRelationship, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>
): Promise<EntityRelationship> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const insertRow: Database['public']['Tables']['entity_relationships']['Insert'] = {
      tenant_id: tenantId,
      source_entity_id: rel.source_entity_id,
      target_entity_id: rel.target_entity_id,
      relationship_type: rel.relationship_type,
      source: rel.source,
      confidence: rel.confidence,
      evidence: rel.evidence,
      context: rel.context,
      effective_from: rel.effective_from,
      effective_to: rel.effective_to,
    };
    const { data, error } = await supabase
      .from('entity_relationships')
      .insert(insertRow)
      .select()
      .single();
    if (error) throw error;
    return data as EntityRelationship;
  }

  const now = new Date().toISOString();
  const newRel: EntityRelationship = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    source_entity_id: rel.source_entity_id,
    target_entity_id: rel.target_entity_id,
    relationship_type: rel.relationship_type,
    source: rel.source || 'imported_explicit',
    confidence: rel.confidence ?? 1,
    evidence: rel.evidence || {},
    context: rel.context || {},
    effective_from: rel.effective_from || null,
    effective_to: rel.effective_to || null,
    created_at: now,
    updated_at: now,
  };
  const all = loadLocal<EntityRelationship>(RELATIONSHIPS_KEY(tenantId));
  all.push(newRel);
  saveLocal(RELATIONSHIPS_KEY(tenantId), all);
  return newRel;
}

export async function getEntityRelationships(
  tenantId: string,
  entityId: string,
  direction: 'outgoing' | 'incoming' | 'both' = 'outgoing'
): Promise<EntityRelationship[]> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (direction === 'both') {
      const { data, error } = await supabase
        .from('entity_relationships')
        .select('*')
        .eq('tenant_id', tenantId)
        .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`);
      if (error) throw error;
      return (data || []) as EntityRelationship[];
    }
    const col = direction === 'outgoing' ? 'source_entity_id' : 'target_entity_id';
    const { data, error } = await supabase
      .from('entity_relationships')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq(col, entityId);
    if (error) throw error;
    return (data || []) as EntityRelationship[];
  }

  const all = loadLocal<EntityRelationship>(RELATIONSHIPS_KEY(tenantId));
  if (direction === 'both') {
    return all.filter(r => r.source_entity_id === entityId || r.target_entity_id === entityId);
  }
  const col = direction === 'outgoing' ? 'source_entity_id' : 'target_entity_id';
  return all.filter(r => r[col] === entityId);
}

// ──────────────────────────────────────────────
// Graph Traversal
// ──────────────────────────────────────────────

/**
 * BFS graph traversal from a starting entity.
 * Returns all reachable entities within maxDepth.
 */
export async function traverseGraph(
  tenantId: string,
  startEntityId: string,
  options: {
    maxDepth?: number;
    relationshipTypes?: string[];
    direction?: 'outgoing' | 'incoming' | 'both';
  } = {}
): Promise<GraphTraversalResult[]> {
  const { maxDepth = 5, relationshipTypes, direction = 'outgoing' } = options;
  const visited = new Set<string>();
  const results: GraphTraversalResult[] = [];
  const queue: Array<{ entityId: string; depth: number; path: string[]; relType: string }> = [
    { entityId: startEntityId, depth: 0, path: [startEntityId], relType: 'root' },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.entityId) || current.depth > maxDepth) continue;
    visited.add(current.entityId);

    const entity = await getEntity(tenantId, current.entityId);
    if (!entity) continue;

    if (current.depth > 0) {
      results.push({
        entity,
        depth: current.depth,
        path: current.path,
        relationship_type: current.relType,
      });
    }

    if (current.depth < maxDepth) {
      const rels = await getEntityRelationships(tenantId, current.entityId, direction);
      for (const rel of rels) {
        if (relationshipTypes && !relationshipTypes.includes(rel.relationship_type)) continue;
        const nextId = rel.source_entity_id === current.entityId
          ? rel.target_entity_id
          : rel.source_entity_id;
        if (!visited.has(nextId)) {
          queue.push({
            entityId: nextId,
            depth: current.depth + 1,
            path: [...current.path, nextId],
            relType: rel.relationship_type,
          });
        }
      }
    }
  }

  return results;
}

/**
 * Get the scope for a profile — all entities visible to them via graph traversal.
 * SG-3: Entity relationship graph traversal returns correct scope for team-scoped users.
 */
export async function materializeProfileScope(
  tenantId: string,
  profileId: string,
  entityId: string
): Promise<ProfileScope> {
  // Traverse outgoing relationships (manages, contains, oversees)
  const reachable = await traverseGraph(tenantId, entityId, {
    maxDepth: 10,
    direction: 'outgoing',
    relationshipTypes: ['manages', 'contains', 'oversees'],
  });

  const visibleEntityIds = [entityId, ...reachable.map(r => r.entity.id)];

  const scope: ProfileScope = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    profile_id: profileId,
    scope_type: 'graph_derived',
    visible_entity_ids: visibleEntityIds,
    visible_rule_set_ids: [],
    visible_period_ids: [],
    metadata: {} as Json,
    materialized_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    const supabase = createClient();
    // Upsert by deleting existing and inserting new
    await supabase
      .from('profile_scope')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('profile_id', profileId);
    const insertRow: Database['public']['Tables']['profile_scope']['Insert'] = {
      id: scope.id,
      tenant_id: scope.tenant_id,
      profile_id: scope.profile_id,
      scope_type: scope.scope_type as Database['public']['Tables']['profile_scope']['Insert']['scope_type'],
      visible_entity_ids: scope.visible_entity_ids,
      visible_rule_set_ids: scope.visible_rule_set_ids,
      visible_period_ids: scope.visible_period_ids,
      metadata: scope.metadata,
    };
    await supabase.from('profile_scope').insert(insertRow);
  }

  return scope;
}

// ──────────────────────────────────────────────
// Reassignment Events
// ──────────────────────────────────────────────

export async function createReassignmentEvent(
  tenantId: string,
  event: Omit<ReassignmentEvent, 'id' | 'tenant_id' | 'created_at'>
): Promise<ReassignmentEvent> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const insertRow: Database['public']['Tables']['reassignment_events']['Insert'] = {
      tenant_id: tenantId,
      entity_id: event.entity_id,
      from_entity_id: event.from_entity_id,
      to_entity_id: event.to_entity_id,
      effective_date: event.effective_date,
      credit_model: event.credit_model,
      transition_window: event.transition_window,
      impact_preview: event.impact_preview,
      reason: event.reason,
      created_by: event.created_by,
    };
    const { data, error } = await supabase
      .from('reassignment_events')
      .insert(insertRow)
      .select()
      .single();
    if (error) throw error;
    return data as ReassignmentEvent;
  }

  const newEvent: ReassignmentEvent = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    entity_id: event.entity_id,
    from_entity_id: event.from_entity_id || null,
    to_entity_id: event.to_entity_id || null,
    effective_date: event.effective_date,
    credit_model: event.credit_model || {},
    transition_window: event.transition_window || {},
    impact_preview: event.impact_preview || {},
    reason: event.reason || null,
    created_by: event.created_by || null,
    created_at: new Date().toISOString(),
  };
  const all = loadLocal<ReassignmentEvent>(REASSIGNMENTS_KEY(tenantId));
  all.push(newEvent);
  saveLocal(REASSIGNMENTS_KEY(tenantId), all);
  return newEvent;
}

export async function listReassignmentEvents(
  tenantId: string,
  entityId?: string
): Promise<ReassignmentEvent[]> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    let query = supabase.from('reassignment_events').select('*').eq('tenant_id', tenantId);
    if (entityId) query = query.eq('entity_id', entityId);
    const { data, error } = await query.order('effective_date', { ascending: false });
    if (error) throw error;
    return (data || []) as ReassignmentEvent[];
  }

  let all = loadLocal<ReassignmentEvent>(REASSIGNMENTS_KEY(tenantId));
  if (entityId) all = all.filter(e => e.entity_id === entityId);
  return all.sort((a, b) => (b.effective_date || '').localeCompare(a.effective_date || ''));
}
