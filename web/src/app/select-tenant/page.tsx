'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/contexts/tenant-context';
import { PlatformObservatory } from '@/components/platform/PlatformObservatory';

/**
 * /select-tenant — Scope-based experience split (OB-47)
 *
 * VL Admin (platform scope) → PlatformObservatory (5-tab command center)
 * Tenant admin → existing tenant picker (TODO: build simple picker if multi-tenant admins appear)
 * Single-tenant user → redirect to /
 */
export default function SelectTenantPage() {
  const router = useRouter();
  const { user, isVLAdmin, isLoading: authLoading } = useAuth();
  const { isLoading: tenantLoading } = useTenant();

  // Redirect non-admin users — they should never be on this page
  useEffect(() => {
    if (authLoading) return;
    if (user && !isVLAdmin) {
      router.push('/');
    }
  }, [isVLAdmin, user, router, authLoading]);

  if (authLoading || tenantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0E1A]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!isVLAdmin) return null;

  // VL Admin → Full Platform Observatory
  return <PlatformObservatory />;
}
