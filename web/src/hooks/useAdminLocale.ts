/**
 * useAdminLocale - Global hook for CC Admin language handling
 *
 * CC Admin users always see English regardless of tenant locale.
 * This ensures consistent experience for platform administrators.
 */

import { useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/contexts/tenant-context';
import { isCCAdmin } from '@/types/auth';

export type SupportedLocale = 'en-US' | 'es-MX';

interface AdminLocaleResult {
  /** The effective locale to use for display */
  locale: SupportedLocale;
  /** Whether the current user is a CC Admin */
  isCCAdminUser: boolean;
  /** Whether Spanish should be used (always false for CC Admin) */
  isSpanish: boolean;
  /** Helper to get localized label from a labels object */
  getLabel: <T extends Record<SupportedLocale, Record<string, string>>>(
    labels: T
  ) => T[SupportedLocale];
}

/**
 * Hook that returns the correct locale for the current user.
 * CC Admin users always get English ('en-US') regardless of tenant locale.
 * Regular tenant users get the tenant's configured locale.
 */
export function useAdminLocale(): AdminLocaleResult {
  const { user } = useAuth();
  const { currentTenant } = useTenant();

  return useMemo(() => {
    // CC Admin always sees English
    const isCCAdminUser = user ? isCCAdmin(user) : false;

    // Determine the effective locale
    let locale: SupportedLocale = 'en-US';

    if (!isCCAdminUser && currentTenant?.locale === 'es-MX') {
      locale = 'es-MX';
    }

    const isSpanish = locale === 'es-MX';

    // Helper function to get the correct labels object
    const getLabel = <T extends Record<SupportedLocale, Record<string, string>>>(
      labels: T
    ): T[SupportedLocale] => {
      return labels[locale];
    };

    return {
      locale,
      isCCAdminUser,
      isSpanish,
      getLabel,
    };
  }, [user, currentTenant?.locale]);
}

export default useAdminLocale;
