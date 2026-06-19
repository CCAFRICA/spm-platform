'use client';

/**
 * InsightPanel — AI-Powered Insight Cards
 *
 * OB-98 Phase 4: Renders structured insights from the insight engine
 * in a responsive card grid with optional LLM-generated narrative.
 *
 * Persona accent colors:
 *   admin → indigo (#6366f1)
 *   manager → amber (#f59e0b)
 *   rep → emerald (#10b981)
 *
 * DS-001: Inline styles for the dark zinc design system.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  AlertTriangle, BarChart3, BarChart2, Activity, Zap, Brain, ShieldAlert,
  TrendingUp, TrendingDown, Users, Award, Target, Rocket, Trophy,
  Star, CheckCircle, ArrowUp, ArrowUpRight, ChevronUp, ChevronDown,
  Lightbulb,
} from 'lucide-react';
import type { InsightCard } from '@/lib/intelligence/insight-engine';
import type { NarrationResponse } from '@/lib/intelligence/narration-service';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

// HF-316: under Vialuce the insight type colors map onto the design-spec palette (warning→danger,
// recommendation→indigo, opportunity→success, observation→slate) for the per-card left accent.
const VIALUCE_TYPE_COLORS: Record<string, string> = {
  warning: 'var(--vl-danger)',
  recommendation: 'var(--vialuce-indigo)',
  opportunity: 'var(--vl-success)',
  observation: 'var(--vl-raw-slate)',
};

// ──────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────

interface InsightPanelProps {
  persona: 'admin' | 'manager' | 'rep';
  insights: InsightCard[];
  tenantName?: string;
  periodLabel?: string;
  locale?: string;
  maxCards?: number;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const ACCENT_COLORS: Record<string, string> = {
  admin: '#6366f1',
  manager: '#f59e0b',
  rep: '#10b981',
};

const TYPE_COLORS: Record<string, string> = {
  warning: '#f87171',
  recommendation: '#60a5fa',
  opportunity: '#34d399',
  observation: '#94a3b8',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  AlertTriangle, BarChart3, BarChart2, Activity, Zap, Brain, ShieldAlert,
  TrendingUp, TrendingDown, Users, Award, Target, Rocket, Trophy,
  Star, CheckCircle, ArrowUp, ArrowUpRight, ChevronUp, ChevronDown,
  Lightbulb,
};

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export function InsightPanel({
  persona,
  insights,
  tenantName,
  periodLabel,
  locale = 'en',
  maxCards = 4,
}: InsightPanelProps) {
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const insightsRef = useRef<string>('');
  const accent = ACCENT_COLORS[persona] || ACCENT_COLORS.admin;
  const isVialuce = useIsVialuce(); // HF-316: panel→.card, narrative→.insight banner, chip→.pill open

  // Sort: warnings first, then recommendations, opportunities, observations
  const sortedInsights = useMemo(() => {
    const priority: Record<string, number> = { warning: 0, recommendation: 1, opportunity: 2, observation: 3 };
    return [...insights]
      .sort((a, b) => (priority[a.type] ?? 4) - (priority[b.type] ?? 4))
      .slice(0, maxCards);
  }, [insights, maxCards]);

  // Fetch narrative from LLM (optional enhancement)
  const fetchNarrative = useCallback(async () => {
    if (sortedInsights.length === 0) return;
    setNarrativeLoading(true);
    try {
      const res = await fetch('/api/intelligence/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona,
          tenantName: tenantName || '',
          periodLabel: periodLabel || '',
          insights: sortedInsights,
          locale,
        }),
      });
      const result: NarrationResponse = await res.json();
      if (result.narrative) {
        setNarrative(result.narrative);
      }
    } catch {
      // Graceful degradation — narrative is optional
    }
    setNarrativeLoading(false);
  }, [persona, tenantName, periodLabel, sortedInsights, locale]);

  // Fetch on insights change (deduplicated)
  useEffect(() => {
    if (sortedInsights.length === 0) return;
    const serialized = JSON.stringify(sortedInsights.map(i => i.id));
    if (serialized === insightsRef.current) return;
    insightsRef.current = serialized;
    fetchNarrative();
  }, [sortedInsights, fetchNarrative]);

  if (insights.length === 0) return null;

  // HF-316: under Vialuce the panel is a .card surface, the LLM narrative is the .insight gold banner,
  // the count is a .pill open, per-insight cards sit on a light surface with a design-spec left accent,
  // and metric labels are DM Mono. The else-branch is byte-identical (Dark/Bliss cannot regress).
  if (isVialuce) {
    return (
      <div className="card" style={{ marginTop: 0, marginBottom: '16px', padding: expanded ? '20px' : '12px 20px' }}>
        {/* Header */}
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => setExpanded(!expanded)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Lightbulb size={18} style={{ color: 'var(--vialuce-gold)' }} />
            <span style={{ color: 'var(--vl-text)', fontSize: '16px', fontWeight: 600 }}>
              {locale === 'es' ? 'Inteligencia' : 'Intelligence'}
            </span>
            <span className="pill open">
              {sortedInsights.length} {locale === 'es' ? 'hallazgos' : 'findings'}
            </span>
          </div>
          {expanded
            ? <ChevronUp size={16} style={{ color: 'var(--vl-text-soft)' }} />
            : <ChevronDown size={16} style={{ color: 'var(--vl-text-soft)' }} />
          }
        </div>

        {expanded && (
          <div style={{ marginTop: '16px' }}>
            {/* Narrative (LLM-enhanced, optional) */}
            {narrativeLoading && !narrative && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <div
                  className="animate-spin h-3.5 w-3.5 border-2 border-t-transparent rounded-full"
                  style={{ borderColor: 'var(--vl-indigo-100)', borderTopColor: 'transparent' }}
                />
                <p style={{ color: 'var(--vl-text-soft)', fontSize: '13px', fontStyle: 'italic' }}>
                  {locale === 'es' ? 'Generando resumen...' : 'Generating summary...'}
                </p>
              </div>
            )}
            {narrative && (
              <div className="insight" style={{ marginBottom: '16px' }}>
                <div className="spark"><Lightbulb size={17} /></div>
                <div>
                  <div className="lbl">{locale === 'es' ? 'RESUMEN' : 'SUMMARY'}</div>
                  <div className="det" style={{ marginTop: 0 }}>{narrative}</div>
                </div>
              </div>
            )}

            {/* Insight cards grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
              {sortedInsights.map(insight => (
                <InsightCardComponent key={insight.id} insight={insight} accent={accent} isVialuce />
              ))}
            </div>

            {/* Footer */}
            <div style={{ marginTop: '12px', textAlign: 'right' }}>
              <span style={{ color: 'var(--vl-text-soft)', fontSize: '11px' }}>
                Powered by Vialuce Intelligence
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'rgba(24,24,27,0.8)',
        backdropFilter: 'blur(12px)',
        border: `1px solid ${accent}33`,
        borderRadius: '12px',
        padding: expanded ? '20px' : '12px 20px',
        marginBottom: '16px',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Lightbulb size={18} style={{ color: accent }} />
          <span style={{ color: '#E2E8F0', fontSize: '16px', fontWeight: 600 }}>
            {locale === 'es' ? 'Inteligencia' : 'Intelligence'}
          </span>
          <span
            style={{
              background: `${accent}22`,
              color: accent,
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              fontWeight: 500,
            }}
          >
            {sortedInsights.length} {locale === 'es' ? 'hallazgos' : 'findings'}
          </span>
        </div>
        {expanded
          ? <ChevronUp size={16} style={{ color: '#94a3b8' }} />
          : <ChevronDown size={16} style={{ color: '#94a3b8' }} />
        }
      </div>

      {expanded && (
        <div style={{ marginTop: '16px' }}>
          {/* Narrative paragraph (LLM-enhanced, optional) */}
          {narrativeLoading && !narrative && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div
                className="animate-spin h-3.5 w-3.5 border-2 border-t-transparent rounded-full"
                style={{ borderColor: `${accent}60`, borderTopColor: 'transparent' }}
              />
              <p style={{ color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' }}>
                {locale === 'es' ? 'Generando resumen...' : 'Generating summary...'}
              </p>
            </div>
          )}
          {narrative && (
            <p style={{
              color: '#CBD5E1',
              fontSize: '14px',
              lineHeight: '1.6',
              marginBottom: '16px',
              padding: '12px',
              background: `${accent}08`,
              borderRadius: '8px',
              borderLeft: `3px solid ${accent}44`,
            }}>
              {narrative}
            </p>
          )}

          {/* Insight cards grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '12px',
          }}>
            {sortedInsights.map(insight => (
              <InsightCardComponent key={insight.id} insight={insight} accent={accent} />
            ))}
          </div>

          {/* Footer */}
          <div style={{ marginTop: '12px', textAlign: 'right' }}>
            <span style={{ color: '#52525b', fontSize: '11px' }}>
              Powered by Vialuce Intelligence
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Individual Insight Card
// ──────────────────────────────────────────────

function InsightCardComponent({
  insight,
  accent,
  isVialuce,
}: {
  insight: InsightCard;
  accent: string;
  isVialuce?: boolean;
}) {
  const typeColor = TYPE_COLORS[insight.type] || '#94a3b8';
  const IconComponent = ICON_MAP[insight.icon] || Lightbulb;

  // HF-316: Vialuce insight card — light surface, design-spec left accent, DM Mono metric label.
  if (isVialuce) {
    const vColor = VIALUCE_TYPE_COLORS[insight.type] || 'var(--vl-raw-slate)';
    return (
      <div
        style={{
          background: 'var(--vl-surface)',
          border: '1px solid var(--vl-line)',
          borderLeft: `3px solid ${vColor}`,
          borderRadius: 'var(--vl-r-md)',
          padding: '14px',
          boxShadow: 'var(--vl-sh-1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <IconComponent size={16} style={{ color: vColor, marginTop: '2px', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: 'var(--vl-text)', fontSize: '13px', fontWeight: 600, lineHeight: '1.3' }}>
              {insight.title}
            </p>
          </div>
          {insight.metricLabel && (
            <span
              style={{
                background: 'var(--vl-bg)',
                color: vColor,
                fontFamily: 'var(--vl-font-mono)',
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: 'var(--vl-r-sm)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {insight.metricLabel}
            </span>
          )}
        </div>

        <p style={{ color: 'var(--vl-text-muted)', fontSize: '12px', lineHeight: '1.5', marginTop: '6px' }}>
          {insight.body}
        </p>

        {insight.action && (
          <div style={{ marginTop: '8px' }}>
            {insight.actionRoute ? (
              <a
                href={insight.actionRoute}
                style={{ color: 'var(--vialuce-indigo)', fontSize: '12px', fontWeight: 500, textDecoration: 'none' }}
              >
                {insight.action} →
              </a>
            ) : (
              <span style={{ color: 'var(--vialuce-indigo)', fontSize: '12px', fontWeight: 500 }}>
                {insight.action}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'rgba(39, 39, 42, 0.6)',
        border: '1px solid rgba(63, 63, 70, 0.5)',
        borderLeft: `3px solid ${typeColor}`,
        borderRadius: '8px',
        padding: '14px',
      }}
    >
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <IconComponent size={16} style={{ color: typeColor, marginTop: '2px', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: '#E2E8F0', fontSize: '13px', fontWeight: 600, lineHeight: '1.3' }}>
            {insight.title}
          </p>
        </div>
        {insight.metricLabel && (
          <span
            style={{
              background: `${typeColor}18`,
              color: typeColor,
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: '4px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {insight.metricLabel}
          </span>
        )}
      </div>

      {/* Card body */}
      <p style={{ color: '#94a3b8', fontSize: '12px', lineHeight: '1.5', marginTop: '6px' }}>
        {insight.body}
      </p>

      {/* Action link */}
      {insight.action && (
        <div style={{ marginTop: '8px' }}>
          {insight.actionRoute ? (
            <a
              href={insight.actionRoute}
              style={{
                color: accent,
                fontSize: '12px',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              {insight.action} →
            </a>
          ) : (
            <span style={{ color: accent, fontSize: '12px', fontWeight: 500 }}>
              {insight.action}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
