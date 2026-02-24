'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import {
  Locale,
  DEFAULT_LOCALE,
  loadTranslations,
  getTranslation,
  formatLocalizedDate,
  formatLocalizedNumber,
  formatLocalizedPercent,
} from '@/lib/i18n';
import { audit } from '@/lib/audit-service';
import { createClient } from '@/lib/supabase/client';

const PUBLIC_ROUTES = ['/landing', '/login', '/signup', '/auth/callback'];

/** Map profiles.locale column value to Locale code */
const LANG_TO_LOCALE: Record<string, Locale> = {
  es: 'es-MX',
  en: 'en-US',
  pt: 'pt-BR',
  'es-MX': 'es-MX',
  'en-US': 'en-US',
  'pt-BR': 'pt-BR',
};

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatDate: (date: Date | string, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatPercent: (value: number, decimals?: number) => string;
  isLoading: boolean;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

interface LocaleProviderProps {
  children: ReactNode;
  defaultLocale?: Locale;
}

export function LocaleProvider({
  children,
  defaultLocale = DEFAULT_LOCALE,
}: LocaleProviderProps) {
  const pathname = usePathname();
  const isPublicRoute = PUBLIC_ROUTES.some(r => pathname?.startsWith(r));
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [translations, setTranslations] = useState<Record<string, unknown>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load translations when locale changes
  useEffect(() => {
    const loadAllTranslations = async () => {
      setIsLoading(true);

      try {
        // Load both common and compensation namespaces
        const [common, compensation] = await Promise.all([
          loadTranslations(locale, 'common'),
          loadTranslations(locale, 'compensation'),
        ]);

        setTranslations({
          ...common,
          ...compensation,
        });
      } catch (error) {
        console.error('Failed to load translations:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAllTranslations();
  }, [locale]);

  // Initialize from profile language stored in Supabase (OB-58).
  // Skip on public routes — no Supabase calls needed for /landing, /login, /signup.
  useEffect(() => {
    if (isPublicRoute) return;

    async function loadProfileLanguage() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('locale')
          .eq('auth_user_id', user.id)
          .limit(1)
          .maybeSingle();

        if (profile?.locale && LANG_TO_LOCALE[profile.locale]) {
          setLocaleState(LANG_TO_LOCALE[profile.locale]);
        }
      } catch {
        // Non-blocking — use default locale
      }
    }
    loadProfileLanguage();
  }, [isPublicRoute]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);

    audit.log({
      action: 'update',
      entityType: 'config',
      entityId: 'locale',
      reason: `Changed language to ${newLocale}`,
    });

    // Persist language preference to profiles.locale in Supabase (OB-58)
    // Fire-and-forget — non-blocking so UI updates instantly
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const langCode = newLocale === 'es-MX' ? 'es' : newLocale === 'pt-BR' ? 'pt' : 'en';
        await supabase
          .from('profiles')
          .update({ locale: langCode })
          .eq('auth_user_id', user.id);
      } catch {
        // Non-blocking — locale already updated in state
      }
    })();
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      return getTranslation(translations, key, params);
    },
    [translations]
  );

  const formatDate = useCallback(
    (date: Date | string, options?: Intl.DateTimeFormatOptions): string => {
      return formatLocalizedDate(date, locale, options);
    },
    [locale]
  );

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions): string => {
      return formatLocalizedNumber(value, locale, options);
    },
    [locale]
  );

  const formatPercent = useCallback(
    (value: number, decimals = 1): string => {
      return formatLocalizedPercent(value, locale, decimals);
    },
    [locale]
  );

  return (
    <LocaleContext.Provider
      value={{
        locale,
        setLocale,
        t,
        formatDate,
        formatNumber,
        formatPercent,
        isLoading,
      }}
    >
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}
