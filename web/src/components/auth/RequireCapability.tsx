'use client';

/**
 * RequireCapability — DS-014 page-level access control
 *
 * Replaces RequireRole. Checks capabilities from permissions.ts,
 * not hardcoded role arrays.
 *
 * Usage:
 *   <RequireCapability capability="data.calculate">
 *     <CalculatePage />
 *   </RequireCapability>
 */

import { useAuth } from '@/contexts/auth-context';
import { hasCapability, type Capability } from '@/lib/auth/permissions';

interface RequireCapabilityProps {
  capability: Capability;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function RequireCapability({ capability, fallback, children }: RequireCapabilityProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return fallback || <CapabilityGate reason="loading" />;
  }

  if (!user) {
    return fallback || <CapabilityGate reason="loading" />;
  }

  if (!hasCapability(user.role, capability)) {
    return fallback || <CapabilityGate reason="denied" />;
  }

  return <>{children}</>;
}

function CapabilityGate({ reason }: { reason: 'loading' | 'denied' }) {
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
