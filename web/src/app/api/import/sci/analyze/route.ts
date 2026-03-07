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
import { createIngestionState, classifyContentUnits, buildProposalFromState } from '@/lib/sci/synaptic-ingestion-state';
import { requiresHumanReview } from '@/lib/sci/agents';
import { queryTenantContext, computeEntityIdOverlap } from '@/lib/sci/tenant-context';
import { computeStructuralFingerprint, lookupPriorSignals, computeClassificationDensity } from '@/lib/sci/classification-signal-service';
import type { ClassificationDensity } from '@/lib/sci/classification-signal-service';
import { loadPromotedPatterns } from '@/lib/sci/promoted-patterns';
import { captureSCISignalBatch } from '@/lib/sci/signal-capture-service';
import type { SCISignalCapture } from '@/lib/sci/sci-signal-types';
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

    // Phase D: Query tenant context ONCE before scoring (parallel queries)
    const tenantContext = await queryTenantContext(
      tenantId,
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const proposalId = crypto.randomUUID();
    const contentUnits: ContentUnitProposal[] = [];
    const densityMap = new Map<string, ClassificationDensity>(); // OB-160K

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

      // Phase B: Enhance with header comprehension (one LLM call for all sheets)
      await enhanceWithHeaderComprehension(
        profileMap,
        file.sheets.map(s => ({
          sheetName: s.sheetName,
          columns: s.columns,
          sampleRows: s.rows.slice(0, 5),
          rowCount: s.totalRowCount,
        })),
        tenantId,
      );

      // Phase C+D: Create Synaptic Ingestion State, populate tenant context, classify
      const state = createIngestionState(tenantId, file.fileName, profileMap);
      state.tenantContext = tenantContext;
      state.promotedPatterns = promotedPatterns; // OB-160L

      // Compute entity ID overlap per content unit (Phase D)
      // + Compute structural fingerprint and lookup prior signals (Phase E)
      for (let tabIndex = 0; tabIndex < file.sheets.length; tabIndex++) {
        const sheet = file.sheets[tabIndex];
        const profile = profileMap.get(sheet.sheetName);
        if (profile) {
          const overlap = computeEntityIdOverlap(
            profile,
            sheet.rows,
            tenantContext.existingEntityExternalIds,
          );
          state.entityIdOverlaps.set(profile.contentUnitId, overlap);

          // Phase E: Prior signal consultation
          const fingerprint = computeStructuralFingerprint(profile);
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

      classifyContentUnits(state);

      // Build proposal from state (same format as before — proposal cards render correctly)
      const fileContentUnits = buildProposalFromState(state, fileSheets);
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

    // OB-135: Capture classification signals (fire-and-forget)
    try {
      const signalCaptures: SCISignalCapture[] = [];

      for (const unit of proposal.contentUnits) {
        // One content_classification signal per content unit
        signalCaptures.push({
          tenantId,
          signal: {
            signalType: 'content_classification',
            contentUnitId: unit.contentUnitId,
            sourceFile: unit.sourceFile,
            tabName: unit.tabName,
            agentScores: unit.allScores.map(s => ({
              agent: s.agent,
              confidence: s.confidence,
              topSignals: s.signals
                .filter(sig => sig.weight > 0)
                .slice(0, 3)
                .map(sig => sig.signal),
            })),
            winningAgent: unit.classification,
            winningConfidence: unit.confidence,
            claimType: unit.claimType || 'FULL',
            requiresHumanReview: anyNeedsReview,
            round: 2,
          },
        });

        // One grouped field_binding signal per content unit
        signalCaptures.push({
          tenantId,
          signal: {
            signalType: 'field_binding',
            contentUnitId: unit.contentUnitId,
            fieldCount: unit.fieldBindings.length,
            bindingSummary: unit.fieldBindings.slice(0, 10).map(b => ({
              sourceField: b.sourceField,
              semanticRole: b.semanticRole,
              confidence: b.confidence,
              claimedBy: b.claimedBy,
            })),
            avgConfidence: unit.fieldBindings.length > 0
              ? unit.fieldBindings.reduce((s, b) => s + b.confidence, 0) / unit.fieldBindings.length
              : 0,
          },
        });
      }

      // Fire-and-forget — do not await
      captureSCISignalBatch(signalCaptures).catch(() => {});
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
