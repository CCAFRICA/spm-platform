'use client';

import { useAuth } from '@/contexts/auth-context';
import { canAccessPage, canPerformAction } from '@/lib/auth/role-permissions';
import { usePathname } from 'next/navigation';

interface RequireRoleProps {
  roles?: string[];
  action?: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function RequireRole({ roles, action, fallback, children }: RequireRoleProps) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();

  if (isLoading) {
    return fallback || <UnauthorizedMessage reason="loading" />;
  }

  if (!user) {
    return fallback || <UnauthorizedMessage reason="loading" />;
  }

  const userRole = user.role;

  const hasAccess = roles
    ? roles.includes(userRole)
    : action
      ? canPerformAction(userRole, action)
      : canAccessPage(userRole, pathname);

  if (!hasAccess) {
    return fallback || <UnauthorizedMessage reason="role" role={userRole} />;
  }

  return <>{children}</>;
}

function UnauthorizedMessage({ reason }: { reason: string; role?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
      <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
        <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
        Access Restricted
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
        {reason === 'loading'
          ? 'Verifying your permissions...'
          : 'Your current role does not have access to this page. Contact your administrator if you believe this is an error.'}
      </p>
    </div>
  );
}

/**
 * Hook for inline permission checks.
 * Usage: const canRun = useCanPerform('run_calculation');
 */
export function useCanPerform(action: string): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return canPerformAction(user.role, action);
}
