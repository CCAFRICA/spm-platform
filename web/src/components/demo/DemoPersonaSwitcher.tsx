'use client';

/**
 * Demo Persona Switcher
 *
 * Floating bar at the bottom of the screen for VL Admin to instantly
 * switch between demo personas without logging out.
 *
 * Only visible when:
 * 1. User is authenticated
 * 2. User is VL Admin (has manage_tenants capability)
 * 3. A tenant is currently selected
 * 4. Tenant has demo_users in settings
 */

import { useState, useEffect, useCallback } from 'react';
import { Shield, Users, User, ArrowLeft, Loader2 } from 'lucide-react';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';

interface DemoUser {
  email: string;
  password: string;
  label: string;
  icon: string;
}

const ICON_MAP: Record<string, typeof Shield> = {
  shield: Shield,
  users: Users,
  user: User,
};

const PLATFORM_EMAIL = 'platform@vialuce.com';
const PLATFORM_PASSWORD = 'VL-platform-2024!';

export function DemoPersonaSwitcher() {
  const { currentTenant, isVLAdmin } = useTenant();
  const { user, isAuthenticated } = useAuth();
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);

  // Load demo users from tenant settings
  useEffect(() => {
    if (!currentTenant || !isVLAdmin) {
      setDemoUsers([]);
      return;
    }

    const fetchDemoUsers = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', currentTenant.id)
        .single();

      const settings = (data?.settings || {}) as Record<string, unknown>;
      const users = (settings.demo_users || []) as DemoUser[];
      setDemoUsers(users);
    };

    fetchDemoUsers();
  }, [currentTenant, isVLAdmin]);

  const switchPersona = useCallback(async (email: string, password: string) => {
    setSwitching(email);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('[DemoPersonaSwitcher] Sign in failed:', error.message);
        setSwitching(null);
        return;
      }
      // Full page reload to re-initialize all contexts
      window.location.reload();
    } catch (err) {
      console.error('[DemoPersonaSwitcher] Switch failed:', err);
      setSwitching(null);
    }
  }, []);

  const switchBackToPlatform = useCallback(async () => {
    setSwitching(PLATFORM_EMAIL);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      const { error } = await supabase.auth.signInWithPassword({
        email: PLATFORM_EMAIL,
        password: PLATFORM_PASSWORD,
      });
      if (error) {
        console.error('[DemoPersonaSwitcher] Platform sign in failed:', error.message);
        setSwitching(null);
        return;
      }
      window.location.reload();
    } catch (err) {
      console.error('[DemoPersonaSwitcher] Switch back failed:', err);
      setSwitching(null);
    }
  }, []);

  // Don't render if not authenticated, not VL Admin, no tenant, or no demo users
  if (!isAuthenticated || !isVLAdmin || !currentTenant || demoUsers.length === 0) {
    return null;
  }

  const currentEmail = user?.email;
  const isViewingAsDemoUser = demoUsers.some(du => du.email === currentEmail);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/90 backdrop-blur-md border border-slate-700 shadow-2xl">
        <span className="text-[11px] text-slate-400 font-medium mr-1">
          Demo
        </span>

        {/* Back to Platform Admin chip */}
        {isViewingAsDemoUser && (
          <button
            onClick={switchBackToPlatform}
            disabled={!!switching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
          >
            {switching === PLATFORM_EMAIL ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ArrowLeft className="h-3 w-3" />
            )}
            Platform Admin
          </button>
        )}

        {/* Demo user chips */}
        {demoUsers.map((du) => {
          const IconComponent = ICON_MAP[du.icon] || User;
          const isActive = currentEmail === du.email;
          const isLoading = switching === du.email;

          return (
            <button
              key={du.email}
              onClick={() => switchPersona(du.email, du.password)}
              disabled={isActive || !!switching}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                isActive
                  ? 'bg-emerald-600 text-white cursor-default'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-50'
              }`}
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <IconComponent className="h-3 w-3" />
              )}
              {du.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
