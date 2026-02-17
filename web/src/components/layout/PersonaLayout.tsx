'use client';

/**
 * PersonaLayout — Persona-aware layout wrapper
 *
 * Applies:
 *   - Background gradient from persona tokens (Wayfinder Layer 1)
 *   - 700ms transition animation when persona changes
 *   - Provides ambient visual identity to all children
 *
 * This component wraps ALL page content in the new design system.
 * Created as standalone (OB-46A) — wired into layout in OB-46B.
 */

import type { ReactNode } from 'react';
import { PERSONA_TOKENS, type PersonaKey } from '@/lib/design/tokens';

interface PersonaLayoutProps {
  children: ReactNode;
  persona?: PersonaKey;
  tokens?: typeof PERSONA_TOKENS[PersonaKey];
}

export function PersonaLayout({ children, persona = 'rep', tokens }: PersonaLayoutProps) {
  const resolvedTokens = tokens ?? PERSONA_TOKENS[persona];

  return (
    <div
      className={`min-h-screen bg-gradient-to-b ${resolvedTokens.bg} text-white transition-all duration-700`}
    >
      {children}
    </div>
  );
}
