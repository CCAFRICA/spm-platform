/**
 * useAdminLocale - Global hook for locale handling
 *
 * OB-37 Phase 5: User's language selector preference takes priority.
 * Priority: user preference > tenant config > en-US default.
 * VL Admin language lock REMOVED -- all users select preferred language.
 */

import { useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
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
 * User's language selector preference takes priority over tenant config.
 */
export function useAdminLocale(): AdminLocaleResult {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { locale: userLocale } = useLocale();

  return useMemo(() => {
    const isVLAdminUser = user ? isVLAdmin(user) : false;

    // User preference (from language selector) takes priority
    // Falls back to tenant config, then to en-US
    const locale: SupportedLocale =
      (userLocale === 'es-MX' || userLocale === 'en-US') ? userLocale
      : currentTenant?.locale === 'es-MX' ? 'es-MX'
      : 'en-US';
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
  }, [user, userLocale, currentTenant?.locale]);
}

export default useAdminLocale;
