'use client';

/**
 * OB-252 — /admin/tenants now REDIRECTS into the Observatory.
 *
 * The HF-352 tenant-management surface (identity + agent entitlement + admin users + clean-slate +
 * delete) has been RELOCATED to the Observatory "Tenant Admin" tab (TenantManagementTab), the single
 * Observatory-confined home (I0/I2). This route is retained only so existing bookmarks / deep links
 * (/admin/tenants?tenant=<id>) keep working — it forwards to the tab, preserving the selected tenant.
 *
 * Still capability-gated (RequireCapability platform.system_config + middleware /admin gate) so a
 * non-platform user hitting the URL is denied before the redirect.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RequireCapability } from '@/components/auth/RequireCapability';
import { Loader2 } from 'lucide-react';

function RedirectToObservatory() {
  const router = useRouter();

  useEffect(() => {
    const tenant = new URLSearchParams(window.location.search).get('tenant');
    const target = tenant
      ? `/select-tenant?tab=tenant-management&tenant=${encodeURIComponent(tenant)}`
      : '/select-tenant?tab=tenant-management';
    router.replace(target);
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Opening Tenant Admin in the Observatory…
      </div>
    </div>
  );
}

export default function TenantManagementRedirectPage() {
  return (
    <RequireCapability capability="platform.system_config">
      <RedirectToObservatory />
    </RequireCapability>
  );
}
