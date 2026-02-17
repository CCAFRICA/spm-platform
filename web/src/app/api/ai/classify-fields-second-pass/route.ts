/**
 * API Route: Second-Pass Field Classification
 *
 * Server-side endpoint for AI-powered field classification with plan context.
 * Called when initial field mapping leaves unresolved fields.
 * Uses AIService for provider abstraction and training signal capture.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAIService } from '@/lib/ai';
import { createServiceRoleClient } from '@/lib/supabase/server';

interface SecondPassRequest {
  sheetName: string;
  componentName: string;
  calculationType: string;
  neededMetrics: string[];
  alreadyMapped: Array<{ sourceColumn: string; semanticType: string }>;
  unresolvedFields: Array<{ sourceColumn: string; sampleValues: unknown[]; dataType: string }>;
  tenantId?: string;
  userId?: string;
}

export async function POST(request: NextRequest) {
  console.log('\n========== API ROUTE: /api/ai/classify-fields-second-pass ==========');

  try {
    const body = await request.json() as SecondPassRequest;
    const {
      sheetName,
      componentName,
      calculationType,
      neededMetrics,
      alreadyMapped,
      unresolvedFields,
      tenantId,
      userId,
    } = body;

    // Validate required fields
    if (!sheetName || !componentName || !calculationType || !neededMetrics || !unresolvedFields) {
      return NextResponse.json(
        { error: 'Missing required fields: sheetName, componentName, calculationType, neededMetrics, unresolvedFields' },
        { status: 400 }
      );
    }

    console.log('Sheet:', sheetName);
    console.log('Component:', componentName);
    console.log('Calculation type:', calculationType);
    console.log('Needed metrics:', neededMetrics);
    console.log('Already mapped:', alreadyMapped.length);
    console.log('Unresolved fields:', unresolvedFields.length);

    // Use AIService for provider abstraction
    const aiService = getAIService();

    console.log('Calling AIService.classifyFieldsSecondPass...');
    const response = await aiService.classifyFieldsSecondPass(
      sheetName,
      componentName,
      calculationType,
      neededMetrics,
      alreadyMapped,
      unresolvedFields,
      { tenantId, userId }
    );

    console.log('\n========== AI RESPONSE ==========');
    console.log('Request ID:', response.requestId);
    console.log('Signal ID:', response.signalId);
    console.log('Confidence:', (response.confidence * 100).toFixed(1) + '%');
    console.log('Latency:', response.latencyMs + 'ms');
    console.log('Tokens:', response.tokenUsage);

    const classifications = response.result?.classifications || [];
    console.log('Classifications returned:', classifications.length);
    classifications.forEach((c: { sourceColumn: string; semanticType: string | null; confidence: number }) => {
      console.log(`  - "${c.sourceColumn}": ${c.semanticType || 'null'} (${(c.confidence * 100).toFixed(0)}%)`);
    });
    console.log('==========================================\n');

    // Write metering event (non-blocking)
    try {
      if (tenantId) {
        const meter = await createServiceRoleClient();
        const now = new Date();
        const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        await meter.from('usage_metering').insert({
          tenant_id: tenantId,
          metric_name: 'ai_inference',
          metric_value: 1,
          period_key: periodKey,
          metadata: {
            endpoint: 'classify-fields-second-pass',
            model: response.model,
            latencyMs: response.latencyMs,
            tokenUsage: response.tokenUsage,
            confidence: response.confidence,
          },
        });
      }
    } catch (meterErr) {
      console.error('[classify-fields-second-pass] Metering failed:', meterErr);
    }

    return NextResponse.json({
      success: true,
      result: response.result,
      confidence: response.confidence,
      _aiMetadata: {
        requestId: response.requestId,
        signalId: response.signalId,
        provider: response.provider,
        model: response.model,
        latencyMs: response.latencyMs,
        tokenUsage: response.tokenUsage,
      },
    });
  } catch (error) {
    console.error('Error in classify-fields-second-pass API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
