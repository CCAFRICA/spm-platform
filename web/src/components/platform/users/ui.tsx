'use client';

// OB-230 — shared Observatory (DS-003 "Indigo Environment") inline-style primitives for the User
// Operations Console. Matches the --strag-* vocabulary used by the other Observatory tabs (no shadcn).

import React, { useState } from 'react';

export const C = {
  deep: 'var(--strag-deep)',
  panel: 'var(--strag-panel)',
  border: 'var(--strag-s8)',
  ink0: 'var(--strag-s0)',
  ink2: 'var(--strag-s2)',
  ink4: 'var(--strag-s4)',
  gold: '#E8A838',
  indigo: '#7B7FD4',
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  blue: '#60A5FA',
  violet: '#A78BFA',
};

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, ...style }}>
      {children}
    </div>
  );
}

export function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      background: hexToRgba(color, 0.15), color, border: `1px solid ${hexToRgba(color, 0.3)}`,
      borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600, display: 'inline-block', whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <span style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: color, flexShrink: 0 }} />;
}

export function Initial({ name, color = C.indigo, size = 32 }: { name: string; color?: string; size?: number }) {
  const letters = (name || '?').trim().split(/\s+/).map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '?';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: hexToRgba(color, 0.18), color,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, flexShrink: 0,
    }}>
      {letters}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 48, color: C.ink4 }}>
      <div style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTopColor: C.indigo, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      {label && <div style={{ fontSize: 13 }}>{label}</div>}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const diff = Date.now() - t;
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? 'ago' : 'from now';
  const m = Math.round(abs / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ${suffix}`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ${suffix}`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ${suffix}`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ${suffix}`;
  return `${Math.round(mo / 12)}y ${suffix}`;
}

export function absTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Two-step confirm action — no single-click destructive operation (directive §2B). First click arms;
 * second click within the inline confirm fires. `onConfirm` returns a promise; the button shows a busy state.
 */
export function ConfirmAction({
  label, confirmLabel = 'Confirm', color = C.indigo, busy = false, disabled = false, onConfirm, size = 'sm',
}: {
  label: string; confirmLabel?: string; color?: string; busy?: boolean; disabled?: boolean;
  onConfirm: () => void | Promise<void>; size?: 'sm' | 'md';
}) {
  const [armed, setArmed] = useState(false);
  const pad = size === 'sm' ? '5px 10px' : '8px 14px';
  const fs = size === 'sm' ? 12 : 13;

  if (busy) {
    return <button disabled style={{ padding: pad, fontSize: fs, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.ink4, cursor: 'wait' }}>Working…</button>;
  }
  if (!armed) {
    return (
      <button
        disabled={disabled}
        onClick={() => setArmed(true)}
        style={{ padding: pad, fontSize: fs, fontWeight: 600, borderRadius: 8, border: `1px solid ${hexToRgba(color, 0.4)}`, background: hexToRgba(color, 0.12), color, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}
      >
        {label}
      </button>
    );
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <button
        onClick={async () => { setArmed(false); await onConfirm(); }}
        style={{ padding: pad, fontSize: fs, fontWeight: 700, borderRadius: 8, border: 'none', background: color, color: '#0b0b0b', cursor: 'pointer' }}
      >
        {confirmLabel}
      </button>
      <button
        onClick={() => setArmed(false)}
        style={{ padding: pad, fontSize: fs, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.ink4, cursor: 'pointer' }}
      >
        Cancel
      </button>
    </span>
  );
}
