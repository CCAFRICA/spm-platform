// SCI Analyze API — POST /api/import/sci/analyze
// Decision 77 — OB-127, OB-160C Consolidated Scoring Pipeline
// Accepts parsed file data, returns agent-classified proposal.
// Zero domain vocabulary. Korean Test applies.

// OB-150: Production timeout fix
export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel Pro max

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateContentProfileStats, generateContentProfilePatterns } from '@/lib/sci/content-profile';
import { enhanceWithHeaderComprehension } from '@/lib/sci/header-comprehension';
import { createIngestionState, buildProposalFromState } from '@/lib/sci/synaptic-ingestion-state';
import type { ClassificationTrace } from '@/lib/sci/synaptic-ingestion-state';
import { resolveClassification } from '@/lib/sci/resolver';
import { classifyByHCPattern } from '@/lib/sci/hc-pattern-classifier';
import { requiresHumanReview } from '@/lib/sci/agents';
// OB-199 Phase 4 supplement A: facade re-established at lib/sci/classification-signal-service.ts.
import { computeStructuralFingerprint, lookupPriorSignals, computeClassificationDensity, writeClassificationSignal } from '@/lib/sci/classification-signal-service';
import { CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
// OB-199 Phase 4: ClassificationSignalPayload no longer constructed at call site
// (canonical writer accepts CanonicalSignalInput directly). Type import removed.
import type { ClassificationDensity, StructuralFingerprint } from '@/lib/sci/classification-signal-service';
import { lookupFingerprint, writeFingerprint, type FlywheelLookupResult } from '@/lib/sci/fingerprint-flywheel';
import { loadPromotedPatterns } from '@/lib/sci/promoted-patterns';
import { queryTenantContext, computeEntityIdOverlap } from '@/lib/sci/tenant-context';
import type { SCIProposal, ContentProfile, ContentUnitProposal, AgentType } from '@/lib/sci/sci-types';

const PROCESSING_ORDER: Record<AgentType, number> = {
  plan: 0,
  entity: 1,
  target: 2,
  transaction: 3,
  reference: 4,
};

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();
    const { tenantId, files } = body as {
      tenantId: string;
      files: Array<{
        fileName: string;
        sheets: Array<{
          sheetName: string;
          columns: string[];
          rows: Record<string, unknown>[];
          totalRowCount: number;
        }>;
      }>;
    };

    if (!tenantId || !files || files.length === 0) {
      return NextResponse.json({ error: 'tenantId and files required' }, { status: 400 });
    }

    // Verify tenant exists + read industry for domain flywheel (OB-160J)
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, settings')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    const tenantSettings = (tenant.settings as Record<string, unknown>) ?? {};
    const tenantDomainId = (tenantSettings.industry as string) || '';

    const proposalId = crypto.randomUUID();
    const contentUnits: ContentUnitProposal[] = [];
    const densityMap = new Map<string, ClassificationDensity>(); // OB-160K
    const fingerprintMap = new Map<string, StructuralFingerprint>(); // HF-094

    // OB-160L: Load promoted patterns once (from foundational signals)
    const promotedPatterns = await loadPromotedPatterns(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    for (const file of files) {
      // Phase A: Generate Content Profile STATS for all sheets (no patterns yet — HC primacy per Decision 108)
      // HF-196 Phase 1G Path α: Two-phase split. Stats are deterministic; patterns are computed
      // in Phase B after HC has run (Phase B receives HC interpretations and gates structural arms on HC silence).
      const profileMap = new Map<string, ContentProfile>();
      const sheetRowsBySheet = new Map<string, Record<string, unknown>[]>();
      const fileSheets: Array<{ sourceFile: string; sheetName: string }> = [];

      for (let tabIndex = 0; tabIndex < file.sheets.length; tabIndex++) {
        const sheet = file.sheets[tabIndex];
        const profile = generateContentProfileStats(
          sheet.sheetName,
          tabIndex,
          file.fileName,
          sheet.columns,
          sheet.rows,
          sheet.totalRowCount,
        );
        profileMap.set(sheet.sheetName, profile);
        sheetRowsBySheet.set(sheet.sheetName, sheet.rows);
        fileSheets.push({ sourceFile: file.fileName, sheetName: sheet.sheetName });
      }

      // OB-174 Phase 3 / HF-197B: DS-017 Tier Routing — PER-SHEET fingerprint lookup BEFORE LLM call.
      // Pre-HF-197B: a single H(sheets[0]) was used for the entire file, causing cross-sheet
      // binding injection (DIAG-021 H3+H4). Per-sheet keying restores DS-017 §3.1 semantics.
      const sheetFlywheelResults = new Map<string, FlywheelLookupResult>();
      for (const sheet of file.sheets) {
        try {
          const result = await lookupFingerprint(
            tenantId,
            sheet.columns,
            sheet.rows,
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          );
          sheetFlywheelResults.set(sheet.sheetName, result);
          console.log(`[SCI-FINGERPRINT] file=${file.fileName} sheet=${sheet.sheetName} fingerprint=${result.fingerprintHash.substring(0, 12)} tier=${result.tier} match=${result.match} confidence=${result.confidence}`);
        } catch (fpErr) {
          console.warn(`[SCI-FINGERPRINT] Lookup failed for sheet=${sheet.sheetName} (non-blocking): ${fpErr instanceof Error ? fpErr.message : 'unknown'}`);
        }
      }

      // HF-236 (DIAG-050 closure Layer 1): Per T1-E910 v2 (Korean Test, locked
      // 2026-05-18: structural primitives in exactly one canonical declaration;
      // no hardcoded role registries in foundational code), cached flywheel
      // bindings that lack a native HeaderInterpretation.columnRole — or carry
      // a non-native value — cannot be promoted into HC without a hardcoded
      // semanticRole → columnRole registry. Such sheets are flagged as
      // insufficient-cache and routed through fresh-LLM HC re-emission. This
      // closes the materialization-layer drift identified by DIAG-050: under
      // HF-236, fresh-LLM and flywheel-replay paths emit the same
      // HeaderInterpretation shape because the only flywheel-replay path that
      // skips HC is one whose cached bindings ALREADY carry native columnRole.
      const NATIVE_COLUMN_ROLES = new Set(['identifier', 'name', 'temporal', 'measure', 'attribute', 'reference_key']);
      const insufficientFlywheelCache = new Set<string>();
      for (const sheet of file.sheets) {
        const r = sheetFlywheelResults.get(sheet.sheetName);
        if (!(r?.tier === 1 && r.match)) continue;
        const cached = (r.classificationResult as Record<string, unknown> | undefined)?.fieldBindings as
          Array<{ columnRole?: string }> | undefined;
        if (!cached || cached.length === 0) {
          insufficientFlywheelCache.add(sheet.sheetName);
          continue;
        }
        const allHaveNativeRole = cached.every(fb => fb.columnRole !== undefined && NATIVE_COLUMN_ROLES.has(fb.columnRole));
        if (!allHaveNativeRole) {
          insufficientFlywheelCache.add(sheet.sheetName);
          console.log(`[SCI-FINGERPRINT] HF-236: ${sheet.sheetName} flywheel cache missing native columnRole on ≥1 binding — forcing fresh-LLM HC re-emission`);
        }
      }

      // HF-197B: per-sheet skipHC determination (was: single file-level skipHC).
      // HF-236: additionally gated on insufficientFlywheelCache to force fresh-
      // LLM HC re-emission when the cached bindings cannot satisfy
      // materialization-layer shape compatibility.
      const sheetSkipHC = (sheetName: string) => {
        const r = sheetFlywheelResults.get(sheetName);
        return r?.tier === 1 && r.match && !insufficientFlywheelCache.has(sheetName);
      };

      // Phase B: Enhance with header comprehension — only for sheets where Tier 1 did not hit.
      const sheetsNeedingHC = file.sheets.filter(s => !sheetSkipHC(s.sheetName));
      const hcMetrics = sheetsNeedingHC.length === 0
        ? {
            llmCalled: false,
            llmCallDuration: 0,
            averageConfidence: (() => {
              const confs = Array.from(sheetFlywheelResults.values()).map(r => r.confidence);
              return confs.length > 0 ? confs.reduce((s, c) => s + c, 0) / confs.length : 0;
            })(),
            columnsInterpreted: 0,
            crossSheetInsightCount: 0,
          }
        : await enhanceWithHeaderComprehension(
            profileMap,
            sheetsNeedingHC.map(s => ({
              sheetName: s.sheetName,
              columns: s.columns,
              sampleRows: s.rows.slice(0, 5),
              rowCount: s.totalRowCount,
            })),
            tenantId,
          );

      // HF-181 Layer 1 / HF-197B: For each Tier 1 match, inject that sheet's OWN cached
      // fieldBindings into that sheet's OWN profile (was: always injected into sheets[0]).
      // HF-236 Layer 1 (DIAG-050 closure): No hardcoded semanticRole → columnRole
      // registry. The cached binding's native columnRole is read directly. Sheets
      // whose cache lacks native columnRole on any binding were diverted to the
      // fresh-LLM HC path by the insufficientFlywheelCache gate above, so by
      // construction every sheet reaching this loop has cached bindings with
      // native columnRole values.
      for (const sheet of file.sheets) {
        const flywheelResult = sheetFlywheelResults.get(sheet.sheetName);
        if (!sheetSkipHC(sheet.sheetName) || !flywheelResult?.classificationResult) continue;

        const flywheelBindings = (flywheelResult.classificationResult as Record<string, unknown>)?.fieldBindings as Array<{
          sourceField: string;
          semanticRole: string;
          confidence: number;
          displayContext?: string;
          columnRole?: 'identifier' | 'name' | 'temporal' | 'measure' | 'attribute' | 'reference_key';
          identifiesWhat?: string;
        }> | undefined;
        if (!flywheelBindings || flywheelBindings.length === 0) continue;

        const sheetProfile = profileMap.get(sheet.sheetName);
        if (!sheetProfile) continue;

        const interpretations = new Map<string, import('@/lib/sci/sci-types').HeaderInterpretation>();
        for (const fb of flywheelBindings) {
          // HF-236: native columnRole guaranteed present by insufficientFlywheelCache gate.
          interpretations.set(fb.sourceField, {
            columnName: fb.sourceField,
            semanticMeaning: fb.displayContext || fb.semanticRole,
            dataExpectation: '',
            columnRole: fb.columnRole!,
            confidence: fb.confidence,
            ...(fb.identifiesWhat ? { identifiesWhat: fb.identifiesWhat } : {}),
          });
        }
        sheetProfile.headerComprehension = {
          interpretations,
          crossSheetInsights: [],
          llmCallDuration: 0,
          llmModel: 'flywheel-tier1',
          fromVocabularyBinding: false,
        };
        console.log(`[SCI-FINGERPRINT] Tier 1: injected ${flywheelBindings.length} fieldBindings from flywheel into ${sheet.sheetName} (native columnRole, HF-236)`);
      }

      // HF-196 Phase 1G Path α — Phase B: HC-aware pattern derivations (Decision 108).
      // HC has run (or been injected from Tier 1 flywheel); now compute patterns +
      // idField-derived structure fields with HC primacy. Structural arms gate on HC silence.
      for (const [sheetName, profile] of Array.from(profileMap.entries())) {
        const hcInterpretations = profile.headerComprehension?.interpretations;
        const sheetRows = sheetRowsBySheet.get(sheetName) ?? [];
        generateContentProfilePatterns(profile, hcInterpretations, sheetRows);
      }

      // ── HF-096: HC Diagnostic Logging (visible in Vercel Runtime Logs) ──
      console.log(`[SCI-HC-DIAG] file=${file.fileName} llmCalled=${hcMetrics.llmCalled} duration=${hcMetrics.llmCallDuration}ms avgConf=${hcMetrics.averageConfidence.toFixed(2)} cols=${hcMetrics.columnsInterpreted} insights=${hcMetrics.crossSheetInsightCount}`);
      for (const [sheetName, profile] of Array.from(profileMap.entries())) {
        const hc = profile.headerComprehension;
        if (hc) {
          const roles = Array.from(hc.interpretations.entries())
            .map(([col, interp]) => `${col}:${interp.columnRole}@${interp.confidence.toFixed(2)}`)
            .join(', ');
          console.log(`[SCI-HC-DIAG] sheet=${sheetName} roles=[${roles}]`);
        } else {
          console.log(`[SCI-HC-DIAG] sheet=${sheetName} HC=null (structural only)`);
        }
        // Profile state after HC override
        console.log(`[SCI-PROFILE-DIAG] sheet=${sheetName} idRepeatRatio=${profile.structure.identifierRepeatRatio.toFixed(2)} volumePattern=${profile.patterns.volumePattern} hasTemporal=${profile.patterns.hasTemporalColumns} hasDate=${profile.patterns.hasDateColumn} hasCurrency=${profile.patterns.hasCurrencyColumns} hasName=${profile.patterns.hasStructuralNameColumn} hasEntityId=${profile.patterns.hasEntityIdentifier} numericRatio=${profile.structure.numericFieldRatio.toFixed(2)}`);
      }

      // Phase C: Create Synaptic Ingestion State, classify
      const state = createIngestionState(tenantId, file.fileName, profileMap);
      state.promotedPatterns = promotedPatterns; // OB-160L

      // Phase E: Compute structural fingerprint and lookup prior signals + density
      for (let tabIndex = 0; tabIndex < file.sheets.length; tabIndex++) {
        const sheet = file.sheets[tabIndex];
        const profile = profileMap.get(sheet.sheetName);
        if (profile) {
          const fingerprint = computeStructuralFingerprint(profile);
          fingerprintMap.set(profile.contentUnitId, fingerprint); // HF-094
          const priors = await lookupPriorSignals(
            tenantId,
            fingerprint,
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            tenantDomainId,
          );
          if (priors.length > 0) {
            state.priorSignals.set(profile.contentUnitId, priors);
          }

          // OB-160K: Compute classification density per content unit
          const density = await computeClassificationDensity(
            tenantId,
            fingerprint,
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          );
          densityMap.set(profile.contentUnitId, density);
        }
      }

      // HF-183: Compute entity ID overlap per sheet before classification
      // Korean Test: uses VALUE matching (entity external_ids), not column names
      try {
        const tenantCtx = await queryTenantContext(
          tenantId,
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
        if (tenantCtx.existingEntityExternalIds.size > 0) {
          const overlapMap = new Map<string, import('@/lib/sci/tenant-context').EntityIdOverlap>();
          for (let tabIndex = 0; tabIndex < file.sheets.length; tabIndex++) {
            const sheet = file.sheets[tabIndex];
            const profile = profileMap.get(sheet.sheetName);
            if (profile) {
              const overlap = computeEntityIdOverlap(profile, sheet.rows, tenantCtx.existingEntityExternalIds);
              if (overlap) {
                overlapMap.set(profile.contentUnitId, overlap);
                console.log(`[SCI-OVERLAP] sheet=${sheet.sheetName} column=${overlap.sheetIdentifierColumn} overlap=${Math.round(overlap.overlapPercentage * 100)}% signal=${overlap.overlapSignal} (${overlap.matchingEntityIds.size}/${overlap.sheetUniqueValues.size})`);
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

      // ── HF-105/HF-106: Level 1 HC Pattern Classification ──
      // Level 1 REPLACES Level 2 when matched. One sheet = one content unit.
      // HF-106: Cap non-winner scores to prevent analyzeSplit from creating duplicates.
      const level1Sheets = new Set<string>();
      for (const [unitId, profile] of Array.from(state.contentUnits.entries())) {
        const hcResult = classifyByHCPattern(profile);
        if (hcResult) {
          level1Sheets.add(profile.tabName);
          // Override resolution
          const resolution = state.resolutions.get(unitId);
          if (resolution) {
            resolution.classification = hcResult.classification;
            resolution.confidence = hcResult.confidence;
            resolution.decisionSource = 'hc_pattern';
            resolution.claimType = 'FULL'; // HF-106: Level 1 never splits
            resolution.requiresHumanReview = false;
          }
          // Override trace
          const trace = state.traces.get(unitId);
          if (trace) {
            trace.finalClassification = hcResult.classification;
            trace.finalConfidence = hcResult.confidence;
            trace.decisionSource = 'hc_pattern';
            trace.requiresHumanReview = false;
          }
          // Override round2Scores: set winner, cap all others to prevent split
          const r2Scores = state.round2Scores.get(unitId);
          if (r2Scores) {
            for (const score of r2Scores) {
              if (score.agent === hcResult.classification) {
                score.confidence = hcResult.confidence;
                score.signals.unshift({
                  signal: `hc_pattern:${hcResult.patternName}`,
                  weight: hcResult.confidence,
                  evidence: `Level 1 HC pattern: ${hcResult.matchedConditions.join(', ')}`,
                });
              } else {
                // HF-106: Cap competing agents to prevent analyzeSplit from splitting
                score.confidence = Math.min(score.confidence, 0.10);
              }
            }
            r2Scores.sort((a, b) => b.confidence - a.confidence);
          }
          console.log(`[SCI-HC-PATTERN] sheet=${profile.tabName} classification=${hcResult.classification}@${(hcResult.confidence * 100).toFixed(0)}% pattern=${hcResult.patternName} conditions=[${hcResult.matchedConditions.join(', ')}]`);
        } else {
          console.log(`[SCI-HC-PATTERN] sheet=${profile.tabName} NO_MATCH — Level 2 CRR Bayesian retained`);
        }
      }

      // ── HF-096: Scores Diagnostic Logging ──
      for (const [cuId, resolution] of Array.from(state.resolutions.entries())) {
        const profile = Array.from(profileMap.values()).find(p => p.contentUnitId === cuId);
        const sheetLabel = profile?.tabName ?? cuId;
        const round2 = state.round2Scores.get(cuId) ?? state.round1Scores.get(cuId) ?? [];
        const scoresStr = round2
          .slice()
          .sort((a, b) => b.confidence - a.confidence)
          .map(s => `${s.agent}=${(s.confidence * 100).toFixed(0)}%`)
          .join(', ');
        console.log(`[SCI-SCORES-DIAG] sheet=${sheetLabel} winner=${resolution.classification}@${(resolution.confidence * 100).toFixed(0)}% scores=[${scoresStr}]`);
      }

      // ── HF-240: workbook-level plan-signature reclassification ──
      // The Level-1 HC pattern classifier (`classifyByHCPattern`) returns
      // one of {entity, target, transaction, reference} but has no `plan`
      // branch — plan-ness is a WORKBOOK property, not a per-sheet
      // property. Level-2 PLAN_WEIGHTS can score plan, but only when
      // Level-1 returns null (HC coverage < 50%). With a warmed-up HC
      // LLM and a confidently classified plan workbook (rate tables +
      // roster + targets), Level-1 fires per-sheet and the file is
      // classified as `entity + reference + target` — never `plan`.
      //
      // The pre-HF-239 execute route had identical gating
      // (`confirmedClassification === 'plan'`), so the cold-start
      // regression presents identically post-HF-239. The architecturally
      // correct fix is workbook-level: AFTER per-sheet classification
      // completes, examine the sheet composition for this file. When
      // the composition matches the plan-workbook signature (small
      // multi-sheet workbook with non-transactional sheets and at least
      // one rate-table-shaped sheet), reclassify ALL of the file's
      // sheets to `plan`.
      //
      // The signature is purely structural — zero hardcoded filenames,
      // tenant names, or domain literals. The signal fires only when
      // (1) all of: ≥2 sheets, no transaction-classified sheet, total
      // committed rows < 1000 (configurations are small), and (2) at
      // least one sheet has rate-table structural signals (sparsity
      // > 0.30 OR percentage values OR auto-generated headers OR
      // reference-category row count).
      {
        const fileUnitIds = new Set(
          Array.from(state.contentUnits.entries())
            .filter(([, p]) => fileSheets.some(fs => fs.sheetName === p.tabName))
            .map(([id]) => id),
        );
        if (fileUnitIds.size >= 2) {
          const fileResolutions: Array<{ unitId: string; classification: AgentType; profile?: ContentProfile }> = [];
          for (const unitId of Array.from(fileUnitIds)) {
            const r = state.resolutions.get(unitId);
            const p = state.contentUnits.get(unitId);
            if (r && p) fileResolutions.push({ unitId, classification: r.classification, profile: p });
          }
          const hasTransaction = fileResolutions.some(r => r.classification === 'transaction');
          const hasReferenceOrTarget = fileResolutions.some(
            r => r.classification === 'reference' || r.classification === 'target',
          );
          let totalRows = 0;
          let hasRateTableSignal = false;
          for (const r of fileResolutions) {
            if (!r.profile) continue;
            totalRows += r.profile.structure.rowCount;
            if (
              r.profile.structure.sparsity > 0.30
              || r.profile.patterns.hasPercentageValues
              || r.profile.structure.headerQuality === 'auto_generated'
              || r.profile.patterns.rowCountCategory === 'reference'
            ) {
              hasRateTableSignal = true;
            }
          }
          const matchesPlanSignature =
            !hasTransaction
            && hasReferenceOrTarget
            && totalRows < 1000
            && hasRateTableSignal;
          if (matchesPlanSignature) {
            console.log(
              `[SCI-PLAN-WORKBOOK] file=${file.fileName} sheets=${fileResolutions.length} ` +
              `totalRows=${totalRows} signature=match — reclassifying all sheets to 'plan'`,
            );
            for (const r of fileResolutions) {
              const resolution = state.resolutions.get(r.unitId);
              if (resolution) {
                resolution.classification = 'plan' as AgentType;
                resolution.confidence = 0.80;
                resolution.decisionSource = 'plan_workbook_signature' as typeof resolution.decisionSource;
                resolution.requiresHumanReview = false;
              }
              const trace = state.traces.get(r.unitId);
              if (trace) {
                trace.finalClassification = 'plan' as AgentType;
                trace.finalConfidence = 0.80;
                trace.decisionSource = 'plan_workbook_signature' as typeof trace.decisionSource;
                trace.requiresHumanReview = false;
              }
              // Boost plan score in round2 so downstream consumers (UI
              // "all scores" display, requiresHumanReview) reflect the
              // workbook-level decision without ambiguity.
              const r2 = state.round2Scores.get(r.unitId);
              if (r2) {
                for (const s of r2) {
                  if (s.agent === 'plan') {
                    s.confidence = 0.80;
                    s.signals.unshift({
                      signal: 'plan_workbook_signature',
                      weight: 0.80,
                      evidence: `multi-sheet workbook signature (${fileResolutions.length} sheets, ${totalRows} rows, rate-table signals present)`,
                    });
                  } else {
                    s.confidence = Math.min(s.confidence, 0.10);
                  }
                }
                r2.sort((a, b) => b.confidence - a.confidence);
              }
            }
          } else {
            console.log(
              `[SCI-PLAN-WORKBOOK] file=${file.fileName} sheets=${fileResolutions.length} ` +
              `totalRows=${totalRows} hasTx=${hasTransaction} hasRefOrTgt=${hasReferenceOrTarget} ` +
              `rateTableSignal=${hasRateTableSignal} — no plan signature`,
            );
          }
        }
      }

      // Build proposal from state (same format as before — proposal cards render correctly)
      // HF-106: Dedup safety net — one sheet = one content unit, always.
      // Remove ALL ::split entries. Split claims caused unique constraint violations
      // on import because two CUs map to the same sheet/committed_data rows.
      const fileContentUnits = buildProposalFromState(state, fileSheets)
        .filter(cu => {
          if (cu.contentUnitId.includes('::split')) {
            console.log(`[SCI-DEDUP] Removed split duplicate for ${cu.tabName} (${cu.classification})`);
            return false;
          }
          return true;
        });
      console.log(`[SCI-PROPOSAL] ${fileContentUnits.length} content units for ${file.sheets.length} sheets`);
      contentUnits.push(...fileContentUnits);
    }

    // Determine processing order based on classification
    const processingOrder = contentUnits
      .slice()
      .sort((a, b) => PROCESSING_ORDER[a.classification] - PROCESSING_ORDER[b.classification])
      .map(u => u.contentUnitId);

    // Overall confidence
    const overallConfidence = contentUnits.length > 0
      ? contentUnits.reduce((sum, u) => sum + u.confidence, 0) / contentUnits.length
      : 0;

    // Human review if ANY unit needs it
    const anyNeedsReview = contentUnits.some(u => {
      const scores = u.allScores;
      return requiresHumanReview(scores);
    });

    // OB-160K: Build density summary for response
    const densitySummary: Record<string, { confidence: number; totalClassifications: number; overrideRate: number; executionMode: 'full_analysis' | 'light_analysis' | 'confident' }> = {};
    for (const [unitId, d] of Array.from(densityMap.entries())) {
      densitySummary[unitId] = {
        confidence: d.confidence,
        totalClassifications: d.totalClassifications,
        overrideRate: d.lastOverrideRate,
        executionMode: d.executionMode,
      };
    }

    const proposal: SCIProposal = {
      proposalId,
      tenantId,
      sourceFiles: files.map(f => f.fileName),
      contentUnits,
      processingOrder,
      overallConfidence,
      requiresHumanReview: anyNeedsReview,
      timestamp: new Date().toISOString(),
      density: Object.keys(densitySummary).length > 0 ? densitySummary : undefined,
    };

    // OB-174 Phase 3 / HF-197B: Write fingerprints to flywheel after classification (fire-and-forget).
    // Per-sheet keying — each unit writes its OWN sheet's hash (was: always sheets[0]),
    // so each (tenant_id, fingerprint_hash) row reflects exactly one sheet's classification.
    try {
      for (const unit of proposal.contentUnits) {
        if (!unit.fieldBindings || unit.fieldBindings.length === 0) continue;
        // Build column_roles map from field bindings
        const columnRoles: Record<string, string> = {};
        for (const binding of unit.fieldBindings) {
          columnRoles[binding.sourceField] = binding.semanticRole;
        }
        // HF-197B: locate the unit's OWN sheet for the hash, not sheets[0].
        const sourceFile = files.find(f => f.fileName === unit.sourceFile);
        const sheetForUnit = sourceFile?.sheets.find(s => s.sheetName === unit.tabName);
        if (!sheetForUnit) {
          console.warn(`[SCI-FINGERPRINT] Could not locate sheet for unit sourceFile=${unit.sourceFile} tabName=${unit.tabName} — skipping flywheel write`);
          continue;
        }
        const hash = (await import('@/lib/sci/structural-fingerprint')).computeFingerprintHashSync(
          sheetForUnit.columns,
          sheetForUnit.rows,
        );
        writeFingerprint(
          tenantId,
          hash,
          {
            classification: unit.classification,
            confidence: unit.confidence,
            fieldBindings: unit.fieldBindings,
            tabName: unit.tabName,
          },
          columnRoles,
          unit.sourceFile,
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        ).catch(() => {}); // Fire-and-forget
      }
    } catch {
      // Flywheel write failure must NEVER block import
    }

    // HF-094: Write classification signals via dedicated columns (fire-and-forget)
    // Single write path: writeClassificationSignal (HF-092 indexed columns)
    try {
      for (const unit of proposal.contentUnits) {
        const fp = fingerprintMap.get(unit.contentUnitId);
        if (!fp) continue; // Document-based units (plan) have no fingerprint

        const unitTrace = unit.classificationTrace as unknown as ClassificationTrace | undefined;
        const unitDecisionSource = unitTrace?.decisionSource || 'crr_bayesian';

        // OB-199 Phase 4 supplement A: thin facade re-establishes SCI structural markers.
        writeClassificationSignal({
          tenantId,
          sourceFileName: unit.sourceFile,
          sheetName: unit.tabName,
          fingerprint: fp,
          classification: unit.classification,
          confidence: unit.confidence,
          decisionSource: unitDecisionSource,
          classificationTrace: (unit.classificationTrace as unknown as ClassificationTrace) ?? ({} as unknown as ClassificationTrace),
          vocabularyBindings: null,
          agentScores: Object.fromEntries(unit.allScores.map(s => [s.agent, s.confidence])),
          humanCorrectionFrom: null,
        }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
          if (err instanceof CanonicalWriteError) {
            console.warn(`[SCIAnalyze] classification:outcome CanonicalWriteError (${err.cause}): ${err.message}`);
          } else {
            console.warn('[SCIAnalyze] classification:outcome unexpected error:', err instanceof Error ? err.message : String(err));
          }
        });
      }
    } catch {
      // Signal capture failure must NEVER block import
    }

    return NextResponse.json(proposal);

  } catch (err) {
    console.error('[SCI Analyze] Error:', err);
    return NextResponse.json(
      { error: 'Analysis failed', details: String(err) },
      { status: 500 }
    );
  }
}
