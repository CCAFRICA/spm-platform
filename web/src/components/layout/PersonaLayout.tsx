'use client';

/**
 * PersonaLayout — Persona-aware layout wrapper
 *
 * Applies persona-specific gradient backgrounds using INLINE STYLES
 * (not Tailwind classes) to ensure they are never overridden.
 *
 * DS-001: Each persona has a distinct color psychology:
 *   - admin (indigo): analytical thinking, trust, governance
 *   - manager (amber): warmth, mentorship, coaching
 *   - rep (emerald): growth trajectory, progress, mastery
 */

import type { ReactNode } from 'react';
import type { PersonaKey } from '@/lib/design/tokens';

const PERSONA_GRADIENTS: Record<string, string> = {
  admin: 'linear-gradient(to bottom, #020617, rgba(30, 27, 75, 0.4), #020617)',
  manager: 'linear-gradient(to bottom, #020617, rgba(69, 26, 3, 0.25), #020617)',
  rep: 'linear-gradient(to bottom, #020617, rgba(6, 78, 59, 0.25), #020617)',
};

interface PersonaLayoutProps {
  children: ReactNode;
  persona?: PersonaKey;
  tokens?: Record<string, string>;
}

export function PersonaLayout({ children, persona = 'rep' }: PersonaLayoutProps) {
  return (
    <div
      style={{
        background: PERSONA_GRADIENTS[persona] || PERSONA_GRADIENTS.admin,
        minHeight: '100vh',
      }}
    >
      {children}
    </div>
  );
}
