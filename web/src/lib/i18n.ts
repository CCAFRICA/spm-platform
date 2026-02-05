export type Locale = 'en-US' | 'es-MX';

export const SUPPORTED_LOCALES: { code: Locale; name: string; flag: string }[] = [
  { code: 'en-US', name: 'English', flag: '🇺🇸' },
  { code: 'es-MX', name: 'Español', flag: '🇲🇽' },
];

export const DEFAULT_LOCALE: Locale = 'en-US';

// Translation cache
const translationCache: Record<string, Record<string, unknown>> = {};

/**
 * Load translations for a specific locale and namespace
 */
export async function loadTranslations(
  locale: Locale,
  namespace: string
): Promise<Record<string, unknown>> {
  const cacheKey = `${locale}:${namespace}`;

  if (translationCache[cacheKey]) {
    return translationCache[cacheKey];
  }

  try {
    // Dynamic import based on locale and namespace
    const translations = await import(`@/locales/${locale}/${namespace}.json`);
    translationCache[cacheKey] = translations.default || translations;
    return translationCache[cacheKey];
  } catch (error) {
    console.warn(`Failed to load translations for ${locale}/${namespace}:`, error);
    // Fallback to default locale
    if (locale !== DEFAULT_LOCALE) {
      return loadTranslations(DEFAULT_LOCALE, namespace);
    }
    return {};
  }
}

/**
 * Get a nested translation value by key path
 */
export function getTranslation(
  translations: Record<string, unknown>,
  key: string,
  params?: Record<string, string | number>
): string {
  const keys = key.split('.');
  let value: unknown = translations;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      return key; // Return key if translation not found
    }
  }

  if (typeof value !== 'string') {
    return key;
  }

  // Replace parameters like {{name}} with actual values
  if (params) {
    return value.replace(/\{\{(\w+)\}\}/g, (_, paramKey) => {
      return String(params[paramKey] ?? `{{${paramKey}}}`);
    });
  }

  return value;
}

/**
 * Format a date according to locale
 */
export function formatLocalizedDate(
  date: Date | string,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    ...options,
  }).format(d);
}

/**
 * Format a number according to locale
 */
export function formatLocalizedNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Format a percentage according to locale
 */
export function formatLocalizedPercent(
  value: number,
  locale: Locale,
  decimals = 1
): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
