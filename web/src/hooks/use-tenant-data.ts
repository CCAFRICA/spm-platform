'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTenant } from '@/contexts/tenant-context';
import { loadTenantData, saveTenantData, clearTenantData } from '@/lib/tenant-data-service';

interface UseTenantDataOptions {
  /** Whether to automatically reload when tenant changes */
  autoReload?: boolean;
  /** Whether to persist changes to localStorage */
  persist?: boolean;
}

interface UseTenantDataResult<T> {
  data: T;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  save: (newData: T) => void;
  update: (updater: (prev: T) => T) => void;
  clear: () => void;
}

/**
 * Hook for loading and managing tenant-specific data
 */
export function useTenantData<T>(
  dataType: string,
  defaultValue: T,
  options: UseTenantDataOptions = {}
): UseTenantDataResult<T> {
  const { autoReload = true, persist = true } = options;
  const { currentTenant } = useTenant();
  const [data, setData] = useState<T>(defaultValue);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track the current tenant ID to detect changes
  const lastTenantIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!currentTenant) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const loaded = await loadTenantData<T>(currentTenant.id, dataType, defaultValue);
      setData(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setData(defaultValue);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant, dataType, defaultValue]);

  // Load data on mount and when tenant changes
  useEffect(() => {
    const tenantChanged = currentTenant?.id !== lastTenantIdRef.current;
    lastTenantIdRef.current = currentTenant?.id || null;

    if (autoReload || tenantChanged) {
      load();
    }
  }, [currentTenant?.id, autoReload, load]);

  const save = useCallback(
    (newData: T) => {
      if (!currentTenant) return;

      setData(newData);
      if (persist) {
        saveTenantData(currentTenant.id, dataType, newData);
      }
    },
    [currentTenant, dataType, persist]
  );

  const update = useCallback(
    (updater: (prev: T) => T) => {
      setData((prev) => {
        const newData = updater(prev);
        if (currentTenant && persist) {
          saveTenantData(currentTenant.id, dataType, newData);
        }
        return newData;
      });
    },
    [currentTenant, dataType, persist]
  );

  const clear = useCallback(() => {
    if (!currentTenant) return;

    setData(defaultValue);
    clearTenantData(currentTenant.id, dataType);
  }, [currentTenant, dataType, defaultValue]);

  return {
    data,
    isLoading,
    error,
    reload: load,
    save,
    update,
    clear,
  };
}

/**
 * Hook for loading multiple tenant data types at once
 */
export function useTenantDataBatch<T extends Record<string, unknown>>(
  dataTypes: { key: keyof T; dataType: string; defaultValue: T[keyof T] }[]
): {
  data: T;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
} {
  const { currentTenant } = useTenant();
  const [data, setData] = useState<T>(() => {
    const initial: Record<string, unknown> = {};
    dataTypes.forEach(({ key, defaultValue }) => {
      initial[key as string] = defaultValue;
    });
    return initial as T;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentTenant) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const results: Record<string, unknown> = {};
      await Promise.all(
        dataTypes.map(async ({ key, dataType, defaultValue }) => {
          results[key as string] = await loadTenantData(
            currentTenant.id,
            dataType,
            defaultValue
          );
        })
      );
      setData(results as T);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant, dataTypes]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, isLoading, error, reload: load };
}
