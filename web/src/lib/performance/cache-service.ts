/**
 * Cache Service
 *
 * In-memory and localStorage caching with TTL support.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // milliseconds
}

// In-memory cache for session data
const memoryCache = new Map<string, CacheEntry<unknown>>();

// Cache configuration
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;

// ============================================
// MEMORY CACHE
// ============================================

/**
 * Get item from memory cache
 */
export function getFromMemoryCache<T>(key: string): T | null {
  const entry = memoryCache.get(key) as CacheEntry<T> | undefined;

  if (!entry) return null;

  // Check if expired
  if (Date.now() - entry.timestamp > entry.ttl) {
    memoryCache.delete(key);
    return null;
  }

  return entry.data;
}

/**
 * Set item in memory cache
 */
export function setInMemoryCache<T>(
  key: string,
  data: T,
  ttl: number = DEFAULT_TTL
): void {
  // Enforce max cache size
  if (memoryCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) {
      memoryCache.delete(oldestKey);
    }
  }

  memoryCache.set(key, {
    data,
    timestamp: Date.now(),
    ttl,
  });
}

/**
 * Remove item from memory cache
 */
export function removeFromMemoryCache(key: string): void {
  memoryCache.delete(key);
}

/**
 * Clear entire memory cache
 */
export function clearMemoryCache(): void {
  memoryCache.clear();
}

/**
 * Get memory cache stats
 */
export function getMemoryCacheStats(): {
  size: number;
  maxSize: number;
  keys: string[];
} {
  return {
    size: memoryCache.size,
    maxSize: MAX_CACHE_SIZE,
    keys: Array.from(memoryCache.keys()),
  };
}

// ============================================
// PERSISTENT CACHE (localStorage)
// ============================================

const CACHE_PREFIX = 'cache_';

/**
 * Get item from persistent cache
 */
export function getFromPersistentCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;

  const stored = localStorage.getItem(CACHE_PREFIX + key);
  if (!stored) return null;

  try {
    const entry: CacheEntry<T> = JSON.parse(stored);

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Set item in persistent cache
 */
export function setInPersistentCache<T>(
  key: string,
  data: T,
  ttl: number = DEFAULT_TTL
): void {
  if (typeof window === 'undefined') return;

  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
    ttl,
  };

  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Storage might be full, clear old cache entries
    cleanupPersistentCache();

    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch {
      // Still failed, ignore
    }
  }
}

/**
 * Remove item from persistent cache
 */
export function removeFromPersistentCache(key: string): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CACHE_PREFIX + key);
  }
}

/**
 * Clear persistent cache
 */
export function clearPersistentCache(): void {
  if (typeof window === 'undefined') return;

  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(CACHE_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

/**
 * Clean up expired cache entries
 */
export function cleanupPersistentCache(): number {
  if (typeof window === 'undefined') return 0;

  let cleaned = 0;
  const keysToCheck: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(CACHE_PREFIX)) {
      keysToCheck.push(key);
    }
  }

  keysToCheck.forEach((key) => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const entry: CacheEntry<unknown> = JSON.parse(stored);
        if (Date.now() - entry.timestamp > entry.ttl) {
          localStorage.removeItem(key);
          cleaned++;
        }
      }
    } catch {
      // Invalid entry, remove it
      localStorage.removeItem(key);
      cleaned++;
    }
  });

  return cleaned;
}

// ============================================
// CACHE UTILITIES
// ============================================

/**
 * Create a cached version of an async function
 */
export function withCache<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  keyGenerator: (...args: TArgs) => string,
  options: { ttl?: number; persistent?: boolean } = {}
): (...args: TArgs) => Promise<TResult> {
  const { ttl = DEFAULT_TTL, persistent = false } = options;

  return async (...args: TArgs): Promise<TResult> => {
    const key = keyGenerator(...args);

    // Try to get from cache
    const cached = persistent
      ? getFromPersistentCache<TResult>(key)
      : getFromMemoryCache<TResult>(key);

    if (cached !== null) {
      return cached;
    }

    // Execute function and cache result
    const result = await fn(...args);

    if (persistent) {
      setInPersistentCache(key, result, ttl);
    } else {
      setInMemoryCache(key, result, ttl);
    }

    return result;
  };
}

/**
 * Debounce function execution
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

/**
 * Throttle function execution
 */
export function throttle<T extends (...args: Parameters<T>) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Memoize function results
 */
export function memoize<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult,
  keyGenerator?: (...args: TArgs) => string
): (...args: TArgs) => TResult {
  const cache = new Map<string, TResult>();

  return (...args: TArgs): TResult => {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = fn(...args);
    cache.set(key, result);

    return result;
  };
}
