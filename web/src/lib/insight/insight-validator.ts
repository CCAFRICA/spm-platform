// OB-232 Enforcement Point 2 — deterministic validator between LLM emission and storage/render.
// Two checks: (a) data-contract — every numeric value the LLM references must trace to a value that
// was present in the summary data it was given (the LLM cannot introduce numbers); (b) allowable-form —
// artifact_type + severity must be in the canonical registries. Fails LOUD. Korean-Test-clean: it
// reasons over numbers + structural registries, never field names or domain strings.

import { ARTIFACT_TYPES, SEVERITIES, type GeneratedInsight } from './insight-types';

export interface ValidationResult {
  ok: boolean;
  failures: string[];
}

// A value "traces" if it equals (rounded to 2dp) some value the LLM was given, within a small relative
// tolerance for LLM rounding. `traceable` is the set of every numeric the digest contained.
function traces(value: number, traceable: Set<number>): boolean {
  const r = Math.round(value * 100) / 100;
  if (traceable.has(r)) return true;
  // relative tolerance fallback (LLM may round/scale): 1%
  for (const t of Array.from(traceable)) {
    const denom = Math.max(Math.abs(t), 1);
    if (Math.abs(t - value) / denom <= 0.01) return true;
  }
  return false;
}

export function validateInsight(ins: GeneratedInsight, traceable: Set<number>): ValidationResult {
  const failures: string[] = [];

  // allowable-form
  if (!ARTIFACT_TYPES.includes(ins.artifact_type)) failures.push(`allowable-form: unknown artifact_type "${ins.artifact_type}"`);
  if (!SEVERITIES.includes(ins.severity)) failures.push(`allowable-form: unknown severity "${ins.severity}"`);
  if (!ins.title?.trim()) failures.push('allowable-form: missing title');
  if (!ins.narrative?.trim()) failures.push('allowable-form: missing narrative');

  // data-contract — every referenced value must trace to the summary data
  const refs = Array.isArray(ins.data_references) ? ins.data_references : [];
  for (const ref of refs) {
    if (typeof ref.value === 'number' && Number.isFinite(ref.value)) {
      if (!traces(ref.value, traceable)) {
        failures.push(`data-contract: value ${ref.value} (metric "${ref.metric}") does not trace to the summary data`);
      }
    }
    // delta_pct is a derived ratio — it need not be a raw summary value; the absolute `value` is the anchor.
  }

  return { ok: failures.length === 0, failures };
}
