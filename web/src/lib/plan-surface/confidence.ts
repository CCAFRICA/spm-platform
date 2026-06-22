/**
 * OB-228 Phase 5 — Confidence Topology (Concept ③). RECOGNITION, not construction
 * (Decision 158): advisory severity derived from the interpreter's confidence + the
 * binding-resolution anomaly + structural signals. Bloodwork Principle: recede the
 * confident, surface the exceptions. "The number that matters is Needs Review."
 *
 * Severity model (DS-029 §3③): silent-incorrect-payout risk → Critical; might-be-error
 * → Warning; unusual-but-valid → Info. The dominant MIR anomaly is the unresolved
 * binding (a component reads a column absent from the data → silent $0/wrong payout).
 */
import type { CanonicalComponent, ComponentConfidence, PlanStructure, PlanTopology, ConfidenceSeverity } from './types';

// Advisory DISPLAY bands (recognition, not calculation authority — Decision 158). They
// gate visual emphasis only; they never enter a payout computation.
const CONF_CRITICAL = 0.5;  // RATIFIED: below this the interpreter is highly uncertain → surface red.
const CONF_WARNING = 0.85;  // RATIFIED: below this warrants a look; at/above recedes as clean.

const RANK: Record<ConfidenceSeverity, number> = { info: 0, warning: 1, critical: 2 };

/** Assess one component. bindingResolved=false is the strongest anomaly (silent payout error). */
export function assessComponent(component: CanonicalComponent, bindingResolved: boolean): ComponentConfidence {
  const reasons: string[] = [];
  let severity: ConfidenceSeverity = 'info';
  let score = 1;

  if (component.binding.column && !bindingResolved) {
    severity = 'critical';
    score = Math.min(score, 0.2);
    reasons.push(`Bound column "${component.binding.column}" is absent from committed data — this component would compute a silent $0 / wrong payout.`);
  } else if (!component.binding.column) {
    severity = worst(severity, 'warning');
    score = Math.min(score, 0.6);
    reasons.push('No data binding could be resolved for this component.');
  }

  const conf = component.confidence;
  if (typeof conf === 'number') {
    if (conf < CONF_CRITICAL) { severity = worst(severity, 'critical'); score = Math.min(score, conf); reasons.push(`Interpreter confidence is very low (${pct(conf)}).`); }
    else if (conf < CONF_WARNING) { severity = worst(severity, 'warning'); score = Math.min(score, conf); reasons.push(`Interpreter confidence is moderate (${pct(conf)}).`); }
  }

  if (reasons.length === 0) reasons.push(`Clean: bound and high-confidence${typeof conf === 'number' ? ` (${pct(conf)})` : ''}.`);

  return { componentId: component.id, severity, score, bindingResolved, confidence: conf, reasons, needsReview: severity !== 'info' };
}

/** Build a plan's topology from a per-component binding-resolution map (componentId → resolved). */
export function buildPlanTopology(plan: PlanStructure, resolvedByComponent: Record<string, boolean>): PlanTopology {
  const components: Record<string, ComponentConfidence> = {};
  let worstSev: ConfidenceSeverity = 'info';
  let needsReviewCount = 0;
  for (const v of plan.variants) {
    for (const c of v.components) {
      const a = assessComponent(c, resolvedByComponent[c.id] ?? true);
      components[c.id] = a;
      if (a.needsReview) needsReviewCount++;
      worstSev = worst(worstSev, a.severity);
    }
  }
  return { components, needsReviewCount, worst: worstSev };
}

function worst(a: ConfidenceSeverity, b: ConfidenceSeverity): ConfidenceSeverity { return RANK[b] > RANK[a] ? b : a; }
function pct(n: number): string { return `${Math.round(n * 100)}%`; }
