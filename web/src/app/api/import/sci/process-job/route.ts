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
import { runDecomposedComprehension, extractFieldIdentitiesFromTrace } from '@/lib/sci/header-comprehension';
// OB-249 — Remediation EXPRESS (propose) at proposal time, off the atomic commit path.
import { runRemediationPropose, computeRemediationExclusions, dataColumns, dbRecall } from '@/lib/remediation/remediation-stage';
import { buildFieldIdentitiesFromBindings } from '@/lib/sci/field-identities';
import { findHcEntityIdColumn } from '@/lib/sci/commit-content-unit';
import { createIngestionState, buildProposalFromState } from '@/lib/sci/synaptic-ingestion-state';
import { resolveClassification } from '@/lib/sci/resolver';
// OB-199 Phase 4 supplement A: facade re-established at lib/sci/classification-signal-service.ts.
import { computeStructuralFingerprint, lookupPriorSignals, lookupLexicalPrior, writeClassificationSignal, emitComprehensionFailureSignals, emitReinforcementBlockedSignal, shouldReinforceUnit } from '@/lib/sci/classification-signal-service';
import { CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
import type { ClassificationTrace } from '@/lib/sci/synaptic-ingestion-state';
import { loadPromotedPatterns } from '@/lib/sci/promoted-patterns';
// HF-285-D: parse-once — persist the parsed workbook so execute-bulk reads it
// instead of re-parsing (keyed by content hash; same hash fn execute uses).
import { computeFileHashSha256 } from '@/lib/sci/file-content-hash';
import { writeParsedCompanion, type ParsedSheets } from '@/lib/sci/parsed-companion';
import { queryTenantContext, computeEntityIdOverlap } from '@/lib/sci/tenant-context';
import { lookupFingerprint, writeFingerprint, type FlywheelLookupResult } from '@/lib/sci/fingerprint-flywheel';
import { computeFingerprintHashSync } from '@/lib/sci/structural-fingerprint';
// OB-250 (DS-016 P-C1): classify on a BOUNDED sample for OOM-scale sheets so the worker never
// materializes the full sheet (the 86,608×87 parse-time spike). The commit worker re-reads windowed.
import { openSheetWindow, CELL_CHUNK_THRESHOLD, CHUNK_ROW_SIZE } from '@/lib/sci/sheet-window';
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

    // OB-250 P-B3: ATOMIC CLAIM — guarded conditional update so the client-fire and the cron sweep
    // can never both process the same job. The transition succeeds for exactly one caller (the one
    // that flips pending→classifying); a loser sees zero rows and 409s. Race-free, not check-then-act.
    const claim = await supabase
      .from('processing_jobs')
      .update({ status: 'classifying', started_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('status', 'pending')
      .select('id');
    if (claim.error || !claim.data || claim.data.length === 0) {
      return NextResponse.json({ error: 'Job not claimable (already claimed or not pending)', jobId }, { status: 409 });
    }

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
    // OB-250 P-C1: dense read halves the cell-map peak (sheet_to_json output byte-identical).
    const workbook = XLSX.read(buffer, { type: 'array', dense: true });

    const sheets: Array<{
      sheetName: string;
      columns: string[];
      rows: Record<string, unknown>[];
      totalRowCount: number;
    }> = [];

    // OB-250 P-C1: a sheet that would OOM (cells > threshold) is CLASSIFIED on a bounded sample
    // (columns + fingerprint + atom/HC over the first window) — NOT the full sheet. totalRowCount
    // carries the TRUE row count for the proposal; the commit worker re-reads the full sheet windowed.
    let anySampled = false;
    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      if (!ws) continue;
      const dim = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      const cells = Math.max(0, dim.e.r - dim.s.r) * (dim.e.c - dim.s.c + 1);
      if (cells > CELL_CHUNK_THRESHOLD) {
        const reader = openSheetWindow(XLSX, ws, sheetName);
        const sample = reader.readWindow(0, CHUNK_ROW_SIZE);
        anySampled = true;
        sheets.push({ sheetName, columns: reader.columns, rows: sample, totalRowCount: reader.totalRows });
        console.log(`[SCI-WORKER] OB-250: ${sheetName} ${reader.totalRows}r×${reader.columns.length}c — classify on bounded ${sample.length}-row sample (commit re-reads windowed)`);
      } else {
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
        sheets.push({ sheetName, columns, rows: jsonData, totalRowCount: jsonData.length });
      }
    }

    console.log(`[SCI-WORKER] Job ${jobId.substring(0, 8)}: Parsed ${sheets.reduce((s, sh) => s + sh.totalRowCount, 0)} rows across ${sheets.length} sheets`);

    // HF-285-D: write the parse-once companion (gzipped, keyed by content hash) so
    // execute-bulk reads it instead of re-parsing the same workbook. Best-effort —
    // never throws; a failure just means execute parses as before. fileHash uses the
    // SAME function execute computes, so the keys align.
    // OB-250: NEVER write a companion when any sheet was sampled — a partial companion would make
    // execute-bulk's companion-HIT commit only the sample (HALT-DATA-LOSS). For sampled files,
    // execute-bulk re-reads the full sheet windowed (bounded). The 50MB companion cap excluded these
    // files anyway, so this is no regression.
    if (!anySampled) {
      const companionSheets: ParsedSheets = {};
      for (const sh of sheets) companionSheets[sh.sheetName] = { columns: sh.columns, rows: sh.rows };
      await writeParsedCompanion(supabase, job.tenant_id, computeFileHashSha256(buffer), companionSheets);
    }

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
    let provenanceMap = new Map<string, { recognizedFraction: number; novelCount: number; llmCalled: boolean }>();
    if (sheetsNeedingHC.length > 0) {
      const dc = await runDecomposedComprehension(
        profileMap,
        sheetsNeedingHC.map(s => ({ sheetName: s.sheetName, columns: s.columns, rows: s.rows, rowCount: s.totalRowCount })), // FULL rows (Deviation 2)
        tenantId,
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      provenanceMap = dc.provenance;
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
      // HF-254 Fix 3b: additive lexical prior via data_nature distribution (same path).
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

    // HF-341 R6: classification is derived from the LLM expression per sheet by
    // resolveClassification (the Bayesian scoring + the classifyByHCPattern override
    // are deleted). Same authority as the analyze route.
    resolveClassification(state);

    // Build proposal units
    const contentUnits = buildProposalFromState(state, fileSheets)
      .filter(cu => !cu.contentUnitId.includes('::split'));

    // OB-203 Phase 2 (DI-4): mark comprehension-failed units as `failed_interpretation`, per-unit class.
    for (const cu of contentUnits) {
      const failureClass = perSheetFailure.get(cu.tabName);
      if (failureClass) cu.failedInterpretation = { failureClass, durationMs: 0 };
      const prov = provenanceMap.get(cu.tabName);
      if (prov) cu.recognitionProvenance = prov;
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

    // Update job with classification result FIRST — OB-249 review BLOCKER fix. The remediation
    // EXPRESS (below, before the response) makes LLM calls; persisting 'classified' HERE guarantees
    // a slow/timed-out express (a wide first import × intermittent Anthropic) can only lose
    // remediation signals for THIS import (re-expressed next time), never strand the job in
    // 'classifying'. CONSTRUCT in commitContentUnit re-reads whatever signals exist.
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
      // HF-254 Fix 2a: enrich fieldBindings with native data_nature from the server-side
      // trace HC (identical shape to analyze + emitFlywheelSignals, AP-17).
      const pjInterpMap = ((unit.classificationTrace as Record<string, unknown> | undefined)
        ?.headerComprehension as
          | { interpretations?: Record<string, { data_nature?: string; identifies?: string }> }
          | undefined)?.interpretations ?? {};
      const pjEnrichedFieldBindings = unit.fieldBindings.map(b => {
        const interp = pjInterpMap[b.sourceField];
        return {
          ...b,
          ...(interp?.data_nature ? { data_nature: interp.data_nature } : {}),
          ...(interp?.identifies ? { identifies: interp.identifies } : {}),
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

    // OB-249 — Remediation EXPRESS (Decision 158), AFTER the status write and BOUNDED (review
    // BLOCKER fix). The LLM proposes variant→canonical groupings at proposal time (off the
    // execute-bulk atomic path), reading prior signals first (read-before-express, I6) and
    // persisting each proposal to the ONE canonical signal surface (durable memory + P5 + the P7
    // render source). The deterministic CONSTRUCT runs later in commitContentUnit (the mandatory
    // gate) and re-reads whatever was expressed. BOUNDED by a wall-clock budget that leaves
    // headroom under maxDuration; on budget-exceed OR any failure it degrades to identity — the
    // remaining columns are simply re-expressed on the next import. The job is already 'classified',
    // so nothing here can strand the import.
    const remediationReports: Record<string, unknown> = {};
    const REMEDIATION_BUDGET_MS = 90_000;
    const remediationStart = Date.now();
    try {
      for (const unit of contentUnits) {
        if (unit.classification === 'plan') continue;
        if (Date.now() - remediationStart > REMEDIATION_BUDGET_MS) {
          console.warn(`[SCI-WORKER] OB-249 remediation budget (${REMEDIATION_BUDGET_MS}ms) exceeded — remaining units degrade to identity (re-expressed next import)`);
          break;
        }
        const sheetForUnit = sheets.find(s => s.sheetName === unit.tabName);
        if (!sheetForUnit || sheetForUnit.rows.length === 0) continue;
        const bindings = unit.fieldBindings ?? [];
        const semanticRoles: Record<string, { role?: string }> = {};
        for (const b of bindings) semanticRoles[b.sourceField] = { role: b.semanticRole };
        const fieldIdentities = extractFieldIdentitiesFromTrace(unit.classificationTrace as Record<string, unknown> | undefined)
          ?? buildFieldIdentitiesFromBindings(bindings);
        const entityIdField = findHcEntityIdColumn(unit.classificationTrace as Record<string, unknown> | undefined)
          ?? (bindings.find(b => b.semanticRole === 'entity_identifier')?.sourceField ?? null);
        const allCols = dataColumns(sheetForUnit.rows);
        const exclusions = computeRemediationExclusions(allCols, semanticRoles, fieldIdentities, entityIdField);
        const allowedColumns = allCols.filter(c => !exclusions.has(c));
        if (allowedColumns.length === 0) continue;
        const reports = await runRemediationPropose(supabase, {
          tenantId,
          rows: sheetForUnit.rows,
          columns: allCols,
          allowedColumns,
          recall: dbRecall(supabase, tenantId),
        });
        remediationReports[unit.contentUnitId] = reports;
      }
      // Attach the reports for the P7 render (best-effort; the job is already 'classified', and P7
      // also reads committed_data.metadata after commit, so this is non-load-bearing).
      if (Object.keys(remediationReports).length > 0) {
        await supabase.from('processing_jobs').update({
          proposal: { contentUnits, remediation: remediationReports },
        }).eq('id', jobId);
      }
    } catch (remErr) {
      console.warn('[SCI-WORKER] OB-249 remediation propose failed (non-blocking):', remErr instanceof Error ? remErr.message : String(remErr));
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
