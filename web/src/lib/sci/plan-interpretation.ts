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
// HF-259 Q3/Q6: idempotency (single-flight + fingerprint reuse) + lifecycle audit. Degrade-safe.
import {
  computePlanContentHash,
  findCompletedRuleSet,
  claimRun,
  completeRun,
  failRun,
  writeRuleSetLifecycleEvent,
} from './plan-idempotency';

export async function executeBatchedPlanInterpretation(
  supabase: SupabaseClient,
  tenantId: string,
  planUnits: ContentUnitExecution[],
  userId: string,
  storagePath: string,
  // HF-270: runtime comprehended-field set (HC of the data sheets in this import).
  // Threaded to the per-component call so reference identities resolve against
  // comprehended columns instead of being minted from prose. Empty/absent →
  // orchestrator falls back to the plan's declared fields (plan-only import).
  comprehendedFields: Array<{ field: string; meaning: string; role: string }> = [],
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
  } else if (ext === 'pptx' || ext === 'docx') {
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
  } else {
    // HF-267 P2 (Carry Everything safety net): a tabular/unknown-format file reached the plan
    // pipeline (misclassified as plan). Do NOT run JSZip document extraction — JSZip.loadAsync on a
    // CSV throws "Can't find end of central directory" (and other tabular inputs hang downstream).
    // Return an explicit, non-crashing failure so the import surfaces a clear message. No re-route
    // (that would risk the duplicate-execution class HF-264 closed). This guard runs BEFORE the
    // single-flight claim, so it strands nothing. XLSX/XLS plans are handled in their own branch
    // above and are unaffected (HALT-4 CLEAR).
    console.error(`[SCI plan-interp] HF-267: tabular/non-document file (.${ext}) reached plan interpretation — refusing document extraction (misclassified as plan).`);
    return planUnits.map(u => ({
      contentUnitId: u.contentUnitId,
      classification: 'plan' as const,
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: `File format ".${ext ?? '?'}" is a tabular data file, not a plan document — it was misclassified as a plan. Re-import it (or correct its classification: entity/target/transaction/reference). No plan was interpreted.`,
    }));
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

  // ── HF-259 Q3: idempotency guard (before the expensive 1+N orchestration) ──
  // content_hash = SHA-256 of the plan file bytes (format-invariant; the unified-content key).
  const contentHash = computePlanContentHash(fileBuffer);
  const sourceFileName = storagePath.split('/').pop()?.replace(/^\d+_/, '') || primaryContentUnitId;
  // Layer 1 — read-before-derive / moat reuse: a completed run for this content → return its
  // rule_set without re-executing (~zero cost). Degrade-safe (null when the table is unapplied).
  const reusedRuleSetId = await findCompletedRuleSet(supabase, tenantId, contentHash);
  if (reusedRuleSetId) {
    console.log(`[SCI plan-interp] HF-259 idempotent REUSE — content_hash matched completed rule_set ${reusedRuleSetId}; no re-execution`);
    return planUnits.map((u, i) => ({
      contentUnitId: u.contentUnitId,
      classification: 'plan' as const,
      success: true,
      rowsProcessed: 0,
      pipeline: i === 0 ? 'plan-interpretation-reused' : 'plan-batch-included',
    }));
  }
  // Layer 2 — single-flight: claim the execution. A concurrent second import of the same content
  // loses the UNIQUE(tenant_id, content_hash) race → does NOT run a second interpretation.
  let claim = await claimRun(supabase, tenantId, contentHash, sourceFileName);
  if (!claim.claimed) {
    const concurrent = await findCompletedRuleSet(supabase, tenantId, contentHash);
    // HF-265: claim refused with NO surviving rule_set. Distinguish an ORPHANED 'completed' claim
    // (the rule_set was deleted but the claim row survived → findCompletedRuleSet returns null and
    // blocks re-import forever) from a genuine fresh 'in_progress' claim (a real concurrent run).
    // Only the orphan is cleared — deleting an in_progress row would permit a double-execution.
    if (!concurrent) {
      const { data: blockingRow } = await supabase
        .from('plan_interpretation_runs')
        .select('status')
        .eq('tenant_id', tenantId).eq('content_hash', contentHash)
        .maybeSingle();
      if ((blockingRow as { status?: string } | null)?.status === 'completed') {
        await supabase.from('plan_interpretation_runs')
          .delete().eq('tenant_id', tenantId).eq('content_hash', contentHash);
        console.log(`[SCI plan-interp] HF-265: deleted orphaned completed claim for content_hash=${contentHash.substring(0, 12)} (completed row with no surviving rule_set) — re-attempting interpretation`);
        claim = await claimRun(supabase, tenantId, contentHash, sourceFileName);
      }
    }
    if (!claim.claimed) {
      console.warn(
        `[SCI plan-interp] HF-259 SINGLE-FLIGHT — plan interpretation blocked by an existing in-progress ` +
        `claim for content_hash=${contentHash.substring(0, 12)} (${concurrent ? 'returning its rule_set' : 'no completed rule_set yet'}); ` +
        `not double-executing. If this persists, the claim may be stale — HF-264 TTL auto-expires claims ` +
        `older than 5 minutes on the next import attempt.`,
      );
      return planUnits.map((u, i) => ({
        contentUnitId: u.contentUnitId,
        classification: 'plan' as const,
        success: true,
        rowsProcessed: 0,
        pipeline: i === 0 ? (concurrent ? 'plan-interpretation-reused' : 'plan-interpretation-deduped') : 'plan-batch-included',
      }));
    }
    // orphan recovered (claim now granted) → fall through to interpretation
  }

  // HF-264: try/finally backstop so the single-flight claim is ALWAYS released — including on an
  // uncaught throw between claimRun and completeRun. Pre-HF-264 such a throw stranded an in_progress
  // claim with no TTL, permanently blocking re-import of this plan (two prod incidents). The TTL in
  // claimRun (HF-264 Phase 2) is the cross-process backstop; this finally is the in-process one.
  let interpretationCompleted = false;
  try {
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
    fieldComprehension: comprehendedFields, // HF-270
  });

  const interpretation = orchestration.interpretation as unknown as Record<string, unknown>;

  // HF-247 Phase 3 + HF-248 Phase 1: combined failure guard. Catches skeleton
  // failure, all-components-failed cases, and the existing fallback/error/parseError
  // shapes. partialSuccess (some succeeded, some failed) is NOT a hard failure —
  // it persists what worked and surfaces the rest via componentOutcomes.
  const orchestratedComponents = orchestration.interpretation.components;
  const componentsCount = orchestratedComponents.length;
  if (orchestration.skeletonError || componentsCount === 0) {
    // HF-265 (P5): surface the ACTUAL per-component construction failures instead of a generic
    // "produced no components" message. componentOutcomes carries errClass + errMessage + violations.
    const failed = (orchestration.componentOutcomes || []).filter(o => o.status === 'failed');
    const failureDetails = failed
      .map(f => `${f.name}: ${f.errClass ?? 'error'}${f.errMessage ? ` — ${f.errMessage}` : ''}${f.violations ? ` (${f.violations})` : ''}`)
      .join('; ');
    const reason = orchestration.skeletonError
      ? `Plan skeleton call failed: ${orchestration.skeletonError}`
      : failureDetails
        ? `Plan interpretation produced no usable components — ${failed.length} component construction failure(s): ${failureDetails}`
        : 'Plan interpretation produced no components. The LLM may have received incomplete plan text or could not extract structure. Check upstream sheet classification.';
    console.error(`[SCI plan-interp] Refusing to persist rule_set — ${reason}`);
    await failRun(supabase, tenantId, contentHash); // HF-259: release the single-flight claim so a retry can re-claim
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
    await failRun(supabase, tenantId, contentHash); // HF-259: release the claim
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
    // HF-259 Q6: explicit audited supersession. With Q3 idempotency upstream, a duplicate import
    // is deduped before this point, so these events record only GENUINE re-interpretations.
    for (const prior of supersededRows as Array<{ id: string }>) {
      if (prior.id === ruleSetId) continue; // don't record the just-created row superseding itself
      await writeRuleSetLifecycleEvent(supabase, {
        tenantId,
        ruleSetId: prior.id,
        eventType: 'superseded',
        predecessorId: ruleSetId, // the new rule_set that replaces this prior one
        actor: userId,
        reason: `reinterpretation: superseded by rule_set ${ruleSetId} (${planName})`,
      });
    }
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
    await failRun(supabase, tenantId, contentHash); // HF-259: release the claim
    return planUnits.map(u => ({
      contentUnitId: u.contentUnitId,
      classification: 'plan' as const,
      success: false,
      rowsProcessed: 0,
      pipeline: 'plan-interpretation',
      error: upsertError.message,
    }));
  }

  // HF-259 Q3: bind the completed run to its rule_set (the reuse pointer) — a later import of the
  // same content now returns this without re-deriving. Q6: record the 'created' lifecycle event.
  await completeRun(supabase, tenantId, contentHash, ruleSetId);
  interpretationCompleted = true; // HF-264: claim transitioned to 'completed'; finally must NOT release it
  await writeRuleSetLifecycleEvent(supabase, {
    tenantId,
    ruleSetId,
    eventType: 'created',
    predecessorId: null,
    actor: userId,
    reason: `plan interpretation: ${planName} (content_hash ${contentHash.substring(0, 12)})`,
  });

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
  } finally {
    // HF-264: release the in_progress claim on every non-completed exit — the three explicit
    // failure returns above AND any uncaught throw between claim and completeRun. failRun is an
    // idempotent delete of the in_progress row, so it is safe even where a failure path already
    // released it. Only the success path (interpretationCompleted=true) skips release, because
    // completeRun has already transitioned the row to 'completed'.
    if (!interpretationCompleted) {
      try {
        await failRun(supabase, tenantId, contentHash);
        console.log(`[SCI plan-interp] HF-264: released in_progress claim on non-completed exit (content_hash=${contentHash.substring(0, 12)})`);
      } catch { /* best-effort */ }
    }
  }
}
