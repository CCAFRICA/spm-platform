/**
 * API Route: Intelligence Narration
 *
 * OB-98 Phase 3: Accepts InsightCard[] and returns a natural language narrative.
 * Routes through AIService for LLM call with graceful degradation to deterministic fallback.
 * Rate limited: max 1 LLM call per persona+tenant+dataHash per 5 minutes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAIService } from '@/lib/ai/ai-service';
import {
  buildNarrationPrompt,
  generateDeterministicNarrative,
  type NarrationRequest,
  type NarrationResponse,
} from '@/lib/intelligence/narration-service';

// ── In-memory cache (per-process) ──
const narrativeCache = new Map<string, { narrative: string; generatedAt: string }>();
const cacheTimestamps = new Map<string, number>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function hashInsights(insights: unknown[]): string {
  const str = JSON.stringify(insights);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

export async function POST(request: NextRequest) {
  try {
    const body: NarrationRequest = await request.json();
    const { persona, tenantName, periodLabel, insights, locale } = body;

    if (!persona || !insights || !Array.isArray(insights)) {
      return NextResponse.json(
        { error: 'persona and insights[] are required' },
        { status: 400 }
      );
    }

    // Empty insights → deterministic response
    if (insights.length === 0) {
      const response: NarrationResponse = {
        narrative: generateDeterministicNarrative([], persona),
        confidence: 1,
        generatedAt: new Date().toISOString(),
        source: 'deterministic',
        cached: false,
      };
      return NextResponse.json(response);
    }

    // Rate limit check: same persona+tenant+data within 5 minutes
    const dataHash = hashInsights(insights);
    const cacheKey = `${persona}:${tenantName || 'unknown'}:${dataHash}`;
    const cachedEntry = narrativeCache.get(cacheKey);
    const cacheAge = cacheTimestamps.get(cacheKey);

    if (cachedEntry && cacheAge && (Date.now() - cacheAge) < CACHE_TTL_MS) {
      const response: NarrationResponse = {
        narrative: cachedEntry.narrative,
        confidence: 0.9,
        generatedAt: cachedEntry.generatedAt,
        source: 'llm',
        cached: true,
      };
      return NextResponse.json(response);
    }

    // Build LLM prompt
    const prompt = buildNarrationPrompt({
      persona,
      tenantName: tenantName || 'your organization',
      periodLabel: periodLabel || 'the current period',
      insights,
      locale: locale || 'en',
    });

    // Attempt LLM call through AIService
    try {
      const aiService = getAIService();
      const aiResponse = await aiService.execute({
        task: 'narration',
        input: { system: prompt.system, userMessage: prompt.user },
        options: { maxTokens: 300 },
      }, false);

      const narrative = typeof aiResponse.result === 'string'
        ? aiResponse.result
        : aiResponse.result?.narrative
        ? String(aiResponse.result.narrative)
        : aiResponse.result?.rawContent
        ? String(aiResponse.result.rawContent)
        : null;

      if (narrative) {
        // Cache the result
        const generatedAt = new Date().toISOString();
        narrativeCache.set(cacheKey, { narrative, generatedAt });
        cacheTimestamps.set(cacheKey, Date.now());

        const response: NarrationResponse = {
          narrative,
          confidence: aiResponse.confidence ?? 0.85,
          generatedAt,
          source: 'llm',
          cached: false,
        };
        return NextResponse.json(response);
      }
    } catch (err) {
      console.warn('[Narration API] LLM call failed, falling back to deterministic:', err);
    }

    // Graceful degradation: deterministic fallback
    const fallbackNarrative = generateDeterministicNarrative(insights, persona);
    const response: NarrationResponse = {
      narrative: fallbackNarrative,
      confidence: 0.7,
      generatedAt: new Date().toISOString(),
      source: 'deterministic',
      cached: false,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('[Narration API] Error:', error);
    return NextResponse.json(
      { error: 'Narration generation failed' },
      { status: 500 }
    );
  }
}
