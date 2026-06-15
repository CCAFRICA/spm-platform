'use client';

/**
 * Financial route gate — WS7-A / HALT-ACCESS #1 (entitlement boundary).
 *
 * The Finance agent is LICENSABLE: a tenant sees it only if `tenants.features.financial` is set.
 * Before this layout, /financial/* was gated ONLY at the sidebar menu (by role capability), never
 * at the route — so a non-Finance tenant's role-capable manager could navigate directly to
 * /financial and see financial data they are not licensed for. This wraps every /financial/* route
 * in the EXISTING FeatureGate (reads tenants.features, redirects when absent), so a non-Finance
 * tenant is DENIED at the ROUTE, not merely hidden in the menu. Leverage, not a new mechanism (SR-34).
 */

import { FeatureGate } from '@/components/feature-gate';

export default function FinancialLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate feature="financial" redirectTo="/unauthorized">
      {children}
    </FeatureGate>
  );
}
