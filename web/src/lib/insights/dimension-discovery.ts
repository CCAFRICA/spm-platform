/**
 * OB-322 — Dimension discovery (Korean Test / AP-25). Discovers the analytic dimensions a
 * tenant's outcomes can be pivoted by WITHOUT hardcoding any field name, then aggregates a
 * period's payout by a chosen dimension. Two sources:
 *   1. Component — every distinct componentName across the period's outcomes (always present).
 *   2. Entity attributes — keys in entities.metadata whose distinct-value count is a natural
 *      grouping cardinality (MIN_DISTINCT..MAX_DISTINCT). This excludes identifiers/dates/
 *      free-text (too many distinct values) and constants (one value), and is field-name-blind:
 *      it iterates whatever keys the data carries (region, nivel_cargo, cargo, zona, …) rather
 *      than the fixed `m.variant ?? m.role ?? m.cargo` chain that entity-table.ts had to assume.
 * Replaces the Analytics "No Segment Dimension" honest-empty, which was a false negative: BCL
 * entities DO carry region/nivel_cargo/cargo in metadata.
 *
 * Deterministic; no AI calls (Decision 158). Built ABOVE the OB-224 drill-through layer.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import { getEntityResults } from '@/lib/drill-through';
import { ALL_INSIGHTS_SCOPE } from './periods';

/** Sentinel key for the always-available component dimension (never a real metadata key). */
export const COMPONENT_DIMENSION_KEY = '__component__';

const MIN_DISTINCT = 2;
const MAX_DISTINCT = 20;
const ENTITY_PAGE = 300; // PostgREST .in() page size, mirrors entity-table.ts

export interface DiscoveredDimension {
  /** entities.metadata key, or COMPONENT_DIMENSION_KEY for the component pivot */
  key: string;
  /** humanized key, derived verbatim from the key string (no hardcoded label map) */
  label: string;
  /** distinct values present, sorted */
  values: string[];
  source: 'component' | 'attribute';
}

export interface DimensionSlice {
  value: string;
  total_payout: number;
  entity_count: number;
  percentage: number;
}

/** snake/kebab key → Title Case, derived mechanically (Korean-clean — no per-key dictionary). */
function humanize(key: string): string {
  return key
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Collect entities.metadata for a set of ids, paged. Returns id → metadata record. */
async function loadEntityMetadata(
  sb: SupabaseClient<Database>,
  ids: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const byId = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += ENTITY_PAGE) {
    const { data } = await sb.from('entities').select('id, metadata').in('id', ids.slice(i, i + ENTITY_PAGE));
    for (const e of data ?? []) byId.set(e.id as string, ((e.metadata ?? {}) as Record<string, unknown>));
  }
  return byId;
}

/**
 * Discover the dimensions a period's outcomes can be pivoted by.
 * Component is first (always present); entity-attribute dimensions follow, deduped by value-set
 * (so role == nivel_cargo, when identical, surfaces once).
 */
export async function discoverDimensions(
  tenantId: string,
  periodId: string,
  client?: SupabaseClient<Database>,
): Promise<DiscoveredDimension[]> {
  if (!tenantId || !periodId) return [];
  const sb = client ?? createClient();
  const dims: DiscoveredDimension[] = [];

  const rows = await getEntityResults(tenantId, ALL_INSIGHTS_SCOPE, { periodId }, sb);
  if (rows.length === 0) return [];

  // (1) Component dimension — distinct component names across this period's outcomes.
  const compNames = new Set<string>();
  for (const r of rows) for (const n of Object.keys(r.componentBreakdown ?? {})) compNames.add(n);
  if (compNames.size >= 1) {
    dims.push({ key: COMPONENT_DIMENSION_KEY, label: 'Component', values: Array.from(compNames).sort(), source: 'component' });
  }

  // (2) Entity-attribute dimensions — metadata keys at natural grouping cardinality.
  const ids = rows.map((r) => r.entityId).filter(Boolean);
  if (ids.length) {
    const metaById = await loadEntityMetadata(sb, ids);
    const valuesByKey = new Map<string, Set<string>>();
    for (const meta of Array.from(metaById.values())) {
      for (const [k, v] of Object.entries(meta)) {
        if (v == null || typeof v === 'object') continue; // skip nested/objects/null
        const s = String(v).trim();
        if (!s) continue;
        let set = valuesByKey.get(k);
        if (!set) { set = new Set<string>(); valuesByKey.set(k, set); }
        set.add(s);
      }
    }
    const seenSets = new Set<string>();
    // stable key order for deterministic dedup-first selection
    for (const k of Array.from(valuesByKey.keys()).sort()) {
      const set = valuesByKey.get(k)!;
      if (set.size < MIN_DISTINCT || set.size > MAX_DISTINCT) continue;
      const sig = Array.from(set).sort().join('');
      if (seenSets.has(sig)) continue; // identical value-set already represented (role≡nivel_cargo)
      seenSets.add(sig);
      dims.push({ key: k, label: humanize(k), values: Array.from(set).sort(), source: 'attribute' });
    }
  }
  return dims;
}

/**
 * Aggregate a period's total payout by a discovered dimension.
 * Component → sum componentBreakdown amounts per component name.
 * Attribute → join each outcome's entity to entities.metadata[key], sum total_payout per value.
 */
export async function aggregateByDimension(
  tenantId: string,
  periodId: string,
  dimension: DiscoveredDimension,
  client?: SupabaseClient<Database>,
): Promise<DimensionSlice[]> {
  if (!tenantId || !periodId) return [];
  const sb = client ?? createClient();
  const rows = await getEntityResults(tenantId, ALL_INSIGHTS_SCOPE, { periodId }, sb);

  const acc = new Map<string, { amount: number; entities: number }>();
  const bump = (value: string, amount: number) => {
    const cur = acc.get(value) ?? { amount: 0, entities: 0 };
    cur.amount += amount;
    cur.entities += 1;
    acc.set(value, cur);
  };

  if (dimension.source === 'component') {
    for (const r of rows) for (const [name, amt] of Object.entries(r.componentBreakdown ?? {})) bump(name, amt);
  } else {
    const ids = rows.map((r) => r.entityId).filter(Boolean);
    const metaById = await loadEntityMetadata(sb, ids);
    for (const r of rows) {
      const v = metaById.get(r.entityId)?.[dimension.key];
      const value = v != null && typeof v !== 'object' ? String(v).trim() : '';
      bump(value || '—', r.totalPayout); // '—' = unattributed (no metadata value)
    }
  }

  const grand = Array.from(acc.values()).reduce((s, v) => s + v.amount, 0);
  return Array.from(acc.entries())
    .map(([value, v]) => ({
      value,
      total_payout: v.amount,
      entity_count: v.entities,
      percentage: grand > 0 ? (v.amount / grand) * 100 : 0,
    }))
    .sort((a, b) => b.total_payout - a.total_payout);
}
