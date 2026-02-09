/**
 * API Route: Workbook Analysis
 *
 * Server-side endpoint for AI-powered multi-sheet workbook analysis.
 * Uses AIService for provider abstraction and training signal capture.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAIService } from '@/lib/ai';
import { getTrainingSignalService } from '@/lib/ai/training-signal-service';

interface SheetSample {
  name: string;
  headers: string[];
  rowCount: number;
  sampleRows: Record<string, unknown>[];
}

export async function POST(request: NextRequest) {
  console.log('\n========== API ROUTE: /api/analyze-workbook ==========');

  try {
    const body = await request.json();
    const { sheets, tenantId, userId, planComponents, expectedFields } = body as {
      sheets: SheetSample[];
      tenantId: string;
      userId?: string;
      planComponents?: { id: string; name: string; type: string }[];
      expectedFields?: Record<string, string[]>;
    };

    if (!sheets || !Array.isArray(sheets) || sheets.length === 0) {
      return NextResponse.json(
        { error: 'sheets array is required' },
        { status: 400 }
      );
    }

    console.log('Sheets count:', sheets.length);
    console.log('Tenant ID:', tenantId);
    console.log('Plan components:', planComponents?.length || 0);

    // Format sheets info for the prompt
    const sheetsInfo = sheets.map((sheet, i) => {
      const headersStr = sheet.headers.map((h, j) => `    ${j + 1}. "${h}"`).join('\n');
      const sampleStr = sheet.sampleRows.slice(0, 2).map((row, j) => {
        const values = sheet.headers.slice(0, 5).map(h => `${h}: ${row[h] ?? 'null'}`).join(', ');
        return `    Sample ${j + 1}: { ${values}${sheet.headers.length > 5 ? ', ...' : ''} }`;
      }).join('\n');

      return `
Sheet ${i + 1}: "${sheet.name}"
  Row count: ${sheet.rowCount}
  Columns (${sheet.headers.length}):
${headersStr}
  Sample data:
${sampleStr}`;
    }).join('\n\n');

    // Format plan components
    let planComponentsStr = 'No plan components provided.';
    if (planComponents && planComponents.length > 0) {
      planComponentsStr = planComponents.map((c, i) =>
        `${i + 1}. ${c.name} (${c.type}) - ID: ${c.id}`
      ).join('\n');
    }

    // Format expected fields
    let expectedFieldsStr = 'No expected fields provided.';
    if (expectedFields && Object.keys(expectedFields).length > 0) {
      expectedFieldsStr = Object.entries(expectedFields).map(([compId, fields]) =>
        `${compId}: ${fields.join(', ')}`
      ).join('\n');
    }

    // Use AIService for provider abstraction
    const aiService = getAIService();

    console.log('Calling AIService.analyzeWorkbook...');
    const response = await aiService.analyzeWorkbook(
      sheetsInfo,
      planComponentsStr,
      expectedFieldsStr,
      { tenantId, userId }
    );

    console.log('\n========== AI RESPONSE ==========');
    console.log('Request ID:', response.requestId);
    console.log('Signal ID:', response.signalId);
    console.log('Confidence:', (response.confidence * 100).toFixed(1) + '%');
    console.log('Latency:', response.latencyMs + 'ms');
    console.log('Tokens:', response.tokenUsage);

    const analysis = response.result;

    console.log('\n========== PARSED ANALYSIS ==========');
    console.log('Sheets analyzed:', (analysis.sheets as unknown[])?.length || 0);
    if (analysis.sheets) {
      (analysis.sheets as Array<{ name: string; classification: string; classificationConfidence: number }>).forEach((s) => {
        console.log(`  - "${s.name}": ${s.classification} (${s.classificationConfidence}%)`);
      });
    }
    console.log('Relationships found:', (analysis.relationships as unknown[])?.length || 0);
    console.log('Roster detected:', (analysis.rosterDetected as { found: boolean })?.found);
    console.log('Overall confidence:', analysis.overallConfidence);
    console.log('==========================================\n');

    return NextResponse.json({
      success: true,
      analysis: {
        ...analysis,
        _aiMetadata: {
          requestId: response.requestId,
          signalId: response.signalId,
          provider: response.provider,
          model: response.model,
          latencyMs: response.latencyMs,
          tokenUsage: response.tokenUsage,
        },
      },
      confidence: response.confidence * 100,
    });
  } catch (error) {
    console.error('Error in analyze-workbook API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Record user feedback on workbook analysis
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { signalId, action, correction, tenantId } = body;

    if (!signalId || !action) {
      return NextResponse.json(
        { error: 'signalId and action are required' },
        { status: 400 }
      );
    }

    const signalService = getTrainingSignalService(tenantId);
    signalService.recordUserAction(signalId, action, correction);

    console.log(`Training signal ${signalId}: user action = ${action}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error recording user action:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
