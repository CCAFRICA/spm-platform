/**
 * POST /api/import/sci/process-job
 *
 * OB-174 Phase 4: Async worker endpoint.
 * Processes a single processing_job: downloads file → computes fingerprint →
 * checks flywheel → classifies (Tier 1/2/3) → updates job status.
 *
 * Called by the client in parallel for each uploaded file.
 * Each invocation runs in its own Vercel Lambda — natural parallelism.
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateContentProfileStats, generateContentProfilePatterns } from '@/lib/sci/content-profile';
import { runDecomposedComprehension } from '@/lib/sci/header-comprehension';
import { createIngestionState, buildProposalFromState } from '@/lib/sci/synaptic-ingestion-state';
import { resolveClassification } from '@/lib/sci/resolver';
import { classifyByHCPattern } from '@/lib/sci/hc-pattern-classifier';
// OB-199 Phase 4 supplement A: facade re-established at lib/sci/classification-signal-service.ts.
import { computeStructuralFingerprint, lookupPriorSignals, lookupLexicalPrior, writeClassificationSignal, emitComprehensionFailureSignals, emitReinforcementBlockedSignal, shouldReinforceUnit } from '@/lib/sci/classification-signal-service';
import { CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
import type { ClassificationTrace } from '@/lib/sci/synaptic-ingestion-state';
import { loadPromotedPatterns } from '@/lib/sci/promoted-patterns';
import { queryTenantContext, computeEntityIdOverlap } from '@/lib/sci/tenant-context';
import { lookupFingerprint, writeFingerprint, type FlywheelLookupResult } from '@/lib/sci/fingerprint-flywheel';
import { computeFingerprintHashSync } from '@/lib/sci/structural-fingerprint';
import type { ContentProfile } from '@/lib/sci/sci-types';

const ANALYSIS_SAMPLE_SIZE = 50;

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Auth check
    const authClient = await createServerSupabaseClient();
    const { data: { user: authUser } } = await authClient.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { jobId } = await req.json() as { jobId: string };
    if (!jobId) {
      return NextResponse.json({ error: 'jobId required' }, { status: 400 });
    }

    // Fetch the job
    const { data: job, error: jobErr } = await supabase
      .from('processing_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobErr || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.status !== 'pending') {
      return NextResponse.json({ error: `Job already in status: ${job.status}` }, { status: 409 });
    }

    // Transition to 'classifying'
    await supabase
      .from('processing_jobs')
      .update({ status: 'classifying', started_at: new Date().toISOString() })
      .eq('id', jobId);

    const tenantId = job.tenant_id;

    // Download file from storage
    console.log(`[SCI-WORKER] Job ${jobId.substring(0, 8)}: Downloading ${job.file_name}`);
    const { data: fileData, error: downloadErr } = await supabase.storage
      .from('ingestion-raw')
      .download(job.file_storage_path);

    if (downloadErr || !fileData) {
      await supabase.from('processing_jobs').update({
        status: 'failed',
        error_detail: `Download failed: ${downloadErr?.message || 'No data'}`,
      }).eq('id', jobId);
      return NextResponse.json({ error: 'File download failed' }, { status: 500 });
    }

    // Parse file server-side
    const XLSX = await import('xlsx');
    const buffer = await fileData.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    const sheets: Array<{
      sheetName: string;
      columns: string[];
      rows: Record<string, unknown>[];
      totalRowCount: number;
    }> = [];

    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      if (!ws) continue;
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
      sheets.push({ sheetName, columns, rows: jsonData, totalRowCount: jsonData.length });
    }

    console.log(`[SCI-WORKER] Job ${jobId.substring(0, 8)}: Parsed ${sheets.reduce((s, sh) => s + sh.totalRowCount, 0)} rows across ${sheets.length} sheets`);

    // HF-197B: per-sheet fingerprint computation (was: single H(sheets[0]) for entire job).
    // The processing_jobs.structural_fingerprint row column retains primarySheet's hash for
    // backward compatibility with the trace surface (trace/route.ts reads one fingerprint
    // per job). Per-sheet caching operates at the structural_fingerprints flywheel layer
    // via the per-sheet writes below.
    const primarySheet = sheets[0];
    const fingerprintHash = primarySheet
      ? computeFingerprintHashSync(primarySheet.columns, primarySheet.rows)
      : '';

    await supabase.from('processing_jobs').update({
      structural_fingerprint: fingerprintHash,
    }).eq('id', jobId);

    // Per-sheet flywheel lookup (DIAG-021 H3 fix). Each sheet hashes its own columns/rows.
    const sheetFlywheelResults = new Map<string, FlywheelLookupResult>();
    for (const sheet of sheets) {
      try {
        const result = await lookupFingerprint(
          tenantId, sheet.columns, sheet.rows,
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
        sheetFlywheelResults.set(sheet.sheetName, result);
        console.log(`[SCI-WORKER] sheet=${sheet.sheetName} fingerprint=${result.fingerprintHash.substring(0, 12)} tier=${result.tier} match=${result.match} confidence=${result.confidence}`);
      } catch (fpErr) {
        console.warn(`[SCI-WORKER] Flywheel lookup failed for sheet=${sheet.sheetName} (non-blocking):`, fpErr instanceof Error ? fpErr.message : 'unknown');
      }
    }

    // Per-sheet helpers (DIAG-021 H3 fix).
    const sheetTier = (sheetName: string): 1 | 2 | 3 => (sheetFlywheelResults.get(sheetName)?.tier ?? 3);
    const sheetMatchTier1 = (sheetName: string) => {
      const r = sheetFlywheelResults.get(sheetName);
      return r?.tier === 1 && r.match;
    };

    // Job-level tier retained for processing_jobs.recognition_tier column backward compat
    // (trace surface and downstream consumers expect a single tier per job). Use primarySheet's
    // tier as the canonical job-level value; per-content-unit tier is set below.
    const recognitionTier: 1 | 2 | 3 = primarySheet ? sheetTier(primarySheet.sheetName) : 3;

    // Classify: generate profiles + (optionally) call LLM
    // HF-142: Strip HF-141 prefix format: timestamp_index_uuid8_originalFilename.xlsx
    // Old regex ^\d+_[a-f0-9]{8}_ failed because _index_ between timestamp and uuid breaks the pattern.
    const fileName = job.file_name.replace(/^\d+_\d+_[a-f0-9]{8}_/, '');
    const profileMap = new Map<string, ContentProfile>();
    const sheetSampleRowsBySheet = new Map<string, Record<string, unknown>[]>();
    const fileSheets: Array<{ sourceFile: string; sheetName: string }> = [];

    // HF-196 Phase 1G Path α — Phase A: deterministic stats only (no patterns yet).
    for (let tabIndex = 0; tabIndex < sheets.length; tabIndex++) {
      const sheet = sheets[tabIndex];
      const sampleRows = sheet.rows.slice(0, ANALYSIS_SAMPLE_SIZE);
      const profile = generateContentProfileStats(
        sheet.sheetName, tabIndex, fileName,
        sheet.columns, sampleRows, sheet.totalRowCount,
      );
      profileMap.set(sheet.sheetName, profile);
      sheetSampleRowsBySheet.set(sheet.sheetName, sampleRows);
      fileSheets.push({ sourceFile: fileName, sheetName: sheet.sheetName });
    }

    // Header comprehension — HF-197B: skip per-sheet (was: file-level skip on primary tier).
    const sheetsNeedingHC = sheets.filter(s => !sheetMatchTier1(s.sheetName));
    // OB-203 Phase 2 (5b): decomposed comprehension — atom read-before-derive, per-unit failures.
    const perSheetFailure = new Map<string, import('@/lib/sci/sci-types').ComprehensionFailureClass>();
    if (sheetsNeedingHC.length > 0) {
      const dc = await runDecomposedComprehension(
        profileMap,
        sheetsNeedingHC.map(s => ({ sheetName: s.sheetName, columns: s.columns, rows: s.rows, rowCount: s.totalRowCount })), // FULL rows (Deviation 2)
        tenantId,
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      // OB-203 Phase 1 (DI-4): per-unit failed_interpretation signal, each with ITS class.
      for (const [sheetName, failureClass] of Array.from(dc.perSheetFailure.entries())) {
        perSheetFailure.set(sheetName, failureClass);
        await emitComprehensionFailureSignals(
          { failureClass, durationMs: 0 },
          [{ sheetName }],
          (name) => sheetFlywheelResults.get(name)?.fingerprintHash ?? null,
          (name) => sheetFlywheelResults.get(name)?.tier ?? null,
          { tenantId, sourceFileName: fileName },
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
      }
    }
    const skipHC = sheetsNeedingHC.length === 0;

    // HF-196 Phase 1G Path α — Phase B: HC-aware pattern derivations (Decision 108).
    for (const [sheetName, profile] of Array.from(profileMap.entries())) {
      const hcInterpretations = profile.headerComprehension?.interpretations;
      const sampleRows = sheetSampleRowsBySheet.get(sheetName) ?? [];
      generateContentProfilePatterns(profile, hcInterpretations, sampleRows);
    }

    console.log(`[SCI-WORKER] Job ${jobId.substring(0, 8)}: HC ${skipHC ? 'SKIPPED (Tier 1)' : 'completed'}`);

    // Classification
    const promotedPatterns = await loadPromotedPatterns(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const state = createIngestionState(tenantId, fileName, profileMap);
    state.promotedPatterns = promotedPatterns;

    // Fingerprint + prior signals
    for (const [, profile] of Array.from(profileMap.entries())) {
      const fp = computeStructuralFingerprint(profile);
      const priors = await lookupPriorSignals(
        tenantId, fp,
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        '',
      );
      // HF-254 Fix 3b: additive lexical prior via columnRole distribution (same path).
      const lexicalPriors = await lookupLexicalPrior(
        tenantId,
        profile.fields.map(f => f.fieldName),
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      const allPriors = [...priors, ...lexicalPriors];
      if (allPriors.length > 0) {
        state.priorSignals.set(profile.contentUnitId, allPriors);
      }
    }

    // HF-183: Compute entity ID overlap per sheet before classification
    try {
      const tenantCtx = await queryTenantContext(
        tenantId,
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      if (tenantCtx.existingEntityExternalIds.size > 0) {
        const overlapMap = new Map<string, import('@/lib/sci/tenant-context').EntityIdOverlap>();
        for (const sheet of sheets) {
          const profile = profileMap.get(sheet.sheetName);
          if (profile) {
            const overlap = computeEntityIdOverlap(profile, sheet.rows, tenantCtx.existingEntityExternalIds);
            if (overlap) {
              overlapMap.set(profile.contentUnitId, overlap);
              console.log(`[SCI-OVERLAP] sheet=${sheet.sheetName} overlap=${Math.round(overlap.overlapPercentage * 100)}% signal=${overlap.overlapSignal}`);
            }
          }
        }
        if (overlapMap.size > 0) {
          state.entityIdOverlaps = overlapMap;
        }
      }
    } catch (overlapErr) {
      console.warn(`[SCI-OVERLAP] Computation failed (non-blocking):`, overlapErr instanceof Error ? overlapErr.message : 'unknown');
    }

    await resolveClassification(
      state,
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // HC pattern classification
    for (const [unitId, profile] of Array.from(state.contentUnits.entries())) {
      const hcResult = classifyByHCPattern(profile);
      if (hcResult) {
        const resolution = state.resolutions.get(unitId);
        if (resolution) {
          resolution.classification = hcResult.classification;
          resolution.confidence = hcResult.confidence;
          resolution.decisionSource = 'hc_pattern';
          resolution.claimType = 'FULL';
          resolution.requiresHumanReview = false;
        }
      }
    }

    // Build proposal units
    const contentUnits = buildProposalFromState(state, fileSheets)
      .filter(cu => !cu.contentUnitId.includes('::split'));

    // OB-203 Phase 2 (DI-4): mark comprehension-failed units as `failed_interpretation`, per-unit class.
    for (const cu of contentUnits) {
      const failureClass = perSheetFailure.get(cu.tabName);
      if (failureClass) cu.failedInterpretation = { failureClass, durationMs: 0 };
    }

    // OB-176 / HF-197B: Per-sheet recognitionTier and confidence override.
    // Each unit is tagged with ITS OWN sheet's tier (was: file-level tier for all units).
    // Tier 1 confidence override uses the unit's own flywheel confidence (was: primary's).
    for (const unit of contentUnits) {
      const unitTier = sheetTier(unit.tabName);
      (unit as unknown as { recognitionTier: number }).recognitionTier = unitTier;
      if (unitTier === 1) {
        const unitFlywheel = sheetFlywheelResults.get(unit.tabName);
        if (unitFlywheel?.confidence) {
          unit.confidence = Math.max(unit.confidence, unitFlywheel.confidence);
        }
      }
    }

    // Build classification result for job record
    const classificationResult = {
      contentUnits: contentUnits.map(u => ({
        contentUnitId: u.contentUnitId,
        sourceFile: u.sourceFile,
        tabName: u.tabName,
        classification: u.classification,
        confidence: u.confidence,
      })),
      recognitionTier,
    };

    // Update job with classification result
    await supabase.from('processing_jobs').update({
      status: 'classified',
      recognition_tier: recognitionTier,
      classification_result: classificationResult,
      proposal: { contentUnits },
    }).eq('id', jobId);

    const totalMs = Date.now() - startTime;
    console.log(`[SCI-WORKER] Job ${jobId.substring(0, 8)}: Classified in ${totalMs}ms (Tier ${recognitionTier})`);

    // Flywheel write (fire-and-forget) — HF-197B: per-sheet keying.
    // Each unit writes its OWN sheet's hash (was: reused fingerprintHash from sheets[0]),
    // so each (tenant_id, fingerprint_hash) row reflects exactly one sheet's classification.
    for (const unit of contentUnits) {
      // OB-203 Phase 2 (DI-7): failed_interpretation units do NOT reinforce the fingerprint flywheel.
      if (!shouldReinforceUnit(unit)) {
        void emitReinforcementBlockedSignal(tenantId, unit.tabName, 'fingerprint_update', process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        continue;
      }
      if (!unit.fieldBindings || unit.fieldBindings.length === 0) continue;
      const sheetForUnit = sheets.find(s => s.sheetName === unit.tabName);
      if (!sheetForUnit) {
        console.warn(`[SCI-WORKER] Could not locate sheet for unit tabName=${unit.tabName} — skipping flywheel write`);
        continue;
      }
      const unitHash = computeFingerprintHashSync(sheetForUnit.columns, sheetForUnit.rows);
      const columnRoles: Record<string, string> = {};
      for (const b of unit.fieldBindings) columnRoles[b.sourceField] = b.semanticRole;
      // HF-254 Fix 2a: enrich fieldBindings with native columnRole from the server-side
      // trace HC (identical shape to analyze + emitFlywheelSignals, AP-17).
      const pjInterpMap = ((unit.classificationTrace as Record<string, unknown> | undefined)
        ?.headerComprehension as
          | { interpretations?: Record<string, { columnRole?: string; identifiesWhat?: string }> }
          | undefined)?.interpretations ?? {};
      const pjEnrichedFieldBindings = unit.fieldBindings.map(b => {
        const interp = pjInterpMap[b.sourceField];
        return {
          ...b,
          ...(interp?.columnRole ? { columnRole: interp.columnRole } : {}),
          ...(interp?.identifiesWhat ? { identifiesWhat: interp.identifiesWhat } : {}),
        };
      });
      writeFingerprint(
        tenantId, unitHash,
        { classification: unit.classification, confidence: unit.confidence, fieldBindings: pjEnrichedFieldBindings, tabName: unit.tabName },
        columnRoles, fileName,
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      ).catch(() => {});
    }

    // Classification signal write (fire-and-forget)
    for (const unit of contentUnits) {
      // OB-203 Phase 2 (DI-7): failed_interpretation units do NOT reinforce the CRR prior.
      if (!shouldReinforceUnit(unit)) {
        void emitReinforcementBlockedSignal(tenantId, unit.tabName, 'crr_outcome', process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        continue;
      }
      const fp = computeStructuralFingerprint(
        Array.from(profileMap.values()).find(p => p.tabName === unit.tabName) || Array.from(profileMap.values())[0]
      );
      // OB-199 Phase 4 supplement A: thin facade re-establishes SCI structural markers.
      writeClassificationSignal({
        tenantId,
        sourceFileName: fileName,
        sheetName: unit.tabName,
        fingerprint: fp,
        classification: unit.classification,
        confidence: unit.confidence,
        decisionSource: sheetTier(unit.tabName) === 1 ? 'fingerprint_tier1' : 'crr_bayesian',
        classificationTrace: (unit.classificationTrace as unknown as ClassificationTrace) ?? ({} as unknown as ClassificationTrace),
        vocabularyBindings: null,
        agentScores: Object.fromEntries(unit.allScores.map(s => [s.agent, s.confidence])),
        humanCorrectionFrom: null,
      }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
        if (err instanceof CanonicalWriteError) {
          console.warn(`[SCIProcessJob] classification:outcome CanonicalWriteError (${err.cause}): ${err.message}`);
        } else {
          console.warn('[SCIProcessJob] classification:outcome unexpected error:', err instanceof Error ? err.message : String(err));
        }
      });
    }

    return NextResponse.json({
      jobId,
      status: 'classified',
      recognitionTier,
      contentUnits: contentUnits.length,
      durationMs: totalMs,
    });

  } catch (err) {
    console.error('[SCI-WORKER] Error:', err);
    return NextResponse.json(
      { error: 'Worker processing failed', details: String(err) },
      { status: 500 },
    );
  }
}
