// SCI Analyze API — POST /api/import/sci/analyze
// Decision 77 — OB-127, OB-134 Round 2 Negotiation
// Accepts parsed file data, returns agent-classified proposal.
// Zero domain vocabulary. Korean Test applies.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateContentProfile } from '@/lib/sci/content-profile';
import { negotiateRound2, requiresHumanReview } from '@/lib/sci/negotiation';
import type { SCIProposal, ContentUnitProposal, AgentType } from '@/lib/sci/sci-types';

const PROCESSING_ORDER: Record<AgentType, number> = {
  plan: 0,
  entity: 1,
  target: 2,
  transaction: 3,
};

const ACTION_DESCRIPTIONS: Record<AgentType, string> = {
  plan: 'Interpret as rule definitions and create/update plan configuration',
  entity: 'Create or update entity records from roster data',
  target: 'Commit performance targets and wire through convergence',
  transaction: 'Commit event data for calculation processing',
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

    // Verify tenant exists
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const proposalId = crypto.randomUUID();
    const contentUnits: ContentUnitProposal[] = [];

    for (const file of files) {
      for (let tabIndex = 0; tabIndex < file.sheets.length; tabIndex++) {
        const sheet = file.sheets[tabIndex];

        // Generate Content Profile
        const profile = generateContentProfile(
          sheet.sheetName,
          tabIndex,
          file.fileName,
          sheet.columns,
          sheet.rows
        );

        // OB-134: Round 2 negotiation (replaces Phase 1 scoring)
        const negotiation = negotiateRound2(profile);
        const scores = negotiation.round2Scores;
        const needsReview = requiresHumanReview(scores);

        // Build warnings
        const warnings: string[] = [];
        if (needsReview) {
          const gap = scores[0].confidence - (scores[1]?.confidence || 0);
          if (scores[0].confidence < 0.50) {
            warnings.push(`Low confidence (${(scores[0].confidence * 100).toFixed(0)}%) — manual review recommended`);
          }
          if (gap < 0.10) {
            warnings.push(`Close scores: ${scores[0].agent} (${(scores[0].confidence * 100).toFixed(0)}%) vs ${scores[1].agent} (${(scores[1].confidence * 100).toFixed(0)}%)`);
          }
        }
        if (profile.structure.headerQuality === 'auto_generated') {
          warnings.push('Auto-generated headers detected (__EMPTY pattern) — content may be rule definitions');
        }

        if (negotiation.isSplit && negotiation.claims.length === 2) {
          // OB-134: PARTIAL claims — generate two content units from one tab
          const primaryClaim = negotiation.claims[0];
          const secondaryClaim = negotiation.claims[1];
          const primaryId = profile.contentUnitId;
          const secondaryId = `${profile.contentUnitId}::split`;

          contentUnits.push({
            contentUnitId: primaryId,
            sourceFile: file.fileName,
            tabName: sheet.sheetName,
            classification: primaryClaim.agent,
            confidence: primaryClaim.confidence,
            reasoning: primaryClaim.reasoning,
            action: ACTION_DESCRIPTIONS[primaryClaim.agent],
            fieldBindings: primaryClaim.semanticBindings,
            allScores: scores,
            warnings: [...warnings],
            claimType: 'PARTIAL',
            ownedFields: primaryClaim.fields,
            sharedFields: primaryClaim.sharedFields,
            partnerContentUnitId: secondaryId,
            negotiationLog: negotiation.log,
          });

          contentUnits.push({
            contentUnitId: secondaryId,
            sourceFile: file.fileName,
            tabName: sheet.sheetName,
            classification: secondaryClaim.agent,
            confidence: secondaryClaim.confidence,
            reasoning: secondaryClaim.reasoning,
            action: ACTION_DESCRIPTIONS[secondaryClaim.agent],
            fieldBindings: secondaryClaim.semanticBindings,
            allScores: scores,
            warnings: [...warnings],
            claimType: 'PARTIAL',
            ownedFields: secondaryClaim.fields,
            sharedFields: secondaryClaim.sharedFields,
            partnerContentUnitId: primaryId,
            negotiationLog: negotiation.log,
          });
        } else {
          // FULL claim — single agent wins
          const claim = negotiation.claims[0];
          contentUnits.push({
            contentUnitId: profile.contentUnitId,
            sourceFile: file.fileName,
            tabName: sheet.sheetName,
            classification: claim.agent,
            confidence: claim.confidence,
            reasoning: claim.reasoning,
            action: ACTION_DESCRIPTIONS[claim.agent],
            fieldBindings: claim.semanticBindings,
            allScores: scores,
            warnings,
            claimType: 'FULL',
            negotiationLog: negotiation.log,
          });
        }
      }
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

    const proposal: SCIProposal = {
      proposalId,
      tenantId,
      sourceFiles: files.map(f => f.fileName),
      contentUnits,
      processingOrder,
      overallConfidence,
      requiresHumanReview: anyNeedsReview,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(proposal);

  } catch (err) {
    console.error('[SCI Analyze] Error:', err);
    return NextResponse.json(
      { error: 'Analysis failed', details: String(err) },
      { status: 500 }
    );
  }
}
