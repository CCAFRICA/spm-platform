'use client';

/**
 * Navigation Context
 *
 * Manages the global navigation state for Mission Control:
 * - Active workspace
 * - Rail collapsed state
 * - Command palette open state
 * - Cycle state
 * - Queue items
 * - Pulse metrics
 * - Recent pages
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './auth-context';
import { useTenant } from './tenant-context';
import { useLocale } from './locale-context';
import { isVLAdmin } from '@/types/auth';
import type {
  WorkspaceId,
  NavigationState,
  CycleState,
  QueueItem,
  PulseMetric,
} from '@/types/navigation';
import {
  getCycleState,
  getAllPeriods,
  getNextAction,
  getQueueItems as getClockQueueItems,
  getPulseMetrics as getClockPulseMetrics,
  type PersonaType,
  type PeriodState,
} from '@/lib/navigation/compensation-clock-service';
import { getWorkspaceForRoute, WORKSPACES } from '@/lib/navigation/workspace-config';
import { getDefaultWorkspace, canAccessWorkspace } from '@/lib/navigation/role-workspaces';
import { logWorkspaceSwitch } from '@/lib/navigation/navigation-signals';

// =============================================================================
// STORAGE KEYS
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const RAIL_COLLAPSED_KEY = 'vialuce_rail_collapsed';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const RECENT_PAGES_KEY = 'vialuce_recent_pages';
const MAX_RECENT_PAGES = 10;

// =============================================================================
// CONTEXT TYPE
// =============================================================================

interface NavigationContextType extends NavigationState {
  // State setters
  setActiveWorkspace: (workspace: WorkspaceId) => void;
  toggleRailCollapsed: () => void;
  setCommandPaletteOpen: (open: boolean) => void;

  // Actions
  navigateToWorkspace: (workspace: WorkspaceId) => void;
  refreshData: () => void;

  // Clock service data
  periodStates: PeriodState[];
  nextAction: string;

  // Helpers
  isSpanish: boolean;
  userRole: string | null;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

// =============================================================================
// PROVIDER
// =============================================================================

interface NavigationProviderProps {
  children: ReactNode;
}

export function NavigationProvider({ children }: NavigationProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { currentTenant } = useTenant();

  // Locale follows user's language selector (single source of truth)
  const { locale } = useLocale();
  const userIsVLAdmin = user && isVLAdmin(user);
  const isSpanish = locale === 'es-MX';
  const userRole = user?.role || null;
  const tenantId = userIsVLAdmin ? 'platform' : (currentTenant?.id || 'default');
  // Core state
  const [activeWorkspace, setActiveWorkspaceState] = useState<WorkspaceId>('perform');
  const [isRailCollapsed, setIsRailCollapsed] = useState(false);
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [cycleState, setCycleState] = useState<CycleState | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [pulseMetrics, setPulseMetrics] = useState<PulseMetric[]>([]);
  const [recentPages, setRecentPages] = useState<string[]>([]);
  const [periodStates, setPeriodStates] = useState<PeriodState[]>([]);
  const [nextAction, setNextAction] = useState<string>('');

  // Initialize defaults (no localStorage)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Rail collapsed and recent pages use defaults (false, [])
  }, []);

  // Set default workspace based on role
  useEffect(() => {
    if (!userRole) return;

    const defaultWs = getDefaultWorkspace(userRole as 'vl_admin' | 'admin' | 'manager' | 'sales_rep');
    setActiveWorkspaceState(defaultWs);
  }, [userRole]);

  // Update active workspace based on current route
  // HF-018: Removed activeWorkspace from deps to prevent double-fire on workspace switch
  useEffect(() => {
    if (!pathname) return;

    const wsForRoute = getWorkspaceForRoute(pathname);
    if (wsForRoute) {
      setActiveWorkspaceState(prev => {
        if (prev === wsForRoute) return prev;
        if (userRole && canAccessWorkspace(userRole as 'vl_admin' | 'admin' | 'manager' | 'sales_rep', wsForRoute)) {
          return wsForRoute;
        }
        return prev;
      });
    }

    // Track recent pages (in-memory only)
    if (pathname !== '/' && pathname !== '/login' && pathname !== '/select-tenant') {
      setRecentPages(prev => {
        const filtered = prev.filter(p => p !== pathname);
        const updated = [pathname, ...filtered].slice(0, MAX_RECENT_PAGES);
        return updated;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, userRole]);

  // Map role to persona type for clock service
  const persona: PersonaType = userRole === 'vl_admin' ? 'vl_admin'
    : userRole === 'admin' ? 'platform_admin'
    : userRole === 'manager' ? 'manager'
    : 'sales_rep';

  // Load data from CompensationClockService (unified source of truth — async Supabase)
  const refreshData = useCallback(async () => {
    if (!user || !userRole) return;

    try {
      // THE CYCLE (central pacemaker)
      const cycle = await getCycleState(tenantId, isSpanish);
      setCycleState(cycle);

      // Multi-period timeline
      const periods = await getAllPeriods(tenantId, isSpanish);
      setPeriodStates(periods);

      // Next action for this persona
      const action = await getNextAction(tenantId, persona, isSpanish);
      setNextAction(action);

      // THE QUEUE (peripheral oscillators)
      const queue = await getClockQueueItems(tenantId, persona, user.id);
      setQueueItems(queue);

      // THE PULSE (feedback loops)
      const pulse = await getClockPulseMetrics(tenantId, persona, user.id);
      setPulseMetrics(pulse);
    } catch (err) {
      console.warn('[NavigationContext] Failed to refresh clock data:', err);
    }
  }, [user, userRole, tenantId, persona, isSpanish]);

  // Initial data load
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Refresh data periodically
  useEffect(() => {
    const interval = setInterval(refreshData, 60000); // Every minute
    return () => clearInterval(interval);
  }, [refreshData]);

  // Set active workspace with validation
  const setActiveWorkspace = useCallback((workspace: WorkspaceId) => {
    if (userRole && !canAccessWorkspace(userRole as 'vl_admin' | 'admin' | 'manager' | 'sales_rep', workspace)) {
      console.warn(`User role ${userRole} cannot access workspace ${workspace}`);
      return;
    }

    // Log the switch for analytics
    if (user && activeWorkspace !== workspace) {
      logWorkspaceSwitch(activeWorkspace, workspace, user.id, tenantId);
    }

    setActiveWorkspaceState(workspace);
  }, [userRole, user, activeWorkspace, tenantId]);

  // Toggle rail collapsed (in-memory only)
  const toggleRailCollapsed = useCallback(() => {
    setIsRailCollapsed(prev => {
      const newValue = !prev;
      return newValue;
    });
  }, []);

  // Navigate to workspace
  const navigateToWorkspace = useCallback((workspace: WorkspaceId) => {
    if (userRole && !canAccessWorkspace(userRole as 'vl_admin' | 'admin' | 'manager' | 'sales_rep', workspace)) {
      console.warn(`User role ${userRole} cannot access workspace ${workspace}`);
      return;
    }

    setActiveWorkspace(workspace);
    const ws = WORKSPACES[workspace];
    router.push(ws.defaultRoute);
  }, [userRole, setActiveWorkspace, router]);

  const value: NavigationContextType = {
    activeWorkspace,
    isRailCollapsed,
    isCommandPaletteOpen,
    cycleState,
    queueItems,
    pulseMetrics,
    recentPages,
    setActiveWorkspace,
    toggleRailCollapsed,
    setCommandPaletteOpen,
    navigateToWorkspace,
    refreshData,
    periodStates,
    nextAction,
    isSpanish,
    userRole,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

// =============================================================================
// HOOK
// =============================================================================

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within NavigationProvider');
  }
  return context;
}

// =============================================================================
// SPECIALIZED HOOKS
// =============================================================================

/**
 * Hook for workspace-related state only
 */
export function useWorkspace() {
  const { activeWorkspace, setActiveWorkspace, navigateToWorkspace, isSpanish, userRole } = useNavigation();
  return { activeWorkspace, setActiveWorkspace, navigateToWorkspace, isSpanish, userRole };
}

/**
 * Hook for command palette
 */
export function useCommandPalette() {
  const { isCommandPaletteOpen, setCommandPaletteOpen } = useNavigation();
  return { isOpen: isCommandPaletteOpen, setOpen: setCommandPaletteOpen };
}

/**
 * Hook for cycle state
 */
export function useCycleState() {
  const { cycleState, periodStates, nextAction, isSpanish } = useNavigation();
  return { cycleState, periodStates, nextAction, isSpanish };
}

/**
 * Hook for queue
 */
export function useQueue() {
  const { queueItems, isSpanish } = useNavigation();
  return { items: queueItems, isSpanish };
}

/**
 * Hook for pulse metrics
 */
export function usePulse() {
  const { pulseMetrics, isSpanish } = useNavigation();
  return { metrics: pulseMetrics, isSpanish };
}

/**
 * Hook for acceleration features (smart suggestions, alerts)
 */
export function useAcceleration() {
  const { cycleState, queueItems, activeWorkspace, userRole, isSpanish } = useNavigation();

  // Import dynamically to avoid circular dependencies
  const getSmartSuggestions = async () => {
    const { getSmartSuggestions: getSuggestions } = await import('@/lib/navigation/acceleration-hints');
    if (!cycleState || !userRole) return [];
    return getSuggestions(
      userRole as 'vl_admin' | 'admin' | 'manager' | 'sales_rep',
      cycleState.currentPhase,
      cycleState.pendingActions,
      activeWorkspace
    );
  };

  const getProactiveAlerts = async () => {
    const { getProactiveAlerts: getAlerts } = await import('@/lib/navigation/acceleration-hints');
    if (!cycleState || !userRole) return [];
    return getAlerts(
      userRole as 'vl_admin' | 'admin' | 'manager' | 'sales_rep',
      cycleState.currentPhase,
      queueItems
    );
  };

  return {
    getSmartSuggestions,
    getProactiveAlerts,
    isSpanish,
  };
}
