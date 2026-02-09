/**
 * API Route: Import Field Mapping Interpretation
 *
 * Server-side endpoint for AI-powered field mapping suggestions.
 * Uses AIService for provider abstraction and training signal capture.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAIService } from '@/lib/ai';
import { getTrainingSignalService } from '@/lib/ai/training-signal-service';

export async function POST(request: NextRequest) {
  console.log('\n========== API ROUTE: /api/interpret-import ==========');

  try {
    const body = await request.json();
    const { headers, sampleData, tenantId, userId, planContext } = body;

    if (!headers || !Array.isArray(headers)) {
      return NextResponse.json(
        { error: 'headers array is required' },
        { status: 400 }
      );
    }

    console.log('Headers count:', headers.length);
    console.log('Headers:', headers.join(', '));
    console.log('Sample data rows:', sampleData?.length || 0);
    console.log('Tenant ID:', tenantId);

    // Format the headers for the prompt
    const headersStr = headers.map((h: string, i: number) => `${i + 1}. "${h}"`).join('\n');

    // Format sample data
    let sampleDataStr = 'No sample data provided';
    if (sampleData && sampleData.length > 0) {
      sampleDataStr = sampleData
        .slice(0, 3)
        .map((row: Record<string, unknown>, i: number) => {
          const values = headers.map((h: string) => `${h}: ${row[h] ?? 'null'}`).join(', ');
          return `Row ${i + 1}: { ${values} }`;
        })
        .join('\n');
    }

    // Format tenant context
    let tenantContext = 'No specific tenant context provided.';
    if (planContext) {
      tenantContext = `Plan components: ${planContext.components?.join(', ') || 'Unknown'}
Currency: ${planContext.currency || 'Unknown'}
Expected metrics: ${planContext.metrics?.join(', ') || 'Standard sales metrics'}`;
    }

    // Use AIService for provider abstraction
    const aiService = getAIService();

    console.log('Calling AIService.suggestImportFieldMappings...');
    const response = await aiService.suggestImportFieldMappings(
      headersStr,
      sampleDataStr,
      tenantContext,
      { tenantId, userId }
    );

    console.log('\n========== AI RESPONSE ==========');
    console.log('Request ID:', response.requestId);
    console.log('Signal ID:', response.signalId);
    console.log('Confidence:', (response.confidence * 100).toFixed(1) + '%');
    console.log('Latency:', response.latencyMs + 'ms');
    console.log('Tokens:', response.tokenUsage);

    const interpretation = response.result;

    console.log('\n========== PARSED INTERPRETATION ==========');
    console.log('Mappings count:', (interpretation.mappings as unknown[])?.length || 0);
    if (interpretation.mappings) {
      (interpretation.mappings as Array<{ sourceField: string; targetField: string | null; confidence: number }>).forEach((m, i) => {
        console.log(`  ${i + 1}. "${m.sourceField}" -> ${m.targetField || 'null'} (${m.confidence}%)`);
      });
    }
    console.log('Required fields status:', JSON.stringify(interpretation.requiredFieldsStatus));
    console.log('Overall confidence:', interpretation.overallConfidence);
    console.log('============================================\n');

    return NextResponse.json({
      success: true,
      method: 'ai',
      interpretation: {
        ...interpretation,
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
    console.error('Error in interpret-import API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Record user feedback on import field mapping
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
