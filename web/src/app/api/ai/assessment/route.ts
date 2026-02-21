/**
 * API Route: AI Dashboard Assessment
 *
 * OB-71: Routes through AIService (not direct Anthropic call).
 * AIService provides: provider abstraction, signal capture, consistent error handling.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAIService } from '@/lib/ai/ai-service';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { persona, data, locale, tenantId, anomalies } = await request.json();

    if (!persona || !data) {
      return NextResponse.json(
        { assessment: null, error: 'persona and data are required' },
        { status: 400 }
      );
    }

    const aiService = getAIService();
    const response = await aiService.generateAssessment(
      persona,
      data,
      locale || 'es',
      anomalies,
      { tenantId: tenantId || 'unknown', userId: 'api' }
    );

    // Extract assessment text from AIService result
    const assessment = typeof response.result.assessment === 'string'
      ? response.result.assessment
      : response.result.rawContent
        ? String(response.result.rawContent)
        : null;

    if (!assessment) {
      return NextResponse.json(
        { assessment: null, error: 'AI did not return an assessment' },
        { status: 502 }
      );
    }

    // Meter the AI inference (non-blocking)
    if (tenantId) {
      try {
        const supabase = await createServiceRoleClient();
        const now = new Date();
        const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        await supabase.from('usage_metering').insert({
          tenant_id: tenantId,
          metric_name: 'ai_inference',
          metric_value: 1,
          period_key: periodKey,
          dimensions: {
            endpoint: 'assessment',
            persona,
            model: response.model,
            tokens: response.tokenUsage,
          },
        });
      } catch {
        // Non-blocking — metering failure should not affect the response
      }
    }

    return NextResponse.json({ assessment });
  } catch (error) {
    console.error('Assessment API error:', error);
    return NextResponse.json(
      { assessment: null, error: 'Assessment generation failed' },
      { status: 500 }
    );
  }
}
