/**
 * HF-239 Phase 0.1: Plan interpretation module.
 * HF-257 (AP-17): `executePlanPipeline` (the per-unit plan duplicate) was removed.
 * `executeBatchedPlanInterpretation` is now the SOLE plan-interpretation function;
 * execute-bulk's plan dispatch calls only it.
 *
 * Extracted from execute/route.ts. Behavior unchanged from execute/route.ts at
 * main @ 6ceb16a7:
 *   - File download from Supabase Storage (or fileBase64 from documentMetadata)
 *   - Text extraction (XLSX/PPTX/DOCX/PDF)
 *   - AI plan interpretation via aiService.interpretPlan
 *   - bridgeAIToEngineFormat → engine-format components + input_bindings
 *   - HF-132 supersede existing active rule_sets for tenant
 *   - rule_sets upsert with status='active', input_bindings populated
 *   - HF-198 E5 / HF-201 Shape B comprehension signal emission (fire-and-forget)
 *
 * The two exported functions match the original signatures so the call
 * sites in execute-bulk can match the patterns from execute's POST handler
 * (planUnits batched into one call; individual fallback unit per dispatch).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/lib/supabase/database.types';
import type { ContentUnitExecution, ContentUnitResult } from './sci-types';

export async function executeBatchedPlanInterpretation(
  supabase: SupabaseClient,
  tenantId: string,
  planUnits: ContentUnitExecution[],
  userId: string,
  storagePath: string,
): Promise<ContentUnitResult[]> {
  const primaryUnit = planUnits[0];
  const primaryContentUnitId = primaryUnit.contentUnitId;

  console.log(`[SCI plan-interp] Batched interpretation: ${planUnits.length} sheets from ${storagePath}`);
  const { data: fileData, error: downloadErr } = await supabase.storage
    .from('ingestion-raw')
    .download(storagePath);

  if (downloadErr || !fileData) {
    console.error(`[SCI plan-interp] Storage download failed: ${downloadErr?.message || 'No data'}`);
    return planUnits.map(u => ({
      contentUnitId: u.contentUnitId,
      classification: 'plan' as const,
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: `Failed to download plan file: ${downloadErr?.message || 'No data'}`,
    }));
  }

  const fileBuffer = Buffer.from(await fileData.arrayBuffer());
  const ext = storagePath.split('.').pop()?.toLowerCase();

  let documentContent = '';
  let pdfBase64ForAI: string | undefined;
  let pdfMediaType: string | undefined;

  if (ext === 'pdf') {
    pdfBase64ForAI = fileBuffer.toString('base64');
    pdfMediaType = 'application/pdf';
    documentContent = `[PDF document: ${pdfBase64ForAI.length} bytes base64]`;
  } else if (ext === 'xlsx' || ext === 'xls') {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const planSheetNames = new Set(planUnits.map(u => u.tabName).filter(Boolean));
    const sheetTexts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      if (planSheetNames.size > 0 && !planSheetNames.has(sheetName)) continue;
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;
      const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      if (rows.length === 0) continue;
      sheetTexts.push(`=== Sheet: ${sheetName} ===`);
      for (const row of rows) {
        const values = (row as unknown[]).map(v => String(v ?? '').trim());
        if (values.some(v => v !== '')) {
          sheetTexts.push(values.join('\t'));
        }
      }
      sheetTexts.push('');
    }
    if (sheetTexts.length === 0) {
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) continue;
        const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        if (rows.length === 0) continue;
        sheetTexts.push(`=== Sheet: ${sheetName} ===`);
        for (const row of rows) {
          const values = (row as unknown[]).map(v => String(v ?? '').trim());
          if (values.some(v => v !== '')) {
            sheetTexts.push(values.join('\t'));
          }
        }
        sheetTexts.push('');
      }
    }
    documentContent = sheetTexts.join('\n');
    console.log(`[SCI plan-interp] XLSX text extracted: ${documentContent.length} chars from ${planSheetNames.size} sheets`);
  } else {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(fileBuffer);
    if (ext === 'pptx') {
      const slideFiles = Object.keys(zip.files)
        .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => {
          const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
          const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
          return numA - numB;
        });
      const texts: string[] = [];
      for (const sf of slideFiles) {
        const content = await zip.file(sf)?.async('string');
        if (!content) continue;
        const matches = Array.from(content.matchAll(/<a:t>([^<]*)<\/a:t>/g));
        for (const m of matches) {
          const t = m[1].trim();
          if (t) texts.push(t);
        }
      }
      documentContent = texts.join('\n');
    } else {
      const docXml = await zip.file('word/document.xml')?.async('string');
      if (docXml) {
        const matches = Array.from(docXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g));
        documentContent = matches.map(m => m[1].trim()).filter(Boolean).join(' ');
      }
    }
  }

  if (!documentContent && !pdfBase64ForAI) {
    console.log(`[SCI plan-interp] No document content extracted from ${storagePath}`);
    return planUnits.map(u => ({
      contentUnitId: u.contentUnitId,
      classification: 'plan' as const,
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: 'No document content could be extracted from the plan file',
    }));
  }

  console.log(`[SCI plan-interp] Interpretation starting — ${documentContent.length} chars`);

  // HF-248 Phase 1+3: per-component two-phase interpretation. The orchestrator
  // calls plan_skeleton once (small JSON) then plan_component per index entry
  // (each ~one component fits in max_tokens). Resume map is loaded from a
  // prior partial-success import_batch when one exists for this tenant.
  const { orchestratePerComponentInterpretation } = await import('./plan-orchestration');
  const { loadResumeContext } = await import('./reimport-resume');
  const resumeCtx = await loadResumeContext(supabase, tenantId, storagePath);
  if (resumeCtx.priorBatchId) {
    console.log(`[SCI plan-interp] HF-248 resume context loaded — priorBatchId=${resumeCtx.priorBatchId} skipIds=${Array.from(resumeCtx.resumeSkipIds).join(',') || '(none)'}`);
  }
  const orchestration = await orchestratePerComponentInterpretation({
    documentContent,
    format: pdfBase64ForAI ? 'pdf' : 'text',
    pdfBase64: pdfBase64ForAI,
    pdfMediaType,
    signalContext: { tenantId, userId },
    resumeSkipIds: resumeCtx.resumeSkipIds,
    priorComponents: resumeCtx.priorComponents,
  });

  const interpretation = orchestration.interpretation as unknown as Record<string, unknown>;

  // HF-247 Phase 3 + HF-248 Phase 1: combined failure guard. Catches skeleton
  // failure, all-components-failed cases, and the existing fallback/error/parseError
  // shapes. partialSuccess (some succeeded, some failed) is NOT a hard failure —
  // it persists what worked and surfaces the rest via componentOutcomes.
  const orchestratedComponents = orchestration.interpretation.components;
  const componentsCount = orchestratedComponents.length;
  if (orchestration.skeletonError || componentsCount === 0) {
    const reason = orchestration.skeletonError
      ? `Plan skeleton call failed: ${orchestration.skeletonError}`
      : 'Plan interpretation produced no components. The LLM may have received incomplete plan text or could not extract structure. Check upstream sheet classification.';
    console.error(`[SCI plan-interp] Refusing to persist rule_set — ${reason}`);
    return planUnits.map(u => ({
      contentUnitId: u.contentUnitId,
      classification: 'plan' as const,
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: reason,
    }));
  }

  const { bridgeAIToEngineFormat } = await import('@/lib/compensation/ai-plan-interpreter');
  const engineFormat = bridgeAIToEngineFormat(
    interpretation as Record<string, unknown>,
    tenantId,
    userId,
  );

  const ruleSetId = crypto.randomUUID();
  const filenameFallback = primaryContentUnitId.split('::')[0]?.replace(/\.[^.]+$/, '') || '';
  const planName = engineFormat.name || filenameFallback || 'Untitled Plan';

  // AUD-013: supersede ALL prior rule_sets for this tenant (any status),
  // not just active. Pre-fix used `.eq('status', 'active')` which missed
  // rule_sets in draft / superseded / archived states — re-importing the
  // same plan would then leave a parallel `active` row instead of being
  // idempotent on plan name. Error checked.
  //
  // HF-244 Phase 3: supersession failure now BLOCKS the upsert. Pre-fix
  // logged the error and proceeded to upsert anyway — this is how BCL ended
  // up with two active rule_sets 60 seconds apart on 2026-05-21. If we can't
  // supersede prior rows, we don't insert a new active row.
  const { error: supersedeError, data: supersededRows } = await supabase
    .from('rule_sets')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .neq('status', 'archived')
    .select('id, name, status');
  if (supersedeError) {
    console.error('[SCI plan-interp] Supersession query failed — aborting upsert to prevent multi-active state:', supersedeError);
    return planUnits.map(u => ({
      contentUnitId: u.contentUnitId,
      classification: 'plan' as const,
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: `Supersession failed: ${supersedeError.message}`,
    }));
  }
  if (supersededRows && supersededRows.length > 0) {
    console.log(`[SCI plan-interp] Superseded ${supersededRows.length} prior rule_set(s) for tenant=${tenantId}`);
  }

  const { error: upsertError } = await supabase
    .from('rule_sets')
    .upsert({
      id: ruleSetId,
      tenant_id: tenantId,
      name: planName,
      description: engineFormat.description || '',
      status: 'active' as const,
      version: 1,
      population_config: { eligible_roles: [] },
      input_bindings: engineFormat.inputBindings as unknown as Json,
      components: engineFormat.components as unknown as Json,
      cadence_config: { period_type: orchestration.interpretation.cadence || 'monthly' } as unknown as Json,
      outcome_config: {},
      metadata: {
        plan_type: 'additive_lookup',
        source: 'sci',
        contentUnitId: primaryContentUnitId,
        batchedSheets: planUnits.map(u => u.contentUnitId),
        aiConfidence: orchestration.interpretation.confidence,
      } as unknown as Json,
      created_by: userId,
    });

  if (upsertError) {
    console.error('[SCI plan-interp] Batched plan save failed:', upsertError);
    return planUnits.map(u => ({
      contentUnitId: u.contentUnitId,
      classification: 'plan' as const,
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: upsertError.message,
    }));
  }

  const variants = engineFormat.components.variants || [];
  const componentCount = variants.reduce(
    (sum: number, v: { components?: unknown[] }) => sum + (v.components?.length || 0),
    0,
  );
  console.log(`[SCI plan-interp] Batched plan saved: ${planName} (${ruleSetId}), ${variants.length} variants, ${componentCount} components from ${planUnits.length} sheets`);

  try {
    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
    const componentsForSignals = orchestration.interpretation.components as unknown as Array<Record<string, unknown>>;
    void emitPlanComprehensionSignals({
      tenantId,
      ruleSetId,
      interpretation: { components: componentsForSignals },
      planConfidence: orchestration.interpretation.confidence,
    });
  } catch (sigErr) {
    console.warn('[SCI plan-interp] Comprehension signal emission threw (non-blocking):', sigErr instanceof Error ? sigErr.message : String(sigErr));
  }

  // HF-248 Phase 3: persist componentOutcomes + partialSuccess marker on the
  // import_batch so reimport-resume can pick up the failed components and
  // skip the successful ones.
  try {
    const { persistComponentOutcomes } = await import('./reimport-resume');
    await persistComponentOutcomes(supabase, tenantId, storagePath, ruleSetId, orchestration);
  } catch (persistErr) {
    console.warn('[SCI plan-interp] componentOutcomes persistence threw (non-blocking):', persistErr instanceof Error ? persistErr.message : String(persistErr));
  }

  return planUnits.map((u, i) => ({
    contentUnitId: u.contentUnitId,
    classification: 'plan' as const,
    success: true,
    rowsProcessed: i === 0 ? componentCount : 0,
    pipeline: i === 0 ? 'plan-interpretation' : 'plan-batch-included',
    // HF-248 Phase 3: per-component outcomes surfaced to the UI on the
    // primary result only (i === 0). Per-unit results downstream don't
    // need to duplicate the array.
    componentOutcomes: i === 0 ? orchestration.componentOutcomes : undefined,
    partialSuccess: i === 0 ? orchestration.partialSuccess : undefined,
  }));
}
