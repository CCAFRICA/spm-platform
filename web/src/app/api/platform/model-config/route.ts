/**
 * OB-215 Agent B — Model Configuration API (platform admin only).
 *
 * GET   → the current task→model policy (defaults merged with persisted overrides),
 *         the available-model inventory, the plan-task family, and which models
 *         reject sampling params (so the Observatory can warn the operator).
 * PATCH → upsert per-task model overrides into platform_settings (key ai_model_config)
 *         and refresh the in-memory resolver cache.
 *
 * Mirrors the platform-scope gate of /api/platform/settings. Decision 110: model
 * selection is a configurable policy, not a code constant — this is its write seam.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { readModelConfig, writeModelConfig } from '@/lib/ai/model-policy-loader';
import {
  AVAILABLE_MODELS,
  ALL_AI_TASKS,
  PLAN_INTERPRETATION_TASKS,
  modelRejectsSamplingParams,
} from '@/lib/ai/model-policy';
import type { AITaskType } from '@/lib/ai/types';

/** Resolve the caller's platform-admin profile id, or a NextResponse error. */
async function requirePlatformAdmin(): Promise<{ profileId: string } | { error: NextResponse }> {
  const authClient = await createServerSupabaseClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const serviceClient = await createServiceRoleClient();
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!profile || profile.role !== 'platform') {
    return { error: NextResponse.json({ error: 'Forbidden — platform admin only' }, { status: 403 }) };
  }
  return { profileId: profile.id };
}

export async function GET() {
  try {
    const gate = await requirePlatformAdmin();
    if ('error' in gate) return gate.error;

    const policy = await readModelConfig();
    return NextResponse.json({
      policy,
      allTasks: ALL_AI_TASKS,
      planTasks: Array.from(PLAN_INTERPRETATION_TASKS),
      availableModels: AVAILABLE_MODELS,
      deprecatedSamplingModels: AVAILABLE_MODELS.filter(modelRejectsSamplingParams),
    });
  } catch (err) {
    console.error('[OB-215 model-config GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const gate = await requirePlatformAdmin();
    if ('error' in gate) return gate.error;

    const body = await request.json();
    const overrides = body?.overrides;
    if (!overrides || typeof overrides !== 'object') {
      return NextResponse.json({ error: 'overrides object required' }, { status: 400 });
    }

    // Accept only known task keys with string model values (Korean Test: structural keys).
    const known = new Set<string>(ALL_AI_TASKS);
    const clean: Partial<Record<AITaskType, string>> = {};
    for (const [task, model] of Object.entries(overrides as Record<string, unknown>)) {
      if (known.has(task) && typeof model === 'string' && model.trim().length > 0) {
        clean[task as AITaskType] = model.trim();
      }
    }

    await writeModelConfig(clean, gate.profileId);
    const policy = await readModelConfig();
    return NextResponse.json({ policy });
  } catch (err) {
    console.error('[OB-215 model-config PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
