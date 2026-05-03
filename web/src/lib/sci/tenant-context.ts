// Synaptic Content Ingestion — Tenant Context Service
// OB-160D — SCI Spec Layer 3, Tier 2: Deterministic tenant state query
// Queries what the tenant already has in Supabase BEFORE agent scoring.
// All adjustments are presence-based. Absence is not evidence. AP-31.
// Korean Test: entity ID overlap matches on VALUES, not column names.

import { createClient } from '@supabase/supabase-js';
import type { ContentProfile } from './sci-types';
// HF-103: Interfaces moved here from synaptic-ingestion-state.ts
// Tenant context is no longer used in classification (Decision 72).
// These types remain for potential post-classification use.

export interface TenantContext {
  existingEntityCount: number;
  existingEntityExternalIds: Set<string>;
  existingPlanCount: number;
  existingPlanComponentNames: string[];
  existingPlanInputRequirements: string[];
  committedDataRowCount: number;
  committedDataTypes: string[];
  referenceDataExists: boolean;
}

export interface EntityIdOverlap {
  sheetIdentifierColumn: string;
  sheetUniqueValues: Set<string>;
  matchingEntityIds: Set<string>;
  overlapPercentage: number;
  overlapSignal: 'high' | 'partial' | 'none';
}

export interface TenantContextAdjustment {
  agent: string;
  adjustment: number;
  signal: string;
  evidence: string;
}

// ============================================================
// TENANT STATE QUERY
// Called ONCE before scoring, result stored in SynapticIngestionState.tenantContext.
// ============================================================

export async function queryTenantContext(
  tenantId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<TenantContext> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Parallel queries — all independent
  const [
    entitiesResult,
    ruleSetsResult,
    committedDataCountResult,
    committedDataTypesResult,
    referenceDataResult,
  ] = await Promise.all([
    supabase
      .from('entities')
      .select('external_id')
      .eq('tenant_id', tenantId)
      .not('external_id', 'is', null),

    supabase
      .from('rule_sets')
      .select('name, components')
      .eq('tenant_id', tenantId),

    supabase
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),

    supabase
      .from('committed_data')
      .select('data_type')
      .eq('tenant_id', tenantId),

    supabase
      .from('reference_data')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
  ]);

  // Entity external_ids
  const entityExternalIds = new Set<string>(
    (entitiesResult.data ?? [])
      .map((e: { external_id: string }) => e.external_id)
      .filter(Boolean)
  );

  // Plan component names and input requirements from calculationIntent
  const planComponentNames: string[] = [];
  const planInputRequirements: string[] = [];
  for (const rs of (ruleSetsResult.data ?? [])) {
    if (Array.isArray(rs.components)) {
      for (const comp of rs.components) {
        if (comp.name) planComponentNames.push(comp.name as string);
        if (comp.calculationIntent?.inputs) {
          for (const input of Object.keys(comp.calculationIntent.inputs)) {
            if (!planInputRequirements.includes(input)) {
              planInputRequirements.push(input);
            }
          }
        }
      }
    }
  }

  // Distinct data_type values
  const committedDataTypes = Array.from(new Set(
    (committedDataTypesResult.data ?? [])
      .map((d: { data_type: string }) => d.data_type)
      .filter(Boolean)
  ));

  return {
    existingEntityCount: entityExternalIds.size,
    existingEntityExternalIds: entityExternalIds,
    existingPlanCount: (ruleSetsResult.data ?? []).length,
    existingPlanComponentNames: planComponentNames,
    existingPlanInputRequirements: planInputRequirements,
    committedDataRowCount: committedDataCountResult.count ?? 0,
    committedDataTypes: committedDataTypes,
    referenceDataExists: (referenceDataResult.count ?? 0) > 0,
  };
}

// ============================================================
// ENTITY ID OVERLAP
// Compares identifier column VALUES against existing entity external_ids.
// Korean Test: uses structural identifier detection from Phase A, not column names.
// ============================================================

export function computeEntityIdOverlap(
  profile: ContentProfile,
  rows: Record<string, unknown>[],
  existingEntityExternalIds: Set<string>,
): EntityIdOverlap | null {
  if (!profile.patterns.hasEntityIdentifier) return null;

  // HF-196 Phase 1G Path α — Find the identifier field with HC primacy (Decision 108).
  // Reads profile.headerComprehension if available; gates structural arms on HC silence.
  const hcInterpretations = profile.headerComprehension?.interpretations;
  const getHCRole = (fieldName: string) => hcInterpretations?.get(fieldName)?.columnRole;

  const idField =
    // HC-primary: HC said this is an identifier
    profile.fields.find(f => getHCRole(f.fieldName) === 'identifier') ??
    // HC-silent fallback: structural detection (Site 8 — gated on HC silence)
    profile.fields.find(f => {
      const hcRole = getHCRole(f.fieldName);
      if (hcRole && hcRole !== 'unknown') return false; // HC said something other than identifier — yield.
      return f.nameSignals.containsId || (f.dataType === 'integer' && f.distribution.isSequential);
    });
  if (!idField) return null;

  const identifierColumn = idField.fieldName;

  // Extract unique values from the identifier column
  const sheetUniqueValues = new Set<string>();
  for (const row of rows) {
    const val = row[identifierColumn];
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      sheetUniqueValues.add(String(val).trim());
    }
  }

  if (sheetUniqueValues.size === 0) return null;

  // No entities yet → overlap is 0%, signal is 'none'
  if (existingEntityExternalIds.size === 0) {
    return {
      sheetIdentifierColumn: identifierColumn,
      sheetUniqueValues,
      matchingEntityIds: new Set<string>(),
      overlapPercentage: 0,
      overlapSignal: 'none',
    };
  }

  // Compute overlap
  const matchingEntityIds = new Set<string>();
  for (const val of Array.from(sheetUniqueValues)) {
    if (existingEntityExternalIds.has(val)) {
      matchingEntityIds.add(val);
    }
  }

  const overlapPercentage = matchingEntityIds.size / sheetUniqueValues.size;

  return {
    sheetIdentifierColumn: identifierColumn,
    sheetUniqueValues,
    matchingEntityIds,
    overlapPercentage,
    overlapSignal: overlapPercentage > 0.80 ? 'high'
                 : overlapPercentage > 0 ? 'partial'
                 : 'none',
  };
}

// ============================================================
// TENANT CONTEXT SCORE ADJUSTMENTS — Presence-based ONLY (AP-31)
// ============================================================

export function computeTenantContextAdjustments(
  tenantContext: TenantContext,
  overlap: EntityIdOverlap | null,
  profile: ContentProfile,
): TenantContextAdjustment[] {
  const adjustments: TenantContextAdjustment[] = [];

  // --- SIGNAL 1: Entity ID Overlap (most powerful) ---
  if (overlap && overlap.overlapSignal === 'high') {
    adjustments.push({
      agent: 'transaction',
      adjustment: +0.15,
      signal: 'entity_id_overlap_high',
      evidence: `${Math.round(overlap.overlapPercentage * 100)}% of identifier values (${overlap.matchingEntityIds.size}/${overlap.sheetUniqueValues.size}) match existing entity external_ids`,
    });
    adjustments.push({
      agent: 'target',
      adjustment: +0.15,
      signal: 'entity_id_overlap_high',
      evidence: `${Math.round(overlap.overlapPercentage * 100)}% of identifier values (${overlap.matchingEntityIds.size}/${overlap.sheetUniqueValues.size}) match existing entities — references existing roster`,
    });
    adjustments.push({
      agent: 'entity',
      adjustment: -0.10,
      signal: 'entity_id_overlap_high',
      evidence: `Entities already exist — ${overlap.matchingEntityIds.size} matching. This sheet is data ABOUT them, not a new roster`,
    });
  }

  if (overlap && overlap.overlapSignal === 'partial') {
    adjustments.push({
      agent: 'transaction',
      adjustment: +0.05,
      signal: 'entity_id_overlap_partial',
      evidence: `${Math.round(overlap.overlapPercentage * 100)}% partial overlap (${overlap.matchingEntityIds.size}/${overlap.sheetUniqueValues.size} matching entity external_ids)`,
    });
  }

  // --- SIGNAL 2: Plan exists + numeric content ---
  if (tenantContext.existingPlanCount > 0 && profile.structure.numericFieldRatio > 0.30) {
    adjustments.push({
      agent: 'transaction',
      adjustment: +0.10,
      signal: 'plan_exists_numeric_content',
      evidence: `Tenant has ${tenantContext.existingPlanCount} plan(s) with ${tenantContext.existingPlanInputRequirements.length} input requirements. This sheet has ${Math.round(profile.structure.numericFieldRatio * 100)}% numeric fields — likely the data those plans need`,
    });
  }

  // --- SIGNAL 3: Roster update candidate ---
  if (overlap && overlap.overlapSignal === 'high'
    && !profile.patterns.hasTemporalColumns && !profile.patterns.hasDateColumn
    && profile.structure.categoricalFieldRatio > 0.25) {
    adjustments.push({
      agent: 'entity',
      adjustment: +0.10,
      signal: 'roster_update_candidate',
      evidence: `High ID overlap (${Math.round(overlap.overlapPercentage * 100)}%) but no temporal columns and ${Math.round(profile.structure.categoricalFieldRatio * 100)}% categorical fields — possible roster update`,
    });
    adjustments.push({
      agent: 'transaction',
      adjustment: -0.05,
      signal: 'roster_update_candidate',
      evidence: `High ID overlap but categorical-heavy structure without temporal columns suggests roster update, not transactions`,
    });
  }

  return adjustments;
}
