/**
 * API Route: AI Dashboard Assessment
 *
 * Generates persona-aware intelligence assessments for each dashboard.
 * Uses the Anthropic API directly (same pattern as anthropic-adapter.ts).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const SYSTEM_PROMPTS: Record<string, (locale: string) => string> = {
  admin: (locale) => `You are a governance advisor for a compensation platform. Analyze the data and provide:
1. A 2-sentence summary of the current state
2. Any anomalies or patterns detected (e.g., identical deltas, missing data, outliers)
3. A specific recommended next action
Keep response under 100 words. Use ${locale === 'en' ? 'English' : 'Spanish'}.`,

  manager: (locale) => `You are a coaching advisor for a sales manager. Analyze team performance data and provide:
1. A 1-sentence team summary
2. Top coaching opportunity (who needs attention and why)
3. A quick win (who is closest to a breakthrough)
4. A specific recommended action for this week
Keep response under 120 words. Use ${locale === 'en' ? 'English' : 'Spanish'}.`,

  rep: (locale) => `You are a personal performance coach for a sales representative. Analyze their compensation data and provide:
1. A 1-sentence congratulatory or motivational opening based on their performance
2. Their strongest component and why
3. Their biggest growth opportunity with a specific dollar impact estimate
4. One specific action they can take today
Keep response under 100 words. Use ${locale === 'en' ? 'English' : 'Spanish'}.`,
};

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { assessment: null, error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 }
      );
    }

    const { persona, data, locale, tenantId } = await request.json();

    if (!persona || !data) {
      return NextResponse.json(
        { assessment: null, error: 'persona and data are required' },
        { status: 400 }
      );
    }

    const systemPrompt = (SYSTEM_PROMPTS[persona] || SYSTEM_PROMPTS.admin)(locale || 'es');

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Analyze this dashboard data and provide your assessment:\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      return NextResponse.json(
        { assessment: null, error: 'AI provider returned an error' },
        { status: 502 }
      );
    }

    const result = await response.json();
    const text = result.content
      ?.filter((block: { type: string }) => block.type === 'text')
      ?.map((block: { text: string }) => block.text)
      ?.join('\n') || '';

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
          metadata: { endpoint: 'assessment', persona, model: 'claude-sonnet-4-20250514' },
        });
      } catch {
        // Non-blocking — metering failure should not affect the response
      }
    }

    return NextResponse.json({ assessment: text });
  } catch (error) {
    console.error('Assessment API error:', error);
    return NextResponse.json(
      { assessment: null, error: 'Assessment generation failed' },
      { status: 500 }
    );
  }
}
