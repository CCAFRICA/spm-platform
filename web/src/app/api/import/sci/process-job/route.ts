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
import { generateContentProfile } from '@/lib/sci/content-profile';
import { enhanceWithHeaderComprehension } from '@/lib/sci/header-comprehension';
import { createIngestionState, buildProposalFromState } from '@/lib/sci/synaptic-ingestion-state';
import { resolveClassification } from '@/lib/sci/resolver';
import { classifyByHCPattern } from '@/lib/sci/hc-pattern-classifier';
import { computeStructuralFingerprint, lookupPriorSignals, writeClassificationSignal } from '@/lib/sci/classification-signal-service';
import type { ClassificationSignalPayload } from '@/lib/sci/classification-signal-service';
import type { ClassificationTrace } from '@/lib/sci/synaptic-ingestion-state';
import { loadPromotedPatterns } from '@/lib/sci/promoted-patterns';
import { lookupFingerprint, writeFingerprint } from '@/lib/sci/fingerprint-flywheel';
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

    // Compute structural fingerprint
    const primarySheet = sheets[0];
    const fingerprintHash = primarySheet
      ? computeFingerprintHashSync(primarySheet.columns, primarySheet.rows)
      : '';

    await supabase.from('processing_jobs').update({
      structural_fingerprint: fingerprintHash,
    }).eq('id', jobId);

    // Check flywheel (DS-017 Tier Routing)
    let recognitionTier: 1 | 2 | 3 = 3;
    let flywheelResult = null;
    if (primarySheet) {
      try {
        flywheelResult = await lookupFingerprint(
          tenantId, primarySheet.columns, primarySheet.rows,
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
        recognitionTier = flywheelResult.tier;
      } catch (fpErr) {
        console.warn(`[SCI-WORKER] Flywheel lookup failed (non-blocking):`, fpErr);
      }
    }

    // Classify: generate profiles + (optionally) call LLM
    const fileName = job.file_name.replace(/^\d+_[a-f0-9]{8}_/, ''); // Strip upload prefix
    const profileMap = new Map<string, ContentProfile>();
    const fileSheets: Array<{ sourceFile: string; sheetName: string }> = [];

    for (let tabIndex = 0; tabIndex < sheets.length; tabIndex++) {
      const sheet = sheets[tabIndex];
      const sampleRows = sheet.rows.slice(0, ANALYSIS_SAMPLE_SIZE);
      const profile = generateContentProfile(
        sheet.sheetName, tabIndex, fileName,
        sheet.columns, sampleRows, sheet.totalRowCount,
      );
      profileMap.set(sheet.sheetName, profile);
      fileSheets.push({ sourceFile: fileName, sheetName: sheet.sheetName });
    }

    // Header comprehension — skip for Tier 1
    const skipHC = recognitionTier === 1 && flywheelResult?.match;
    if (!skipHC) {
      await enhanceWithHeaderComprehension(
        profileMap,
        sheets.map(s => ({
          sheetName: s.sheetName,
          columns: s.columns,
          sampleRows: s.rows.slice(0, 5),
          rowCount: s.totalRowCount,
        })),
        tenantId,
      );
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
      if (priors.length > 0) {
        state.priorSignals.set(profile.contentUnitId, priors);
      }
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

    // Flywheel write (fire-and-forget)
    for (const unit of contentUnits) {
      if (!unit.fieldBindings || unit.fieldBindings.length === 0) continue;
      const columnRoles: Record<string, string> = {};
      for (const b of unit.fieldBindings) columnRoles[b.sourceField] = b.semanticRole;
      writeFingerprint(
        tenantId, fingerprintHash,
        { classification: unit.classification, confidence: unit.confidence, fieldBindings: unit.fieldBindings, tabName: unit.tabName },
        columnRoles, fileName,
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      ).catch(() => {});
    }

    // Classification signal write (fire-and-forget)
    for (const unit of contentUnits) {
      const fp = computeStructuralFingerprint(
        Array.from(profileMap.values()).find(p => p.tabName === unit.tabName) || Array.from(profileMap.values())[0]
      );
      const payload: ClassificationSignalPayload = {
        tenantId,
        sourceFileName: fileName,
        sheetName: unit.tabName,
        fingerprint: fp,
        classification: unit.classification,
        confidence: unit.confidence,
        decisionSource: recognitionTier === 1 ? 'fingerprint_tier1' : 'crr_bayesian',
        classificationTrace: (unit.classificationTrace as unknown as ClassificationTrace) ?? ({} as unknown as ClassificationTrace),
        vocabularyBindings: null,
        agentScores: Object.fromEntries(unit.allScores.map(s => [s.agent, s.confidence])),
        humanCorrectionFrom: null,
      };
      writeClassificationSignal(
        payload,
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      ).catch(() => {});
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
