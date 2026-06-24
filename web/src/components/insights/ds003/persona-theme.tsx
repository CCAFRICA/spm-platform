'use client';

/**
 * OB-234 T1-D — Persona context provider for the DS-003 Intelligence redesign.
 *
 * The platform ALREADY derives the active persona from auth/capabilities in `usePersona()`
 * (contexts/persona-context.tsx → 'admin' | 'manager' | 'rep'). This module does NOT re-derive it —
 * it wires to that source and projects the DS-003-specific persona values the redesign needs:
 *
 *   • accent color (hex)        — DS-003 §3 persona accent: Admin #6366F1, Manager #F59E0B, Rep #10B981
 *   • ambient gradient (classes)— the dark environment each surface sits on (TMR-7 / directive T1-D)
 *   • density level             — high | medium | low; surfaces FILTER which elements render (Rule 4)
 *   • action vocabulary         — persona-appropriate verbs (thermostat labels)
 *
 * Ambient gradient is applied PER SURFACE via <PersonaAmbient> — never the shared shell/layout — so
 * non-Intelligence surfaces are untouched (HALT-2 avoided).
 */

import { createContext, useContext, type ReactNode } from 'react';
import { usePersona } from '@/contexts/persona-context';
import type { PersonaKey } from '@/lib/design/tokens';

// ── DS-003 persona theme map ─────────────────────────────────────────────────────────────────────
export type DensityLevel = 'high' | 'medium' | 'low';

export interface PersonaTheme {
  persona: PersonaKey;
  /** DS-003 §3 persona accent (environment + highlights), as hex for recharts/inline use. */
  accent: string;
  /** translucent accent fill (e.g. selected-card tint, glow), rgba. */
  accentSoft: string;
  /** translucent accent border, rgba. */
  accentBorder: string;
  /** focal-glow radial color, rgba. */
  accentGlow: string;
  /** ambient background gradient — Tailwind classes (directive T1-D / DS-003 §5.6). */
  ambientGradient: string;
  /** Admin=high, Manager=medium, Rep=low — surfaces filter content by this (Rule 4). */
  density: DensityLevel;
  /** persona-appropriate action verbs (thermostat labels). */
  actions: string[];
}

const THEME: Record<PersonaKey, PersonaTheme> = {
  admin: {
    persona: 'admin',
    accent: '#6366F1', // indigo-500
    accentSoft: 'rgba(99, 102, 241, 0.14)',
    accentBorder: 'rgba(99, 102, 241, 0.35)',
    accentGlow: 'rgba(99, 102, 241, 0.28)',
    ambientGradient: 'bg-gradient-to-b from-slate-950 via-indigo-950/40 to-slate-950',
    density: 'high',
    actions: ['Publish', 'Approve', 'Resolve', 'Investigate', 'Simulate Impact'],
  },
  manager: {
    persona: 'manager',
    accent: '#F59E0B', // amber-500
    accentSoft: 'rgba(245, 158, 11, 0.14)',
    accentBorder: 'rgba(245, 158, 11, 0.35)',
    accentGlow: 'rgba(245, 158, 11, 0.26)',
    ambientGradient: 'bg-gradient-to-b from-slate-950 via-amber-950/25 to-slate-950',
    density: 'medium',
    actions: ['Coach', 'Develop', 'Recognize', 'Reassign', 'Schedule'],
  },
  rep: {
    persona: 'rep',
    accent: '#10B981', // emerald-500
    accentSoft: 'rgba(16, 185, 129, 0.14)',
    accentBorder: 'rgba(16, 185, 129, 0.35)',
    accentGlow: 'rgba(16, 185, 129, 0.26)',
    ambientGradient: 'bg-gradient-to-b from-slate-950 via-emerald-950/25 to-slate-950',
    density: 'low',
    actions: ['Explore', 'Simulate', 'Dispute', 'View Plan', 'Track Progress'],
  },
};

// ── Context (override seam) ──────────────────────────────────────────────────────────────────────
// Default null → usePersonaTheme falls back to the live usePersona(). A provider can FORCE a persona
// (used by the G5 proof to render the same surface as Admin and as Rep without changing global state).
const PersonaThemeContext = createContext<PersonaKey | null>(null);

export function PersonaThemeProvider({
  persona,
  children,
}: {
  persona?: PersonaKey;
  children: ReactNode;
}) {
  return (
    <PersonaThemeContext.Provider value={persona ?? null}>{children}</PersonaThemeContext.Provider>
  );
}

/** The DS-003 persona theme for the active persona (or the provider override). */
export function usePersonaTheme(): PersonaTheme {
  const override = useContext(PersonaThemeContext);
  const { persona } = usePersona();
  return THEME[override ?? persona];
}

// ── Density gating ───────────────────────────────────────────────────────────────────────────────
const RANK: Record<DensityLevel, number> = { low: 0, medium: 1, high: 2 };

/** Does the active persona's density meet `min`?  low→All · medium→Admin+Manager · high→Admin only. */
export function useDensityAllows(min: DensityLevel): boolean {
  const { density } = usePersonaTheme();
  return RANK[density] >= RANK[min];
}

/**
 * Conditionally render by persona density. `min="high"` ⇒ Admin only; `min="medium"` ⇒ Admin+Manager;
 * `min="low"` (default) ⇒ everyone. This is the "content filtered, not just resized" mechanism (Rule 4):
 * surfaces wrap higher-cognition elements in <DensityGate min="…"> so Rep gets a focused subset.
 */
export function DensityGate({
  min = 'low',
  children,
}: {
  min?: DensityLevel;
  children: ReactNode;
}) {
  return useDensityAllows(min) ? <>{children}</> : null;
}

// ── Ambient environment wrapper ──────────────────────────────────────────────────────────────────
/**
 * The persona ambient environment. Wrap a surface's content in this to give it the persona's dark
 * gradient. Applied at the SURFACE level (not the shell) so non-Intelligence pages are unaffected.
 */
export function PersonaAmbient({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { ambientGradient } = usePersonaTheme();
  return <div className={`${ambientGradient} min-h-full ${className ?? ''}`}>{children}</div>;
}

export { THEME as PERSONA_THEME };
