'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/contexts/tenant-context';
import { PersonaProvider } from '@/contexts/persona-context';
import { NavigationProvider, useNavigation } from '@/contexts/navigation-context';
import { PeriodProvider } from '@/contexts/period-context';
import { ChromeSidebar } from '@/components/navigation/ChromeSidebar';
import { CommandPalette } from '@/components/navigation/command-palette/CommandPalette';
import { Navbar } from '@/components/navigation/Navbar';
import { DemoPersonaSwitcher } from '@/components/demo/DemoPersonaSwitcher';
import { cn } from '@/lib/utils';

// Routes that don't require a tenant to be selected
const TENANT_EXEMPT_ROUTES = ['/login', '/select-tenant'];

// Routes that should not show the app shell (sidebar/navbar)
const SHELL_EXCLUDED_ROUTES = ['/login', '/select-tenant'];

interface AuthShellProps {
  children: React.ReactNode;
}

/**
 * Inner shell component that uses navigation context.
 * Applies data-workspace attribute for Wayfinder ambient identity.
 */
function AuthShellInner({ children }: AuthShellProps) {
  const { isRailCollapsed, activeWorkspace, isMobileOpen, toggleMobileOpen } = useNavigation();

  return (
    <>
      <ChromeSidebar />
      <div
        data-workspace={activeWorkspace}
        className={cn(
          'transition-all duration-300 ease-in-out',
          isRailCollapsed ? 'md:pl-16' : 'md:pl-[264px]'
        )}
      >
        <Navbar onMenuToggle={toggleMobileOpen} isMobileMenuOpen={isMobileOpen} />
        <main className="workspace-content min-h-screen" style={{ background: 'transparent' }}>{children}</main>
      </div>
      <CommandPalette />
    </>
  );
}

/**
 * Gate component: checks pathname BEFORE any auth hooks run.
 * On public routes (/login, /api/auth), renders children directly —
 * no useAuth, no useTenant, no Supabase calls, no redirect logic.
 */
export function AuthShell({ children }: AuthShellProps) {
  const pathname = usePathname();

  if (pathname === '/login' || pathname === '/landing' || pathname === '/signup' || pathname.startsWith('/api/auth')) {
    return <>{children}</>;
  }

  return <AuthShellProtected>{children}</AuthShellProtected>;
}

function AuthShellProtected({ children }: AuthShellProps) {
  const { isAuthenticated, isLoading, isVLAdmin } = useAuth();
  const { currentTenant, isLoading: tenantLoading } = useTenant();
  const pathname = usePathname();
  const router = useRouter();

  // Note: public routes (/login, /api/auth) are handled by the AuthShell gate above.
  // This component only renders on protected routes.
  const isTenantExempt = TENANT_EXEMPT_ROUTES.includes(pathname);
  const showShell = !SHELL_EXCLUDED_ROUTES.includes(pathname);

  useEffect(() => {
    if (isLoading || tenantLoading) return;

    // Not authenticated → full page navigation to /login (always works)
    if (!isAuthenticated) {
      window.location.href = `/login?redirect=${encodeURIComponent(pathname)}`;
      return;
    }

    // Platform admin without a tenant selected must pick one first
    if (isVLAdmin && !currentTenant && !isTenantExempt) {
      router.push('/select-tenant');
    }
  }, [isAuthenticated, isLoading, tenantLoading, isVLAdmin, currentTenant, isTenantExempt, pathname, router]);

  // Show loading state while checking auth or tenant
  if (isLoading || tenantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated on a protected route: show spinner while redirect fires
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    );
  }

  // Platform admin without tenant on a non-exempt route: render nothing while redirect fires
  if (isVLAdmin && !currentTenant && !isTenantExempt) {
    return null;
  }

  // Authenticated user - show with or without shell based on route
  if (!showShell) {
    // OB-60: No DemoPersonaSwitcher on Observatory (/select-tenant).
    // The Observatory is exclusively for VL Platform Admin — persona
    // switching only makes sense inside a tenant context on regular pages.
    return <>{children}</>;
  }

  // Full app shell with Mission Control Rail
  return (
    <PersonaProvider>
      <PeriodProvider>
        <NavigationProvider>
          <AuthShellInner>{children}</AuthShellInner>
          <DemoPersonaSwitcher />
        </NavigationProvider>
      </PeriodProvider>
    </PersonaProvider>
  );
}
