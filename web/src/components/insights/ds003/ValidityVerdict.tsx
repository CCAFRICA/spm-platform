'use client';

/**
 * OB-234 — ValidityVerdict. THE single data-quality verdict, rendered identically wherever it appears.
 * `/stream` and `/perform` both render this from the SAME getBatchValidity(tenantId, periodId) result
 * (End-State A §0.3 / G4): one verdict, one source, every surface reflects it. If the batch has
 * anomalies it SAYS SO — never "within expected parameters" over a dirty batch.
 */

import { AlertTriangle, CheckCircle2, HelpCircle, ShieldAlert } from 'lucide-react';
import type { ValidityVerdict as Verdict, ValiditySeverity } from '@/lib/insights';
import { SEMANTIC, TEXT } from './ds003-tokens';

const STYLE: Record<ValiditySeverity, { color: string; bg: string; border: string; icon: typeof CheckCircle2; word: string }> = {
  clean: { color: SEMANTIC.green, bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.4)', icon: CheckCircle2, word: 'Verified' },
  warning: { color: SEMANTIC.amber, bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.4)', icon: AlertTriangle, word: 'Review needed' },
  critical: { color: SEMANTIC.red, bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.4)', icon: ShieldAlert, word: 'Action required' },
  none: { color: '#64748b', bg: 'rgba(100,116,139,0.06)', border: 'rgba(100,116,139,0.35)', icon: HelpCircle, word: 'No batch' },
};

export interface ValidityVerdictProps {
  verdict: Verdict;
  /** compact = a single badge line; default = a bordered card with the recommendation. */
  variant?: 'card' | 'badge';
  className?: string;
}

export function ValidityVerdict({ verdict, variant = 'card', className }: ValidityVerdictProps) {
  const s = STYLE[verdict.severity];
  const Icon = s.icon;

  if (variant === 'badge') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${className ?? ''}`}
        style={{ color: s.color, backgroundColor: s.bg, borderColor: s.border }}
        title={verdict.recommendation}
      >
        <Icon className="h-3.5 w-3.5" />
        {s.word}
      </span>
    );
  }

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${className ?? ''}`} style={{ backgroundColor: s.bg, borderColor: s.border }}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: s.color }} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: s.color }}>{s.word}</span>
          {verdict.matchPercent != null && (
            <span className={`text-xs ${TEXT.muted}`}>· {verdict.matchPercent.toFixed(1)}% match</span>
          )}
          {verdict.exceptionCount > 0 && (
            <span className={`text-xs ${TEXT.muted}`}>· {verdict.exceptionCount} exception{verdict.exceptionCount === 1 ? '' : 's'}</span>
          )}
        </div>
        <p className={`mt-0.5 text-sm ${TEXT.body}`}>{verdict.recommendation}</p>
      </div>
    </div>
  );
}
