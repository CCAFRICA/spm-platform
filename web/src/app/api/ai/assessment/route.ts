/**
 * API Route: AI Dashboard Assessment
 *
 * OB-71: Routes through AIService (not direct Anthropic call).
 * OB-72: Auto-invokes anomaly detection when payout data is present.
 * AIService provides: provider abstraction, signal capture, consistent error handling.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAIService } from '@/lib/ai/ai-service';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { detectAnomalies } from '@/lib/intelligence/anomaly-detection';

export async function POST(request: NextRequest) {
  try {
    const { persona, data, locale, tenantId, anomalies: clientAnomalies } = await request.json();

    if (!persona || !data) {
      return NextResponse.json(
        { assessment: null, error: 'persona and data are required' },
        { status: 400 }
      );
    }

    // OB-73 Mission 1 / F-38 / AP-18: SAFETY GATE — Never generate assessment on empty data.
    // If the tenant has zero calculation_results, return a structured "no data" response
    // instead of calling the AI (which would fabricate confident analysis with made-up numbers).
    if (tenantId) {
      try {
        const supabase = await createServiceRoleClient();
        const { count } = await supabase
          .from('calculation_results')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId);

        if (!count || count === 0) {
          return NextResponse.json({
            assessment: null,
            generated: false,
            dataPoints: 0,
            message: locale === 'es'
              ? 'No hay datos de calculo disponibles para este periodo. Importa datos y ejecuta calculos antes de solicitar una evaluacion.'
              : 'No calculation data available for this period. Import data and run calculations before requesting an assessment.',
          });
        }
      } catch (err) {
        console.warn('[Assessment API] Safety gate check failed:', err);
      }
    }

    // OB-72: Auto-invoke anomaly detection if payout data is available
    let anomalies = clientAnomalies;
    if (!anomalies && data) {
      try {
        // Try to extract payout records from various data shapes
        const records: Array<{ entityId: string; totalPayout: number }> = [];
        if (Array.isArray(data.storeBreakdown)) {
          for (const s of data.storeBreakdown) {
            if (s.entityId && typeof s.totalPayout === 'number') {
              records.push({ entityId: s.entityId, totalPayout: s.totalPayout });
            }
          }
        }
        if (Array.isArray(data.teamMembers)) {
          for (const m of data.teamMembers) {
            if (m.entityId && typeof m.totalPayout === 'number') {
              records.push({ entityId: m.entityId, totalPayout: m.totalPayout });
            }
          }
        }
        if (records.length >= 3) {
          const report = detectAnomalies(records);
          if (report.anomalies.length > 0) {
            anomalies = report.anomalies;
          }
        }
      } catch {
        // Non-blocking — anomaly detection failure should not affect assessment
      }
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
