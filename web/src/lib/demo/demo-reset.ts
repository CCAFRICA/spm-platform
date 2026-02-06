/**
 * Demo Reset Service
 *
 * Manages resetting the demo environment to predefined states.
 * Handles localStorage cleanup and state initialization.
 */

import { DEMO_STATES, DemoState, getDemoState } from './demo-states';

// All localStorage keys that should be managed by the demo system
const DEMO_STORAGE_KEYS = [
  // Disputes & Adjustments
  'retailco_disputes',
  'retailco_adjustments',
  // Notifications
  'retailco_notifications',
  // Data Quality
  'retailco_quarantine',
  // Scenarios
  'retailco_scenarios',
  // Plans (shared across tenants)
  'compensation_plans',
  'compensation_plan_history',
  // Audit
  'audit_log',
  // Demo state tracking
  'demo_current_state',
  'demo_state_timestamp',
] as const;

// Tenant-specific keys that should be cleared when switching tenants
const TENANT_SPECIFIC_KEYS = [
  'retailco_disputes',
  'retailco_adjustments',
  'retailco_notifications',
  'retailco_quarantine',
  'retailco_scenarios',
] as const;

/**
 * Reset the demo to a specific state
 * @param targetState - The state to reset to (defaults to 'initial')
 * @param reload - Whether to reload the page after reset (defaults to true)
 */
export function resetDemo(targetState: DemoState = 'initial', reload: boolean = true): void {
  const config = getDemoState(targetState);
  if (!config) {
    console.error(`Unknown demo state: ${targetState}`);
    return;
  }

  if (typeof window === 'undefined') return;

  // Clear all demo-related localStorage
  DEMO_STORAGE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
  });

  // Set the new state data
  const { storageData } = config;

  // Disputes
  if (storageData.disputes.length > 0) {
    localStorage.setItem('retailco_disputes', JSON.stringify(storageData.disputes));
  }

  // Adjustments
  if (storageData.adjustments.length > 0) {
    localStorage.setItem('retailco_adjustments', JSON.stringify(storageData.adjustments));
  }

  // Notifications
  if (storageData.notifications.length > 0) {
    localStorage.setItem('retailco_notifications', JSON.stringify(storageData.notifications));
  }

  // Quarantine
  if (storageData.quarantine && storageData.quarantine.length > 0) {
    localStorage.setItem('retailco_quarantine', JSON.stringify(storageData.quarantine));
  }

  // Track the current demo state
  localStorage.setItem('demo_current_state', targetState);
  localStorage.setItem('demo_state_timestamp', new Date().toISOString());

  // Log the reset for audit
  logDemoReset(targetState);

  // Reload to pick up new state
  if (reload) {
    window.location.reload();
  }
}

/**
 * Get the current demo state by analyzing localStorage
 */
export function getCurrentDemoState(): DemoState {
  if (typeof window === 'undefined') return 'initial';

  // First check if we have an explicitly set state
  const explicitState = localStorage.getItem('demo_current_state') as DemoState | null;
  if (explicitState && DEMO_STATES.some((s) => s.id === explicitState)) {
    return explicitState;
  }

  // Otherwise, analyze the current data to determine state
  try {
    const disputes = JSON.parse(localStorage.getItem('retailco_disputes') || '[]');
    const adjustments = JSON.parse(localStorage.getItem('retailco_adjustments') || '[]');
    const quarantine = JSON.parse(localStorage.getItem('retailco_quarantine') || '[]');

    // Check for resolved state
    if (adjustments.length > 0) {
      return 'resolved';
    }

    // Check for disputed state (submitted disputes)
    if (disputes.some((d: { status: string }) => d.status === 'submitted' || d.status === 'in_review')) {
      return 'disputed';
    }

    // Check for clean data state
    if (quarantine.length === 0) {
      return 'data_clean';
    }

    // Check for dirty data state
    if (quarantine.some((q: { status: string }) => q.status === 'pending')) {
      return 'data_dirty';
    }

    return 'initial';
  } catch {
    return 'initial';
  }
}

/**
 * Get the timestamp of the last demo reset
 */
export function getLastResetTimestamp(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('demo_state_timestamp');
}

/**
 * Check if the demo has been modified since the last reset
 */
export function isDemoModified(): boolean {
  const lastReset = getLastResetTimestamp();
  if (!lastReset) return true;

  // Check audit log for actions after last reset
  try {
    const auditLog = JSON.parse(localStorage.getItem('audit_log') || '[]');
    const resetTime = new Date(lastReset).getTime();

    return auditLog.some(
      (entry: { timestamp: string }) => new Date(entry.timestamp).getTime() > resetTime
    );
  } catch {
    return false;
  }
}

/**
 * Clear all demo data without setting a new state
 */
export function clearAllDemoData(): void {
  if (typeof window === 'undefined') return;

  DEMO_STORAGE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
  });

  logDemoReset('cleared');
}

/**
 * Clear only tenant-specific data (useful when switching tenants)
 */
export function clearTenantData(): void {
  if (typeof window === 'undefined') return;

  TENANT_SPECIFIC_KEYS.forEach((key) => {
    localStorage.removeItem(key);
  });
}

/**
 * Export current demo state for sharing/debugging
 */
export function exportDemoState(): string {
  if (typeof window === 'undefined') return '{}';

  const state: Record<string, unknown> = {};

  DEMO_STORAGE_KEYS.forEach((key) => {
    const value = localStorage.getItem(key);
    if (value) {
      try {
        state[key] = JSON.parse(value);
      } catch {
        state[key] = value;
      }
    }
  });

  return JSON.stringify(state, null, 2);
}

/**
 * Import a demo state from an exported string
 */
export function importDemoState(stateJson: string): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const state = JSON.parse(stateJson);

    // Clear existing data
    clearAllDemoData();

    // Import new data
    Object.entries(state).forEach(([key, value]) => {
      if (DEMO_STORAGE_KEYS.includes(key as (typeof DEMO_STORAGE_KEYS)[number])) {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    });

    return true;
  } catch (error) {
    console.error('Failed to import demo state:', error);
    return false;
  }
}

/**
 * Log demo reset to audit for debugging
 */
function logDemoReset(targetState: string): void {
  if (typeof window === 'undefined') return;

  const auditLog = JSON.parse(localStorage.getItem('audit_log') || '[]');
  auditLog.push({
    id: `audit-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'demo_reset',
    entityType: 'system',
    entityId: 'demo',
    entityName: 'Demo System',
    metadata: {
      targetState,
      userAgent: navigator.userAgent,
    },
  });

  // Keep only last 100 audit entries
  const trimmedLog = auditLog.slice(-100);
  localStorage.setItem('audit_log', JSON.stringify(trimmedLog));
}

/**
 * Register keyboard shortcut for quick reset (Ctrl+Shift+R)
 */
export function registerResetShortcut(callback?: () => void): () => void {
  const handler = (event: KeyboardEvent) => {
    // Ctrl+Shift+R (or Cmd+Shift+R on Mac)
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'R') {
      event.preventDefault();
      if (callback) {
        callback();
      } else {
        resetDemo('initial');
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handler);
  }

  // Return cleanup function
  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handler);
    }
  };
}

/**
 * Fast-forward to next demo state
 */
export function fastForwardDemo(): DemoState {
  const currentState = getCurrentDemoState();

  const stateOrder: DemoState[] = ['initial', 'disputed', 'resolved'];
  const currentIndex = stateOrder.indexOf(currentState);

  if (currentIndex >= 0 && currentIndex < stateOrder.length - 1) {
    const nextState = stateOrder[currentIndex + 1];
    resetDemo(nextState);
    return nextState;
  }

  // If at the end or not in the flow, reset to initial
  resetDemo('initial');
  return 'initial';
}
