'use client';

/**
 * Revenue route gate — OB-257 O1 (entitlement boundary; the Financial precedent exactly).
 *
 * The Revenue agent is LICENSABLE: a tenant sees it only if `tenants.features.revenue_enabled` is
 * set (default-OFF, DEFAULT_FEATURES). This wraps every /revenue/* route in the EXISTING
 * FeatureGate (reads tenants.features, redirects when absent), so an un-entitled tenant is DENIED
 * at the ROUTE, not merely hidden in the menu. The server-side deep-link gate is the matching
 * WORKSPACE_FEATURES entry (middleware); the FUNCTIONAL gate is isRevenueEnabledForTenant on the
 * Revenue API routes. Leverage, not a new mechanism (SR-34).
 */

import { FeatureGate } from '@/components/feature-gate';

export default function RevenueLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate feature="revenue_enabled" redirectTo="/unauthorized">
      {children}
    </FeatureGate>
  );
}
