'use client';

/**
 * Module Context
 *
 * Provides current module identity to all child components.
 * Supports wayfinding through ambient accents and layout signatures.
 */

import React, { createContext, useContext, useMemo, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MODULE_TOKENS, getModuleFromPath, type ModuleId } from './tokens';

// ============================================
// TYPES
// ============================================

interface ModuleContextValue {
  moduleId: ModuleId | null;
  moduleConfig: typeof MODULE_TOKENS[ModuleId] | null;
  isTransitioning: boolean;
  previousModuleId: ModuleId | null;
}

// ============================================
// CONTEXT
// ============================================

const ModuleContext = createContext<ModuleContextValue>({
  moduleId: null,
  moduleConfig: null,
  isTransitioning: false,
  previousModuleId: null,
});

// ============================================
// PROVIDER
// ============================================

interface ModuleProviderProps {
  children: React.ReactNode;
  overrideModuleId?: ModuleId; // For testing or forced module contexts
}

export function ModuleProvider({ children, overrideModuleId }: ModuleProviderProps) {
  const pathname = usePathname();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [previousModuleId, setPreviousModuleId] = useState<ModuleId | null>(null);

  const moduleId = useMemo(() => {
    if (overrideModuleId) return overrideModuleId;
    return getModuleFromPath(pathname);
  }, [pathname, overrideModuleId]);

  const moduleConfig = useMemo(() => {
    if (!moduleId) return null;
    return MODULE_TOKENS[moduleId];
  }, [moduleId]);

  // Handle module transitions
  useEffect(() => {
    if (previousModuleId !== moduleId && previousModuleId !== null) {
      setIsTransitioning(true);
      const timer = setTimeout(() => setIsTransitioning(false), 200);
      return () => clearTimeout(timer);
    }
    setPreviousModuleId(moduleId);
  }, [moduleId, previousModuleId]);

  const value = useMemo(
    () => ({
      moduleId,
      moduleConfig,
      isTransitioning,
      previousModuleId,
    }),
    [moduleId, moduleConfig, isTransitioning, previousModuleId]
  );

  return (
    <ModuleContext.Provider value={value}>
      {children}
    </ModuleContext.Provider>
  );
}

// ============================================
// HOOK
// ============================================

export function useModule() {
  const context = useContext(ModuleContext);
  return context;
}

// ============================================
// UTILITY HOOKS
// ============================================

/**
 * Get the accent color for the current module
 */
export function useModuleAccent() {
  const { moduleConfig } = useModule();
  return moduleConfig?.accent || 'hsl(210, 70%, 50%)';
}

/**
 * Get the layout signature for the current module
 */
export function useLayoutSignature() {
  const { moduleConfig } = useModule();
  return moduleConfig?.layoutSignature || 'mixed';
}

/**
 * Check if currently transitioning between modules
 */
export function useIsTransitioning() {
  const { isTransitioning } = useModule();
  return isTransitioning;
}
