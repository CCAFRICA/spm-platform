/**
 * API Route: AI File Classification
 *
 * Server-side endpoint for AI-powered file type classification.
 * Uses AIService for provider abstraction and training signal capture.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAIService } from '@/lib/ai';
import { getTrainingSignalService } from '@/lib/ai/training-signal-service';

export async function POST(request: NextRequest) {
  console.log('\n========== API ROUTE: /api/ai/classify-file ==========');

  try {
    const body = await request.json();
    const { fileName, contentPreview, metadata, tenantId, userId } = body;

    if (!fileName || !contentPreview) {
      return NextResponse.json(
        { error: 'fileName and contentPreview are required' },
        { status: 400 }
      );
    }

    console.log('File name:', fileName);
    console.log('Content preview length:', contentPreview.length, 'chars');
    console.log('Tenant ID:', tenantId);

    // Use AIService for provider abstraction
    const aiService = getAIService();

    console.log('Calling AIService.classifyFile...');
    const response = await aiService.classifyFile(
      fileName,
      contentPreview,
      metadata,
      { tenantId, userId }
    );

    console.log('\n========== AI RESPONSE ==========');
    console.log('Request ID:', response.requestId);
    console.log('Signal ID:', response.signalId);
    console.log('File type:', response.result.fileType);
    console.log('Suggested module:', response.result.suggestedModule);
    console.log('Confidence:', (response.confidence * 100).toFixed(1) + '%');
    console.log('Latency:', response.latencyMs + 'ms');
    console.log('=====================================\n');

    return NextResponse.json({
      success: true,
      result: response.result,
      confidence: response.confidence * 100, // Return as 0-100
      signalId: response.signalId,
      _aiMetadata: {
        requestId: response.requestId,
        provider: response.provider,
        model: response.model,
        latencyMs: response.latencyMs,
        tokenUsage: response.tokenUsage,
      },
    });
  } catch (error) {
    console.error('Error in classify-file API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Record user feedback on file classification
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
