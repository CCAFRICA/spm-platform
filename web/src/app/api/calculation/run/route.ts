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
  applyMetricDerivations,
  type ComponentResult,
  type AIContextSheet,
  type MetricDerivationRule,
} from '@/lib/calculation/run-calculation';
import { transformVariant } from '@/lib/calculation/intent-transformer';
import { executeIntent, type EntityData } from '@/lib/calculation/intent-executor';
import type { ComponentIntent } from '@/lib/calculation/intent-types';
import type { PlanComponent } from '@/types/compensation-plan';
import type { Json } from '@/lib/supabase/database.types';
import { persistSignal } from '@/lib/ai/signal-persistence';
import { loadDensity, persistDensityUpdates } from '@/lib/calculation/synaptic-density';
import {
  createSynapticSurface,
  writeSynapse,
  getExecutionMode,
  consolidateSurface,
  initializePatternDensity,
} from '@/lib/calculation/synaptic-surface';
import { generatePatternSignature } from '@/lib/calculation/pattern-signature';
// OB-81: Agent memory, flywheel, and insight wiring
import { loadPriorsForAgent, type AgentPriors } from '@/lib/agents/agent-memory';
// OB-83: Domain Agent dispatch — wraps calculation through negotiation protocol
import { createCalculationRequest, scoreCalculationResult } from '@/lib/domain/domain-dispatcher';
import '@/lib/domain/domains/icm'; // Import ICM to trigger domain registration
import { postConsolidationFlywheel } from '@/lib/calculation/flywheel-pipeline';
import {
  checkInlineInsights,
  generateFullAnalysis,
  DEFAULT_INSIGHT_CONFIG,
  type InlineInsight,
  type CalculationSummary,
} from '@/lib/agents/insight-agent';

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
  const defaultComponents: PlanComponent[] = (variants[0]?.components as PlanComponent[]) ?? [];

  if (defaultComponents.length === 0) {
    return NextResponse.json(
      { error: 'Rule set has no components', log },
      { status: 400 }
    );
  }

  addLog(`Rule set "${ruleSet.name}" has ${defaultComponents.length} components, ${variants.length} variants`);

  // ── OB-118: Parse metric derivation rules from input_bindings ──
  const inputBindings = ruleSet.input_bindings as Record<string, unknown> | null;
  const metricDerivations: MetricDerivationRule[] =
    (inputBindings?.metric_derivations as MetricDerivationRule[] | undefined) ?? [];
  if (metricDerivations.length > 0) {
    addLog(`OB-118 Metric derivations: ${metricDerivations.length} rules from input_bindings`);
  }

  // ── OB-76: Transform components to intents (once, before entity loop) ──
  const componentIntents: ComponentIntent[] = transformVariant(defaultComponents);
  addLog(`OB-76 Intent layer: ${componentIntents.length} components transformed to intents`);

  // ── 2. Fetch entities via assignments (OB-75: paginated, no 1000-row cap) ──
  const PAGE_SIZE = 1000; // Supabase project max_rows = 1000
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

  // HF-078: Deduplicate entity IDs to prevent UNIQUE constraint violations
  const entityIds = Array.from(new Set(assignments.map(a => a.entity_id)));
  if (entityIds.length === 0) {
    return NextResponse.json(
      { error: 'No entities assigned to this rule set', log },
      { status: 400 }
    );
  }

  addLog(`${entityIds.length} entities assigned (paginated fetch)`);

  // Fetch entity display info (OB-85-R3: reduced batch to 200 to avoid URL length limits)
  const entities: Array<{ id: string; external_id: string | null; display_name: string }> = [];
  const ENTITY_BATCH = 200; // 1000 UUIDs × 37 chars ≈ 37KB URL, exceeds Supabase limit
  for (let i = 0; i < entityIds.length; i += ENTITY_BATCH) {
    const batch = entityIds.slice(i, i + ENTITY_BATCH);
    const { data: page, error: entErr } = await supabase
      .from('entities')
      .select('id, external_id, display_name')
      .in('id', batch);
    if (entErr) {
      console.log(`[R3-DIAG] Entity batch ${i}-${i+batch.length} ERROR: ${entErr.message}`);
    }
    if (page) entities.push(...page);
  }

  const entityMap = new Map(entities.map(e => [e.id, e]));

  // ── 3. Fetch period ──
  const { data: period } = await supabase
    .from('periods')
    .select('id, canonical_key, start_date')
    .eq('id', periodId)
    .single();

  if (!period) {
    return NextResponse.json(
      { error: 'Period not found', log },
      { status: 404 }
    );
  }

  addLog(`Period: ${period.canonical_key}`);

  // ── 3b. OB-121: Find prior period (for delta derivations) ──
  const hasDeltaDerivations = metricDerivations.some(d => d.operation === 'delta');
  let priorPeriodId: string | null = null;
  if (hasDeltaDerivations && period.start_date) {
    const { data: priorPeriod } = await supabase
      .from('periods')
      .select('id')
      .eq('tenant_id', tenantId)
      .lt('start_date', period.start_date)
      .order('start_date', { ascending: false })
      .limit(1)
      .single();
    priorPeriodId = priorPeriod?.id ?? null;
    addLog(`Prior period for delta: ${priorPeriodId ?? 'none (first period)'}`);
  }

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
  addLog(`Store data: ${storeData.size} unique stores`);

  // ── 4b. OB-121: Fetch prior period data (only if delta derivations exist) ──
  const priorDataByEntity = new Map<string, Map<string, Array<{ row_data: Json }>>>();
  if (priorPeriodId) {
    const priorCommittedData: Array<{ entity_id: string | null; data_type: string; row_data: Json }> = [];
    let priorPage = 0;
    while (true) {
      const from = priorPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data: page } = await supabase
        .from('committed_data')
        .select('entity_id, data_type, row_data')
        .eq('tenant_id', tenantId)
        .eq('period_id', priorPeriodId)
        .range(from, to);

      if (!page || page.length === 0) break;
      priorCommittedData.push(...page);
      if (page.length < PAGE_SIZE) break;
      priorPage++;
    }

    for (const row of priorCommittedData) {
      if (row.entity_id) {
        if (!priorDataByEntity.has(row.entity_id)) {
          priorDataByEntity.set(row.entity_id, new Map());
        }
        const entitySheets = priorDataByEntity.get(row.entity_id)!;
        const sheetName = row.data_type || '_unknown';
        if (!entitySheets.has(sheetName)) {
          entitySheets.set(sheetName, []);
        }
        entitySheets.get(sheetName)!.push({ row_data: row.row_data });
      }
    }

    addLog(`Prior period data: ${priorCommittedData.length} rows for ${priorDataByEntity.size} entities`);
  }

  // ── OB-85-R3 Fix 1: Entity data consolidation ──
  // The import creates separate entity UUIDs per sheet for the same employee.
  // external_ids differ ("96568046" vs "1-96568046"), so we match by row_data.entityId.
  //
  // Build employee number → [entity UUIDs] map from committed_data row_data.
  const employeeToEntityIds = new Map<string, Set<string>>();
  for (const row of committedData) {
    if (!row.entity_id) continue;
    const rd = row.row_data as Record<string, unknown> | null;
    const empNum = String(rd?.['entityId'] ?? rd?.['num_empleado'] ?? '');
    if (empNum && empNum !== 'undefined' && empNum !== 'null') {
      if (!employeeToEntityIds.has(empNum)) {
        employeeToEntityIds.set(empNum, new Set());
      }
      employeeToEntityIds.get(empNum)!.add(row.entity_id);
    }
  }

  // Build roster entity external_id → entity UUID for lookup
  // Roster entities have simple numeric external_ids like "96568046"
  const extIdToAssignedId = new Map<string, string>();
  for (const e of entities) {
    if (e.external_id && entityIds.includes(e.id)) {
      extIdToAssignedId.set(e.external_id, e.id);
    }
  }

  // Merge: for each employee number with multiple UUIDs, find the roster entity
  // and merge all other UUIDs' data into it.
  let consolidatedCount = 0;
  for (const [empNum, uuidSet] of Array.from(employeeToEntityIds.entries())) {
    if (uuidSet.size <= 1) continue; // No siblings to merge

    // Find the "primary" entity — the one with roster sheet (Datos Colaborador)
    let primaryId: string | null = null;
    for (const uuid of Array.from(uuidSet)) {
      const sheets = dataByEntity.get(uuid);
      if (sheets) {
        for (const sheetName of Array.from(sheets.keys())) {
          if (['datos colaborador', 'roster', 'employee', 'empleados'].some(r => sheetName.toLowerCase().includes(r))) {
            primaryId = uuid;
            break;
          }
        }
      }
      if (primaryId) break;
    }

    // Fallback: use the entity that's in the extIdToAssignedId map
    if (!primaryId) {
      primaryId = extIdToAssignedId.get(empNum) ?? null;
    }
    if (!primaryId) continue;

    // Merge all sibling data into the primary entity
    for (const siblingId of Array.from(uuidSet)) {
      if (siblingId === primaryId) continue;

      const siblingSheetData = dataByEntity.get(siblingId);
      if (!siblingSheetData) continue;

      if (!dataByEntity.has(primaryId)) {
        dataByEntity.set(primaryId, new Map());
      }
      const primarySheets = dataByEntity.get(primaryId)!;
      for (const [sheetName, rows] of Array.from(siblingSheetData.entries())) {
        if (!primarySheets.has(sheetName)) {
          primarySheets.set(sheetName, []);
        }
        primarySheets.get(sheetName)!.push(...rows);
      }

      // Merge flat data
      const siblingFlat = flatDataByEntity.get(siblingId);
      if (siblingFlat) {
        if (!flatDataByEntity.has(primaryId)) {
          flatDataByEntity.set(primaryId, []);
        }
        flatDataByEntity.get(primaryId)!.push(...siblingFlat);
      }
      consolidatedCount++;
    }
  }

  if (consolidatedCount > 0) {
    addLog(`Entity consolidation: merged data from ${consolidatedCount} sibling UUIDs by employee number`);
  }

  // ── 4a. Population filter: only calculate entities on the roster ──
  // The roster sheet (e.g., "Datos Colaborador") defines which employees are active
  // for this period. Entities that only appear in transaction sheets (warranty, insurance)
  // but not on the roster should NOT be calculated.
  const rosterEntityIds = new Set<string>();
  const rosterSheetNames = ['Datos Colaborador', 'Roster', 'Employee', 'Empleados'];

  for (const [entityId, sheetMap] of Array.from(dataByEntity.entries())) {
    for (const sheetName of Array.from(sheetMap.keys())) {
      if (rosterSheetNames.some(r => sheetName.toLowerCase().includes(r.toLowerCase()))) {
        rosterEntityIds.add(entityId);
        break;
      }
    }
  }

  // If roster found, filter entityIds to only roster employees
  let calculationEntityIds = entityIds;
  if (rosterEntityIds.size > 0) {
    calculationEntityIds = entityIds.filter(id => rosterEntityIds.has(id));
    addLog(`Population filter: ${rosterEntityIds.size} entities on roster, ${calculationEntityIds.length} assigned+rostered (filtered from ${entityIds.length})`);
  } else {
    addLog(`No roster sheet detected — calculating all ${entityIds.length} assigned entities`);
  }

  // ── OB-85-R6: Pre-compute per-store entity sheet aggregates ──
  // For matrix_lookup column metrics that need store-level data derived from
  // entity-level sheets (e.g., store optical sales from individual optical sales),
  // aggregate entity data per store per sheet type AFTER consolidation.
  // Key: storeId → Map<sheetName, aggregated numeric metrics>
  const perStoreEntitySheetAgg = new Map<string, Map<string, Record<string, number>>>();
  for (const entityId of calculationEntityIds) {
    const entitySheetData = dataByEntity.get(entityId);
    if (!entitySheetData) continue;

    // Find this entity's storeId from its flat data
    const entityRows = flatDataByEntity.get(entityId) || [];
    let sid: string | undefined;
    for (const row of entityRows) {
      const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
        ? row.row_data as Record<string, unknown> : {};
      const s = rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'];
      if (s !== undefined && s !== null) {
        sid = String(s);
        break;
      }
    }
    if (!sid) continue;

    if (!perStoreEntitySheetAgg.has(sid)) {
      perStoreEntitySheetAgg.set(sid, new Map());
    }
    const storeSheetMap = perStoreEntitySheetAgg.get(sid)!;

    for (const [sheetName, rows] of Array.from(entitySheetData.entries())) {
      const existing = storeSheetMap.get(sheetName) ?? {};
      for (const row of rows) {
        const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
          ? row.row_data as Record<string, unknown> : {};
        for (const [key, value] of Object.entries(rd)) {
          if (typeof value === 'number' && !key.startsWith('_') && key !== 'date') {
            existing[key] = (existing[key] ?? 0) + value;
          }
        }
      }
      storeSheetMap.set(sheetName, existing);
    }
  }

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

  // ── 4c. OB-81: Load agent memory (three-flywheel priors) + create surface ──
  const synapticStartTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const domainId = 'icm'; // default domain — will be configurable per tenant
  const dispatchContext = { tenantId, domainId };
  let priors: AgentPriors;
  let density;
  try {
    priors = await loadPriorsForAgent(tenantId, domainId, 'calculation');
    density = priors.tenantDensity;
    addLog(`Agent memory loaded: ${density.size} tenant patterns, ${priors.foundationalPriors.size} foundational, ${priors.domainPriors.size} domain`);
  } catch (memErr) {
    console.error('[CalcAPI] Agent memory load failed, falling back to direct density:', memErr);
    try {
      density = await loadDensity(tenantId);
      addLog(`Fallback: Synaptic density loaded: ${density.size} patterns`);
    } catch {
      density = new Map() as Awaited<ReturnType<typeof loadDensity>>;
      addLog('Fallback: Synaptic density load failed (non-blocking) — starting fresh');
    }
    priors = {
      tenantDensity: density,
      foundationalPriors: new Map(),
      domainPriors: new Map(),
      signalHistory: { fieldMappingSignals: [], interpretationSignals: [], reconciliationSignals: [], resolutionSignals: [] },
    };
  }
  const coldStart = density.size === 0;
  const surface = createSynapticSurface(density);
  surface.stats.entityCount = calculationEntityIds.length;
  surface.stats.componentCount = componentIntents.length;

  // Generate pattern signatures and initialize density for each component
  const patternSignatures: string[] = [];
  for (const ci of componentIntents) {
    const sig = generatePatternSignature(ci);
    patternSignatures.push(sig);
    initializePatternDensity(surface, sig, ci.componentIndex);
  }
  addLog(`Pattern signatures: ${patternSignatures.length} generated`);

  // ── 5. Create calculation batch ──
  const { data: batch, error: batchErr } = await supabase
    .from('calculation_batches')
    .insert({
      tenant_id: tenantId,
      period_id: periodId,
      rule_set_id: ruleSetId,
      batch_type: 'standard',
      lifecycle_state: 'DRAFT',
      entity_count: calculationEntityIds.length,
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

  // ── 5a. OB-83: Domain Agent dispatch — create negotiation request ──
  const negotiationRequest = createCalculationRequest(dispatchContext, batch.id, periodId);
  addLog(`Domain dispatch: ${negotiationRequest.domainId} → ${negotiationRequest.requestType} (request=${negotiationRequest.requestId})`);

  // ── 5b. OB-81: Batch-load period history for temporal_window support ──
  const periodHistoryMap = new Map<string, number[]>();
  try {
    const TEMPORAL_WINDOW_MAX = 12;
    const { data: priorPeriodResults } = await supabase
      .from('calculation_results')
      .select('entity_id, total_payout')
      .eq('tenant_id', tenantId)
      .neq('period_id', periodId)
      .order('created_at', { ascending: false })
      .limit(TEMPORAL_WINDOW_MAX * Math.min(calculationEntityIds.length, 1000));

    if (priorPeriodResults && priorPeriodResults.length > 0) {
      for (const row of priorPeriodResults) {
        if (!periodHistoryMap.has(row.entity_id)) {
          periodHistoryMap.set(row.entity_id, []);
        }
        periodHistoryMap.get(row.entity_id)!.push(row.total_payout);
      }
      addLog(`Period history loaded: ${periodHistoryMap.size} entities with prior results`);
    } else {
      addLog('No prior period results found (temporal_window will use current values)');
    }
  } catch (histErr) {
    addLog(`Period history load failed (temporal_window will degrade gracefully): ${histErr instanceof Error ? histErr.message : 'unknown'}`);
  }

  // OB-81: Inline insights collector
  const allInlineInsights: InlineInsight[] = [];
  const INSIGHT_CHECKPOINT_INTERVAL = Math.max(100, Math.floor(calculationEntityIds.length / 10));

  // ── 6. Evaluate each entity using DUAL-PATH: current engine + intent executor ──
  const entityResults: Array<{
    entity_id: string;
    rule_set_id: string;
    period_id: string;
    total_payout: number;
    components: ComponentResult[];
    metrics: Record<string, number>;
    attainment: { overall: number };
    metadata: Record<string, unknown>;
  }> = [];

  let grandTotal = 0;
  let intentMatchCount = 0;
  let intentMismatchCount = 0;

  for (const entityId of calculationEntityIds) {
    const entityInfo = entityMap.get(entityId);
    const entitySheetData = dataByEntity.get(entityId) || new Map();
    const entityRowsFlat = flatDataByEntity.get(entityId) || [];

    // Find this entity's store ID and role (use FIRST occurrence, not sum)
    const allEntityMetrics = aggregateMetrics(entityRowsFlat);
    let entityStoreId: string | number | undefined;
    let entityRole: string | null = null;
    for (const row of entityRowsFlat) {
      const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
        ? row.row_data as Record<string, unknown> : {};
      if (entityStoreId === undefined) {
        const sid = rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'];
        if (sid !== undefined && sid !== null) {
          entityStoreId = sid as string | number;
        }
      }
      if (!entityRole) {
        const role = rd['role'] ?? rd['Puesto'] ?? rd['puesto'];
        if (typeof role === 'string' && role.length > 0) {
          entityRole = role;
        }
      }
      if (entityStoreId !== undefined && entityRole) break;
    }
    const entityStoreData = entityStoreId !== undefined ? storeData.get(entityStoreId) : undefined;

    // OB-85-R3R4 Fix 2: Select variant based on entity role
    let selectedComponents = defaultComponents;
    if (entityRole && variants.length > 1) {
      const normRole = entityRole.toLowerCase().replace(/\s+/g, ' ').trim();
      for (const variant of variants) {
        const variantName = String(variant.variantName ?? variant.description ?? '');
        const normVariant = variantName.toLowerCase().replace(/\s+/g, ' ').trim();
        if (normRole === normVariant) {
          selectedComponents = (variant.components as PlanComponent[]) ?? defaultComponents;
          break;
        }
      }
      if (selectedComponents === defaultComponents) {
        const sorted = [...variants].sort((a, b) => {
          const aLen = String(a.variantName ?? '').length;
          const bLen = String(b.variantName ?? '').length;
          return bLen - aLen;
        });
        for (const variant of sorted) {
          const variantName = String(variant.variantName ?? variant.description ?? '');
          const normVariant = variantName.toLowerCase().replace(/\s+/g, ' ').trim();
          if (normRole.includes(normVariant) || normVariant.includes(normRole)) {
            selectedComponents = (variant.components as PlanComponent[]) ?? defaultComponents;
            break;
          }
        }
      }
    }

    // ── OB-118: Derive metrics once per entity from loaded data ──
    // OB-121: Pass prior period data for delta derivations
    const entityPriorData = priorDataByEntity.get(entityId);
    const derivedMetrics = metricDerivations.length > 0
      ? applyMetricDerivations(entitySheetData, metricDerivations, entityPriorData)
      : {};

    // ── CURRENT ENGINE PATH ──
    const componentResults: ComponentResult[] = [];
    let entityTotal = 0;
    const perComponentMetrics: Record<string, number>[] = [];

    for (const component of selectedComponents) {
      // OB-85-R6: Pass per-store entity sheet aggregates for matrix column metrics
      const entityStoreAgg = entityStoreId !== undefined
        ? perStoreEntitySheetAgg.get(String(entityStoreId))
        : undefined;
      const metrics = buildMetricsForComponent(
        component,
        entitySheetData,
        entityStoreData,
        aiContextSheets,
        entityStoreAgg
      );
      // OB-118: Merge derived metrics into component metrics
      // Derived metrics take precedence (they're specifically configured)
      for (const [key, value] of Object.entries(derivedMetrics)) {
        metrics[key] = value;
      }
      const result = evaluateComponent(component, metrics);
      componentResults.push(result);
      perComponentMetrics.push(metrics);
      entityTotal += result.payout;
    }

    // ── OB-76 INTENT ENGINE PATH (parallel execution) ──
    const intentTraces: unknown[] = [];
    let intentTotal = 0;
    const priorResults: number[] = [];

    for (const ci of componentIntents) {
      const metrics = perComponentMetrics[ci.componentIndex] ?? allEntityMetrics;
      const entityData: EntityData = {
        entityId,
        metrics,
        attributes: {},
        priorResults: [...priorResults],
        periodHistory: periodHistoryMap.get(entityId), // OB-81: temporal_window support
      };
      const intentResult = executeIntent(ci, entityData);
      intentTraces.push(intentResult.trace);
      intentTotal += intentResult.outcome;
      priorResults[ci.componentIndex] = intentResult.outcome;
    }

    // ── DUAL-PATH COMPARISON ──
    const entityMatch = Math.abs(entityTotal - intentTotal) < 0.01;
    if (entityMatch) {
      intentMatchCount++;
    } else {
      intentMismatchCount++;
    }

    // ── SYNAPTIC: Write per-component confidence synapses ──
    for (let ci = 0; ci < componentIntents.length; ci++) {
      const compMatch = componentResults[ci] && Math.abs(componentResults[ci].payout - (priorResults[ci] ?? 0)) < 0.01;
      writeSynapse(surface, {
        type: 'confidence',
        componentIndex: ci,
        entityId,
        value: compMatch ? 1.0 : 0.0,
        timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      });
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
        intentTraces,
        intentTotal,
        intentMatch: entityMatch,
      },
    });

    // OB-81: Inline insight check at intervals during calculation
    if (entityResults.length > 0 && entityResults.length % INSIGHT_CHECKPOINT_INTERVAL === 0) {
      try {
        const inlineInsights = checkInlineInsights(surface, DEFAULT_INSIGHT_CONFIG, entityResults.length);
        if (inlineInsights.length > 0) {
          allInlineInsights.push(...inlineInsights);
        }
      } catch {
        // Never block calculation for insight failure
      }
    }

    // Only log first 20 and last 5 entities to avoid log flooding at scale
    if (entityResults.length <= 20 || entityResults.length > calculationEntityIds.length - 5) {
      const matchLabel = entityMatch ? '✓' : '✗';
      addLog(`  ${entityInfo?.display_name ?? entityId}: ${entityTotal.toLocaleString()} | intent=${intentTotal.toLocaleString()} ${matchLabel}`);
    } else if (entityResults.length === 21) {
      addLog(`  ... (${calculationEntityIds.length - 25} more entities) ...`);
    }
  }

  const concordanceRate = (intentMatchCount / calculationEntityIds.length) * 100;
  addLog(`OB-76 Dual-path: ${intentMatchCount} match, ${intentMismatchCount} mismatch (${concordanceRate.toFixed(1)}% concordance)`);

  addLog(`Grand total: ${grandTotal.toLocaleString()}`);

  // ── SYNAPTIC: Consolidate surface + persist density updates ──
  const { densityUpdates, signalBatch } = consolidateSurface(surface);
  const synapticEndTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const synapticMs = Math.round(synapticEndTime - synapticStartTime);

  addLog(`Synaptic: ${surface.stats.totalSynapsesWritten} synapses, ${densityUpdates.length} density updates, ${surface.stats.anomalyCount} anomalies (${synapticMs}ms)`);

  // Persist density updates (fire-and-forget)
  if (densityUpdates.length > 0) {
    persistDensityUpdates(tenantId, densityUpdates).catch(err => {
      console.warn('[CalcAPI] Density persist failed (non-blocking):', err);
    });

    // OB-81: Flywheel post-consolidation — aggregate into F2 + F3 (fire-and-forget)
    try {
      const flywheelUpdates = densityUpdates.map(d => ({
        patternSignature: d.signature,
        confidence: d.newConfidence,
        executionCount: d.totalExecutions,
        anomalyRate: d.anomalyRate,
        learnedBehaviors: {},
      }));
      postConsolidationFlywheel(tenantId, domainId, undefined, flywheelUpdates)
        .catch(err => console.warn('[CalcAPI] Flywheel aggregation error (non-blocking):', err));
      addLog(`Flywheel: ${flywheelUpdates.length} patterns queued for F2+F3 aggregation`);
    } catch (fwErr) {
      console.warn('[CalcAPI] Flywheel wiring error (non-blocking):', fwErr);
    }
  }

  // Persist training signals from consolidation (fire-and-forget)
  if (signalBatch.length > 0) {
    for (const signal of signalBatch) {
      persistSignal({
        tenantId,
        signalType: (signal.signalType as string) ?? 'training:synaptic_density',
        signalValue: (signal.signalValue as Record<string, unknown>) ?? {},
        source: 'ai_prediction',
        context: { trigger: 'synaptic_consolidation', batchId: undefined },
      }).catch(err => {
        console.warn('[CalcAPI] Synaptic signal persist failed (non-blocking):', err);
      });
    }
  }

  // ── OB-77: Training signal — dual-path concordance (fire-and-forget) ──
  persistSignal({
    tenantId,
    signalType: 'training:dual_path_concordance',
    signalValue: {
      matchCount: intentMatchCount,
      mismatchCount: intentMismatchCount,
      concordanceRate: parseFloat(concordanceRate.toFixed(2)),
      entityCount: calculationEntityIds.length,
      componentCount: defaultComponents.length,
      intentsTransformed: componentIntents.length,
      totalPayout: grandTotal,
      ruleSetId,
      periodId,
    },
    confidence: concordanceRate / 100,
    source: 'ai_prediction',
    context: {
      ruleSetName: ruleSet.name,
      trigger: 'calculation_run',
    },
  }).catch(err => {
    console.warn('[CalcAPI] Training signal persist failed (non-blocking):', err);
  });

  // ── 7. Write calculation_results (OB-121: DELETE before INSERT to prevent stale accumulation) ──
  const { error: cleanupErr } = await supabase
    .from('calculation_results')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('rule_set_id', ruleSetId)
    .eq('period_id', periodId);

  if (cleanupErr) {
    return NextResponse.json(
      { error: `Failed to clear existing results: ${cleanupErr.message}`, log },
      { status: 500 }
    );
  }
  addLog(`OB-121: Cleaned old calculation_results for plan=${ruleSetId} period=${periodId}`);

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
        component_count: defaultComponents.length,
        rule_set_name: ruleSet.name,
        intentLayer: {
          matchCount: intentMatchCount,
          mismatchCount: intentMismatchCount,
          concordance: ((intentMatchCount / calculationEntityIds.length) * 100).toFixed(1) + '%',
          intentsTransformed: componentIntents.length,
        },
        synaptic: {
          synapsesWritten: surface.stats.totalSynapsesWritten,
          densityUpdates: densityUpdates.length,
          anomalies: surface.stats.anomalyCount,
          patternsLoaded: density.size,
          executionTimeMs: synapticMs,
          patternSignatures,
        },
      } as unknown as Json,
    })
    .eq('id', batch.id);

  if (transErr) {
    addLog(`WARNING: Failed to transition batch: ${transErr.message}`);
  } else {
    addLog(`Batch transitioned to PREVIEW`);
  }

  // ── 8b. OB-81: Fire async full analysis (does not block response) ──
  try {
    const sorted = entityResults.map(r => r.total_payout).sort((a, b) => a - b);
    const medianOutcome = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
    const zeroCount = entityResults.filter(r => r.total_payout === 0).length;

    const calcSummary: CalculationSummary = {
      entityCount: entityResults.length,
      componentCount: defaultComponents.length,
      totalOutcome: grandTotal,
      avgOutcome: entityResults.length > 0 ? grandTotal / entityResults.length : 0,
      medianOutcome,
      zeroOutcomeCount: zeroCount,
      concordanceRate: parseFloat(concordanceRate.toFixed(2)),
      topEntities: entityResults
        .sort((a, b) => b.total_payout - a.total_payout)
        .slice(0, 5)
        .map(r => ({ entityId: r.entity_id, outcome: r.total_payout })),
      bottomEntities: entityResults
        .sort((a, b) => a.total_payout - b.total_payout)
        .slice(0, 5)
        .map(r => ({ entityId: r.entity_id, outcome: r.total_payout })),
    };

    const analysis = generateFullAnalysis(batch.id, surface, calcSummary, DEFAULT_INSIGHT_CONFIG, allInlineInsights);

    // Store analysis in batch config (fire-and-forget)
    Promise.resolve(
      supabase
        .from('calculation_batches')
        .update({
          config: { insightAnalysis: analysis } as unknown as Json,
        })
        .eq('id', batch.id)
    ).then(() => {
      console.log('[CalcAPI] Insight analysis stored in batch config');
    }).catch((err: unknown) => console.warn('[CalcAPI] Insight analysis store failed (non-blocking):', err));

    addLog(`Insights: ${analysis.insights.length} prescriptive, ${analysis.alerts.length} alerts, ${allInlineInsights.length} inline`);
  } catch (insightErr) {
    console.warn('[CalcAPI] Full analysis failed (non-blocking):', insightErr);
    addLog('Insight analysis failed (non-blocking)');
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
        component_count: defaultComponents.length,
        source: 'api_calculation_run',
      } as unknown as Json,
    });
    addLog('Metering recorded');
  } catch {
    addLog('Metering failed (non-blocking)');
  }

  // ── OB-83: Domain Agent dispatch — score result through IAP ──
  const producedLearning = densityUpdates.length > 0 || signalBatch.length > 0;
  const avgConfidence = concordanceRate / 100; // concordance rate as 0-1 confidence
  const dispatchResult = scoreCalculationResult(
    dispatchContext,
    negotiationRequest.requestId,
    null, // actual results are in the response body below
    avgConfidence,
    producedLearning
  );
  addLog(`IAP score: I=${dispatchResult.negotiation.iapScore.intelligence.toFixed(2)} A=${dispatchResult.negotiation.iapScore.acceleration.toFixed(2)} P=${dispatchResult.negotiation.iapScore.performance.toFixed(2)} composite=${dispatchResult.negotiation.iapScore.composite.toFixed(3)}`);

  addLog(`COMPLETE: batch=${batch.id}, entities=${entityResults.length}, total=${grandTotal}`);

  return NextResponse.json({
    success: true,
    batchId: batch.id,
    entityCount: entityResults.length,
    totalPayout: grandTotal,
    intentLayer: {
      matchCount: intentMatchCount,
      mismatchCount: intentMismatchCount,
      concordance: `${((intentMatchCount / calculationEntityIds.length) * 100).toFixed(1)}%`,
      intentsTransformed: componentIntents.length,
    },
    synaptic: {
      synapsesWritten: surface.stats.totalSynapsesWritten,
      densityUpdates: densityUpdates.length,
      anomalies: surface.stats.anomalyCount,
      patternsLoaded: density.size,
      executionTimeMs: synapticMs,
      patternSignatures,
      executionModes: patternSignatures.map(sig => ({
        signature: sig,
        mode: getExecutionMode(surface, sig),
      })),
    },
    // OB-81: Density profile and inline insights
    densityProfile: {
      patternsTracked: density.size,
      coldStart,
      flywheelPriorsLoaded: priors.foundationalPriors.size + priors.domainPriors.size,
      agentMemorySource: density.size > 0 ? 'tenant' : (priors.foundationalPriors.size > 0 ? 'flywheel' : 'fresh'),
    },
    inlineInsights: allInlineInsights,
    // OB-83: Domain Agent negotiation metadata
    negotiation: dispatchResult.negotiation,
    results: entityResults.map(r => ({
      entityId: r.entity_id,
      entityName: r.metadata.entityName as string,
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
