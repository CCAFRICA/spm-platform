export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'MXN' | 'CAD' | 'JPY';

export interface Currency {
  code: CurrencyCode;
  name: string;
  symbol: string;
  locale: string;
}

export const SUPPORTED_CURRENCIES: Currency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', locale: 'en-US' },
  { code: 'EUR', name: 'Euro', symbol: '€', locale: 'de-DE' },
  { code: 'GBP', name: 'British Pound', symbol: '£', locale: 'en-GB' },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$', locale: 'es-MX' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: '$', locale: 'en-CA' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', locale: 'ja-JP' },
];

export const DEFAULT_CURRENCY: CurrencyCode = 'USD';

// Mock exchange rates (in production, fetch from API)
const EXCHANGE_RATES: Record<CurrencyCode, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  MXN: 17.15,
  CAD: 1.36,
  JPY: 149.50,
};

/**
 * Convert amount from one currency to another
 */
export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode
): number {
  if (from === to) return amount;

  // Convert to USD first, then to target currency
  const inUSD = amount / EXCHANGE_RATES[from];
  return inUSD * EXCHANGE_RATES[to];
}

/**
 * Format currency according to locale and currency code
 */
export function formatCurrency(
  amount: number,
  currencyCode: CurrencyCode = 'USD',
  options?: {
    showCode?: boolean;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    compact?: boolean;
  }
): string {
  const currency = SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode);
  const locale = currency?.locale || 'en-US';

  const formatOptions: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 0,
  };

  if (options?.compact) {
    formatOptions.notation = 'compact';
    formatOptions.compactDisplay = 'short';
  }

  let formatted = new Intl.NumberFormat(locale, formatOptions).format(amount);

  if (options?.showCode && !formatted.includes(currencyCode)) {
    formatted = `${formatted} ${currencyCode}`;
  }

  return formatted;
}

/**
 * Format currency with conversion display
 * Shows original amount and converted amount if different currencies
 */
export function formatWithConversion(
  amount: number,
  originalCurrency: CurrencyCode,
  displayCurrency: CurrencyCode
): {
  original: string;
  converted: string | null;
  rate: number | null;
} {
  const original = formatCurrency(amount, originalCurrency);

  if (originalCurrency === displayCurrency) {
    return { original, converted: null, rate: null };
  }

  const convertedAmount = convertCurrency(amount, originalCurrency, displayCurrency);
  const converted = formatCurrency(convertedAmount, displayCurrency);
  const rate = EXCHANGE_RATES[displayCurrency] / EXCHANGE_RATES[originalCurrency];

  return { original, converted, rate };
}

/**
 * Get exchange rate between two currencies
 */
export function getExchangeRate(from: CurrencyCode, to: CurrencyCode): number {
  return EXCHANGE_RATES[to] / EXCHANGE_RATES[from];
}

/**
 * Get all exchange rates relative to a base currency
 */
export function getAllExchangeRates(
  base: CurrencyCode = 'USD'
): Record<CurrencyCode, number> {
  const baseRate = EXCHANGE_RATES[base];
  const rates: Record<CurrencyCode, number> = {} as Record<CurrencyCode, number>;

  for (const code of Object.keys(EXCHANGE_RATES) as CurrencyCode[]) {
    rates[code] = EXCHANGE_RATES[code] / baseRate;
  }

  return rates;
}

/**
 * Parse a currency string to get the numeric value
 */
export function parseCurrencyString(value: string): number {
  // Remove currency symbols and formatting
  const cleaned = value.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}
