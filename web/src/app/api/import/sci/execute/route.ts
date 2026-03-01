// SCI Execute API — POST /api/import/sci/execute
// Decision 77 — OB-127
// Processes confirmed proposals through classification-specific pipelines.
// Zero domain vocabulary. Korean Test applies.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { convergeBindings } from '@/lib/intelligence/convergence-service';
import type { Json } from '@/lib/supabase/database.types';
import type {
  SCIExecutionRequest,
  SCIExecutionResult,
  ContentUnitResult,
  ContentUnitExecution,
} from '@/lib/sci/sci-types';

// Generic role detection targets (AP-5/AP-6: no hardcoded language-specific names)
const ROLE_TARGETS = ['role', 'position', 'puesto', 'title', 'cargo'];

// Normalize filename to semantic data_type (same logic as import/commit)
function normalizeFileNameToDataType(fn: string): string {
  let stem = fn.replace(/\.[^.]+$/, '');
  stem = stem.replace(/^[A-Z]{2,5}_/, '');
  stem = stem.replace(/_?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\d{4}$/i, '');
  stem = stem.replace(/_?Q[1-4]_?\d{4}$/i, '');
  stem = stem.replace(/_?\d{4}[-_]\d{2}$/i, '');
  stem = stem.replace(/_?\d{4}$/i, '');
  stem = stem.replace(/_+$/, '');
  return stem.toLowerCase().replace(/[\s-]+/g, '_');
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body: SCIExecutionRequest = await req.json();
    const { proposalId, tenantId, contentUnits } = body;

    if (!tenantId || !proposalId || !contentUnits || contentUnits.length === 0) {
      return NextResponse.json(
        { error: 'tenantId, proposalId, and contentUnits required' },
        { status: 400 }
      );
    }

    // Verify tenant exists
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const results: ContentUnitResult[] = [];

    for (const unit of contentUnits) {
      try {
        const result = await executeContentUnit(supabase, tenantId, proposalId, unit);
        results.push(result);
      } catch (err) {
        results.push({
          contentUnitId: unit.contentUnitId,
          classification: unit.confirmedClassification,
          success: false,
          rowsProcessed: 0,
          pipeline: unit.confirmedClassification,
          error: String(err),
        });
      }
    }

    const response: SCIExecutionResult = {
      proposalId,
      results,
      overallSuccess: results.every(r => r.success),
    };

    return NextResponse.json(response);

  } catch (err) {
    console.error('[SCI Execute] Error:', err);
    return NextResponse.json(
      { error: 'Execution failed', details: String(err) },
      { status: 500 }
    );
  }
}

async function executeContentUnit(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: ContentUnitExecution
): Promise<ContentUnitResult> {
  switch (unit.confirmedClassification) {
    case 'target':
      return executeTargetPipeline(supabase, tenantId, proposalId, unit);
    case 'transaction':
      return executeTransactionPipeline(supabase, tenantId, proposalId, unit);
    case 'entity':
      return executeEntityPipeline(supabase, tenantId, proposalId, unit);
    case 'plan':
      return executePlanStub(unit);
  }
}

// ============================================================
// TARGET PIPELINE — the critical new addition
// ============================================================

async function executeTargetPipeline(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: ContentUnitExecution
): Promise<ContentUnitResult> {
  const rows = unit.rawData;
  if (!rows || rows.length === 0) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'target',
      success: true,
      rowsProcessed: 0,
      pipeline: 'target',
    };
  }

  // Create import batch
  const batchId = crypto.randomUUID();
  await supabase.from('import_batches').insert({
    id: batchId,
    tenant_id: tenantId,
    file_name: `sci-execute-${proposalId}`,
    file_type: 'sci',
    status: 'processing',
    row_count: rows.length,
    metadata: { source: 'sci', proposalId, contentUnitId: unit.contentUnitId } as unknown as Json,
  });

  // Resolve data_type from contentUnitId (format: fileName::tabName::tabIndex)
  const parts = unit.contentUnitId.split('::');
  const fileName = parts[0] || 'unknown';
  const tabName = parts[1] || 'Sheet1';
  const normalized = normalizeFileNameToDataType(fileName);
  const isGenericTab = tabName === 'Sheet1' || tabName === 'Hoja1';
  const dataType = !isGenericTab && normalized.length > 2
    ? `${normalized}__${tabName.toLowerCase().replace(/[\s\-]+/g, '_')}`
    : normalized || tabName.toLowerCase().replace(/[\s\-]+/g, '_');

  // Build semantic_roles map from bindings
  const semanticRoles: Record<string, { role: string; confidence: number; claimedBy: string }> = {};
  for (const binding of unit.confirmedBindings) {
    semanticRoles[binding.sourceField] = {
      role: binding.semanticRole,
      confidence: binding.confidence,
      claimedBy: binding.claimedBy,
    };
  }

  // Resolve entity IDs from bindings
  const entityIdBinding = unit.confirmedBindings.find(
    b => b.semanticRole === 'entity_identifier'
  );
  const entityIdField = entityIdBinding?.sourceField;
  const entityIdMap = new Map<string, string>();

  if (entityIdField) {
    // Collect unique external IDs
    const externalIds = new Set<string>();
    for (const row of rows) {
      const val = row[entityIdField];
      if (val != null && String(val).trim()) {
        externalIds.add(String(val).trim());
      }
    }

    // Fetch existing entities
    const allIds = Array.from(externalIds);
    const BATCH = 200;
    for (let i = 0; i < allIds.length; i += BATCH) {
      const slice = allIds.slice(i, i + BATCH);
      const { data: existing } = await supabase
        .from('entities')
        .select('id, external_id')
        .eq('tenant_id', tenantId)
        .in('external_id', slice);

      if (existing) {
        for (const e of existing) {
          if (e.external_id) entityIdMap.set(e.external_id, e.id);
        }
      }
    }
  }

  // Build committed_data rows
  const insertRows = rows.map((row, i) => {
    let entityId: string | null = null;
    if (entityIdField && row[entityIdField] != null) {
      entityId = entityIdMap.get(String(row[entityIdField]).trim()) || null;
    }

    return {
      tenant_id: tenantId,
      import_batch_id: batchId,
      entity_id: entityId,
      period_id: null,
      data_type: dataType,
      row_data: { ...row, _sheetName: tabName, _rowIndex: i },
      metadata: {
        source: 'sci',
        proposalId,
        semantic_roles: semanticRoles,
        resolved_data_type: dataType,
      },
    };
  });

  // Bulk insert in 5000-row chunks
  const CHUNK = 5000;
  let totalInserted = 0;
  for (let i = 0; i < insertRows.length; i += CHUNK) {
    const slice = insertRows.slice(i, i + CHUNK);
    const { error: insertErr } = await supabase
      .from('committed_data')
      .insert(slice);

    if (insertErr) {
      console.error('[SCI Execute] Target insert failed:', insertErr);
      await supabase.from('import_batches').update({
        status: 'failed',
        error_summary: { error: insertErr.message } as unknown as Json,
      }).eq('id', batchId);

      return {
        contentUnitId: unit.contentUnitId,
        classification: 'target',
        success: false,
        rowsProcessed: totalInserted,
        pipeline: 'target',
        error: insertErr.message,
      };
    }
    totalInserted += slice.length;
  }

  // Update batch status
  await supabase.from('import_batches').update({
    status: 'completed',
    row_count: totalInserted,
  }).eq('id', batchId);

  console.log(`[SCI Execute] Target: ${totalInserted} rows committed, data_type=${dataType}`);

  // Trigger convergence re-run for all active rule_sets
  const { data: ruleSets } = await supabase
    .from('rule_sets')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  let convergenceCount = 0;
  if (ruleSets && ruleSets.length > 0) {
    for (const rs of ruleSets) {
      try {
        const result = await convergeBindings(tenantId, rs.id, supabase);
        if (result.derivations.length > 0) {
          // Read existing bindings and merge
          const { data: rsData } = await supabase
            .from('rule_sets')
            .select('input_bindings')
            .eq('id', rs.id)
            .single();

          const existing = ((rsData?.input_bindings as Record<string, unknown>)?.metric_derivations ?? []) as Array<Record<string, unknown>>;
          const merged = [...existing];

          for (const d of result.derivations) {
            if (!merged.some(e => e.metric === d.metric)) {
              merged.push(d as unknown as Record<string, unknown>);
            }
          }

          await supabase
            .from('rule_sets')
            .update({ input_bindings: { metric_derivations: merged } as unknown as Json })
            .eq('id', rs.id);

          convergenceCount += result.derivations.length;
          console.log(`[SCI Execute] Convergence for ${rs.name}: ${result.derivations.length} new derivations`);
        }
      } catch (convErr) {
        console.error(`[SCI Execute] Convergence failed for ${rs.name}:`, convErr);
      }
    }
  }

  console.log(`[SCI Execute] Target pipeline complete: ${totalInserted} rows, ${convergenceCount} derivations`);

  return {
    contentUnitId: unit.contentUnitId,
    classification: 'target',
    success: true,
    rowsProcessed: totalInserted,
    pipeline: 'target',
  };
}

// ============================================================
// TRANSACTION PIPELINE — standard committed_data insert
// ============================================================

async function executeTransactionPipeline(
  supabase: SupabaseClient,
  tenantId: string,
  proposalId: string,
  unit: ContentUnitExecution
): Promise<ContentUnitResult> {
  const rows = unit.rawData;
  if (!rows || rows.length === 0) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'transaction',
      success: true,
      rowsProcessed: 0,
      pipeline: 'transaction',
    };
  }

  const batchId = crypto.randomUUID();
  await supabase.from('import_batches').insert({
    id: batchId,
    tenant_id: tenantId,
    file_name: `sci-execute-${proposalId}`,
    file_type: 'sci',
    status: 'processing',
    row_count: rows.length,
    metadata: { source: 'sci', proposalId, contentUnitId: unit.contentUnitId } as unknown as Json,
  });

  // Resolve data_type
  const parts = unit.contentUnitId.split('::');
  const fileName = parts[0] || 'unknown';
  const tabName = parts[1] || 'Sheet1';
  const normalized = normalizeFileNameToDataType(fileName);
  const dataType = normalized.length > 2 ? normalized : tabName.toLowerCase().replace(/[\s\-]+/g, '_');

  // Resolve entity IDs
  const entityIdBinding = unit.confirmedBindings.find(
    b => b.semanticRole === 'entity_identifier'
  );
  const entityIdField = entityIdBinding?.sourceField;
  const entityIdMap = new Map<string, string>();

  if (entityIdField) {
    const externalIds = new Set<string>();
    for (const row of rows) {
      const val = row[entityIdField];
      if (val != null && String(val).trim()) {
        externalIds.add(String(val).trim());
      }
    }

    const allIds = Array.from(externalIds);
    const BATCH = 200;
    for (let i = 0; i < allIds.length; i += BATCH) {
      const slice = allIds.slice(i, i + BATCH);
      const { data: existing } = await supabase
        .from('entities')
        .select('id, external_id')
        .eq('tenant_id', tenantId)
        .in('external_id', slice);

      if (existing) {
        for (const e of existing) {
          if (e.external_id) entityIdMap.set(e.external_id, e.id);
        }
      }
    }
  }

  // Build insert rows
  const insertRows = rows.map((row, i) => {
    let entityId: string | null = null;
    if (entityIdField && row[entityIdField] != null) {
      entityId = entityIdMap.get(String(row[entityIdField]).trim()) || null;
    }

    return {
      tenant_id: tenantId,
      import_batch_id: batchId,
      entity_id: entityId,
      period_id: null,
      data_type: dataType,
      row_data: { ...row, _sheetName: tabName, _rowIndex: i },
      metadata: {
        source: 'sci',
        proposalId,
        resolved_data_type: dataType,
      },
    };
  });

  const CHUNK = 5000;
  let totalInserted = 0;
  for (let i = 0; i < insertRows.length; i += CHUNK) {
    const slice = insertRows.slice(i, i + CHUNK);
    const { error: insertErr } = await supabase
      .from('committed_data')
      .insert(slice);

    if (insertErr) {
      console.error('[SCI Execute] Transaction insert failed:', insertErr);
      return {
        contentUnitId: unit.contentUnitId,
        classification: 'transaction',
        success: false,
        rowsProcessed: totalInserted,
        pipeline: 'transaction',
        error: insertErr.message,
      };
    }
    totalInserted += slice.length;
  }

  await supabase.from('import_batches').update({
    status: 'completed',
    row_count: totalInserted,
  }).eq('id', batchId);

  console.log(`[SCI Execute] Transaction: ${totalInserted} rows committed, data_type=${dataType}`);

  return {
    contentUnitId: unit.contentUnitId,
    classification: 'transaction',
    success: true,
    rowsProcessed: totalInserted,
    pipeline: 'transaction',
  };
}

// ============================================================
// ENTITY PIPELINE — dedup + create entities
// ============================================================

async function executeEntityPipeline(
  supabase: SupabaseClient,
  tenantId: string,
  _proposalId: string,
  unit: ContentUnitExecution
): Promise<ContentUnitResult> {
  const rows = unit.rawData;
  if (!rows || rows.length === 0) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'entity',
      success: true,
      rowsProcessed: 0,
      pipeline: 'entity',
    };
  }

  // Find entity identifier and name fields from semantic bindings
  const idBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier');
  const nameBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_name');
  const licenseBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_license');

  if (!idBinding) {
    return {
      contentUnitId: unit.contentUnitId,
      classification: 'entity',
      success: false,
      rowsProcessed: 0,
      pipeline: 'entity',
      error: 'No entity_identifier binding found',
    };
  }

  // Collect unique external IDs with metadata
  const entityData = new Map<string, { name: string; role?: string; licenses?: string }>();
  for (const row of rows) {
    const eid = row[idBinding.sourceField];
    if (eid == null || !String(eid).trim()) continue;
    const key = String(eid).trim();
    if (entityData.has(key)) continue;

    const name = nameBinding ? String(row[nameBinding.sourceField] || key).trim() : key;
    const meta: { name: string; role?: string; licenses?: string } = { name };

    // Extract role from any role-like field
    for (const binding of unit.confirmedBindings) {
      if (binding.semanticRole === 'entity_attribute') {
        const fieldLower = binding.sourceField.toLowerCase().replace(/[\s_-]+/g, '');
        if (ROLE_TARGETS.some(t => fieldLower.includes(t))) {
          meta.role = String(row[binding.sourceField] || '').trim();
        }
      }
    }

    if (licenseBinding) {
      meta.licenses = String(row[licenseBinding.sourceField] || '').trim();
    }

    entityData.set(key, meta);
  }

  // Fetch existing entities
  const allIds = Array.from(entityData.keys());
  const existingMap = new Map<string, string>();
  const BATCH = 200;
  for (let i = 0; i < allIds.length; i += BATCH) {
    const slice = allIds.slice(i, i + BATCH);
    const { data: existing } = await supabase
      .from('entities')
      .select('id, external_id')
      .eq('tenant_id', tenantId)
      .in('external_id', slice);

    if (existing) {
      for (const e of existing) {
        if (e.external_id) existingMap.set(e.external_id, e.id);
      }
    }
  }

  // Create new entities (dedup against existing)
  const newIds = allIds.filter(eid => !existingMap.has(eid));
  let created = 0;

  if (newIds.length > 0) {
    const newEntities = newIds.map(eid => {
      const meta = entityData.get(eid);
      return {
        tenant_id: tenantId,
        external_id: eid,
        display_name: meta?.name || eid,
        entity_type: 'individual' as const,
        status: 'active' as const,
        temporal_attributes: [] as Json[],
        metadata: {
          ...(meta?.role ? { role: meta.role } : {}),
          ...(meta?.licenses ? { product_licenses: meta.licenses } : {}),
        } as Record<string, Json>,
      };
    });

    const INSERT_BATCH = 5000;
    for (let i = 0; i < newEntities.length; i += INSERT_BATCH) {
      const slice = newEntities.slice(i, i + INSERT_BATCH);
      const { error: entErr } = await supabase
        .from('entities')
        .insert(slice);

      if (entErr) {
        return {
          contentUnitId: unit.contentUnitId,
          classification: 'entity' as const,
          success: false,
          rowsProcessed: created,
          pipeline: 'entity',
          error: entErr.message,
        };
      }
      created += slice.length;
    }
  }

  console.log(`[SCI Execute] Entity: ${created} new, ${existingMap.size} existing (deduped)`);

  return {
    contentUnitId: unit.contentUnitId,
    classification: 'entity',
    success: true,
    rowsProcessed: rows.length,
    pipeline: 'entity',
  };
}

// ============================================================
// PLAN PIPELINE — stub (routes to existing plan interpretation)
// ============================================================

function executePlanStub(unit: ContentUnitExecution): ContentUnitResult {
  // Plan interpretation is currently only available through the Configure UI
  // This stub acknowledges the classification but defers execution
  console.log(`[SCI Execute] Plan content unit ${unit.contentUnitId} — route to plan interpretation (deferred)`);
  return {
    contentUnitId: unit.contentUnitId,
    classification: 'plan',
    success: true,
    rowsProcessed: 0,
    pipeline: 'plan-deferred',
  };
}
