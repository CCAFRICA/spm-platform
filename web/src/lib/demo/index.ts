/**
 * Demo Module
 *
 * Demo management, snapshots, validation, and guided tours.
 */

// Core demo service (state management, snapshots, validation, tours)
export {
  getDemoState,
  updateDemoState,
  resetDemoData,
  initializeDemo,
  getSnapshots,
  createSnapshot,
  restoreSnapshot,
  deleteSnapshot,
  getSnapshot,
  validateDemoData,
  getAvailableTours,
  getTour,
  startTour,
  advanceTour,
  endTour,
  getDemoScripts,
  getScript,
  startRehearsal,
  getActiveRehearsal,
  updateRehearsal,
  endRehearsal,
  addRehearsalNote,
} from './demo-service';

// Demo state definitions (persona-based states)
export type { DemoState as DemoPersonaState, DemoStateConfig, DemoNotification, QuarantineItem } from './demo-states';
export { DEMO_STATES, getDemoState as getDemoPersonaStateConfig, getDemoStateName, getDemoStateDescription } from './demo-states';

// Demo reset utilities
export * from './demo-reset';

// Foundation demo data
export {
  FOUNDATION_STORAGE_KEYS,
  seedFoundationDemoData,
  clearFoundationDemoData,
  isFoundationDataSeeded,
  getSeededImportBatches,
  getSeededApprovalRequests,
  getSeededCheckpoints,
} from './foundation-demo-data';

// OB-02 demo data (User Import, Hierarchy, Payroll, Reconciliation, Shadow Payroll)
export {
  DEMO_EMPLOYEES,
  DEMO_PAYROLL_PERIODS,
  DEMO_RECONCILIATION_SESSIONS,
  DEMO_RECONCILIATION_RULES,
  DEMO_SHADOW_PAYROLL_RUNS,
  DEMO_CALCULATION_SCENARIOS,
  initializeOB02DemoData,
  getOB02DemoData,
  resetOB02DemoData,
} from './ob02-demo-data';
export type { DemoEmployee } from './ob02-demo-data';
