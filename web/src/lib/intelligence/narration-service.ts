/**
 * Narration Service — LLM Enhancement Layer
 *
 * OB-98 Phase 3: Takes structured InsightCard[] from the insight engine and
 * generates a natural language narrative paragraph via AIService.
 *
 * Graceful degradation: if LLM call fails, returns a deterministic fallback
 * generated from the insight cards themselves. The dashboard always renders
 * something useful — the LLM just makes it more polished.
 *
 * Rate limited: max 1 call per batch+persona per 5 minutes (in-memory cache).
 */

import type { InsightCard } from './insight-engine';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface NarrationRequest {
  persona: 'admin' | 'manager' | 'rep';
  tenantName: string;
  periodLabel: string;
  insights: InsightCard[];
  locale: string;
}

export interface NarrationResponse {
  narrative: string;
  confidence: number;
  generatedAt: string;
  source: 'llm' | 'deterministic';
  cached: boolean;
}

// ──────────────────────────────────────────────
// Deterministic Fallback
// ──────────────────────────────────────────────

/**
 * Generate a readable narrative from structured insights without an LLM.
 * Used when AI is unavailable, rate-limited, or API key missing.
 */
export function generateDeterministicNarrative(
  insights: InsightCard[],
  persona: 'admin' | 'manager' | 'rep'
): string {
  if (insights.length === 0) {
    const labels: Record<string, string> = {
      admin: 'No insights available for this period. Run a calculation to generate performance data.',
      manager: 'No team insights available. Data will appear after calculations run for this period.',
      rep: 'No performance insights yet. Your data will appear after the next calculation run.',
    };
    return labels[persona];
  }

  const warnings = insights.filter(i => i.type === 'warning');
  const opportunities = insights.filter(i => i.type === 'opportunity');
  const observations = insights.filter(i => i.type === 'observation');
  const recommendations = insights.filter(i => i.type === 'recommendation');

  const parts: string[] = [];

  // Lead with the most important observation
  if (observations.length > 0) {
    parts.push(observations[0].body);
  }

  // Warnings next
  if (warnings.length > 0) {
    parts.push(warnings[0].body);
  }

  // Opportunities or recommendations
  if (opportunities.length > 0) {
    parts.push(opportunities[0].body);
  } else if (recommendations.length > 0) {
    parts.push(recommendations[0].body);
  }

  return parts.join(' ');
}

// ──────────────────────────────────────────────
// LLM Prompt Builder
// ──────────────────────────────────────────────

export function buildNarrationPrompt(req: NarrationRequest): {
  system: string;
  user: string;
} {
  const personaLabel = req.persona === 'admin'
    ? 'an administrator'
    : req.persona === 'manager'
    ? 'a team manager'
    : 'an individual contributor';

  return {
    system: `You are an intelligence analyst for ${req.tenantName}. Generate a 2-4 sentence executive summary for ${personaLabel} reviewing ${req.periodLabel} results. Be specific with numbers. Focus on what needs attention and what action to take. Language: ${req.locale === 'en' ? 'English' : 'Spanish'}. No bullet points. No headers. Just clear prose.`,
    user: `Here are the key insights:\n${JSON.stringify(req.insights.map(i => ({
      type: i.type,
      title: i.title,
      body: i.body,
      metric: i.metricLabel,
      action: i.action,
    })), null, 2)}\n\nGenerate a concise narrative summary.`,
  };
}
