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
import { debandWorksheet } from './deband-sheet';
// HF-259 Q3/Q6: idempotency (single-flight + fingerprint reuse) + lifecycle audit. Degrade-safe.
import {
  computePlanContentHash,
  findCompletedRuleSet,
  claimRun,
  completeRun,
  failRun,
  writeRuleSetLifecycleEvent,
} from './plan-idempotency';
import type { ComponentOutcome } from './interpretation-errors';

/**
 * HF-280 — import atomicity decision (pure, exported for deterministic testing).
 *
 * A rule set persists ONLY if every component of every variant completed
 * recognition. Returns a structured abort reason when the import must fail as a
 * whole (skeleton failure, zero usable components, OR any non-success component
 * outcome after the retry policy), or null when persistence may proceed.
 *
 * Korean Test / AUD-009: the predicate is outcome.status ONLY — every failure
 * cause aborts identically; no registry of drop reasons. The component name,
 * variant (appliesTo), and underlying error in the message are DISPLAY data
 * carried verbatim from the outcomes, never predicate inputs.
 */
export function evaluateImportAtomicity(args: {
  skeletonError?: string;
  componentsCount: number;
  componentOutcomes: ComponentOutcome[];
}): { reason: string } | null {
  const { skeletonError, componentsCount } = args;
  const componentOutcomes = args.componentOutcomes || [];
  const failedOutcomes = componentOutcomes.filter(o => o.status !== 'success');
  if (!skeletonError && componentsCount > 0 && failedOutcomes.length === 0) {
    return null; // every component recognized — persist may proceed
  }
  const failureDetails = failedOutcomes
    .map(f => {
      const variant = f.appliesTo && f.appliesTo.length > 0 ? ` [variant ${f.appliesTo.join('+')}]` : '';
      return `${f.name}${variant}: ${f.errClass ?? 'error'}${f.errMessage ? ` — ${f.errMessage}` : ''}${f.violations ? ` (${f.violations})` : ''}`;
    })
    .join('; ');
  const reason = skeletonError
    ? `Plan skeleton call failed: ${skeletonError}`
    : componentsCount === 0
      ? (failureDetails
          ? `Plan interpretation produced no usable components — ${failedOutcomes.length} component construction failure(s): ${failureDetails}`
          : 'Plan interpretation produced no components. The LLM may have received incomplete plan text or could not extract structure. Check upstream sheet classification.')
      : `Plan import aborted (HF-280 atomicity) — ${failedOutcomes.length} of ${componentOutcomes.length} component(s) failed recognition after retries; no partial plan persisted. Re-import once the plan/recognition is corrected. Failures: ${failureDetails}`;
  return { reason };
}

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
    // OB-255 / OB-254: DE-BAND each sheet (recover the real header, lift __section, drop banner / repeated
    // sub-headers / subtotal junk) BEFORE flattening to the LLM. Without this the model reads the raw
    // banded grid (__EMPTY headers, title banners, interleaved per-branch headers) and cannot recognize
    // the commission rules. Reuses the merged OB-254 de-bander — no new logic, Korean-clean.
    // A plan is a RULE, not a data dump: the interpreter needs the column STRUCTURE + a representative
    // sample of rows to recognize the commission rule (the per-row rates are DATA, bound at calc time by
    // convergence — not plan constants). Sending every row makes the model enumerate per-row and overrun
    // the skeleton token budget (the truncated-JSON failure). Cap to a representative sample per sheet,
    // covering distinct __section groups, and state the true total so the model generalizes.
    const PLAN_SAMPLE_ROWS = 12;
    const flattenDebanded = (sheetName: string): string[] => {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) return [];
      const db = debandWorksheet(XLSX, worksheet, sheetName);
      if (db.rows.length === 0) return [];
      // representative sample: spread across __section groups if present, else the head
      const sectionCol = db.columns.includes('__section') ? '__section' : null;
      let sample = db.rows;
      if (db.rows.length > PLAN_SAMPLE_ROWS) {
        if (sectionCol) {
          const bySection = new Map<string, Record<string, unknown>[]>();
          for (const r of db.rows) { const k = String(r[sectionCol] ?? ''); if (!bySection.has(k)) bySection.set(k, []); bySection.get(k)!.push(r); }
          const perSection = Math.max(1, Math.floor(PLAN_SAMPLE_ROWS / bySection.size));
          sample = Array.from(bySection.values()).flatMap(rows => rows.slice(0, perSection)).slice(0, PLAN_SAMPLE_ROWS);
        } else {
          sample = db.rows.slice(0, PLAN_SAMPLE_ROWS);
        }
      }
      const out: string[] = [`=== Sheet: ${sheetName} (${db.rows.length} rows total; ${sample.length} shown) ===`, db.columns.join('\t')];
      for (const rec of sample) {
        const values = db.columns.map(c => String(rec[c] ?? '').trim());
        if (values.some(v => v !== '')) out.push(values.join('\t'));
      }
      out.push('');
      return out;
    };
    const sheetTexts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      if (planSheetNames.size > 0 && !planSheetNames.has(sheetName)) continue;
      sheetTexts.push(...flattenDebanded(sheetName));
    }
    if (sheetTexts.length === 0) {
      // no named plan sheet matched → de-band every sheet (Carry Everything safety net)
      for (const sheetName of workbook.SheetNames) sheetTexts.push(...flattenDebanded(sheetName));
    }
    documentContent = sheetTexts.join('\n');
    console.log(`[SCI plan-interp] XLSX de-banded text extracted: ${documentContent.length} chars from ${planSheetNames.size || workbook.SheetNames.length} sheets`);
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

  // HF-280 — IMPORT ATOMICITY (replaces the HF-247/HF-248 partial-success
  // tolerance). A rule set persists ONLY if every component of every variant
  // completed recognition. Any non-success outcome after the existing retry policy
  // fails the import as a whole; no partial variant or plan is ever persisted.
  //
  // Why: the post-HF-279 cold re-imports persisted PARTIAL plans that calculated
  // clean-looking, WRONG totals — BCL ejecutivo missing "Captacion de Depositos"
  // (c2-ejecutivo: attempts=3, cognition_violation, partialSuccess=true persisted),
  // Meridian missing one component in both variants. The HF-279 coherence invariant
  // correctly rejected the incoherent component intents; the defect was that the
  // import absorbed those failures at the plan seam instead of failing loudly.
  //
  // Korean Test / AUD-009: the predicate is outcome.status ONLY — every failure
  // cause aborts identically; there is no registry of drop reasons. The component
  // name, variant (appliesTo), and underlying error in the message are DISPLAY data
  // carried verbatim from the outcome, never predicate inputs.
  const orchestratedComponents = orchestration.interpretation.components;
  const componentsCount = orchestratedComponents.length;
  const atomicity = evaluateImportAtomicity({
    skeletonError: orchestration.skeletonError,
    componentsCount,
    componentOutcomes: orchestration.componentOutcomes || [],
  });
  if (atomicity) {
    const reason = atomicity.reason;
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
  // HF-300 (C1, DIAG-071): supersede only PRIOR VERSIONS OF THE SAME PLAN, identified by `name`
  // (the plan's identity across re-exports). content_hash is the FILE identity and is already handled
  // by the HF-259 exact-duplicate REUSE earlier in this function. The pre-HF query archived EVERY
  // non-archived rule_set for the tenant (no plan-identity filter), so importing N distinct plans left
  // only the LAST active (DIAG-071 C1: 1 active / 11 archived on the MIR tenant). Scoping to `name`
  // archives only this plan's prior version, leaves the OTHER plans active, and converges a reimport of
  // the same N plans to exactly N active — the "idempotent on plan name" intent the comment below
  // already claimed but the code never enforced. Scale-by-Design: holds for any N, no per-count assumption.
  const { error: supersedeError, data: supersededRows } = await supabase
    .from('rule_sets')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('name', planName)
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
