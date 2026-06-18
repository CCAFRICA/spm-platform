/**
 * AI Model Policy — single source of truth for model selection, sampling-param
 * deprecation, and per-model pricing.
 *
 * OB-215 (implements the AUD-018 HALT-0 advisories). Before this file, model
 * selection was scattered across 4 independent seams that could drift (AUD-018
 * File A): the AIService constructor, the adapter execute() ternary, the adapter
 * executeAgentTurn() chain, and the reconcile-diagnose route's own env read.
 * Every one of them inlined a `'claude-sonnet-4-6'` fallback and HF-304's Opus
 * branch lived only in the adapter. This module retires that class: ONE policy,
 * keyed on the typed `AITaskType` discriminant.
 *
 * Decision 110: model selection is a quality-governing authority value — the same
 * prohibited class as the 8 developer-set thresholds. It belongs in a single
 * configurable policy, not as constants buried at each call site. The Observatory
 * model-control surface (OB-215 Agent B) reads `getModelPolicy()` and writes
 * `applyModelOverrides()`; the persisted overrides win over the code defaults.
 *
 * Korean Test (Decision 154): the resolver keys ONLY on the structural
 * `AITaskType`. No tenant, no language, no column name ever enters model selection.
 */

import { AITaskType } from './types';

// ── Model identifiers ────────────────────────────────────────────────────────
// These are the ONLY model string literals in the codebase. Every seam routes
// through this module (enforced by the OB-215 §8.1 proof grep). Opus id confirmed
// live via /v1/models (HF-304 §5).
export const OPUS_MODEL = 'claude-opus-4-8';
export const DEFAULT_MODEL = 'claude-sonnet-4-6';

/**
 * The non-plan default model. Reads the env override if set, else the code default.
 * (AUD-018: `NEXT_PUBLIC_AI_MODEL` is the single env var that can override the
 * default; it is currently unset in production, so the code default governs.)
 */
export function defaultModel(): string {
  return process.env.NEXT_PUBLIC_AI_MODEL || DEFAULT_MODEL;
}

// ── The plan-interpretation task family ──────────────────────────────────────
// HF-248/HF-249: plan interpretation is four typed tasks. It is the highest-
// reasoning step and must emit a structurally COMPLETE exact rate table (e.g. all
// 20 cells of a 5×4 banded_lookup) — the c1-senior regression (AUD-017) was a
// 19-vs-20 under-emission, fixed by routing the whole family to Opus. The failure
// is in `plan_component` (Phase B), so the WHOLE family routes, not just the
// legacy `plan_interpretation` task.
export const PLAN_INTERPRETATION_TASKS: ReadonlySet<AITaskType> = new Set<AITaskType>([
  'plan_interpretation',
  'plan_skeleton',
  'plan_component',
  'plan_component_with_chunking',
]);

// The canonical list of every AI task — kept in sync with the `AITaskType` union
// in types.ts (there is no runtime enum). Used to materialize the full policy map
// for the Observatory control surface.
export const ALL_AI_TASKS: readonly AITaskType[] = [
  'file_classification',
  'sheet_classification',
  'field_mapping',
  'field_mapping_second_pass',
  'plan_interpretation',
  'plan_skeleton',
  'plan_component',
  'plan_component_with_chunking',
  'plan_chunk',
  'workbook_analysis',
  'import_field_mapping',
  'entity_extraction',
  'anomaly_detection',
  'recommendation',
  'natural_language_query',
  'dashboard_assessment',
  'narration',
  'header_comprehension',
  'document_analysis',
  'convergence_mapping',
];

// ── Persisted overrides (populated by the Observatory loader, OB-215 Agent B) ──
// A platform operator can change the model for any task without a code deploy. The
// loader reads `platform_settings` (key `ai_model_config`) and calls
// `applyModelOverrides`; `resolveModel` consults these first. Empty by default →
// the code-level policy below governs (so this module is correct with or without
// the persisted config).
let _overrides: Partial<Record<AITaskType, string>> = {};

export function applyModelOverrides(overrides: Partial<Record<AITaskType, string>>): void {
  // Drop empty/blank entries so a cleared field falls back to the code default.
  const clean: Partial<Record<AITaskType, string>> = {};
  for (const [task, model] of Object.entries(overrides)) {
    if (typeof model === 'string' && model.trim().length > 0) {
      clean[task as AITaskType] = model.trim();
    }
  }
  _overrides = clean;
}

export function clearModelOverrides(): void {
  _overrides = {};
}

export function getModelOverrides(): Partial<Record<AITaskType, string>> {
  return { ..._overrides };
}

// ── The resolver ─────────────────────────────────────────────────────────────
/**
 * The single model-selection function. Precedence:
 *   1. a persisted per-task override (operator-set via the Observatory), else
 *   2. an explicit per-call config model (`opts.configModel`), else
 *   3. the plan family → Opus; every other task → the env/default model.
 *
 * Pure and synchronous: it reads only the module-level override cache (populated
 * out-of-band by the loader) and its arguments. Keyed on `AITaskType` only.
 */
export function resolveModel(task: AITaskType, opts?: { configModel?: string }): string {
  const override = _overrides[task];
  if (override) return override;
  if (PLAN_INTERPRETATION_TASKS.has(task)) return OPUS_MODEL;
  return opts?.configModel || defaultModel();
}

/**
 * The full current task→model mapping (defaults merged with persisted overrides).
 * This is what the Observatory model-config panel renders and makes editable.
 */
export function getModelPolicy(): Record<AITaskType, string> {
  const policy = {} as Record<AITaskType, string>;
  for (const task of ALL_AI_TASKS) {
    policy[task] = resolveModel(task);
  }
  return policy;
}

// ── Sampling-param deprecation ───────────────────────────────────────────────
// AUD-018 File B: the adapter's execute() body sent `temperature` unconditionally,
// and the Opus tier that HF-304 routes plan tasks to rejects sampling params with
// HTTP 400 ("temperature is deprecated for this model") — the live import blocker.
// The current default-tier models that 400 on sampling params are the Opus 4.x
// family and Fable (the adapter's executeAgentTurn note + AUD-018 File B). Sonnet
// 4.6 tolerates `temperature`. Since every task sets `temperature: 0` (the
// deterministic default), omitting it where rejected is LOSSLESS for emission
// determinism (Korean-Test-safe: no behavioral change beyond the param drop).
//
// NOTE (AUD-018 §"tension"): the architect's observed 400 was reported on
// claude-sonnet-4-6. If sonnet-4-6 is in fact in the rejecting tier, add a
// `claude-sonnet-4-6` branch here — this predicate is the single place to change.
const SAMPLING_PARAM_REJECTING_PATTERNS: readonly RegExp[] = [
  /^claude-opus-4/, // Opus 4.x (4.5/4.6/4.7/4.8) — plan tasks route here
  /^claude-fable/,  // Fable 5+
];

export function modelRejectsSamplingParams(model: string): boolean {
  return SAMPLING_PARAM_REJECTING_PATTERNS.some((re) => re.test(model));
}

// The sampling params a rejecting model 400s on (omitted wholesale for those models).
export const DEPRECATED_SAMPLING_PARAMS: readonly string[] = [
  'temperature',
  'top_p',
  'top_k',
];

// ── Per-model pricing (USD per 1M tokens) ────────────────────────────────────
// OB-215 Agent C consumes this for real per-call cost (replacing the flat
// $0.003/1K blended rate and the Haiku cost-basis comment AUD-018 File A flagged).
// Exact-id entries first; `pricingTierFor` falls back by model-family prefix so a
// new point release inherits its tier's pricing rather than the wrong default.
export interface ModelPrice {
  inputPer1M: number;
  outputPer1M: number;
}

export const MODEL_PRICING: Record<string, ModelPrice> = {
  'claude-opus-4-8': { inputPer1M: 15, outputPer1M: 75 },
  'claude-sonnet-4-6': { inputPer1M: 3, outputPer1M: 15 },
  'claude-haiku-4-5': { inputPer1M: 1, outputPer1M: 5 },
};

const PRICING_TIERS: ReadonlyArray<{ pattern: RegExp; price: ModelPrice }> = [
  { pattern: /^claude-opus/, price: { inputPer1M: 15, outputPer1M: 75 } },
  { pattern: /^claude-sonnet/, price: { inputPer1M: 3, outputPer1M: 15 } },
  { pattern: /^claude-haiku/, price: { inputPer1M: 1, outputPer1M: 5 } },
  { pattern: /^claude-fable/, price: { inputPer1M: 15, outputPer1M: 75 } },
];

/** Resolve pricing for a model: exact id, else family tier, else the default-model tier. */
export function pricingFor(model: string): ModelPrice {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  const tier = PRICING_TIERS.find((t) => t.pattern.test(model));
  if (tier) return tier.price;
  return MODEL_PRICING[DEFAULT_MODEL];
}

/** Per-call cost in USD from the resolved model and token counts. */
export function computeCallCostUSD(model: string, tokensIn: number, tokensOut: number): number {
  const price = pricingFor(model);
  const cost = (tokensIn * price.inputPer1M) / 1_000_000 + (tokensOut * price.outputPer1M) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
