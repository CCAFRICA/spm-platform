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
import { useIsVialuce } from '@/hooks/use-is-vialuce';

// HF-316: under Vialuce the priority accents map onto the design-spec palette (action→indigo,
// success→success, info→slate) on a light surface.
const VIALUCE_PRIORITY: Record<string, { bg: string; border: string; accent: string }> = {
  action: { bg: 'var(--vl-indigo-50)', border: 'var(--vl-indigo-100)', accent: 'var(--vialuce-indigo)' },
  success: { bg: 'var(--vl-success-50)', border: 'var(--vl-success-50)', accent: 'var(--vl-success)' },
  info: { bg: 'var(--vl-bg)', border: 'var(--vl-line)', accent: 'var(--vl-raw-slate)' },
};

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
  const isVialuce = useIsVialuce(); // HF-316: bar→light surface + design-spec priority accent

  if (!action) return null;

  const colors = PRIORITY_COLORS[action.priority] || PRIORITY_COLORS.info;
  const IconComponent = ICON_MAP[action.icon] || Lightbulb;

  // HF-316: under Vialuce the bar is a light surface with a left accent + indigo/success/slate by
  // priority; the action link uses the accent color. The else-branch is byte-identical (Dark/Bliss
  // cannot regress).
  if (isVialuce) {
    const v = VIALUCE_PRIORITY[action.priority] || VIALUCE_PRIORITY.info;
    return (
      <div
        style={{
          background: v.bg,
          border: `1px solid ${v.border}`,
          borderLeft: `3px solid ${v.accent}`,
          borderRadius: 'var(--vl-r-md)',
          padding: '10px 16px',
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          <IconComponent size={16} style={{ color: v.accent, flexShrink: 0 }} />
          <span style={{ color: 'var(--vl-text)', fontSize: '13px', lineHeight: '1.4' }}>
            {action.message}
          </span>
        </div>
        <Link
          href={action.actionRoute}
          style={{
            color: v.accent,
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
