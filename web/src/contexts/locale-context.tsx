'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
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

  // Initialize from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('locale');
    if (stored && (stored === 'en-US' || stored === 'es-MX')) {
      setLocaleState(stored as Locale);
    }
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('locale', newLocale);

    audit.log({
      action: 'update',
      entityType: 'config',
      entityId: 'locale',
      reason: `Changed language to ${newLocale}`,
    });
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
