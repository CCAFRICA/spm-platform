/**
 * OB-215 Agent B — persisted model-policy loader.
 *
 * Loads the operator-set per-task model overrides from `platform_settings`
 * (key `ai_model_config`) into the in-memory resolver overrides, so a model change
 * made in the Observatory governs selection WITHOUT a code deploy (Decision 110:
 * model selection is a configurable policy, not a code constant).
 *
 * Cached per process with a short TTL — safe to call on every AI request. Any error
 * (table/row missing, cold start, RLS) falls back SILENTLY to the code-level
 * defaults in model-policy.ts, so the resolver is always correct even with no
 * persisted config.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { applyModelOverrides, getModelPolicy, ALL_AI_TASKS } from './model-policy';
import type { AITaskType } from './types';

export const MODEL_CONFIG_SETTINGS_KEY = 'ai_model_config';
const TTL_MS = 60_000;

let _loadedAt = 0;
let _inFlight: Promise<void> | null = null;

/** Accept either a native jsonb object or a stringified JSON (the legacy settings PATCH stringifies). */
function coerceMap(value: unknown): Partial<Record<AITaskType, string>> {
  let v: unknown = value;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return {};
    }
  }
  if (!v || typeof v !== 'object') return {};
  const record = v as Record<string, unknown>;
  const out: Partial<Record<AITaskType, string>> = {};
  for (const task of ALL_AI_TASKS) {
    const model = record[task];
    if (typeof model === 'string' && model.trim().length > 0) {
      out[task] = model.trim();
    }
  }
  return out;
}

/** Load (cached) the persisted overrides into the resolver. `force` bypasses the TTL. */
export async function ensureModelPolicyLoaded(force = false): Promise<void> {
  if (!force && Date.now() - _loadedAt < TTL_MS) return;
  if (_inFlight) return _inFlight;
  _inFlight = (async () => {
    try {
      const supabase = await createServiceRoleClient();
      const { data } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', MODEL_CONFIG_SETTINGS_KEY)
        .maybeSingle();
      applyModelOverrides(coerceMap(data?.value));
      _loadedAt = Date.now();
    } catch {
      // Best-effort: keep the code-level defaults.
    } finally {
      _inFlight = null;
    }
  })();
  return _inFlight;
}

/** The full current task→model policy (defaults merged with the freshly-loaded overrides). */
export async function readModelConfig(): Promise<Record<AITaskType, string>> {
  await ensureModelPolicyLoaded(true);
  return getModelPolicy();
}

/** Upsert the operator's per-task overrides and refresh the in-memory cache. */
export async function writeModelConfig(
  overrides: Partial<Record<AITaskType, string>>,
  updatedBy: string,
): Promise<void> {
  const supabase = await createServiceRoleClient();
  const { error } = await supabase
    .from('platform_settings')
    .upsert(
      {
        key: MODEL_CONFIG_SETTINGS_KEY,
        value: coerceMap(overrides),
        description: 'OB-215 per-task AI model overrides (AITaskType → model id)',
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );
  if (error) throw new Error(error.message);
  await ensureModelPolicyLoaded(true);
}
