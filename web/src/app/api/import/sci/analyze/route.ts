// SCI Analyze API — POST /api/import/sci/analyze
// Decision 77 — OB-127, OB-160C Consolidated Scoring Pipeline
// Accepts parsed file data, returns agent-classified proposal.
// Zero domain vocabulary. Korean Test applies.

// OB-150: Production timeout fix
export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel Pro max

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateContentProfile } from '@/lib/sci/content-profile';
import { enhanceWithHeaderComprehension } from '@/lib/sci/header-comprehension';
import { createIngestionState, buildProposalFromState } from '@/lib/sci/synaptic-ingestion-state';
import type { ClassificationTrace } from '@/lib/sci/synaptic-ingestion-state';
import { resolveClassification } from '@/lib/sci/resolver';
import { classifyByHCPattern } from '@/lib/sci/hc-pattern-classifier';
import { requiresHumanReview } from '@/lib/sci/agents';
import { computeStructuralFingerprint, lookupPriorSignals, computeClassificationDensity, writeClassificationSignal } from '@/lib/sci/classification-signal-service';
import type { ClassificationDensity, StructuralFingerprint, ClassificationSignalPayload } from '@/lib/sci/classification-signal-service';
import { lookupFingerprint, writeFingerprint, type FlywheelLookupResult } from '@/lib/sci/fingerprint-flywheel';
import { loadPromotedPatterns } from '@/lib/sci/promoted-patterns';
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
      // Phase A: Generate Content Profiles for all sheets
      const profileMap = new Map<string, ContentProfile>();
      const fileSheets: Array<{ sourceFile: string; sheetName: string }> = [];

      for (let tabIndex = 0; tabIndex < file.sheets.length; tabIndex++) {
        const sheet = file.sheets[tabIndex];
        const profile = generateContentProfile(
          sheet.sheetName,
          tabIndex,
          file.fileName,
          sheet.columns,
          sheet.rows,
          sheet.totalRowCount,
        );
        profileMap.set(sheet.sheetName, profile);
        fileSheets.push({ sourceFile: file.fileName, sheetName: sheet.sheetName });
      }

      // OB-174 Phase 3: DS-017 Tier Routing — check fingerprint BEFORE LLM call
      // Compute fingerprint from the first sheet (primary content) for file-level matching
      const primarySheet = file.sheets[0];
      let flywheelResult: FlywheelLookupResult | null = null;
      if (primarySheet) {
        try {
          flywheelResult = await lookupFingerprint(
            tenantId,
            primarySheet.columns,
            primarySheet.rows,
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          );
          console.log(`[SCI-FINGERPRINT] file=${file.fileName} fingerprint=${flywheelResult.fingerprintHash.substring(0, 12)} tier=${flywheelResult.tier} match=${flywheelResult.match} confidence=${flywheelResult.confidence}`);
        } catch (fpErr) {
          console.warn(`[SCI-FINGERPRINT] Lookup failed (non-blocking): ${fpErr instanceof Error ? fpErr.message : 'unknown'}`);
        }
      }

      // Phase B: Enhance with header comprehension (one LLM call for all sheets)
      // OB-174: Skip LLM for Tier 1 matches — classification already known
      const skipHC = flywheelResult?.tier === 1 && flywheelResult.match;
      const hcMetrics = skipHC
        ? { llmCalled: false, llmCallDuration: 0, averageConfidence: flywheelResult!.confidence, columnsInterpreted: 0, crossSheetInsightCount: 0 }
        : await enhanceWithHeaderComprehension(
            profileMap,
            file.sheets.map(s => ({
              sheetName: s.sheetName,
              columns: s.columns,
              sampleRows: s.rows.slice(0, 5),
              rowCount: s.totalRowCount,
            })),
            tenantId,
          );

      // HF-181 Layer 1: For Tier 1 matches, inject flywheel fieldBindings as synthetic headerComprehension
      // Without this, generateSemanticBindings() runs on structural heuristics only → entity_identifier lost
      if (skipHC && flywheelResult?.classificationResult) {
        const flywheelBindings = (flywheelResult.classificationResult as Record<string, unknown>)?.fieldBindings as Array<{ sourceField: string; semanticRole: string; confidence: number; displayContext?: string }> | undefined;
        if (flywheelBindings && flywheelBindings.length > 0) {
          const primaryProfile = profileMap.get(file.sheets[0]?.sheetName);
          if (primaryProfile) {
            // Map semanticRole → ColumnRole for HeaderInterpretation
            const roleMap: Record<string, 'identifier' | 'name' | 'temporal' | 'measure' | 'attribute' | 'reference_key' | 'unknown'> = {
              entity_identifier: 'identifier', entity_name: 'name',
              transaction_date: 'temporal', period: 'temporal',
              transaction_amount: 'measure', transaction_count: 'measure',
              category_code: 'attribute', entity_attribute: 'attribute',
            };
            const interpretations = new Map<string, import('@/lib/sci/sci-types').HeaderInterpretation>();
            for (const fb of flywheelBindings) {
              const columnRole = roleMap[fb.semanticRole] ?? 'unknown';
              interpretations.set(fb.sourceField, {
                columnName: fb.sourceField,
                semanticMeaning: fb.displayContext || fb.semanticRole,
                dataExpectation: '',
                columnRole,
                confidence: fb.confidence,
              });
            }
            primaryProfile.headerComprehension = {
              interpretations,
              crossSheetInsights: [],
              llmCallDuration: 0,
              llmModel: 'flywheel-tier1',
              fromVocabularyBinding: false,
            };
            console.log(`[SCI-FINGERPRINT] Tier 1: injected ${flywheelBindings.length} fieldBindings from flywheel into ${file.sheets[0].sheetName}`);
          }
        }
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

    // OB-174 Phase 3: Write fingerprints to flywheel after classification (fire-and-forget)
    try {
      for (const unit of proposal.contentUnits) {
        if (!unit.fieldBindings || unit.fieldBindings.length === 0) continue;
        // Build column_roles map from field bindings
        const columnRoles: Record<string, string> = {};
        for (const binding of unit.fieldBindings) {
          columnRoles[binding.sourceField] = binding.semanticRole;
        }
        // Find the file's primary sheet columns for fingerprint hash
        const sourceFile = files.find(f => f.fileName === unit.sourceFile);
        if (sourceFile && sourceFile.sheets[0]) {
          const hash = (await import('@/lib/sci/structural-fingerprint')).computeFingerprintHashSync(
            sourceFile.sheets[0].columns,
            sourceFile.sheets[0].rows,
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

        const payload: ClassificationSignalPayload = {
          tenantId,
          sourceFileName: unit.sourceFile,
          sheetName: unit.tabName,
          fingerprint: fp,
          classification: unit.classification,
          confidence: unit.confidence,
          decisionSource: unitDecisionSource,
          classificationTrace: (unit.classificationTrace as unknown as ClassificationTrace) ?? ({} as unknown as ClassificationTrace),
          vocabularyBindings: null,
          agentScores: Object.fromEntries(
            unit.allScores.map(s => [s.agent, s.confidence])
          ),
          humanCorrectionFrom: null,
        };

        writeClassificationSignal(
          payload,
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        ).catch(() => {});
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
