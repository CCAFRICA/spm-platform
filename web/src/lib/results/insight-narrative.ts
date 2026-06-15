/**
 * OB-210 Unit A (genuine build) — Insight Agent narrative.
 *
 * A DETERMINISTIC, design-time builder: it synthesizes the single most important thing right now from
 * the surface's ALREADY-LOADED structural state (payout, entity/component counts, anomalies, regime mix)
 * — AI front-and-center, Bloodwork-toned. NO LLM, NO per-entity call (Synaptic scale litmus): the
 * synthesis is a structural reduction of loaded data, not a generation.
 *
 * Korean Test: the inputs are structural counts/severities; the copy is platform-generic vocabulary
 * (entities, components, anomalies, period) — never a tenant domain or component-name literal.
 * Bloodwork: lead with what needs attention; a clean state affirms health quietly.
 */

export type NarrativeTone = 'healthy' | 'attention' | 'critical';
export type NarrativePersona = 'admin' | 'manager' | 'rep';

export interface InsightInput {
  persona: NarrativePersona;
  totalPayout: number;
  entityCount: number;
  componentCount: number;
  anomalyCount: number;                 // active (post-resolve) anomalies
  topAnomaly?: { description: string; severity: 'critical' | 'warning' | 'info' } | null;
  targetDrivenComponents: number;       // regime-3 component count (drives the "attainment" framing)
  formatCurrency: (n: number) => string;
}

export interface InsightNarrative {
  tone: NarrativeTone;
  headline: string;   // the lead synthesis
  detail: string;     // the supporting context
}

const LEAD: Record<NarrativePersona, { attention: (n: number) => string; healthy: string }> = {
  admin: {
    attention: n => `${n} ${n === 1 ? 'anomaly needs' : 'anomalies need'} review before this period advances.`,
    healthy: 'This period is within expected parameters — no anomalies flagged.',
  },
  manager: {
    attention: n => `${n} ${n === 1 ? 'signal' : 'signals'} on your team need coaching attention this period.`,
    healthy: 'Your team is tracking within expected parameters this period.',
  },
  rep: {
    attention: n => `${n} ${n === 1 ? 'item needs' : 'items need'} your attention this period.`,
    healthy: 'Your results are on track this period.',
  },
};

/** Build the lead narrative from loaded surface state. Pure + deterministic. */
export function buildInsightNarrative(input: InsightInput): InsightNarrative {
  const { persona, totalPayout, entityCount, componentCount, anomalyCount, topAnomaly, targetDrivenComponents, formatCurrency } = input;
  const scale = `${formatCurrency(totalPayout)} across ${entityCount.toLocaleString()} entit${entityCount === 1 ? 'y' : 'ies'}`;
  const regimeNote = targetDrivenComponents > 0
    ? ` · ${targetDrivenComponents} of ${componentCount} component${componentCount === 1 ? '' : 's'} target-driven`
    : componentCount > 0 ? ` · ${componentCount} component${componentCount === 1 ? '' : 's'}` : '';

  if (anomalyCount > 0 && topAnomaly) {
    const tone: NarrativeTone = topAnomaly.severity === 'critical' ? 'critical' : 'attention';
    return {
      tone,
      headline: LEAD[persona].attention(anomalyCount),
      detail: `${topAnomaly.description}. ${scale}${regimeNote}.`,
    };
  }
  return {
    tone: 'healthy',
    headline: LEAD[persona].healthy,
    detail: `${scale}${regimeNote}.`,
  };
}
