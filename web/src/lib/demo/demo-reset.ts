/**
 * Demo Reset Service
 *
 * Manages resetting the demo environment to predefined states.
 * localStorage removed -- all operations are no-ops returning defaults.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DEMO_STATES, DemoState, getDemoState } from './demo-states';

// All localStorage keys that should be managed by the demo system
// HF-021: compensation_plans and compensation_plan_history are NOT included here
// because they are shared global keys — wiping them destroys ALL tenant plans
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  // Audit
  'audit_log',
  // Demo state tracking
  'demo_current_state',
  'demo_state_timestamp',
] as const;

// Tenant-specific keys that should be cleared when switching tenants
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // No-op: localStorage removed

  // Log the reset for audit
  logDemoReset(targetState);

  // Reload to pick up new state
  if (reload && typeof window !== 'undefined') {
    window.location.reload();
  }
}

/**
 * Get the current demo state by analyzing localStorage
 */
export function getCurrentDemoState(): DemoState {
  return 'initial';
}

/**
 * Get the timestamp of the last demo reset
 */
export function getLastResetTimestamp(): string | null {
  return null;
}

/**
 * Check if the demo has been modified since the last reset
 */
export function isDemoModified(): boolean {
  return false;
}

/**
 * Clear all demo data without setting a new state
 */
export function clearAllDemoData(): void {
  logDemoReset('cleared');
}

/**
 * Clear only tenant-specific data (useful when switching tenants)
 */
export function clearTenantData(): void {
  // No-op: localStorage removed
}

/**
 * Export current demo state for sharing/debugging
 */
export function exportDemoState(): string {
  return '{}';
}

/**
 * Import a demo state from an exported string
 */
export function importDemoState(stateJson: string): boolean {
  try {
    JSON.parse(stateJson);
    // No-op: localStorage removed
    return true;
  } catch (error) {
    console.error('Failed to import demo state:', error);
    return false;
  }
}

/**
 * Log demo reset to audit for debugging
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function logDemoReset(targetState: string): void {
  // No-op: localStorage removed
}

// HF-021: registerResetShortcut REMOVED — it hijacked CMD+SHIFT+R (browser hard refresh)
// for ALL tenants, silently blocking refresh for tenants without demo users and
// risking accidental data destruction for tenants with demo users.

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
