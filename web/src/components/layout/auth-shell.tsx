'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { NavigationProvider, useNavigation } from '@/contexts/navigation-context';
import { MissionControlRail } from '@/components/navigation/mission-control';
import { CommandPalette } from '@/components/navigation/command-palette/CommandPalette';
import { Navbar } from '@/components/navigation/Navbar';
import { cn } from '@/lib/utils';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login'];

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
  const { isRailCollapsed, activeWorkspace } = useNavigation();

  return (
    <>
      <MissionControlRail />
      <div
        data-workspace={activeWorkspace}
        className={cn(
          'transition-all duration-300 ease-in-out',
          isRailCollapsed ? 'md:pl-16' : 'md:pl-[280px]'
        )}
      >
        <Navbar />
        <main className="workspace-content min-h-screen">{children}</main>
      </div>
      <CommandPalette />
    </>
  );
}

export function AuthShell({ children }: AuthShellProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);
  const showShell = !SHELL_EXCLUDED_ROUTES.includes(pathname);

  useEffect(() => {
    // Don't redirect while loading
    if (isLoading) return;

    // If not authenticated and not on a public route, redirect to login
    if (!isAuthenticated && !isPublicRoute) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, isPublicRoute, router]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // For public routes or when not authenticated, just render children
  if (isPublicRoute || !isAuthenticated) {
    return <>{children}</>;
  }

  // Authenticated user - show with or without shell based on route
  if (!showShell) {
    return <>{children}</>;
  }

  // Full app shell with Mission Control Rail
  return (
    <NavigationProvider>
      <AuthShellInner>{children}</AuthShellInner>
    </NavigationProvider>
  );
}
