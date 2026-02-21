'use client';

/**
 * Demo Persona Switcher — Real Re-Authentication (OB-73 Mission 2 / F-71)
 *
 * Floating bar at the bottom of the screen for VL Admin to switch
 * between persona views with REAL Supabase re-authentication.
 *
 * Locked Decision #18: Must call signInWithPassword() — not in-memory override.
 * After switch, does a full page reload so all server components, middleware,
 * and RLS policies see the new authenticated user.
 *
 * Only visible when:
 * 1. User is authenticated
 * 2. User is VL Admin (has manage_tenants capability)
 * 3. A tenant is currently selected
 */

import { useState, useEffect, useCallback } from 'react';
import { Shield, Users, User, RotateCcw, Loader2 } from 'lucide-react';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';

interface PersonaOption {
  email: string;
  role: string;
  displayName: string;
}

const ROLE_ICONS: Record<string, typeof Shield> = {
  admin: Shield,
  manager: Users,
  viewer: User,
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Gerente',
  viewer: 'Vendedor',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-indigo-600 text-white',
  manager: 'bg-amber-600 text-white',
  viewer: 'bg-emerald-600 text-white',
};

// All demo users share this password (HF-056)
const DEMO_PASSWORD = 'demo-password-VL1';

export function DemoPersonaSwitcher() {
  const { currentTenant, isVLAdmin } = useTenant();
  const { isAuthenticated, user } = useAuth();
  const [switching, setSwitching] = useState(false);
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);

  // Fetch available personas from profiles table for the current tenant
  useEffect(() => {
    if (!currentTenant?.id) {
      setPersonas([]);
      return;
    }

    async function loadPersonas() {
      const supabase = createClient();
      const { data: profiles } = await supabase
        .from('profiles')
        .select('email, role, display_name')
        .eq('tenant_id', currentTenant!.id)
        .in('role', ['admin', 'manager', 'viewer'])
        .order('role');

      if (profiles && profiles.length > 0) {
        setPersonas(profiles.map(p => ({
          email: p.email,
          role: p.role,
          displayName: p.display_name || p.email,
        })));
      }
    }

    loadPersonas();
  }, [currentTenant?.id]);

  // Track current authenticated user email
  useEffect(() => {
    if (user?.email) {
      setCurrentEmail(user.email);
    }
  }, [user?.email]);

  const handleSwitch = useCallback(async (persona: PersonaOption) => {
    if (switching || persona.email === currentEmail) return;
    setSwitching(true);

    try {
      const supabase = createClient();

      // 1. Sign out current session
      await supabase.auth.signOut();

      // 2. Sign in as the new persona (REAL auth — Locked Decision #18)
      const { error } = await supabase.auth.signInWithPassword({
        email: persona.email,
        password: DEMO_PASSWORD,
      });

      if (error) {
        console.error('[PersonaSwitcher] Switch failed:', error.message);
        setSwitching(false);
        return;
      }

      // 3. Full page reload to pick up new session in all server components
      window.location.href = '/';
    } catch (err) {
      console.error('[PersonaSwitcher] Switch error:', err);
      setSwitching(false);
    }
  }, [switching, currentEmail]);

  const handleReset = useCallback(async () => {
    // "Reset" means switch back to the VL Admin account
    // VL Admin email is stored on the original user
    if (switching) return;

    // Find the VL admin persona — it's the platform admin, not tenant-level
    // For reset, redirect to login which will re-auth as the original user
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }, [switching]);

  // Only visible to authenticated VL Admin with a tenant selected
  if (!isAuthenticated || !isVLAdmin || !currentTenant) {
    return null;
  }

  // Derive current role from email match
  const currentPersona = personas.find(p => p.email === currentEmail);
  const currentRole = currentPersona?.role || 'admin';

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/90 backdrop-blur-md border border-slate-700 shadow-2xl">
        {switching ? (
          <div className="flex items-center gap-2 px-3 py-1">
            <Loader2 className="h-3 w-3 animate-spin text-slate-300" />
            <span className="text-[11px] text-slate-400">Switching...</span>
          </div>
        ) : (
          <>
            <span className="text-[11px] text-slate-400 font-medium mr-1">
              Vista
            </span>

            {/* Persona chips from real profiles */}
            {personas.map((persona) => {
              const IconComponent = ROLE_ICONS[persona.role] || User;
              const isActive = persona.email === currentEmail;
              const label = ROLE_LABELS[persona.role] || persona.role;
              const activeColor = ROLE_COLORS[persona.role] || 'bg-slate-600 text-white';

              return (
                <button
                  key={persona.email}
                  onClick={() => handleSwitch(persona)}
                  disabled={isActive}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isActive
                      ? `${activeColor} cursor-default`
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                  }`}
                  title={persona.email}
                >
                  <IconComponent className="h-3 w-3" />
                  {label}
                </button>
              );
            })}

            {/* Reset to VL Admin */}
            {currentRole !== 'admin' && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600"
                title="Sign out and return to login"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
