/**
 * API Route: AI Dashboard Assessment
 *
 * OB-71: Routes through AIService (not direct Anthropic call).
 * OB-72: Auto-invokes anomaly detection when payout data is present.
 * OB-83: Domain terminology injection, assessment caching, training signals.
 * AIService provides: provider abstraction, signal capture, consistent error handling.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAIService } from '@/lib/ai/ai-service';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { detectAnomalies } from '@/lib/intelligence/anomaly-detection';
import { persistSignal } from '@/lib/ai/signal-persistence';
import { getDomain } from '@/lib/domain/domain-registry';
import '@/lib/domain/domains/icm'; // Trigger ICM registration
import type { Json } from '@/lib/supabase/database.types';

// ── OB-83: In-memory assessment cache (per-process) ──
const assessmentCache = new Map<string, { assessment: string; generatedAt: string }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();

function buildCacheKey(persona: string, tenantId: string, dataHash: string): string {
  return `${persona}:${tenantId}:${dataHash}`;
}

function hashData(data: unknown): string {
  // Simple deterministic hash from JSON-serialized data
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

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
            cached: false,
            message: locale === 'es'
              ? 'No hay datos de calculo disponibles para este periodo. Importa datos y ejecuta calculos antes de solicitar una evaluacion.'
              : 'No calculation data available for this period. Import data and run calculations before requesting an assessment.',
          });
        }
      } catch (err) {
        console.warn('[Assessment API] Safety gate check failed:', err);
      }
    }

    // OB-83: Check assessment cache before calling AI
    const dataHash = hashData(data);
    const cacheKey = buildCacheKey(persona, tenantId || 'unknown', dataHash);
    const cachedEntry = assessmentCache.get(cacheKey);
    const cacheAge = cacheTimestamps.get(cacheKey);

    if (cachedEntry && cacheAge && (Date.now() - cacheAge) < CACHE_TTL_MS) {
      return NextResponse.json({
        assessment: cachedEntry.assessment,
        cached: true,
        generatedAt: cachedEntry.generatedAt,
      });
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

    // OB-83: Load domain terminology for prompt enrichment
    const domainId = 'icm'; // default — will be configurable per tenant
    const domain = getDomain(domainId);
    const terminology = domain?.terminology;

    // Inject domain terminology into data context for AI prompt
    const enrichedData = terminology
      ? { ...data, domainTerminology: terminology, domainId }
      : data;

    const aiService = getAIService();
    const response = await aiService.generateAssessment(
      persona,
      enrichedData,
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

    // OB-83: Cache the assessment
    const generatedAt = new Date().toISOString();
    assessmentCache.set(cacheKey, { assessment, generatedAt });
    cacheTimestamps.set(cacheKey, Date.now());

    // OB-83: Capture training signal for assessment generation (non-blocking)
    if (tenantId) {
      persistSignal({
        tenantId,
        signalType: 'training:assessment_generated',
        signalValue: {
          persona,
          domainId,
          locale: locale || 'es',
          dataKeys: Object.keys(data),
          assessmentLength: assessment.length,
          hadAnomalies: !!anomalies,
          cacheKey: dataHash,
        },
        source: 'ai_prediction',
        context: { trigger: 'assessment_api', endpoint: '/api/ai/assessment' },
      }).catch(err => {
        console.warn('[Assessment API] Training signal failed (non-blocking):', err);
      });
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
            domainId,
            model: response.model,
            tokens: response.tokenUsage,
            cached: false,
          } as unknown as Json,
        });
      } catch {
        // Non-blocking — metering failure should not affect the response
      }
    }

    return NextResponse.json({ assessment, cached: false, generatedAt });
  } catch (error) {
    console.error('Assessment API error:', error);
    return NextResponse.json(
      { assessment: null, error: 'Assessment generation failed' },
      { status: 500 }
    );
  }
}
