'use client';

/**
 * AssessmentPanel — AI-powered dashboard intelligence
 *
 * Calls /api/ai/assessment with persona + dashboard data.
 * Renders a collapsible glass card with the AI assessment text.
 * Follows DS-001 inline styles (Standing Rule 7).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Lightbulb, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

interface AssessmentPanelProps {
  persona: 'admin' | 'manager' | 'rep';
  data: Record<string, unknown>;
  locale?: string;
  accentColor?: string;
  tenantId?: string;
}

export function AssessmentPanel({ persona, data, locale = 'es', accentColor = '#6366f1', tenantId }: AssessmentPanelProps) {
  const [assessment, setAssessment] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState(false);
  const dataRef = useRef<string>('');

  const fetchAssessment = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/ai/assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona, data, locale, tenantId }),
      });
      const result = await res.json();
      if (result.assessment) {
        setAssessment(result.assessment);
      } else if (result.generated === false && result.message) {
        // OB-73 Mission 1: Safety gate — show informative message, not fabricated AI
        setAssessment(result.message);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
    setLoading(false);
  }, [persona, data, locale, tenantId]);

  // Fetch when data changes (deduplicated via stringified comparison)
  useEffect(() => {
    if (!data || Object.keys(data).length === 0) return;
    const serialized = JSON.stringify(data);
    if (serialized === dataRef.current) return;
    dataRef.current = serialized;
    fetchAssessment();
  }, [data, fetchAssessment]);

  // OB-73 Mission 6 / F-17: Contextual assessment titles per persona
  const titles: Record<string, Record<string, string>> = {
    admin: { en: 'Performance Governance', es: 'Gobernanza de Rendimiento' },
    manager: { en: 'Coaching Intelligence', es: 'Inteligencia de Coaching' },
    rep: { en: 'My Performance Summary', es: 'Mi Resumen de Rendimiento' },
  };

  const lang = locale === 'en' ? 'en' : 'es';
  const title = titles[persona]?.[lang] || titles.admin[lang];

  return (
    <div
      style={{
        background: 'rgba(24,24,27,0.8)',
        backdropFilter: 'blur(12px)',
        border: `1px solid ${accentColor}33`,
        borderRadius: '12px',
        padding: expanded ? '20px' : '12px 20px',
        marginBottom: '16px',
        transition: 'all 0.2s ease',
      }}
    >
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
          <Lightbulb size={18} style={{ color: accentColor }} />
          <span style={{ color: '#E2E8F0', fontSize: '16px', fontWeight: 600 }}>
            {title}
          </span>
          <span
            style={{
              background: `${accentColor}22`,
              color: accentColor,
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              fontWeight: 500,
            }}
          >
            AI
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); fetchAssessment(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          >
            <RefreshCw size={14} style={{ color: '#94a3b8' }} className={loading ? 'animate-spin' : ''} />
          </button>
          {expanded ? <ChevronUp size={16} style={{ color: '#94a3b8' }} /> : <ChevronDown size={16} style={{ color: '#94a3b8' }} />}
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: '12px' }}>
          {loading && !assessment && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="animate-spin h-3.5 w-3.5 border-2 border-t-transparent rounded-full" style={{ borderColor: `${accentColor}60`, borderTopColor: 'transparent' }} />
              <p style={{ color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' }}>
                {lang === 'es' ? 'Analizando datos del panel...' : 'Analyzing dashboard data...'}
              </p>
            </div>
          )}
          {error && !loading && (
            <p style={{ color: '#f87171', fontSize: '13px' }}>
              {lang === 'es' ? 'Evaluacion no disponible. Verifica la configuracion de la API.' : 'Assessment unavailable. Check API configuration.'}
            </p>
          )}
          {assessment && (
            <div style={{ position: 'relative' }}>
              {loading && (
                <div style={{ position: 'absolute', top: 0, right: 0 }}>
                  <div className="animate-spin h-3 w-3 border-2 border-t-transparent rounded-full" style={{ borderColor: `${accentColor}60`, borderTopColor: 'transparent' }} />
                </div>
              )}
              <div style={{ color: '#CBD5E1', fontSize: '14px', lineHeight: '1.6' }} className="prose prose-sm prose-invert max-w-none [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_p]:my-1 [&_strong]:text-zinc-200 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-zinc-200 [&_h3]:mt-3 [&_h3]:mb-1">
                <ReactMarkdown>{assessment}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
