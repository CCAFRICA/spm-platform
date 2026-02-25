'use client';

/**
 * NextAction — Persistent next-step recommendation bar
 *
 * OB-98 Phase 6: A subtle bar below the PeriodRibbon that shows the single
 * most important next action based on current lifecycle state and data.
 * Clickable — navigates to the relevant page.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import {
  PlayCircle, AlertTriangle, CheckSquare, CheckCircle, AlertCircle,
  Upload, Clock, Send, CheckCircle2, Target, Star, Lightbulb,
} from 'lucide-react';
import { computeNextAction, type NextActionContext } from '@/lib/intelligence/next-action-engine';

// ──────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────

interface NextActionProps {
  context: NextActionContext;
}

// ──────────────────────────────────────────────
// Icon Map
// ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  PlayCircle, AlertTriangle, CheckSquare, CheckCircle, AlertCircle,
  Upload, Clock, Send, CheckCircle2, Target, Star, Lightbulb,
};

const PRIORITY_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  action: { bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.3)', text: '#93c5fd', icon: '#60a5fa' },
  success: { bg: 'rgba(34, 197, 94, 0.08)', border: 'rgba(34, 197, 94, 0.3)', text: '#86efac', icon: '#22c55e' },
  info: { bg: 'rgba(148, 163, 184, 0.08)', border: 'rgba(148, 163, 184, 0.2)', text: '#cbd5e1', icon: '#94a3b8' },
};

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export function NextAction({ context }: NextActionProps) {
  const action = useMemo(() => computeNextAction(context), [context]);

  if (!action) return null;

  const colors = PRIORITY_COLORS[action.priority] || PRIORITY_COLORS.info;
  const IconComponent = ICON_MAP[action.icon] || Lightbulb;

  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        padding: '10px 16px',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
        <IconComponent size={16} style={{ color: colors.icon, flexShrink: 0 }} />
        <span style={{ color: colors.text, fontSize: '13px', lineHeight: '1.4' }}>
          {action.message}
        </span>
      </div>
      <Link
        href={action.actionRoute}
        style={{
          color: colors.icon,
          fontSize: '13px',
          fontWeight: 600,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {action.actionLabel} →
      </Link>
    </div>
  );
}
