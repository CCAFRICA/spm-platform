'use client';

/**
 * Demo Persona Switcher — Context-Only Impersonation (OB-89)
 *
 * Floating bar at the bottom of the screen for VL Admin to switch
 * between persona views using context override ONLY.
 *
 * Architecture:
 * - VL Admin is always the authenticated Supabase user (session unchanged)
 * - Clicking a persona chip calls setPersonaOverride() in persona-context
 * - Override changes: visual identity, intent framing, data scope perception
 * - Override persists in sessionStorage across navigation
 * - NO signOut/signIn. NO page reload. NO auth round-trip.
 *
 * Only visible when:
 * 1. User is authenticated
 * 2. User is VL Admin (isVLAdmin from tenant context)
 * 3. A tenant is currently selected
 */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Users, User } from 'lucide-react';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { usePersona } from '@/contexts/persona-context';
import { getDefaultWorkspace, personaToRole } from '@/lib/navigation/role-workspaces';
import { WORKSPACES } from '@/lib/navigation/workspace-config';
import type { PersonaKey } from '@/lib/design/tokens';

interface PersonaChip {
  key: PersonaKey;
  label: string;
  icon: typeof Shield;
  activeColor: string;
}

const PERSONA_CHIPS: PersonaChip[] = [
  { key: 'admin', label: 'Admin', icon: Shield, activeColor: 'bg-indigo-600 text-white' },
  { key: 'manager', label: 'Manager', icon: Users, activeColor: 'bg-amber-600 text-white' },
  { key: 'rep', label: 'Rep', icon: User, activeColor: 'bg-emerald-600 text-white' },
];

export function DemoPersonaSwitcher() {
  const router = useRouter();
  const { currentTenant, isVLAdmin } = useTenant();
  const { isAuthenticated } = useAuth();
  const { persona, setPersonaOverride } = usePersona();

  const handleSwitch = useCallback((key: PersonaKey) => {
    // If clicking the derived default (admin for VL Admin), clear the override
    if (key === 'admin') {
      setPersonaOverride(null);
    } else {
      setPersonaOverride(key);
    }

    // OB-94: Navigate to the default workspace for the selected persona
    const role = personaToRole(key);
    const defaultWs = getDefaultWorkspace(role);
    const ws = WORKSPACES[defaultWs];
    router.push(ws.defaultRoute);
  }, [setPersonaOverride, router]);

  // Only visible to authenticated VL Admin with a tenant selected
  if (!isAuthenticated || !isVLAdmin || !currentTenant) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/90 backdrop-blur-md border border-slate-700 shadow-2xl">
        <span className="text-[11px] text-slate-400 font-medium mr-1">
          Persona
        </span>

        {PERSONA_CHIPS.map((chip) => {
          const IconComponent = chip.icon;
          const isActive = persona === chip.key;

          return (
            <button
              key={chip.key}
              onClick={() => handleSwitch(chip.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                isActive
                  ? `${chip.activeColor} cursor-default shadow-lg`
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
              }`}
            >
              <IconComponent className="h-3 w-3" />
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
