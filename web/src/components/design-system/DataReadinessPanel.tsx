'use client';

import type { CSSProperties } from 'react';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

export interface DataReadiness {
  plan: { status: 'ready' | 'missing' | 'warning'; label: string; detail?: string };
  data: { status: 'ready' | 'missing' | 'warning'; label: string; detail?: string };
  mapping: { status: 'ready' | 'missing' | 'warning'; label: string; detail?: string; confidence?: number };
  validation: { status: 'ready' | 'stale' | 'never'; label: string; detail?: string };
}

interface DataReadinessPanelProps {
  readiness: DataReadiness;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'ready') {
    return <span className="text-emerald-400">&#10003;</span>;
  }
  if (status === 'warning' || status === 'stale') {
    return <span className="text-amber-400">&#9888;</span>;
  }
  return <span className="text-rose-400">&#10007;</span>;
}

function statusColor(status: string): string {
  if (status === 'ready') return 'border-emerald-500/30 bg-emerald-500/5';
  if (status === 'warning' || status === 'stale') return 'border-amber-500/30 bg-amber-500/5';
  return 'border-rose-500/30 bg-rose-500/5';
}

// HF-316: design-spec status surfaces — success / gold / danger tinted rows under Vialuce.
function StatusIconVialuce({ status }: { status: string }) {
  if (status === 'ready') return <span style={{ color: 'var(--vl-success)' }}>&#10003;</span>;
  if (status === 'warning' || status === 'stale') return <span style={{ color: 'var(--vl-raw-gold)' }}>&#9888;</span>;
  return <span style={{ color: 'var(--vl-danger)' }}>&#10007;</span>;
}

function statusStyleVialuce(status: string): CSSProperties {
  if (status === 'ready') return { border: '1px solid #BFE6D2', background: 'var(--vl-success-50)' };
  if (status === 'warning' || status === 'stale') return { border: '1px solid #F0E4C4', background: 'var(--vl-gold-50)' };
  return { border: '1px solid #F3C9C9', background: 'var(--vl-danger-50)' };
}

export function DataReadinessPanel({ readiness }: DataReadinessPanelProps) {
  const isVialuce = useIsVialuce(); // HF-316: token-tinted status rows + DM Mono eyebrow under Vialuce
  const items = [
    { key: 'plan', ...readiness.plan },
    { key: 'data', ...readiness.data },
    { key: 'mapping', ...readiness.mapping },
    { key: 'validation', label: readiness.validation.label, status: readiness.validation.status === 'ready' ? 'ready' : readiness.validation.status === 'stale' ? 'warning' : 'missing', detail: readiness.validation.detail },
  ];

  if (isVialuce) {
    return (
      <div className="space-y-2">
        <h4 style={{ fontFamily: 'var(--vl-font-mono)', fontSize: '10.5px', letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--vl-text-soft)', fontWeight: 400 }}>Preparacion de Datos</h4>
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center gap-3 px-3 py-2"
            style={{ borderRadius: 'var(--vl-r-md)', ...statusStyleVialuce(item.status) }}
          >
            <StatusIconVialuce status={item.status} />
            <div className="flex-1 min-w-0">
              <span style={{ fontSize: '13px', color: 'var(--vl-text)' }}>{item.label}</span>
              {item.detail && (
                <p className="truncate" style={{ fontSize: '11px', color: 'var(--vl-text-muted)' }}>{item.detail}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Preparacion de Datos</h4>
      {items.map((item) => (
        <div
          key={item.key}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${statusColor(item.status)}`}
        >
          <StatusIcon status={item.status} />
          <div className="flex-1 min-w-0">
            <span className="text-sm text-zinc-200">{item.label}</span>
            {item.detail && (
              <p className="text-[11px] text-zinc-400 truncate">{item.detail}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
