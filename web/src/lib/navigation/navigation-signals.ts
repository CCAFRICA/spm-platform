/**
 * Navigation Signals Service
 *
 * Captures navigation behavior for analytics and future AI-driven suggestions.
 * Every search, selection, and navigation is a training signal.
 */

import type { NavigationSignal, NavigationSignalType, WorkspaceId } from '@/types/navigation';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SIGNALS_STORAGE_KEY = 'vialuce_nav_signals';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MAX_SIGNALS = 1000; // Keep last 1000 signals

// =============================================================================
// SIGNAL CAPTURE
// =============================================================================

/**
 * Log a navigation signal
 */
export function logSignal(
  type: NavigationSignalType,
  userId: string,
  tenantId: string,
  data: Partial<Omit<NavigationSignal, 'type' | 'timestamp' | 'userId' | 'tenantId'>>
): void {
  if (typeof window === 'undefined') return;

  const signal: NavigationSignal = {
    type,
    userId,
    tenantId,
    timestamp: new Date().toISOString(),
    ...data,
  };

  // Store signal
  storeSignal(signal);

  // Log for debugging (remove in production)
  if (process.env.NODE_ENV === 'development') {
    console.log('[NavSignal]', type, data);
  }
}

/**
 * Log a search query
 */
export function logSearch(
  query: string,
  userId: string,
  tenantId: string
): void {
  logSignal('search', userId, tenantId, { query });
}

/**
 * Log a command selection from the palette
 */
export function logCommandSelect(
  commandId: string,
  query: string | undefined,
  userId: string,
  tenantId: string
): void {
  logSignal('command_select', userId, tenantId, {
    selectedItem: commandId,
    query,
  });
}

/**
 * Log a workspace switch
 */
export function logWorkspaceSwitch(
  fromWorkspace: WorkspaceId | undefined,
  toWorkspace: WorkspaceId,
  userId: string,
  tenantId: string
): void {
  logSignal('workspace_switch', userId, tenantId, {
    fromWorkspace,
    toWorkspace,
  });
}

/**
 * Log a queue item click
 */
export function logQueueClick(
  itemId: string,
  userId: string,
  tenantId: string
): void {
  logSignal('queue_click', userId, tenantId, {
    selectedItem: itemId,
  });
}

/**
 * Log a cycle phase click
 */
export function logCycleClick(
  phase: string,
  userId: string,
  tenantId: string
): void {
  logSignal('cycle_click', userId, tenantId, {
    selectedItem: phase,
  });
}

/**
 * Log a pulse metric click
 */
export function logPulseClick(
  metricId: string,
  userId: string,
  tenantId: string
): void {
  logSignal('pulse_click', userId, tenantId, {
    selectedItem: metricId,
  });
}

// =============================================================================
// SIGNAL STORAGE
// =============================================================================

/**
 * Store a signal (no-op, localStorage removed)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function storeSignal(_signal: NavigationSignal): void {
  // No-op: localStorage removed
}

/**
 * Get all stored signals (returns empty, localStorage removed)
 */
function getStoredSignals(): NavigationSignal[] {
  return [];
}

// =============================================================================
// ANALYTICS
// =============================================================================

/**
 * Get search analytics for a user
 */
export function getSearchAnalytics(userId: string, tenantId: string): {
  totalSearches: number;
  topSearches: Array<{ query: string; count: number }>;
  recentSearches: string[];
} {
  const signals = getStoredSignals().filter(
    s => s.type === 'search' && s.userId === userId && s.tenantId === tenantId
  );

  // Count queries
  const queryCounts: Record<string, number> = {};
  signals.forEach(s => {
    if (s.query) {
      const normalized = s.query.toLowerCase().trim();
      queryCounts[normalized] = (queryCounts[normalized] || 0) + 1;
    }
  });

  // Sort by count
  const topSearches = Object.entries(queryCounts)
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Recent unique searches
  const recentSearches = Array.from(new Set(
    signals
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .map(s => s.query)
      .filter((q): q is string => !!q)
  )).slice(0, 5);

  return {
    totalSearches: signals.length,
    topSearches,
    recentSearches,
  };
}

/**
 * Get workspace usage analytics
 */
export function getWorkspaceAnalytics(userId: string, tenantId: string): {
  workspaceVisits: Record<WorkspaceId, number>;
  mostUsedWorkspace: WorkspaceId | null;
} {
  const signals = getStoredSignals().filter(
    s => s.type === 'workspace_switch' && s.userId === userId && s.tenantId === tenantId
  );

  const visits: Record<string, number> = {};
  signals.forEach(s => {
    if (s.toWorkspace) {
      visits[s.toWorkspace] = (visits[s.toWorkspace] || 0) + 1;
    }
  });

  const mostUsedWorkspace = Object.entries(visits)
    .sort((a, b) => b[1] - a[1])[0]?.[0] as WorkspaceId | undefined;

  return {
    workspaceVisits: visits as Record<WorkspaceId, number>,
    mostUsedWorkspace: mostUsedWorkspace || null,
  };
}

/**
 * Clear all signals (no-op, localStorage removed)
 */
export function clearSignals(): void {
  // No-op: localStorage removed
}
