// OB-233 (DS-030 §4.2) — deterministic validator between LLM emission and storage (the EP-2 boundary).
// STRUCTURAL-PROPERTY validation only (C0): there is NO allowable-form / set-membership check on
// insight_characterization or insight_severity. Two structural checks:
//   (a) data-contract     — every numeric value referenced must trace to a value the LLM was given
//                           (a summary_artifacts metric); the LLM cannot introduce numbers.
//   (b) structural-coherence — non-empty characterization/title/narrative; >=1 data_reference;
//                           a present entity_id must be a real entity; a present date range valid.
// A never-before-seen characterization is FLAGGED novel (novelCharacterization) so the engine can log
// a flywheel signal, and is ACCEPTED — never rejected (DS-030 §2.5: structured failure means
// escalate, not delete; C2). Novelty is DATA-DRIVEN (a seen-set passed in), never a code registry.
// Korean-Test-clean: reasons over numbers + structural properties, never field names or domain strings.

import type { GeneratedInsight } from './insight-types';

export interface ValidationResult {
  ok: boolean;
  failures: string[];
  novelCharacterization: string | null;
}

export interface ValidateContext {
  entityIds?: Set<string>;             // known entity ids; a present entity_id must be one of these
  seenCharacterizations?: Set<string>; // characterizations already observed (data-driven novelty)
}

// A value "traces" if it equals (rounded to 2dp) some value the LLM was given, within a small relative
// tolerance for LLM rounding. `traceable` is the set of every numeric the digest contained.
function traces(value: number, traceable: Set<number>): boolean {
  const r = Math.round(value * 100) / 100;
  if (traceable.has(r)) return true;
  for (const t of Array.from(traceable)) {
    const denom = Math.max(Math.abs(t), 1);
    if (Math.abs(t - value) / denom <= 0.01) return true; // relative tolerance fallback: 1%
  }
  return false;
}

const isValidDate = (s: string): boolean => !Number.isNaN(Date.parse(s));

export function validateInsight(
  ins: GeneratedInsight,
  traceable: Set<number>,
  ctx: ValidateContext = {},
): ValidationResult {
  const failures: string[] = [];

  // (b) structural-coherence — non-empty free-form fields + at least one data reference
  if (!ins.insight_characterization?.trim()) failures.push('structural: empty insight_characterization');
  if (!ins.title?.trim()) failures.push('structural: empty title');
  if (!ins.narrative?.trim()) failures.push('structural: empty narrative');
  const refs = Array.isArray(ins.data_references) ? ins.data_references : [];
  if (refs.length === 0) failures.push('structural: no data_references');

  // a present entity_id must reference a real entity; a present date range must be coherent
  if (ins.entity_id && ctx.entityIds && !ctx.entityIds.has(ins.entity_id)) {
    failures.push(`structural: entity_id ${ins.entity_id} is not a known entity`);
  }
  if (ins.period_start && !isValidDate(ins.period_start)) failures.push(`structural: invalid period_start ${ins.period_start}`);
  if (ins.period_end && !isValidDate(ins.period_end)) failures.push(`structural: invalid period_end ${ins.period_end}`);
  if (ins.period_start && ins.period_end && isValidDate(ins.period_start) && isValidDate(ins.period_end)
      && Date.parse(ins.period_start) > Date.parse(ins.period_end)) {
    failures.push('structural: period_start is after period_end');
  }

  // (a) data-contract — every referenced value must trace to the summary data
  for (const ref of refs) {
    if (typeof ref.value === 'number' && Number.isFinite(ref.value)) {
      if (!traces(ref.value, traceable)) {
        failures.push(`data-contract: value ${ref.value} (metric "${ref.metric}") does not trace to the summary data`);
      }
    }
    // delta_pct is a derived ratio — it need not be a raw summary value; the absolute `value` is the anchor.
  }

  // novelty (data-driven, NOT a registry): a characterization not in the seen set is flagged so the
  // engine logs a flywheel signal. NEVER a failure (C2: escalate, do not reject).
  const c = ins.insight_characterization?.trim() ?? '';
  const novelCharacterization = (c && ctx.seenCharacterizations && !ctx.seenCharacterizations.has(c)) ? c : null;

  return { ok: failures.length === 0, failures, novelCharacterization };
}
