/**
 * POST /api/intelligence/wire
 *
 * OB-123: Data Intelligence Pipeline — Wiring Layer
 *
 * Chains 5 existing operations to bridge the gap between import and calculation:
 *   1. Activate archived rule_sets
 *   2. Normalize data_types (strip component_data: prefix + date suffixes)
 *   3. Enrich entity metadata from roster data
 *   4. Create rule_set_assignments (license-based or full-coverage fallback)
 *   5. Run convergence to generate input_bindings
 *
 * Body: { tenantId: string }
 * Returns: { success, report: WiringReport }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { convergeBindings } from '@/lib/intelligence/convergence-service';
import type { Json } from '@/lib/supabase/database.types';

interface WiringReport {
  ruleSetsActivated: number;
  dataTypesNormalized: number;
  entitiesEnriched: number;
  assignmentsCreated: number;
  derivationsGenerated: number;
  readyForCalculation: boolean;
  steps: Array<{ step: string; status: string; detail: string }>;
}

// Reuse normalizeFileNameToDataType from import/commit/route.ts
function normalizeFileNameToDataType(fn: string): string {
  let stem = fn.replace(/\.[^.]+$/, ''); // Remove extension
  stem = stem.replace(/^[A-Z]{2,5}_/, ''); // Strip common prefix (e.g., "CFG_")
  stem = stem.replace(/_?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\d{4}$/i, '');
  stem = stem.replace(/_?Q[1-4]_?\d{4}$/i, '');
  stem = stem.replace(/_?\d{4}[-_]\d{2}$/i, '');
  stem = stem.replace(/_?\d{4}$/i, '');
  stem = stem.replace(/_+$/, ''); // Clean trailing underscores
  return stem.toLowerCase().replace(/[\s-]+/g, '_');
}

// Metadata extraction targets (from import/commit/route.ts)
const NAME_TARGETS = ['name', 'entity_name', 'display_name', 'employee_name', 'nombre'];
const ROLE_TARGETS = ['role', 'position', 'puesto', 'title', 'cargo'];
const LICENSE_TARGETS = ['productlicenses', 'product_licenses', 'licenses', 'products', 'licencias'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId } = body as { tenantId: string };

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'tenantId required' }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();
    const report: WiringReport = {
      ruleSetsActivated: 0,
      dataTypesNormalized: 0,
      entitiesEnriched: 0,
      assignmentsCreated: 0,
      derivationsGenerated: 0,
      readyForCalculation: false,
      steps: [],
    };

    // ── Step 1: Activate archived rule_sets ──
    console.log(`[Wire] Step 1: Activating archived rule_sets for tenant ${tenantId}`);
    const { data: archivedRuleSets } = await supabase
      .from('rule_sets')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'archived');

    if (archivedRuleSets && archivedRuleSets.length > 0) {
      const ids = archivedRuleSets.map(rs => rs.id);
      await supabase
        .from('rule_sets')
        .update({ status: 'active' })
        .in('id', ids);
      report.ruleSetsActivated = ids.length;
    }
    report.steps.push({
      step: 'activate_rule_sets',
      status: 'done',
      detail: `${report.ruleSetsActivated} archived → active`,
    });

    // ── Step 2: Normalize data_types ──
    // Get distinct prefixed data_types, then UPDATE directly by data_type (avoids row limit)
    console.log(`[Wire] Step 2: Normalizing data_types for tenant ${tenantId}`);
    const { data: distinctTypes } = await supabase
      .from('committed_data')
      .select('data_type')
      .eq('tenant_id', tenantId)
      .like('data_type', 'component_data:%')
      .limit(500);

    if (distinctTypes && distinctTypes.length > 0) {
      const uniqueTypes = Array.from(new Set(distinctTypes.map(r => r.data_type as string)));

      for (const oldType of uniqueTypes) {
        // Count rows first (for reporting)
        const { count: rowCount } = await supabase
          .from('committed_data')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('data_type', oldType);

        const rawName = oldType.replace(/^component_data:/, '');
        const normalized = normalizeFileNameToDataType(rawName);
        console.log(`[Wire]   ${oldType} → ${normalized} (${rowCount || 0} rows)`);

        // Direct UPDATE by data_type — no row limit issue
        await supabase
          .from('committed_data')
          .update({ data_type: normalized })
          .eq('tenant_id', tenantId)
          .eq('data_type', oldType);

        report.dataTypesNormalized += rowCount || 0;
      }
    }
    report.steps.push({
      step: 'normalize_data_types',
      status: 'done',
      detail: `${report.dataTypesNormalized} rows normalized`,
    });

    // ── Step 3: Enrich entity metadata from roster data ──
    console.log(`[Wire] Step 3: Enriching entity metadata for tenant ${tenantId}`);

    // Find entities with empty metadata
    const { data: emptyEntities } = await supabase
      .from('entities')
      .select('id, external_id, metadata')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    const entitiesToEnrich = (emptyEntities || []).filter(e => {
      const meta = e.metadata as Record<string, unknown> | null;
      return !meta || Object.keys(meta).length === 0;
    });

    if (entitiesToEnrich.length > 0) {
      // Find roster-like data in committed_data
      const { data: rosterRows } = await supabase
        .from('committed_data')
        .select('row_data, data_type')
        .eq('tenant_id', tenantId)
        .or('data_type.ilike.%roster%,data_type.ilike.%employee%,data_type.ilike.%rep%,data_type.ilike.%participant%')
        .limit(5000);

      if (rosterRows && rosterRows.length > 0) {
        // Build a map: externalId → metadata from roster rows
        const rosterMeta = new Map<string, Record<string, unknown>>();

        for (const row of rosterRows) {
          const rd = row.row_data as Record<string, unknown> | null;
          if (!rd) continue;

          // Find entity ID in row_data
          let entityExternalId: string | null = null;
          for (const key of Object.keys(rd)) {
            const lower = key.toLowerCase().replace(/[\s_-]+/g, '_');
            if (['entityid', 'entity_id', 'employeeid', 'employee_id', 'external_id', 'externalid', 'repid', 'rep_id'].includes(lower)) {
              entityExternalId = rd[key] ? String(rd[key]).trim() : null;
              break;
            }
          }
          if (!entityExternalId || rosterMeta.has(entityExternalId)) continue;

          const meta: Record<string, unknown> = {};
          for (const key of Object.keys(rd)) {
            const lower = key.toLowerCase().replace(/[\s_-]+/g, '');
            if (NAME_TARGETS.some(t => lower.includes(t))) {
              meta.display_name = rd[key] ? String(rd[key]).trim() : null;
            } else if (ROLE_TARGETS.some(t => lower.includes(t))) {
              meta.role = rd[key] ? String(rd[key]).trim() : null;
            } else if (LICENSE_TARGETS.some(t => lower.includes(t))) {
              meta.product_licenses = rd[key] ? String(rd[key]).trim() : null;
            }
          }
          if (Object.keys(meta).length > 0) {
            rosterMeta.set(entityExternalId, meta);
          }
        }

        // Update entities with roster metadata
        for (const entity of entitiesToEnrich) {
          const meta = rosterMeta.get(entity.external_id || '');
          if (meta) {
            await supabase
              .from('entities')
              .update({ metadata: meta as unknown as Json })
              .eq('id', entity.id);
            report.entitiesEnriched++;
          }
        }
      }
    }
    report.steps.push({
      step: 'enrich_entity_metadata',
      status: 'done',
      detail: `${report.entitiesEnriched} entities enriched`,
    });

    // ── Step 4: Create assignments ──
    console.log(`[Wire] Step 4: Creating rule_set_assignments for tenant ${tenantId}`);

    // Get all active rule_sets
    const { data: activeRuleSets } = await supabase
      .from('rule_sets')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    // Get all active entities (re-fetch to get enriched metadata)
    const { data: allEntities } = await supabase
      .from('entities')
      .select('id, external_id, metadata')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    if (activeRuleSets && activeRuleSets.length > 0 && allEntities && allEntities.length > 0) {
      // Check existing assignments
      const existingSet = new Set<string>();
      const entityIds = allEntities.map(e => e.id);
      const CHECK_BATCH = 200;
      for (let i = 0; i < entityIds.length; i += CHECK_BATCH) {
        const slice = entityIds.slice(i, i + CHECK_BATCH);
        const { data: existing } = await supabase
          .from('rule_set_assignments')
          .select('entity_id, rule_set_id')
          .eq('tenant_id', tenantId)
          .in('entity_id', slice);
        if (existing) {
          for (const a of existing) existingSet.add(`${a.entity_id}:${a.rule_set_id}`);
        }
      }

      // Build license mapping: plan name → rule_set_id
      const licenseMapping = new Map<string, string>();
      for (const rs of activeRuleSets) {
        licenseMapping.set(rs.name.toLowerCase().replace(/[\s_-]+/g, ''), rs.id);
      }

      const newAssignments: Array<{
        tenant_id: string;
        entity_id: string;
        rule_set_id: string;
        effective_from: string;
      }> = [];

      let usedLicenseMapping = false;

      // Try license-based mapping first
      for (const entity of allEntities) {
        const meta = entity.metadata as Record<string, unknown> | null;
        const licenses = meta?.product_licenses ? String(meta.product_licenses) : null;
        if (!licenses) continue;

        usedLicenseMapping = true;
        const licenseList = licenses.split(',').map(l => l.trim()).filter(Boolean);

        for (const license of licenseList) {
          const normalizedLicense = license.toLowerCase().replace(/[\s_-]+/g, '');
          for (const [mappedName, ruleSetId] of Array.from(licenseMapping.entries())) {
            if (mappedName.includes(normalizedLicense) || normalizedLicense.includes(mappedName)) {
              const key = `${entity.id}:${ruleSetId}`;
              if (!existingSet.has(key)) {
                newAssignments.push({
                  tenant_id: tenantId,
                  entity_id: entity.id,
                  rule_set_id: ruleSetId,
                  effective_from: new Date().toISOString().split('T')[0],
                });
                existingSet.add(key);
              }
              break;
            }
          }
        }
      }

      // Fallback: if no license-based assignments, assign ALL entities to ALL active plans
      if (!usedLicenseMapping || newAssignments.length === 0) {
        console.log(`[Wire]   No license mapping found — using full-coverage assignment`);
        for (const entity of allEntities) {
          for (const rs of activeRuleSets) {
            const key = `${entity.id}:${rs.id}`;
            if (!existingSet.has(key)) {
              newAssignments.push({
                tenant_id: tenantId,
                entity_id: entity.id,
                rule_set_id: rs.id,
                effective_from: new Date().toISOString().split('T')[0],
              });
              existingSet.add(key);
            }
          }
        }
      }

      // Insert in batches
      if (newAssignments.length > 0) {
        const BATCH = 5000;
        for (let i = 0; i < newAssignments.length; i += BATCH) {
          const slice = newAssignments.slice(i, i + BATCH);
          const { error } = await supabase.from('rule_set_assignments').insert(slice);
          if (error) {
            console.error(`[Wire] Assignment batch insert error:`, error.message);
          }
        }
        report.assignmentsCreated = newAssignments.length;
      }
    }
    report.steps.push({
      step: 'create_assignments',
      status: 'done',
      detail: `${report.assignmentsCreated} assignments created`,
    });

    // ── Step 5: Run convergence for all active plans ──
    console.log(`[Wire] Step 5: Running convergence for tenant ${tenantId}`);

    if (activeRuleSets && activeRuleSets.length > 0) {
      for (const rs of activeRuleSets) {
        const result = await convergeBindings(tenantId, rs.id, supabase);

        if (result.derivations.length > 0) {
          // Read existing bindings
          const { data: currentRS } = await supabase
            .from('rule_sets')
            .select('input_bindings')
            .eq('id', rs.id)
            .single();

          const existing = ((currentRS?.input_bindings as Record<string, unknown>)?.metric_derivations ?? []) as Array<Record<string, unknown>>;
          const merged = [...existing];

          for (const d of result.derivations) {
            // Only add if no existing derivation targets the same metric
            if (!merged.some(e => e.metric === d.metric)) {
              merged.push(d as unknown as Record<string, unknown>);
            }
          }

          await supabase
            .from('rule_sets')
            .update({ input_bindings: { metric_derivations: merged } as unknown as Json })
            .eq('id', rs.id);

          const newCount = merged.length - existing.length;
          report.derivationsGenerated += newCount;
        }
      }
    }
    report.steps.push({
      step: 'run_convergence',
      status: 'done',
      detail: `${report.derivationsGenerated} new derivations generated`,
    });

    // Determine readiness
    report.readyForCalculation = report.assignmentsCreated > 0 || report.derivationsGenerated > 0;

    // If no new assignments/derivations were created, check existing state
    if (!report.readyForCalculation) {
      const { count: assignmentCount } = await supabase
        .from('rule_set_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      report.readyForCalculation = (assignmentCount || 0) > 0;
    }

    console.log(`[Wire] Complete: ${JSON.stringify(report)}`);

    return NextResponse.json({ success: true, report });
  } catch (err) {
    console.error('[Wire] Error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
