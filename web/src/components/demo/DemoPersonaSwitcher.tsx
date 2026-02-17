'use client';

/**
 * Demo Persona Switcher — In-Memory Impersonation
 *
 * Floating bar at the bottom of the screen for VL Admin to instantly
 * switch between persona views WITHOUT auth round-trip.
 *
 * Uses setPersonaOverride() from persona-context to swap the visual
 * persona in-memory. No signOut, no signIn, no page reload.
 *
 * Only visible when:
 * 1. User is authenticated
 * 2. User is VL Admin (has manage_tenants capability)
 * 3. A tenant is currently selected
 */

import { useCallback } from 'react';
import { Shield, Users, User, RotateCcw } from 'lucide-react';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { usePersona } from '@/contexts/persona-context';
import type { PersonaKey } from '@/lib/design/tokens';

interface PersonaChip {
  key: PersonaKey;
  label: string;
  icon: typeof Shield;
}

const PERSONA_CHIPS: PersonaChip[] = [
  { key: 'admin', label: 'Admin', icon: Shield },
  { key: 'manager', label: 'Gerente', icon: Users },
  { key: 'rep', label: 'Vendedor', icon: User },
];

export function DemoPersonaSwitcher() {
  const { currentTenant, isVLAdmin } = useTenant();
  const { isAuthenticated } = useAuth();
  const { persona, setPersonaOverride } = usePersona();

  const handleSwitch = useCallback((key: PersonaKey) => {
    setPersonaOverride(key);
  }, [setPersonaOverride]);

  const handleReset = useCallback(() => {
    setPersonaOverride(null);
  }, [setPersonaOverride]);

  // Only visible to authenticated VL Admin with a tenant selected
  if (!isAuthenticated || !isVLAdmin || !currentTenant) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/90 backdrop-blur-md border border-slate-700 shadow-2xl">
        <span className="text-[11px] text-slate-400 font-medium mr-1">
          Vista
        </span>

        {/* Persona chips */}
        {PERSONA_CHIPS.map((chip) => {
          const IconComponent = chip.icon;
          const isActive = persona === chip.key;

          return (
            <button
              key={chip.key}
              onClick={() => handleSwitch(chip.key)}
              disabled={isActive}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                isActive
                  ? chip.key === 'admin'
                    ? 'bg-indigo-600 text-white cursor-default'
                    : chip.key === 'manager'
                    ? 'bg-amber-600 text-white cursor-default'
                    : 'bg-emerald-600 text-white cursor-default'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
              }`}
            >
              <IconComponent className="h-3 w-3" />
              {chip.label}
            </button>
          );
        })}

        {/* Reset to derived persona */}
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600"
          title="Restablecer a persona derivada"
        >
          <RotateCcw className="h-3 w-3" />
          Auto
        </button>
      </div>
    </div>
  );
}
