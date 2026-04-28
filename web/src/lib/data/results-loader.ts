/**
 * Results Page Data Loader
 *
 * Single batch fetch for the DS-007 results page.
 * Standing Rule 26: Zero component-level Supabase calls.
 * Components render props. This is the single data source.
 */

import { createClient } from '@/lib/supabase/client';

// ──────────────────────────────────────────────
// Component color palette (deterministic by index)
// ──────────────────────────────────────────────

const COMPONENT_COLORS = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
];

// ──────────────────────────────────────────────
// Types — derived from actual DB shape (Phase 0)
// ──────────────────────────────────────────────

export interface ComponentPayout {
  componentId: string;
  componentName: string;
  componentType: string;
  payout: number;
  attainment: number | null;
  gateStatus: 'passed' | 'failed' | 'none';
  details: Record<string, unknown>;
}

export interface EntityResult {
  entityId: string;
  externalId: string;
  displayName: string;
  store: string;
  totalPayout: number;
  attainment: number | null;
  status: 'exceeds' | 'on_track' | 'below';
  componentPayouts: ComponentPayout[];
  sourceSheets: string[];
}

export interface ComponentTotal {
  componentId: string;
  componentName: string;
  componentType: string;
  total: number;
  entityCount: number;
  color: string;
}

export interface StoreComponentCell {
  store: string;
  componentId: string;
  avgPayout: number;
  entityCount: number;
}

export interface ComponentDef {
  id: string;
  name: string;
  type: string;
  order: number;
  color: string;
}

export interface ResultsPageData {
  // L5: Outcome
  totalPayout: number;
  resultCount: number;
  componentTotals: ComponentTotal[];

  // L4: Population
  entities: EntityResult[];
  storeComponentMatrix: StoreComponentCell[];
  stores: string[];

  // Metadata
  planName: string;
  periodLabel: string;
  batchId: string;
  batchDate: string;
  lifecycleState: string;
  componentDefinitions: ComponentDef[];
}

// ──────────────────────────────────────────────
// Loader
// ──────────────────────────────────────────────

export async function loadResultsPageData(
  tenantId: string,
  periodId: string,
  ruleSetId: string
): Promise<ResultsPageData | null> {
  const supabase = createClient();

  // Round 1: Parallel — batch, rule_set, period (3 calls)
  const [batchRes, ruleSetRes, periodRes] = await Promise.all([
    supabase
      .from('calculation_batches')
      .select('id, lifecycle_state, entity_count, summary, created_at')
      .eq('tenant_id', tenantId)
      .eq('period_id', periodId)
      .eq('rule_set_id', ruleSetId)
      .is('superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('rule_sets')
      .select('id, name, components')
      .eq('id', ruleSetId)
      .single(),
    supabase
      .from('periods')
      .select('id, label, canonical_key')
      .eq('id', periodId)
      .single(),
  ]);

  const batch = batchRes.data;
  if (!batch) return null;

  const ruleSet = ruleSetRes.data;
  const period = periodRes.data;

  // Parse component definitions from rule_set
  const rawComps = (ruleSet?.components ?? []) as Array<Record<string, unknown>>;
  const componentDefinitions: ComponentDef[] = rawComps.map((c, i) => ({
    id: String(c.id ?? `comp_${i}`),
    name: String(c.name ?? `Component ${i + 1}`),
    type: String(c.componentType ?? c.component_type ?? ''),
    order: Number(c.order ?? i),
    color: COMPONENT_COLORS[i % COMPONENT_COLORS.length],
  }));

  // Round 2: calculation_results for this batch (1 call)
  const { data: results } = await supabase
    .from('calculation_results')
    .select('entity_id, total_payout, components, attainment, metadata, metrics')
    .eq('tenant_id', tenantId)
    .eq('batch_id', batch.id);

  if (!results || results.length === 0) return null;

  // Round 3: entity data (batched in groups of 200)
  const entityIds = results.map(r => r.entity_id);
  const entityMap = new Map<string, { externalId: string; displayName: string; store: string }>();

  const BATCH_SIZE = 200;
  for (let i = 0; i < entityIds.length; i += BATCH_SIZE) {
    const batch = entityIds.slice(i, i + BATCH_SIZE);
    const { data: ents } = await supabase
      .from('entities')
      .select('id, external_id, display_name, metadata')
      .in('id', batch);

    for (const e of ents ?? []) {
      const meta = (e.metadata ?? {}) as Record<string, unknown>;
      const store = String(meta.No_Tienda ?? meta.num_tienda ?? meta.storeId ?? '');
      entityMap.set(e.id, {
        externalId: e.external_id ?? '',
        displayName: e.display_name ?? e.external_id ?? '',
        store,
      });
    }
  }

  // Build color lookup by component id/name
  const colorByName = new Map<string, string>();
  for (const cd of componentDefinitions) {
    colorByName.set(cd.id, cd.color);
    colorByName.set(cd.name, cd.color);
  }

  // Build entities + component totals
  const compTotalMap = new Map<string, { name: string; type: string; total: number; count: number; color: string }>();
  const entities: EntityResult[] = [];

  for (const r of results) {
    const ent = entityMap.get(r.entity_id);
    const comps = Array.isArray(r.components) ? r.components : [];
    const attData = (r.attainment ?? {}) as Record<string, unknown>;
    const overall = typeof attData.overall === 'number' ? attData.overall : null;
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const metrics = (r.metrics ?? {}) as Record<string, unknown>;

    // Determine status
    let status: 'exceeds' | 'on_track' | 'below' = 'below';
    if (overall !== null) {
      if (overall >= 120) status = 'exceeds';
      else if (overall >= 80) status = 'on_track';
    } else if (r.total_payout > 0) {
      status = 'on_track';
    }

    // Extract source sheets from metrics
    const sourceSheets: string[] = [];
    const sheetName = metrics._sheetName as string | undefined;
    if (sheetName) sourceSheets.push(sheetName);

    // From intent traces, extract unique sheet references
    const traces = meta.intentTraces as Array<Record<string, unknown>> | undefined;
    if (traces) {
      for (const trace of traces) {
        const inputs = trace.inputs as Record<string, Record<string, unknown>> | undefined;
        if (inputs) {
          for (const input of Object.values(inputs)) {
            if (input.source === 'metric' && typeof input.rawValue === 'number') {
              // This metric was resolved — the component used data
              const compIdx = trace.componentIndex as number | undefined;
              if (compIdx !== undefined && componentDefinitions[compIdx]) {
                const compName = componentDefinitions[compIdx].name;
                if (!sourceSheets.includes(compName)) {
                  sourceSheets.push(compName);
                }
              }
            }
          }
        }
      }
    }

    // Build per-component payouts
    const componentPayouts: ComponentPayout[] = (comps as Array<Record<string, unknown>>).map((c) => {
      const details = (c.details ?? {}) as Record<string, unknown>;
      const compId = String(c.componentId ?? '');
      const compName = String(c.componentName ?? '');
      const compType = String(c.componentType ?? '');

      // Determine attainment from details
      let compAttainment: number | null = null;
      if (typeof details.metricValue === 'number') {
        compAttainment = details.metricValue as number;
      } else if (typeof details.rowValue === 'number') {
        compAttainment = details.rowValue as number;
      }

      // Determine gate status for conditional_percentage
      let gateStatus: 'passed' | 'failed' | 'none' = 'none';
      if (compType === 'conditional_gate') {
        const condVal = details.conditionValue as number | undefined;
        const baseAmt = details.baseAmount as number | undefined;
        if (baseAmt !== undefined && baseAmt > 0 && (c.payout as number) > 0) {
          gateStatus = 'passed';
        } else if (condVal !== undefined || baseAmt !== undefined) {
          gateStatus = 'failed';
        }
      }

      return {
        componentId: compId,
        componentName: compName,
        componentType: compType,
        payout: Number(c.payout ?? 0),
        attainment: compAttainment,
        gateStatus,
        details,
      };
    });

    // Accumulate component totals
    for (const cp of componentPayouts) {
      const existing = compTotalMap.get(cp.componentId);
      if (existing) {
        existing.total += cp.payout;
        existing.count += 1;
      } else {
        compTotalMap.set(cp.componentId, {
          name: cp.componentName,
          type: cp.componentType,
          total: cp.payout,
          count: 1,
          color: colorByName.get(cp.componentId) || colorByName.get(cp.componentName) || COMPONENT_COLORS[compTotalMap.size % COMPONENT_COLORS.length],
        });
      }
    }

    // Extract store from metadata or metrics if not on entity
    let store = ent?.store || '';
    if (!store) {
      const numTienda = metrics.num_tienda as string | number | undefined;
      if (numTienda) store = String(numTienda);
    }

    entities.push({
      entityId: r.entity_id,
      externalId: ent?.externalId || (meta.externalId as string) || '',
      displayName: ent?.displayName || (meta.entityName as string) || '',
      store,
      totalPayout: r.total_payout || 0,
      attainment: overall,
      status,
      componentPayouts,
      sourceSheets,
    });
  }

  const componentTotals: ComponentTotal[] = Array.from(compTotalMap.entries()).map(([id, data]) => ({
    componentId: id,
    componentName: data.name,
    componentType: data.type,
    total: data.total,
    entityCount: data.count,
    color: data.color,
  }));

  // Build store × component matrix
  const storeMap = new Map<string, Map<string, { sum: number; count: number }>>();
  for (const ent of entities) {
    const storeKey = ent.store || 'unassigned';
    if (!storeMap.has(storeKey)) storeMap.set(storeKey, new Map());
    const compMap = storeMap.get(storeKey)!;

    for (const cp of ent.componentPayouts) {
      const existing = compMap.get(cp.componentId);
      if (existing) {
        existing.sum += cp.payout;
        existing.count += 1;
      } else {
        compMap.set(cp.componentId, { sum: cp.payout, count: 1 });
      }
    }
  }

  const stores = Array.from(storeMap.keys()).sort();
  const storeComponentMatrix: StoreComponentCell[] = [];
  for (const [store, compMap] of Array.from(storeMap.entries())) {
    for (const [compId, data] of Array.from(compMap.entries())) {
      storeComponentMatrix.push({
        store,
        componentId: compId,
        avgPayout: data.count > 0 ? data.sum / data.count : 0,
        entityCount: data.count,
      });
    }
  }

  const totalPayout = entities.reduce((sum, e) => sum + e.totalPayout, 0);

  return {
    totalPayout,
    resultCount: entities.length,
    componentTotals,
    entities,
    storeComponentMatrix,
    stores,
    planName: ruleSet?.name ?? 'Plan',
    periodLabel: period?.label ?? period?.canonical_key ?? '',
    batchId: batch.id,
    batchDate: batch.created_at,
    lifecycleState: batch.lifecycle_state ?? 'DRAFT',
    componentDefinitions,
  };
}
