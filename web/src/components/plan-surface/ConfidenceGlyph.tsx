/**
 * OB-228 Phase 5 — ConfidenceGlyph (Concept ③). The recede-the-confident, surface-the-
 * exception marker: red=critical, amber=warning, grey/green=info. Used in the
 * ComponentCard header and the PlanRail health summary ("Needs Review" count).
 */
'use client';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ConfidenceSeverity } from '@/lib/plan-surface';

const STYLE: Record<ConfidenceSeverity, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  critical: { color: 'var(--vl-danger, #DC5454)', bg: 'var(--vl-danger-50, #FCECEC)', icon: <AlertCircle className="h-3.5 w-3.5" />, label: 'Critical' },
  warning: { color: '#9a6a12', bg: 'var(--vl-gold-50, #FCF4E3)', icon: <AlertTriangle className="h-3.5 w-3.5" />, label: 'Review' },
  info: { color: 'var(--vl-success, #15936A)', bg: 'var(--vl-success-50, #E6F5EE)', icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'Clean' },
};

export function ConfidenceGlyph({ severity, count, label }: { severity: ConfidenceSeverity; count?: number; label?: string }) {
  const s = STYLE[severity];
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: s.color, background: s.bg }} title={label ?? s.label}>
      {s.icon}
      {count !== undefined ? count : (label ?? s.label)}
    </span>
  );
}
