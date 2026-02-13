/**
 * useAdminLocale - Global hook for locale handling
 *
 * Returns the effective locale based on tenant configuration.
 * All users (including VL Admin) see the tenant's configured locale.
 */

import { useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/contexts/tenant-context';
import { isVLAdmin } from '@/types/auth';

export type SupportedLocale = 'en-US' | 'es-MX';

interface AdminLocaleResult {
  /** The effective locale to use for display */
  locale: SupportedLocale;
  /** Whether the current user is a VL Admin */
  isVLAdminUser: boolean;
  /** Whether Spanish should be used */
  isSpanish: boolean;
  /** Helper to get localized label from a labels object */
  getLabel: <T extends Record<SupportedLocale, Record<string, string>>>(
    labels: T
  ) => T[SupportedLocale];
}

/**
 * Hook that returns the correct locale for the current user.
 * All users see the tenant's configured locale.
 */
export function useAdminLocale(): AdminLocaleResult {
  const { user } = useAuth();
  const { currentTenant } = useTenant();

  return useMemo(() => {
    const isVLAdminUser = user ? isVLAdmin(user) : false;

    // Determine the effective locale from tenant config
    const locale: SupportedLocale = currentTenant?.locale === 'es-MX' ? 'es-MX' : 'en-US';
    const isSpanish = locale === 'es-MX';

    // Helper function to get the correct labels object
    const getLabel = <T extends Record<SupportedLocale, Record<string, string>>>(
      labels: T
    ): T[SupportedLocale] => {
      return labels[locale];
    };

    return {
      locale,
      isVLAdminUser,
      isSpanish,
      getLabel,
    };
  }, [user, currentTenant?.locale]);
}

export default useAdminLocale;
