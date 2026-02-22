/**
 * POST /api/calculation/run
 *
 * Server-side calculation orchestrator.
 * Uses service role client (bypasses RLS) to read inputs and write results.
 * Reuses the SAME evaluator functions from run-calculation.ts —
 * this proves the actual engine logic, not a reimplementation.
 *
 * Body: { tenantId, periodId, ruleSetId }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  evaluateComponent,
  aggregateMetrics,
  buildMetricsForComponent,
  type ComponentResult,
  type AIContextSheet,
} from '@/lib/calculation/run-calculation';
import type { PlanComponent } from '@/types/compensation-plan';
import type { Json } from '@/lib/supabase/database.types';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tenantId, periodId, ruleSetId } = body;

  if (!tenantId || !periodId || !ruleSetId) {
    return NextResponse.json(
      { error: 'Missing required fields: tenantId, periodId, ruleSetId' },
      { status: 400 }
    );
  }

  const supabase = await createServiceRoleClient();
  const log: string[] = [];
  const addLog = (msg: string) => { log.push(msg); console.log(`[CalcAPI] ${msg}`); };

  addLog(`Starting: tenant=${tenantId}, period=${periodId}, ruleSet=${ruleSetId}`);

  // ── 1. Fetch rule set ──
  const { data: ruleSet, error: rsErr } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings, population_config, metadata')
    .eq('id', ruleSetId)
    .single();

  if (rsErr || !ruleSet) {
    return NextResponse.json(
      { error: `Rule set not found: ${rsErr?.message}`, log },
      { status: 404 }
    );
  }

  // Parse components from JSONB
  const componentsJson = ruleSet.components as Record<string, unknown>;
  const variants = (componentsJson?.variants as Array<Record<string, unknown>>) ?? [];
  const defaultVariant = variants[0];
  const components: PlanComponent[] = (defaultVariant?.components as PlanComponent[]) ?? [];

  if (components.length === 0) {
    return NextResponse.json(
      { error: 'Rule set has no components', log },
      { status: 400 }
    );
  }

  addLog(`Rule set "${ruleSet.name}" has ${components.length} components`);

  // ── 2. Fetch entities via assignments (OB-75: paginated, no 1000-row cap) ──
  const PAGE_SIZE = 10000;
  const assignments: Array<{ entity_id: string }> = [];
  let assignPage = 0;
  while (true) {
    const from = assignPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data: page, error: aErr } = await supabase
      .from('rule_set_assignments')
      .select('entity_id')
      .eq('tenant_id', tenantId)
      .eq('rule_set_id', ruleSetId)
      .range(from, to);

    if (aErr) {
      return NextResponse.json(
        { error: `Failed to fetch assignments: ${aErr.message}`, log },
        { status: 500 }
      );
    }
    if (!page || page.length === 0) break;
    assignments.push(...page);
    if (page.length < PAGE_SIZE) break;
    assignPage++;
  }

  const entityIds = assignments.map(a => a.entity_id);
  if (entityIds.length === 0) {
    return NextResponse.json(
      { error: 'No entities assigned to this rule set', log },
      { status: 400 }
    );
  }

  addLog(`${entityIds.length} entities assigned (paginated fetch)`);

  // Fetch entity display info (OB-75: paginated, batched .in() to avoid URL length limits)
  const entities: Array<{ id: string; external_id: string | null; display_name: string }> = [];
  const ENTITY_BATCH = 5000;
  for (let i = 0; i < entityIds.length; i += ENTITY_BATCH) {
    const batch = entityIds.slice(i, i + ENTITY_BATCH);
    const { data: page } = await supabase
      .from('entities')
      .select('id, external_id, display_name')
      .in('id', batch);
    if (page) entities.push(...page);
  }

  const entityMap = new Map(entities.map(e => [e.id, e]));

  // ── 3. Fetch period ──
  const { data: period } = await supabase
    .from('periods')
    .select('id, canonical_key')
    .eq('id', periodId)
    .single();

  if (!period) {
    return NextResponse.json(
      { error: 'Period not found', log },
      { status: 404 }
    );
  }

  addLog(`Period: ${period.canonical_key}`);

  // ── 4. Fetch committed data (OB-75: paginated, no 1000-row cap) ──
  const committedData: Array<{ entity_id: string | null; data_type: string; row_data: Json }> = [];
  let dataPage = 0;
  while (true) {
    const from = dataPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data: page } = await supabase
      .from('committed_data')
      .select('entity_id, data_type, row_data')
      .eq('tenant_id', tenantId)
      .eq('period_id', periodId)
      .range(from, to);

    if (!page || page.length === 0) break;
    committedData.push(...page);
    if (page.length < PAGE_SIZE) break;
    dataPage++;
  }

  addLog(`Fetched ${committedData.length} committed_data rows (paginated)`);

  // Group entity-level data by entity_id → data_type → rows
  const dataByEntity = new Map<string, Map<string, Array<{ row_data: Json }>>>();
  // Also keep flat structure for backward compat
  const flatDataByEntity = new Map<string, Array<{ row_data: Json }>>();

  // Store-level data (NULL entity_id) grouped by storeId → data_type → rows
  const storeData = new Map<string | number, Map<string, Array<{ row_data: Json }>>>();

  for (const row of committedData) {
    if (row.entity_id) {
      // Entity-level: group by entity + sheet
      if (!dataByEntity.has(row.entity_id)) {
        dataByEntity.set(row.entity_id, new Map());
      }
      const entitySheets = dataByEntity.get(row.entity_id)!;
      const sheetName = row.data_type || '_unknown';
      if (!entitySheets.has(sheetName)) {
        entitySheets.set(sheetName, []);
      }
      entitySheets.get(sheetName)!.push({ row_data: row.row_data });

      // Also flat
      if (!flatDataByEntity.has(row.entity_id)) {
        flatDataByEntity.set(row.entity_id, []);
      }
      flatDataByEntity.get(row.entity_id)!.push({ row_data: row.row_data });
    } else {
      // Store-level: group by store identifier
      const rd = row.row_data as Record<string, unknown> | null;
      const storeKey = (rd?.['storeId'] ?? rd?.['num_tienda'] ?? rd?.['No_Tienda'] ?? rd?.['Tienda']) as string | number | undefined;
      if (storeKey !== undefined) {
        if (!storeData.has(storeKey)) {
          storeData.set(storeKey, new Map());
        }
        const storeSheets = storeData.get(storeKey)!;
        const sheetName = row.data_type || '_unknown';
        if (!storeSheets.has(sheetName)) {
          storeSheets.set(sheetName, []);
        }
        storeSheets.get(sheetName)!.push({ row_data: row.row_data });
      }
    }
  }

  const entityRowCount = Array.from(flatDataByEntity.values()).reduce((s, r) => s + r.length, 0);
  const storeRowCount = committedData.length - entityRowCount;
  addLog(`${committedData.length} committed_data rows (${entityRowCount} entity-level, ${storeRowCount} store-level)`);

  // ── 4b. Fetch AI Import Context from import_batches.metadata (OB-75) ──
  // Korean Test: PASSES — AI determined sheet→component mapping at import time
  const aiContextSheets: AIContextSheet[] = [];
  try {
    // Get distinct batch IDs from committed_data for this period
    const { data: batchRows } = await supabase
      .from('committed_data')
      .select('import_batch_id')
      .eq('tenant_id', tenantId)
      .eq('period_id', periodId)
      .not('import_batch_id', 'is', null)
      .limit(100);

    const batchIds = Array.from(new Set((batchRows ?? []).map(r => r.import_batch_id).filter((id): id is string => id !== null)));

    if (batchIds.length > 0) {
      const { data: batches } = await supabase
        .from('import_batches')
        .select('id, metadata')
        .in('id', batchIds);

      for (const b of (batches ?? [])) {
        const meta = b.metadata as Record<string, unknown> | null;
        const aiCtx = meta?.ai_context as { sheets?: AIContextSheet[] } | undefined;
        if (aiCtx?.sheets) {
          aiContextSheets.push(...aiCtx.sheets);
        }
      }
    }

    if (aiContextSheets.length > 0) {
      addLog(`AI context loaded: ${aiContextSheets.length} sheet mappings from import batches`);
    } else {
      addLog('No AI context found in import_batches — using fallback name matching');
    }
  } catch (aiErr) {
    addLog(`AI context fetch failed (non-blocking): ${aiErr instanceof Error ? aiErr.message : 'unknown'}`);
  }

  // ── 5. Create calculation batch ──
  const { data: batch, error: batchErr } = await supabase
    .from('calculation_batches')
    .insert({
      tenant_id: tenantId,
      period_id: periodId,
      rule_set_id: ruleSetId,
      batch_type: 'standard',
      lifecycle_state: 'DRAFT',
      entity_count: entityIds.length,
      config: {} as unknown as Json,
      summary: {} as unknown as Json,
    })
    .select()
    .single();

  if (batchErr || !batch) {
    return NextResponse.json(
      { error: `Failed to create batch: ${batchErr?.message}`, log },
      { status: 500 }
    );
  }

  addLog(`Batch created: ${batch.id}`);

  // ── 6. Evaluate each entity using the REAL engine ──
  const entityResults: Array<{
    entity_id: string;
    rule_set_id: string;
    period_id: string;
    total_payout: number;
    components: ComponentResult[];
    metrics: Record<string, number>;
    attainment: { overall: number };
    metadata: { entityName: string; externalId: string };
  }> = [];

  let grandTotal = 0;

  for (const entityId of entityIds) {
    const entityInfo = entityMap.get(entityId);
    const entitySheetData = dataByEntity.get(entityId) || new Map();
    const entityRowsFlat = flatDataByEntity.get(entityId) || [];

    // Find this entity's store ID (use FIRST occurrence, not sum)
    const allEntityMetrics = aggregateMetrics(entityRowsFlat);
    let entityStoreId: string | number | undefined;
    for (const row of entityRowsFlat) {
      const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
        ? row.row_data as Record<string, unknown> : {};
      const sid = rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'];
      if (sid !== undefined && sid !== null) {
        entityStoreId = sid as string | number;
        break;
      }
    }
    const entityStoreData = entityStoreId !== undefined ? storeData.get(entityStoreId) : undefined;

    // Evaluate each component with sheet-aware metrics
    const componentResults: ComponentResult[] = [];
    let entityTotal = 0;

    for (const component of components) {
      // Build metrics specific to this component's matching sheet (OB-75: AI-context-aware)
      const metrics = buildMetricsForComponent(
        component,
        entitySheetData,
        entityStoreData,
        aiContextSheets
      );
      const result = evaluateComponent(component, metrics);
      componentResults.push(result);
      entityTotal += result.payout;
    }

    grandTotal += entityTotal;

    entityResults.push({
      entity_id: entityId,
      rule_set_id: ruleSetId,
      period_id: periodId,
      total_payout: entityTotal,
      components: componentResults,
      metrics: allEntityMetrics,
      attainment: { overall: allEntityMetrics['attainment'] ?? 0 },
      metadata: {
        entityName: entityInfo?.display_name ?? entityId,
        externalId: entityInfo?.external_id ?? '',
      },
    });

    // Only log first 20 and last 5 entities to avoid log flooding at scale
    if (entityResults.length <= 20 || entityResults.length > entityIds.length - 5) {
      addLog(`  ${entityInfo?.display_name ?? entityId}: ${entityTotal.toLocaleString()} (${componentResults.map(c => `${c.componentName}=${c.payout}`).join(', ')})`);
    } else if (entityResults.length === 21) {
      addLog(`  ... (${entityIds.length - 25} more entities) ...`);
    }
  }

  addLog(`Grand total: ${grandTotal.toLocaleString()}`);

  // ── 7. Write calculation_results (OB-75: batched for 22K+ entities) ──
  const insertRows = entityResults.map(r => ({
    tenant_id: tenantId,
    batch_id: batch.id,
    entity_id: r.entity_id,
    rule_set_id: r.rule_set_id,
    period_id: r.period_id,
    total_payout: r.total_payout,
    components: r.components.map(c => ({
      componentId: c.componentId,
      componentName: c.componentName,
      componentType: c.componentType,
      payout: c.payout,
      details: c.details,
    })) as unknown as Json,
    metrics: r.metrics as unknown as Json,
    attainment: r.attainment as unknown as Json,
    metadata: r.metadata as unknown as Json,
  }));

  const WRITE_BATCH = 5000;
  for (let i = 0; i < insertRows.length; i += WRITE_BATCH) {
    const slice = insertRows.slice(i, i + WRITE_BATCH);
    const { error: writeErr } = await supabase
      .from('calculation_results')
      .insert(slice);

    if (writeErr) {
      return NextResponse.json(
        { error: `Failed to write results batch ${i / WRITE_BATCH}: ${writeErr.message}`, log },
        { status: 500 }
      );
    }
  }

  addLog(`Wrote ${insertRows.length} calculation_results (in ${Math.ceil(insertRows.length / WRITE_BATCH)} batches)`);

  // ── 8. Transition batch to PREVIEW ──
  const { error: transErr } = await supabase
    .from('calculation_batches')
    .update({
      lifecycle_state: 'PREVIEW',
      entity_count: entityResults.length,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      summary: {
        total_payout: grandTotal,
        entity_count: entityResults.length,
        component_count: components.length,
        rule_set_name: ruleSet.name,
      } as unknown as Json,
    })
    .eq('id', batch.id);

  if (transErr) {
    addLog(`WARNING: Failed to transition batch: ${transErr.message}`);
  } else {
    addLog(`Batch transitioned to PREVIEW`);
  }

  // ── 9. Materialize entity_period_outcomes ──
  const outcomeRows = entityResults.map(r => ({
    tenant_id: tenantId,
    entity_id: r.entity_id,
    period_id: r.period_id,
    total_payout: r.total_payout,
    lowest_lifecycle_state: 'PREVIEW',
    rule_set_breakdown: [{
      rule_set_id: ruleSetId,
      total_payout: r.total_payout,
    }] as unknown as Json,
    component_breakdown: r.components.map(c => ({
      componentId: c.componentId,
      componentName: c.componentName,
      payout: c.payout,
    })) as unknown as Json,
    attainment_summary: r.attainment as unknown as Json,
    metadata: {} as unknown as Json,
  }));

  // Delete existing outcomes for this tenant+period first
  await supabase
    .from('entity_period_outcomes')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId);

  // OB-75: Batched insert for 22K+ outcomes
  let outcomeWriteErr: string | null = null;
  for (let i = 0; i < outcomeRows.length; i += WRITE_BATCH) {
    const slice = outcomeRows.slice(i, i + WRITE_BATCH);
    const { error: outErr } = await supabase
      .from('entity_period_outcomes')
      .insert(slice);

    if (outErr) {
      outcomeWriteErr = outErr.message;
      break;
    }
  }

  if (outcomeWriteErr) {
    addLog(`WARNING: Failed to materialize outcomes: ${outcomeWriteErr}`);
  } else {
    addLog(`Materialized ${outcomeRows.length} entity_period_outcomes (in ${Math.ceil(outcomeRows.length / WRITE_BATCH)} batches)`);
  }

  // ── 10. Metering ──
  const now = new Date();
  const meterPeriodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  try {
    await supabase.from('usage_metering').insert({
      tenant_id: tenantId,
      metric_name: 'calculation_run',
      metric_value: entityResults.length,
      period_key: meterPeriodKey,
      dimensions: {
        batch_id: batch.id,
        rule_set_id: ruleSetId,
        period_id: periodId,
        total_payout: grandTotal,
        component_count: components.length,
        source: 'api_calculation_run',
      } as unknown as Json,
    });
    addLog('Metering recorded');
  } catch {
    addLog('Metering failed (non-blocking)');
  }

  addLog(`COMPLETE: batch=${batch.id}, entities=${entityResults.length}, total=${grandTotal}`);

  return NextResponse.json({
    success: true,
    batchId: batch.id,
    entityCount: entityResults.length,
    totalPayout: grandTotal,
    results: entityResults.map(r => ({
      entityId: r.entity_id,
      entityName: r.metadata.entityName,
      totalPayout: r.total_payout,
      components: r.components.map(c => ({
        name: c.componentName,
        type: c.componentType,
        payout: c.payout,
      })),
    })),
    log,
  });
}
