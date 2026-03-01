// SCI Analyze API — POST /api/import/sci/analyze
// Decision 77 — OB-127
// Accepts parsed file data, returns agent-classified proposal.
// Zero domain vocabulary. Korean Test applies.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateContentProfile } from '@/lib/sci/content-profile';
import { scoreContentUnit, resolveClaimsPhase1, requiresHumanReview } from '@/lib/sci/agents';
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

        // Score with all 4 agents
        const scores = scoreContentUnit(profile);

        // Resolve claim
        const claim = resolveClaimsPhase1(profile, scores);
        const winner = scores[0];
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

        contentUnits.push({
          contentUnitId: profile.contentUnitId,
          sourceFile: file.fileName,
          tabName: sheet.sheetName,
          classification: winner.agent,
          confidence: winner.confidence,
          reasoning: winner.reasoning,
          action: ACTION_DESCRIPTIONS[winner.agent],
          fieldBindings: claim.semanticBindings,
          allScores: scores,
          warnings,
        });
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
