'use client';

/**
 * OB-234 T1-D — Persona context provider for the DS-003 Intelligence redesign.
 *
 * The platform ALREADY derives the active persona from auth/capabilities in `usePersona()`
 * (contexts/persona-context.tsx → 'admin' | 'manager' | 'rep'). This module does NOT re-derive it —
 * it wires to that source and projects the DS-003 persona values the redesign needs:
 *
 *   • accent color (hex)  — Admin #6366F1 · Manager #F59E0B · Rep #10B981. Applied SUBTLY (card-border
 *                           tints, section-header/icon tints, active-state indicators) by the DS-003
 *                           components — NOT as a page-background override.
 *   • density level       — high | medium | low; surfaces FILTER which elements render (Rule 4).
 *   • action vocabulary   — persona-appropriate verbs (thermostat labels).
 *
 * THEME OBSERVANCE (corrective): surfaces participate in the production theme — `PersonaAmbient` is the
 * production page frame (`.page` under Vialuce, `p-6 max-w-7xl mx-auto` otherwise), with NO dark/light
 * background override. The page background comes from the app shell / theme, exactly like /configure,
 * /operate, /investigate. Persona is expressed through accents, not a coloured backdrop (matching how
 * production suppresses the persona gradient under Vialuce).
 */

import { createContext, useContext, type ReactNode } from 'react';
import { usePersona } from '@/contexts/persona-context';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import type { PersonaKey } from '@/lib/design/tokens';

// ── DS-003 persona theme map ─────────────────────────────────────────────────────────────────────
export type DensityLevel = 'high' | 'medium' | 'low';

export interface PersonaTheme {
  persona: PersonaKey;
  /** persona accent (subtle highlights), hex for recharts/inline use. */
  accent: string;
  /** translucent accent fill (selected-card tint, glow), rgba. */
  accentSoft: string;
  /** translucent accent border, rgba. */
  accentBorder: string;
  /** focal-glow radial color, rgba (very faint on a light card). */
  accentGlow: string;
  /** Admin=high, Manager=medium, Rep=low — surfaces filter content by this (Rule 4). */
  density: DensityLevel;
  /** persona-appropriate action verbs (thermostat labels). */
  actions: string[];
}

const THEME: Record<PersonaKey, PersonaTheme> = {
  admin: {
    persona: 'admin',
    accent: '#6366F1', // indigo-500
    accentSoft: 'rgba(99, 102, 241, 0.12)',
    accentBorder: 'rgba(99, 102, 241, 0.40)',
    accentGlow: 'rgba(99, 102, 241, 0.16)',
    density: 'high',
    actions: ['Publish', 'Approve', 'Resolve', 'Investigate', 'Simulate Impact'],
  },
  manager: {
    persona: 'manager',
    accent: '#F59E0B', // amber-500
    accentSoft: 'rgba(245, 158, 11, 0.12)',
    accentBorder: 'rgba(245, 158, 11, 0.40)',
    accentGlow: 'rgba(245, 158, 11, 0.15)',
    density: 'medium',
    actions: ['Coach', 'Develop', 'Recognize', 'Reassign', 'Schedule'],
  },
  rep: {
    persona: 'rep',
    accent: '#10B981', // emerald-500
    accentSoft: 'rgba(16, 185, 129, 0.12)',
    accentBorder: 'rgba(16, 185, 129, 0.40)',
    accentGlow: 'rgba(16, 185, 129, 0.15)',
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
 * `min="low"` (default) ⇒ everyone. This is the "content filtered, not just resized" mechanism (Rule 4).
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

// ── Page frame ───────────────────────────────────────────────────────────────────────────────────
/**
 * The Intelligence surface page frame. Matches production (`.page` under Vialuce, `p-6 max-w-7xl mx-auto`
 * otherwise) and applies NO background — the page background comes from the app theme/shell, so the
 * surface participates in whatever theme is active (Vialuce light, Dark, Bliss). Persona shows through
 * the component accents inside, not a coloured backdrop.
 */
export function PersonaAmbient({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const isVialuce = useIsVialuce();
  return (
    <div className={`${isVialuce ? 'page' : 'p-6 max-w-7xl mx-auto'} ${className ?? ''}`}>{children}</div>
  );
}

export { THEME as PERSONA_THEME };
