/**
 * API Route: Plan Interpretation
 *
 * Server-side endpoint for AI-powered plan interpretation.
 * Uses AIService for provider abstraction and training signal capture.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAIService } from '@/lib/ai';
import { getTrainingSignalService } from '@/lib/ai/training-signal-service';
import { createServiceRoleClient } from '@/lib/supabase/server';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(request: NextRequest) {
  console.log('\n========== API ROUTE: /api/interpret-plan ==========');

  try {
    const body = await request.json();
    const { documentContent, tenantId, userId, pdfBase64, pdfMediaType } = body;

    if (!documentContent && !pdfBase64) {
      return NextResponse.json(
        { error: 'documentContent or pdfBase64 is required' },
        { status: 400 }
      );
    }

    console.log('Document content length:', documentContent?.length || 0, 'chars');
    console.log('PDF base64 length:', pdfBase64?.length || 0, 'chars');
    console.log('Tenant ID:', tenantId);
    console.log('User ID:', userId);

    // Use AIService for provider abstraction
    const aiService = getAIService();

    const format = pdfBase64 ? 'pdf' : 'text';
    console.log(`Calling AIService.interpretPlan (format: ${format})...`);
    const response = await aiService.interpretPlan(
      documentContent || `[PDF document: ${pdfBase64?.length || 0} bytes base64]`,
      format,
      { tenantId, userId },
      pdfBase64,
      pdfMediaType
    );

    console.log('\n========== AI RESPONSE ==========');
    console.log('Request ID:', response.requestId);
    console.log('Signal ID:', response.signalId);
    console.log('Confidence:', (response.confidence * 100).toFixed(1) + '%');
    console.log('Latency:', response.latencyMs + 'ms');
    console.log('Tokens:', response.tokenUsage);

    const interpretation = response.result;

    // OB-23 DIAG: Write full AI response to file
    try {
      const logPath = path.join(process.cwd(), 'API_PLAN_RESPONSE.json');
      fs.writeFileSync(logPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId: response.requestId,
        confidence: response.confidence,
        fullResult: interpretation,
        componentsDetail: (interpretation.components as Array<Record<string, unknown>>)?.map(c => ({
          name: c.name,
          type: c.type,
          calculationMethod: c.calculationMethod,
        })),
      }, null, 2), 'utf-8');
      console.log('OB-23: Full AI response written to API_PLAN_RESPONSE.json');
    } catch (e) {
      console.error('OB-23: Failed to write response file:', e);
    }

    console.log('\n========== PARSED INTERPRETATION ==========');
    console.log('Plan name:', interpretation.ruleSetName);
    console.log('Employee types:', (interpretation.employeeTypes as unknown[])?.length || 0);
    console.log('Components:', (interpretation.components as unknown[])?.length || 0);
    if (interpretation.components && Array.isArray(interpretation.components)) {
      (interpretation.components as Array<Record<string, unknown>>).forEach((comp, i) => {
        console.log(`  ${i + 1}. ${comp.name} (${comp.type}) - ${comp.confidence || 0}% confidence`);
      });
    }
    console.log('============================================\n');

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
          dimensions: {
            endpoint: 'interpret-plan',
            model: response.model,
            latencyMs: response.latencyMs,
            tokenUsage: response.tokenUsage,
            confidence: response.confidence,
          },
        });
      }
    } catch (meterErr) {
      console.error('[interpret-plan] Metering failed:', meterErr);
    }

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
      confidence: response.confidence * 100, // Return as 0-100 for backward compat
    });
  } catch (error) {
    console.error('Error in interpret-plan API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Record user feedback on plan interpretation
 * Called when user accepts, corrects, or rejects AI interpretation
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
