export type Locale = 'en-US' | 'es-MX' | 'pt-BR';

export const SUPPORTED_LOCALES: { code: Locale; name: string; flag: string }[] = [
  { code: 'en-US', name: 'English', flag: '🇺🇸' },
  { code: 'es-MX', name: 'Español', flag: '🇲🇽' },
  { code: 'pt-BR', name: 'Português', flag: '🇧🇷' },
];

export const DEFAULT_LOCALE: Locale = 'en-US';

// HF-335 — shared, presentation-layer locale predicates (NOT engine/SCI/calculation; AP-25 safe).
// Accept a broad `string` because the TENANT locale set (types/tenant.ts) is wider than the i18n
// `Locale` union — e.g. `es-PE`, `en-GB`, `fr-FR` — and must be classified correctly.

/**
 * Is this a Spanish locale? Prefix match so BOTH `es-MX` and `es-PE` (a real, creatable tenant
 * locale with no dedicated catalog) render Spanish. Replaces the ~90 exact `locale === 'es-MX'`
 * checks that previously left es-PE tenants in English.
 */
export function isSpanishLocale(locale?: string | null): boolean {
  return !!locale && locale.toLowerCase().startsWith('es');
}

/**
 * Map an ISO locale code to a language NAME for AI prompt construction (Defect Class B). Prefix-based
 * and extensible — adding a locale family is one line. Presentation-layer only (used to build the
 * model's LANGUAGE REQUIREMENT instruction), never a structural identifier.
 */
export function localeToLanguageName(locale?: string | null): string {
  const l = (locale || '').toLowerCase();
  if (l.startsWith('es')) return 'Spanish';
  if (l.startsWith('pt')) return 'Portuguese';
  if (l.startsWith('fr')) return 'French';
  return 'English';
}

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
