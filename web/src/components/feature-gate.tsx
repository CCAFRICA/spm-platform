'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFeature, useTenant } from '@/contexts/tenant-context';
import type { TenantConfig } from '@/types/tenant';

interface FeatureGateProps {
  feature: keyof TenantConfig['features'];
  children: React.ReactNode;
  fallback?: React.ReactNode;
  redirectTo?: string;
}

/**
 * FeatureGate - Conditionally renders children based on tenant feature flags
 *
 * Usage:
 * <FeatureGate feature="salesFinance" redirectTo="/insights">
 *   <SalesFinancePage />
 * </FeatureGate>
 *
 * Or with fallback:
 * <FeatureGate feature="gamification" fallback={<ComingSoon />}>
 *   <GamificationDashboard />
 * </FeatureGate>
 */
export function FeatureGate({
  feature,
  children,
  fallback,
  redirectTo = '/'
}: FeatureGateProps) {
  const { currentTenant } = useTenant();
  const isEnabled = useFeature(feature);
  const router = useRouter();

  useEffect(() => {
    // Only redirect if tenant is loaded and feature is not enabled
    if (currentTenant && !isEnabled && !fallback) {
      router.push(redirectTo);
    }
  }, [currentTenant, isEnabled, fallback, redirectTo, router]);

  // Still loading tenant
  if (!currentTenant) {
    return null;
  }

  // Feature not enabled
  if (!isEnabled) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}

/**
 * useFeatureGate - Hook version for more control
 *
 * Usage:
 * const { isEnabled, isLoading } = useFeatureGate('salesFinance');
 * if (!isEnabled) return <Redirect />;
 */
export function useFeatureGate(feature: keyof TenantConfig['features']) {
  const { currentTenant, isLoading } = useTenant();
  const isEnabled = useFeature(feature);

  return {
    isEnabled,
    isLoading: isLoading || !currentTenant,
    tenant: currentTenant,
  };
}

/**
 * FeatureFlag - Simple visibility toggle (no redirect)
 *
 * Usage:
 * <FeatureFlag feature="gamification">
 *   <GamificationWidget />
 * </FeatureFlag>
 */
export function FeatureFlag({
  feature,
  children
}: {
  feature: keyof TenantConfig['features'];
  children: React.ReactNode;
}) {
  const isEnabled = useFeature(feature);

  if (!isEnabled) {
    return null;
  }

  return <>{children}</>;
}
